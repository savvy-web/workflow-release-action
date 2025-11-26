import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { context, getOctokit } from "@actions/github";
import { summaryWriter } from "./summary-writer.js";

/**
 * Update release branch result
 */
interface UpdateReleaseBranchResult {
	/** Whether the update was successful */
	success: boolean;
	/** Whether there were merge conflicts */
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

	core.startGroup("Updating release branch");

	// Configure git
	await exec.exec("git", ["config", "user.name", "github-actions[bot]"]);
	await exec.exec("git", ["config", "user.email", "github-actions[bot]@users.noreply.github.com"]);

	// Checkout release branch
	core.info(`Checking out release branch '${releaseBranch}'`);
	if (!dryRun) {
		await exec.exec("git", ["fetch", "origin", releaseBranch]);
		await exec.exec("git", ["checkout", releaseBranch]);
	} else {
		core.info(`[DRY RUN] Would checkout: ${releaseBranch}`);
	}

	// Merge target branch
	core.info(`Merging '${targetBranch}' into '${releaseBranch}'`);
	let hadConflicts = false;
	let mergeError = "";

	if (!dryRun) {
		try {
			await exec.exec(
				"git",
				["merge", `origin/${targetBranch}`, "--no-ff", "-m", `Merge ${targetBranch} into ${releaseBranch}`],
				{
					listeners: {
						stderr: (data: Buffer) => {
							mergeError += data.toString();
						},
					},
					ignoreReturnCode: true,
				},
			);

			// Check for conflicts
			let statusOutput = "";
			await exec.exec("git", ["status", "--porcelain"], {
				listeners: {
					stdout: (data: Buffer) => {
						statusOutput += data.toString();
					},
				},
			});

			hadConflicts = statusOutput.includes("UU") || mergeError.includes("CONFLICT");

			if (hadConflicts) {
				core.warning("Merge conflicts detected");
				core.info("Aborting merge");
				await exec.exec("git", ["merge", "--abort"]);
			}
		} catch (error) {
			core.warning(`Merge failed: ${error instanceof Error ? error.message : String(error)}`);
			hadConflicts = true;
		}
	} else {
		core.info(`[DRY RUN] Would merge origin/${targetBranch} into ${releaseBranch}`);
	}

	if (hadConflicts) {
		// Handle conflicts
		core.warning(`Merge conflicts between '${releaseBranch}' and '${targetBranch}'`);

		// Post comment to PR about conflicts
		if (prNumber && !dryRun) {
			const conflictComment = `
## ⚠️ Merge Conflicts Detected

The release branch has conflicts with \`${targetBranch}\` and needs manual resolution.

### Steps to Resolve

1. Checkout the release branch locally:
   \`\`\`bash
   git fetch origin
   git checkout ${releaseBranch}
   git merge origin/${targetBranch}
   \`\`\`

2. Resolve conflicts in the affected files

3. Complete the merge:
   \`\`\`bash
   git add .
   git commit -m "Merge ${targetBranch} into ${releaseBranch}"
   git push origin ${releaseBranch}
   \`\`\`

4. Re-run the release workflow

---
🤖 Generated by [GitHub Actions](https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId})
`;

			await github.rest.issues.createComment({
				owner: context.repo.owner,
				repo: context.repo.repo,
				issue_number: prNumber,
				body: conflictComment,
			});

			// Add conflict label
			await github.rest.issues.addLabels({
				owner: context.repo.owner,
				repo: context.repo.repo,
				issue_number: prNumber,
				labels: ["conflicts"],
			});

			core.info("Posted conflict resolution instructions to PR");
		}

		core.endGroup();

		// Create check run for conflicts
		const { data: checkRun } = await github.rest.checks.create({
			owner: context.repo.owner,
			repo: context.repo.repo,
			name: dryRun ? "🧪 Update Release Branch (Dry Run)" : "Update Release Branch",
			head_sha: context.sha,
			status: "completed",
			conclusion: "action_required",
			output: {
				title: "Merge conflicts detected",
				summary: `Conflicts between \`${releaseBranch}\` and \`${targetBranch}\` require manual resolution.`,
				text: prNumber
					? `See PR #${prNumber} for resolution instructions.`
					: "Please resolve conflicts manually and re-run the workflow.",
			},
		});

		// Write job summary using summaryWriter (markdown, not HTML)
		const conflictTitle = dryRun ? "🧪 Update Release Branch (Dry Run)" : "Update Release Branch";
		const conflictSummary = summaryWriter.build([
			{ heading: conflictTitle, content: "⚠️ Merge conflicts detected" },
			{ content: `Conflicts between \`${releaseBranch}\` and \`${targetBranch}\` require manual resolution.` },
			{
				content: prNumber
					? `See PR #${prNumber} for resolution instructions.`
					: "Please resolve conflicts manually and re-run the workflow.",
			},
		]);
		await summaryWriter.write(conflictSummary);

		return {
			success: false,
			hadConflicts: true,
			prNumber,
			checkId: checkRun.id,
			versionSummary: "",
		};
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

		// Commit changes
		const commitMessage = `chore: update versions\n\nUpdate versions from changesets after merging ${targetBranch}`;
		if (!dryRun) {
			await exec.exec("git", ["add", "."]);
			await exec.exec("git", ["commit", "-m", commitMessage]);
		} else {
			core.info(`[DRY RUN] Would commit with message: ${commitMessage}`);
		}

		// Push updates with retry
		core.info(`Pushing updates to '${releaseBranch}'`);
		if (!dryRun) {
			await execWithRetry("git", ["push", "origin", releaseBranch]);
		} else {
			core.info(`[DRY RUN] Would push to: ${releaseBranch}`);
		}
	} else {
		core.info("No new version changes after merge");
	}

	core.endGroup();

	// Build check details using summaryWriter (markdown, not HTML)
	const checkStatusTable = summaryWriter.keyValueTable([
		{ key: "Branch", value: `\`${releaseBranch}\`` },
		{ key: "Target", value: `\`${targetBranch}\`` },
		{ key: "Conflicts", value: "❌ None" },
		{ key: "New Changes", value: hasChanges ? "✅ Yes" : "❌ No" },
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
			title: hasChanges ? "Release branch updated with new changes" : "Release branch updated (no new changes)",
			summary: checkDetails,
		},
	});

	// Write job summary using summaryWriter (markdown, not HTML)
	const jobTitle = dryRun ? "🧪 Update Release Branch (Dry Run)" : "Update Release Branch";
	const jobStatusTable = summaryWriter.keyValueTable([
		{ key: "Branch", value: `\`${releaseBranch}\`` },
		{ key: "Target", value: `\`${targetBranch}\`` },
		{ key: "Conflicts", value: "❌ No" },
		{ key: "New Changes", value: hasChanges ? "✅ Yes" : "❌ No" },
		{ key: "PR", value: prNumber ? `#${prNumber}` : "_N/A_" },
	]);

	const jobSections: Array<{ heading?: string; level?: 2 | 3; content: string }> = [
		{
			heading: jobTitle,
			content: hasChanges ? "✅ Release branch updated with new changes" : "✅ Release branch updated (no new changes)",
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
