import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { context, getOctokit } from "@actions/github";
import { createApiCommit } from "./create-api-commit.js";
import { summaryWriter } from "./summary-writer.js";

/**
 * Update release branch result
 */
interface UpdateReleaseBranchResult {
	/** Whether the update was successful */
	success: boolean;
	/** Whether there were merge conflicts (always false with recreate strategy) */
	hadConflicts: boolean;
	/** PR number if it exists */
	prNumber: number | null;
	/** GitHub check run ID */
	checkId: number;
	/** Version summary */
	versionSummary: string;
}

/**
 * Executes a command with retry logic and exponential backoff
 *

 * @param exec - GitHub Actions exec module
 * @param command - Command to execute
 * @param args - Command arguments
 * @param options - Exec options
 * @param maxRetries - Maximum number of retries (default: 3)
 * @returns Promise that resolves when command succeeds
 */
async function execWithRetry(
	command: string,
	args: string[],
	options: exec.ExecOptions = {},
	maxRetries: number = 3,
): Promise<void> {
	const retryableErrors = ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"];
	const baseDelay = 1000;
	const maxDelay = 10000;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			await exec.exec(command, args, options);
			return;
		} catch (error) {
			const isLastAttempt = attempt === maxRetries;
			const errorMessage = error instanceof Error ? error.message : String(error);
			const isRetryable = retryableErrors.some((err) => errorMessage.includes(err));

			if (isLastAttempt || !isRetryable) {
				throw error;
			}

			// Exponential backoff with jitter
			const delay = Math.min(baseDelay * 2 ** attempt + Math.random() * 1000, maxDelay);
			core.warning(`Attempt ${attempt + 1} failed: ${errorMessage}. Retrying in ${Math.round(delay)}ms...`);

			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}
}

/**
 * Updates the release branch with changes from target branch
 *
 * @param releaseBranch - Release branch name
 * @param targetBranch - Target branch to merge from
 * @param prNumber - PR number if it exists
 * @param packageManager - Package manager to use
 * @param versionCommand - Custom version command
 * @param dryRun - Whether this is a dry-run
 * @returns Update release branch result
 */
export async function updateReleaseBranch(): Promise<UpdateReleaseBranchResult> {
	// Read all inputs
	const token = core.getInput("token", { required: true });
	const releaseBranch = core.getInput("release-branch") || "changeset-release/main";
	const targetBranch = core.getInput("target-branch") || "main";
	const packageManager = core.getInput("package-manager") || "pnpm";
	const versionCommand = core.getInput("version-command") || "";
	const dryRun = core.getBooleanInput("dry-run") || false;

	const github = getOctokit(token);
	// Find the open PR for this release branch
	let prNumber: number | null = null;
	try {
		const { data: prs } = await github.rest.pulls.list({
			owner: context.repo.owner,
			repo: context.repo.repo,
			state: "open",
			head: `${context.repo.owner}:${releaseBranch}`,
			base: targetBranch,
		});
		if (prs.length > 0) {
			prNumber = prs[0].number;
		}
	} catch (error) {
		core.warning(`Could not find open PR: ${error instanceof Error ? error.message : String(error)}`);
	}

	const prTitlePrefix = core.getInput("pr-title-prefix") || "chore: release";

	core.startGroup("Updating release branch");

	// Strategy: Recreate the release branch from main to ensure it's always up-to-date
	// This avoids merge conflicts and ensures a clean history
	core.info(`Recreating release branch '${releaseBranch}' from '${targetBranch}'`);

	// We're already on main from the workflow checkout
	// Create the release branch locally from main HEAD
	if (!dryRun) {
		// Delete local release branch if it exists (ignore errors)
		await exec.exec("git", ["branch", "-D", releaseBranch], { ignoreReturnCode: true });

		// Create new release branch from current HEAD (main)
		await exec.exec("git", ["checkout", "-b", releaseBranch]);
	} else {
		core.info(`[DRY RUN] Would recreate branch: ${releaseBranch} from ${targetBranch}`);
	}

	// Run changeset version to update versions
	core.info("Running changeset version");
	const versionCmd =
		versionCommand || (packageManager === "pnpm" ? "pnpm" : packageManager === "yarn" ? "yarn" : "npm");
	const versionArgs =
		versionCommand === ""
			? packageManager === "pnpm"
				? ["ci:version"]
				: packageManager === "yarn"
					? ["ci:version"]
					: ["run", "ci:version"]
			: versionCommand.split(" ");

	if (!dryRun) {
		await execWithRetry(versionCmd, versionArgs);
	} else {
		core.info(`[DRY RUN] Would run: ${versionCmd} ${versionArgs.join(" ")}`);
	}

	// Check for new changes
	let hasChanges = false;
	let changedFiles = "";

	if (!dryRun) {
		await exec.exec("git", ["status", "--porcelain"], {
			listeners: {
				stdout: (data: Buffer) => {
					changedFiles += data.toString();
				},
			},
		});
		hasChanges = changedFiles.trim().length > 0;
	} else {
		// In dry-run mode, assume changes exist
		hasChanges = true;
		core.info("[DRY RUN] Assuming changes exist for version bump");
	}

	let versionSummary = "";

	if (hasChanges) {
		// Generate version summary from changed files
		versionSummary = changedFiles
			.split("\n")
			.filter((line) => line.includes("package.json") || line.includes("CHANGELOG.md"))
			.join("\n");

		core.info("New version changes:");
		core.info(versionSummary);

		// Stage all changes for the API commit
		if (!dryRun) {
			await exec.exec("git", ["add", "."]);
		}

		// Force push the branch to update remote (this replaces the old branch)
		core.info(`Force pushing '${releaseBranch}' to origin`);
		if (!dryRun) {
			// Push the branch first to create/update the remote ref
			await execWithRetry("git", ["push", "-f", "-u", "origin", releaseBranch]);
		} else {
			core.info(`[DRY RUN] Would force push to: ${releaseBranch}`);
		}

		// Create commit via GitHub API (automatically signed and attributed to GitHub App)
		const commitMessage = `${prTitlePrefix}\n\nVersion bump from changesets (rebased on ${targetBranch})`;
		if (!dryRun) {
			core.info("Creating verified commit via GitHub API...");
			const commitResult = await createApiCommit(token, releaseBranch, commitMessage);
			if (!commitResult.created) {
				core.warning("No changes to commit via API");
			} else {
				core.info(`✓ Created verified commit: ${commitResult.sha}`);
			}
		} else {
			core.info(`[DRY RUN] Would commit with message: ${commitMessage}`);
		}
	} else {
		core.info("No version changes from changesets");

		// Still need to force push to update the branch base
		if (!dryRun) {
			await execWithRetry("git", ["push", "-f", "-u", "origin", releaseBranch]);
			core.info(`Force pushed '${releaseBranch}' to sync with ${targetBranch}`);
		} else {
			core.info(`[DRY RUN] Would force push to sync: ${releaseBranch}`);
		}
	}

	core.endGroup();

	// Build check details using summaryWriter (markdown, not HTML)
	const checkStatusTable = summaryWriter.keyValueTable([
		{ key: "Branch", value: `\`${releaseBranch}\`` },
		{ key: "Base", value: `\`${targetBranch}\`` },
		{ key: "Strategy", value: "Recreate from main" },
		{ key: "Version Changes", value: hasChanges ? "✅ Yes" : "❌ No" },
		{
			key: "PR",
			value: prNumber
				? `[#${prNumber}](https://github.com/${context.repo.owner}/${context.repo.repo}/pull/${prNumber})`
				: "_N/A_",
		},
	]);

	const checkSections: Array<{ heading?: string; level?: 2 | 3; content: string }> = [
		{ heading: "Release Branch Updated", content: checkStatusTable },
	];

	if (hasChanges) {
		checkSections.push({
			heading: "Version Changes",
			level: 3,
			content: summaryWriter.codeBlock(versionSummary, "text"),
		});
	}

	const checkDetails = summaryWriter.build(checkSections);

	const { data: checkRun } = await github.rest.checks.create({
		owner: context.repo.owner,
		repo: context.repo.repo,
		name: dryRun ? "🧪 Update Release Branch (Dry Run)" : "Update Release Branch",
		head_sha: context.sha,
		status: "completed",
		conclusion: "success",
		output: {
			title: hasChanges ? "Release branch recreated from main with version changes" : "Release branch synced with main",
			summary: checkDetails,
		},
	});

	// Write job summary using summaryWriter (markdown, not HTML)
	const jobTitle = dryRun ? "🧪 Update Release Branch (Dry Run)" : "Update Release Branch";
	const jobStatusTable = summaryWriter.keyValueTable([
		{ key: "Branch", value: `\`${releaseBranch}\`` },
		{ key: "Base", value: `\`${targetBranch}\`` },
		{ key: "Strategy", value: "Recreate from main" },
		{ key: "Version Changes", value: hasChanges ? "✅ Yes" : "❌ No" },
		{ key: "PR", value: prNumber ? `#${prNumber}` : "_N/A_" },
	]);

	const jobSections: Array<{ heading?: string; level?: 2 | 3; content: string }> = [
		{
			heading: jobTitle,
			content: hasChanges
				? "✅ Release branch recreated from main with version changes"
				: "✅ Release branch synced with main (no version changes)",
		},
		{ heading: "Update Summary", level: 3, content: jobStatusTable },
	];

	if (hasChanges) {
		jobSections.push({
			heading: "Version Changes",
			level: 3,
			content: summaryWriter.codeBlock(versionSummary, "text"),
		});
	}

	await summaryWriter.write(summaryWriter.build(jobSections));

	return {
		success: true,
		hadConflicts: false,
		prNumber,
		checkId: checkRun.id,
		versionSummary,
	};
}
