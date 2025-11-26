import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { context, getOctokit } from "@actions/github";
import { createApiCommit, updateBranchToRef } from "./create-api-commit.js";
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
	// Find the PR for this release branch (open or closed)
	let prNumber: number | null = null;
	let prWasClosed = false;
	try {
		// First check for open PRs
		const { data: openPrs } = await github.rest.pulls.list({
			owner: context.repo.owner,
			repo: context.repo.repo,
			state: "open",
			head: `${context.repo.owner}:${releaseBranch}`,
			base: targetBranch,
		});
		if (openPrs.length > 0) {
			prNumber = openPrs[0].number;
		} else {
			// Check for closed PRs (force push can close them)
			const { data: closedPrs } = await github.rest.pulls.list({
				owner: context.repo.owner,
				repo: context.repo.repo,
				state: "closed",
				head: `${context.repo.owner}:${releaseBranch}`,
				base: targetBranch,
			});
			// Find a closed PR that wasn't merged (merged PRs have merged_at set)
			const unmergedClosedPr = closedPrs.find((pr) => !pr.merged_at);
			if (unmergedClosedPr) {
				prNumber = unmergedClosedPr.number;
				prWasClosed = true;
				core.info(`Found closed (unmerged) PR #${prNumber} - will reopen after branch update`);
			}
		}
	} catch (error) {
		core.warning(`Could not find PR: ${error instanceof Error ? error.message : String(error)}`);
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

		// Create commit via GitHub API on top of main, then update release branch ref
		// This is a single atomic operation - no separate force push needed
		const commitMessage = `${prTitlePrefix}\n\nVersion bump from changesets (rebased on ${targetBranch})`;
		if (!dryRun) {
			core.info("Creating verified commit via GitHub API (rebasing onto main)...");
			const commitResult = await createApiCommit(token, releaseBranch, commitMessage, {
				parentBranch: targetBranch,
			});
			if (!commitResult.created) {
				core.warning("No changes to commit via API");
			} else {
				core.info(`✓ Created verified commit: ${commitResult.sha}`);
			}
		} else {
			core.info(`[DRY RUN] Would create API commit with message: ${commitMessage}`);
		}
	} else {
		core.info("No version changes from changesets");

		// Update release branch to point to main via API (no git push needed)
		if (!dryRun) {
			const sha = await updateBranchToRef(token, releaseBranch, targetBranch);
			core.info(`✓ Updated '${releaseBranch}' to match '${targetBranch}' (${sha})`);
		} else {
			core.info(`[DRY RUN] Would update ${releaseBranch} to match ${targetBranch}`);
		}
	}

	core.endGroup();

	// Reopen PR if it was closed by force push
	if (prWasClosed && prNumber && !dryRun) {
		core.startGroup("Reopening closed PR");
		try {
			await github.rest.pulls.update({
				owner: context.repo.owner,
				repo: context.repo.repo,
				pull_number: prNumber,
				state: "open",
			});
			core.info(`✓ Reopened PR #${prNumber}`);
		} catch (error) {
			core.warning(`Could not reopen PR #${prNumber}: ${error instanceof Error ? error.message : String(error)}`);
		}
		core.endGroup();
	} else if (prWasClosed && prNumber && dryRun) {
		core.info(`[DRY RUN] Would reopen PR #${prNumber}`);
	}

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
