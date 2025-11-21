import type * as core from "@actions/core";
import type { Context } from "@actions/github/lib/context";
import type { GitHub } from "@actions/github/lib/utils";
import type { AsyncFunctionArguments } from "../shared/types.js";

/**
 * Release branch check result
 */
interface ReleaseBranchCheckResult {
	/** Whether the release branch exists */
	exists: boolean;
	/** Whether there's an open PR to main */
	hasOpenPr: boolean;
	/** PR number if open PR exists */
	prNumber: number | null;
	/** GitHub check run ID */
	checkId: number;
}

/**
 * Checks if the release branch exists and has an open PR
 *
 * @param core - GitHub Actions core module
 * @param github - GitHub API client
 * @param context - GitHub Actions context
 * @param releaseBranch - Release branch name (default: changeset-release/main)
 * @param targetBranch - Target branch for PR (default: main)
 * @param dryRun - Whether this is a dry-run
 * @returns Release branch check result
 *
 * @remarks
 * This function:
 * 1. Checks if the release branch exists in the repository
 * 2. Searches for an open PR from release branch to target branch
 * 3. Creates a GitHub check run to report findings
 * 4. Returns branch status and PR information
 */
async function checkReleaseBranch(
	coreModule: typeof core,
	github: InstanceType<typeof GitHub>,
	context: Context,
	releaseBranch: string,
	targetBranch: string,
	dryRun: boolean,
): Promise<ReleaseBranchCheckResult> {
	const core = coreModule;
	// Check if branch exists
	let branchExists = false;
	try {
		await github.rest.repos.getBranch({
			owner: context.repo.owner,
			repo: context.repo.repo,
			branch: releaseBranch,
		});
		branchExists = true;
		core.info(`✓ Release branch '${releaseBranch}' exists`);
	} catch (error) {
		if ((error as { status?: number }).status === 404) {
			core.info(`Release branch '${releaseBranch}' does not exist`);
		} else {
			core.warning(
				`Failed to check if branch '${releaseBranch}' exists: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	// Check for open PR
	let hasOpenPr = false;
	let prNumber: number | null = null;

	if (branchExists) {
		try {
			const { data: prs } = await github.rest.pulls.list({
				owner: context.repo.owner,
				repo: context.repo.repo,
				state: "open",
				head: `${context.repo.owner}:${releaseBranch}`,
				base: targetBranch,
			});

			if (prs.length > 0) {
				hasOpenPr = true;
				prNumber = prs[0].number;
				core.info(`✓ Open PR found: #${prNumber} (${prs[0].html_url})`);
			} else {
				core.info(`No open PR found from '${releaseBranch}' to '${targetBranch}'`);
			}
		} catch (error) {
			core.warning(`Failed to check for open PRs: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	// Create GitHub check run
	const checkTitle = dryRun ? "🧪 Check Release Branch (Dry Run)" : "Check Release Branch";
	const checkSummary = branchExists
		? hasOpenPr
			? `Release branch exists with open PR #${prNumber}`
			: `Release branch exists without open PR`
		: `Release branch does not exist`;

	// Build check details using core.summary methods
	const checkSummaryBuilder = core.summary
		.addHeading("Release Branch Status", 2)
		.addEOL()
		.addTable([
			[
				{ data: "Property", header: true },
				{ data: "Value", header: true },
			],
			["Branch", `\`${releaseBranch}\``],
			["Target", `\`${targetBranch}\``],
			["Exists", branchExists ? "✅ Yes" : "❌ No"],
			["Open PR", hasOpenPr ? `✅ Yes (#${prNumber})` : "❌ No"],
		])
		.addEOL()
		.addHeading("Next Steps", 3)
		.addEOL();

	if (hasOpenPr) {
		checkSummaryBuilder.addRaw(
			`An open release PR already exists. The workflow will update it with the latest changes from \`${targetBranch}\`.`,
		);
	} else if (branchExists) {
		checkSummaryBuilder.addRaw("The release branch exists but has no open PR. A new PR will be created.");
	} else {
		checkSummaryBuilder.addRaw("No release branch exists. A new branch and PR will be created.");
	}

	if (dryRun) {
		checkSummaryBuilder.addEOL().addEOL().addRaw("---").addEOL().addRaw("**Mode**: Dry Run (Preview Only)");
	}

	const checkDetails = checkSummaryBuilder.stringify();

	const { data: checkRun } = await github.rest.checks.create({
		owner: context.repo.owner,
		repo: context.repo.repo,
		name: checkTitle,
		head_sha: context.sha,
		status: "completed",
		conclusion: "success",
		output: {
			title: checkSummary,
			summary: checkDetails,
		},
	});

	core.info(`Created check run: ${checkRun.html_url}`);

	// Write job summary
	await core.summary
		.addHeading(checkTitle, 2)
		.addRaw(checkSummary)
		.addEOL()
		.addHeading("Release Branch Status", 3)
		.addTable([
			[
				{ data: "Property", header: true },
				{ data: "Value", header: true },
			],
			["Branch", `\`${releaseBranch}\``],
			["Target", `\`${targetBranch}\``],
			["Exists", branchExists ? "✅ Yes" : "❌ No"],
			["Open PR", hasOpenPr ? `✅ Yes (#${prNumber})` : "❌ No"],
		])
		.write();

	return {
		exists: branchExists,
		hasOpenPr,
		prNumber,
		checkId: checkRun.id,
	};
}

/**
 * Main action entrypoint: Checks release branch status and sets GitHub Actions outputs
 *
 * @param args - Function arguments from github-script
 * @param args.core - GitHub Actions core module
 * @param args.github - GitHub API client
 * @param args.context - GitHub Actions context
 *
 * @remarks
 * This action checks if the release branch exists and has an open PR to main.
 * It sets the following outputs:
 * - `exists`: Whether the release branch exists (true | false)
 * - `has_open_pr`: Whether there's an open PR (true | false)
 * - `pr_number`: PR number if open PR exists (number | empty string)
 * - `check_id`: GitHub check run ID
 *
 * The action respects environment variables:
 * - `RELEASE_BRANCH`: Release branch name (default: changeset-release/main)
 * - `TARGET_BRANCH`: Target branch for PR (default: main)
 * - `DRY_RUN`: Whether this is a dry-run (true | false)
 *
 * @example
 * ```yaml
 * - uses: actions/github-script@v8
 *   env:
 *     RELEASE_BRANCH: changeset-release/main
 *     TARGET_BRANCH: main
 *     DRY_RUN: ${{ inputs.dry_run }}
 *   with:
 *     script: |
 *       const { default: checkReleaseBranch } = await import('${{ github.workspace }}/.github/actions/setup-release/check-release-branch.ts');
 *       await checkReleaseBranch({ core, github, context });
 * ```
 */
export default async ({ core, github, context }: AsyncFunctionArguments): Promise<void> => {
	try {
		const releaseBranch = process.env.RELEASE_BRANCH || "changeset-release/main";
		const targetBranch = process.env.TARGET_BRANCH || "main";
		const dryRun = process.env.DRY_RUN === "true";

		if (dryRun) {
			core.notice("🧪 Running in dry-run mode (preview only)");
		}

		const result = await checkReleaseBranch(core, github, context, releaseBranch, targetBranch, dryRun);

		// Set outputs
		core.setOutput("exists", result.exists.toString());
		core.setOutput("has_open_pr", result.hasOpenPr.toString());
		core.setOutput("pr_number", result.prNumber !== null ? result.prNumber.toString() : "");
		core.setOutput("check_id", result.checkId.toString());

		// Log summary
		if (result.exists) {
			if (result.hasOpenPr) {
				core.notice(`✓ Release branch '${releaseBranch}' exists with open PR #${result.prNumber}`);
			} else {
				core.notice(`✓ Release branch '${releaseBranch}' exists without open PR`);
			}
		} else {
			core.notice(`✓ Release branch '${releaseBranch}' does not exist`);
		}

		// Debug outputs
		core.debug(`Set output 'exists' to: ${result.exists}`);
		core.debug(`Set output 'has_open_pr' to: ${result.hasOpenPr}`);
		core.debug(`Set output 'pr_number' to: ${result.prNumber !== null ? result.prNumber : ""}`);
		core.debug(`Set output 'check_id' to: ${result.checkId}`);
	} catch (error) {
		/* v8 ignore next -- @preserve */
		core.setFailed(`Failed to check release branch: ${error instanceof Error ? error.message : String(error)}`);
	}
};
