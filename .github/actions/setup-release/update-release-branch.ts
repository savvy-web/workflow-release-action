import type * as core from "@actions/core";
import type * as exec from "@actions/exec";
import type { Context } from "@actions/github/lib/context";
import type { GitHub } from "@actions/github/lib/utils";
import type { AsyncFunctionArguments } from "../shared/types.js";

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
 * @param core - GitHub Actions core module
 * @param exec - GitHub Actions exec module
 * @param command - Command to execute
 * @param args - Command arguments
 * @param options - Exec options
 * @param maxRetries - Maximum number of retries (default: 3)
 * @returns Promise that resolves when command succeeds
 */
async function execWithRetry(
	coreModule: typeof core,
	execModule: typeof exec,
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
			await execModule.exec(command, args, options);
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
			coreModule.warning(`Attempt ${attempt + 1} failed: ${errorMessage}. Retrying in ${Math.round(delay)}ms...`);

			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}
}

/**
 * Updates the release branch with changes from target branch
 *
 * @param core - GitHub Actions core module
 * @param exec - GitHub Actions exec module
 * @param github - GitHub API client
 * @param context - GitHub Actions context
 * @param releaseBranch - Release branch name
 * @param targetBranch - Target branch to merge from
 * @param prNumber - PR number if it exists
 * @param packageManager - Package manager to use
 * @param versionCommand - Custom version command
 * @param dryRun - Whether this is a dry-run
 * @returns Update release branch result
 */
async function updateReleaseBranch(
	coreModule: typeof core,
	execModule: typeof exec,
	github: InstanceType<typeof GitHub>,
	context: Context,
	releaseBranch: string,
	targetBranch: string,
	prNumber: number | null,
	packageManager: string,
	versionCommand: string,
	dryRun: boolean,
): Promise<UpdateReleaseBranchResult> {
	const core = coreModule;
	const exec = execModule;

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

	// Handle conflicts
	if (hadConflicts) {
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

		// Write job summary
		await core.summary
			.addHeading(dryRun ? "🧪 Update Release Branch (Dry Run)" : "Update Release Branch", 2)
			.addRaw("⚠️ Merge conflicts detected")
			.addEOL()
			.addRaw(`Conflicts between \`${releaseBranch}\` and \`${targetBranch}\` require manual resolution.`)
			.addEOL()
			.addRaw(
				prNumber
					? `See PR #${prNumber} for resolution instructions.`
					: "Please resolve conflicts manually and re-run the workflow.",
			)
			.write();

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
		await execWithRetry(coreModule, execModule, versionCmd, versionArgs);
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
			await execWithRetry(coreModule, execModule, "git", ["push", "origin", releaseBranch]);
		} else {
			core.info(`[DRY RUN] Would push to: ${releaseBranch}`);
		}
	} else {
		core.info("No new version changes after merge");
	}

	core.endGroup();

	// Build check details using core.summary methods
	const checkSummaryBuilder = core.summary
		.addHeading("Release Branch Updated", 2)
		.addEOL()
		.addTable([
			[
				{ data: "Property", header: true },
				{ data: "Value", header: true },
			],
			["Branch", `\`${releaseBranch}\``],
			["Target", `\`${targetBranch}\``],
			["Conflicts", "❌ None"],
			["New Changes", hasChanges ? "✅ Yes" : "❌ No"],
			[
				"PR",
				prNumber
					? `[#${prNumber}](https://github.com/${context.repo.owner}/${context.repo.repo}/pull/${prNumber})`
					: "_N/A_",
			],
		]);

	if (hasChanges) {
		checkSummaryBuilder.addEOL().addHeading("Version Changes", 3).addEOL().addCodeBlock(versionSummary, "text");
	}

	if (dryRun) {
		checkSummaryBuilder.addEOL().addRaw("---").addEOL().addRaw("**Mode**: Dry Run (Preview Only)");
	}

	const checkDetails = checkSummaryBuilder.stringify();

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

	// Write job summary
	const summaryBuilder = core.summary
		.addHeading(dryRun ? "🧪 Update Release Branch (Dry Run)" : "Update Release Branch", 2)
		.addRaw(hasChanges ? "✅ Release branch updated with new changes" : "✅ Release branch updated (no new changes)")
		.addEOL()
		.addHeading("Update Summary", 3)
		.addTable([
			[
				{ data: "Property", header: true },
				{ data: "Value", header: true },
			],
			["Branch", `\`${releaseBranch}\``],
			["Target", `\`${targetBranch}\``],
			["Conflicts", "❌ No"],
			["New Changes", hasChanges ? "✅ Yes" : "❌ No"],
			["PR", prNumber ? `#${prNumber}` : "_N/A_"],
		]);

	if (hasChanges) {
		summaryBuilder.addHeading("Version Changes", 3).addCodeBlock(versionSummary, "text");
	}

	await summaryBuilder.write();

	return {
		success: true,
		hadConflicts: false,
		prNumber,
		checkId: checkRun.id,
		versionSummary,
	};
}

/**
 * Main action entrypoint: Updates release branch and sets GitHub Actions outputs
 *
 * @param args - Function arguments from github-script
 * @param args.core - GitHub Actions core module
 * @param args.exec - GitHub Actions exec module
 * @param args.github - GitHub API client
 * @param args.context - GitHub Actions context
 *
 * @remarks
 * This action merges the target branch into the release branch and runs changeset version.
 * It sets the following outputs:
 * - `success`: Whether the update was successful (true | false)
 * - `had_conflicts`: Whether there were merge conflicts (true | false)
 * - `pr_number`: PR number if it exists (number | empty string)
 * - `check_id`: GitHub check run ID
 * - `version_summary`: Summary of version changes
 *
 * The action respects environment variables:
 * - `RELEASE_BRANCH`: Release branch name (default: changeset-release/main)
 * - `TARGET_BRANCH`: Target branch to merge from (default: main)
 * - `PR_NUMBER`: PR number if it exists (default: empty)
 * - `PACKAGE_MANAGER`: Package manager to use (default: pnpm)
 * - `VERSION_COMMAND`: Custom version command (default: empty, uses package manager default)
 * - `DRY_RUN`: Whether this is a dry-run (true | false)
 *
 * @example
 * ```yaml
 * - uses: actions/github-script@v8
 *   env:
 *     RELEASE_BRANCH: changeset-release/main
 *     TARGET_BRANCH: main
 *     PR_NUMBER: ${{ steps.check-release-branch.outputs.pr_number }}
 *     PACKAGE_MANAGER: ${{ steps.detect-repo-type.outputs.package-manager }}
 *     VERSION_COMMAND: ""
 *     DRY_RUN: ${{ inputs.dry_run }}
 *   with:
 *     script: |
 *       const { default: updateReleaseBranch } = await import('${{ github.workspace }}/.github/actions/setup-release/update-release-branch.ts');
 *       await updateReleaseBranch({ core, exec, github, context });
 * ```
 */
export default async ({ core, exec, github, context }: AsyncFunctionArguments): Promise<void> => {
	try {
		const releaseBranch = process.env.RELEASE_BRANCH || "changeset-release/main";
		const targetBranch = process.env.TARGET_BRANCH || "main";
		const prNumberEnv = process.env.PR_NUMBER || "";
		const prNumber = prNumberEnv !== "" ? Number.parseInt(prNumberEnv, 10) : null;
		const packageManager = process.env.PACKAGE_MANAGER || "pnpm";
		const versionCommand = process.env.VERSION_COMMAND || "";
		const dryRun = process.env.DRY_RUN === "true";

		if (dryRun) {
			core.notice("🧪 Running in dry-run mode (preview only)");
		}

		const result = await updateReleaseBranch(
			core,
			exec,
			github,
			context,
			releaseBranch,
			targetBranch,
			prNumber,
			packageManager,
			versionCommand,
			dryRun,
		);

		// Set outputs
		core.setOutput("success", result.success.toString());
		core.setOutput("had_conflicts", result.hadConflicts.toString());
		core.setOutput("pr_number", result.prNumber !== null ? result.prNumber.toString() : "");
		core.setOutput("check_id", result.checkId.toString());
		core.setOutput("version_summary", result.versionSummary);

		// Log summary
		if (result.success) {
			core.notice(`✓ Successfully updated release branch '${releaseBranch}'`);
		} else if (result.hadConflicts) {
			core.warning(`⚠️ Merge conflicts detected between '${releaseBranch}' and '${targetBranch}'`);
		}

		// Debug outputs
		core.debug(`Set output 'success' to: ${result.success}`);
		core.debug(`Set output 'had_conflicts' to: ${result.hadConflicts}`);
		core.debug(`Set output 'pr_number' to: ${result.prNumber !== null ? result.prNumber : ""}`);
		core.debug(`Set output 'check_id' to: ${result.checkId}`);
		core.debug(`Set output 'version_summary' to: ${result.versionSummary}`);
	} catch (error) {
		/* v8 ignore next -- @preserve */
		core.setFailed(`Failed to update release branch: ${error instanceof Error ? error.message : String(error)}`);
	}
};
