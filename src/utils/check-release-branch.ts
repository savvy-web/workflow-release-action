import { getState, info, warning } from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { summaryWriter } from "./summary-writer.js";

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
export async function checkReleaseBranch(
	releaseBranch: string,
	targetBranch: string,
	dryRun: boolean,
): Promise<ReleaseBranchCheckResult> {
	// Check if branch exists
	let branchExists = false;

	const token = getState("token");
	if (!token) {
		throw new Error("No token available from state - ensure pre.ts ran successfully");
	}
	const github = getOctokit(token);

	try {
		await github.rest.repos.getBranch({
			owner: context.repo.owner,
			repo: context.repo.repo,
			branch: releaseBranch,
		});
		branchExists = true;
		info(`✓ Release branch '${releaseBranch}' exists`);
	} catch (error) {
		if ((error as { status?: number }).status === 404) {
			info(`Release branch '${releaseBranch}' does not exist`);
		} else {
			warning(
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
				info(`✓ Open PR found: #${prNumber} (${prs[0].html_url})`);
			} else {
				info(`No open PR found from '${releaseBranch}' to '${targetBranch}'`);
			}
		} catch (error) {
			warning(`Failed to check for open PRs: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	// Create GitHub check run
	const checkTitle = dryRun ? "🧪 Check Release Branch (Dry Run)" : "Check Release Branch";
	const checkSummary = branchExists
		? hasOpenPr
			? `Release branch exists with open PR #${prNumber}`
			: `Release branch exists without open PR`
		: `Release branch does not exist`;

	// Build check details using summaryWriter (markdown, not HTML)
	const statusTable = summaryWriter.keyValueTable([
		{ key: "Branch", value: `\`${releaseBranch}\`` },
		{ key: "Target", value: `\`${targetBranch}\`` },
		{ key: "Exists", value: branchExists ? "✅ Yes" : "❌ No" },
		{ key: "Open PR", value: hasOpenPr ? `✅ Yes (#${prNumber})` : "❌ No" },
	]);

	let nextSteps: string;
	if (hasOpenPr) {
		nextSteps = `An open release PR already exists. The workflow will update it with the latest changes from \`${targetBranch}\`.`;
	} else if (branchExists) {
		nextSteps = "The release branch exists but has no open PR. A new PR will be created.";
	} else {
		nextSteps = "No release branch exists. A new branch and PR will be created.";
	}

	const checkDetails = summaryWriter.build([
		{ heading: "Release Branch Status", content: statusTable },
		{ heading: "Next Steps", level: 3, content: nextSteps },
	]);

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

	info(`Created check run: ${checkRun.html_url}`);

	// Write job summary using summaryWriter (markdown, not HTML)
	const jobStatusTable = summaryWriter.keyValueTable([
		{ key: "Branch", value: `\`${releaseBranch}\`` },
		{ key: "Target", value: `\`${targetBranch}\`` },
		{ key: "Exists", value: branchExists ? "✅ Yes" : "❌ No" },
		{ key: "Open PR", value: hasOpenPr ? `✅ Yes (#${prNumber})` : "❌ No" },
	]);

	const jobSummary = summaryWriter.build([
		{ heading: checkTitle, content: checkSummary },
		{ heading: "Release Branch Status", level: 3, content: jobStatusTable },
	]);

	await summaryWriter.write(jobSummary);

	return {
		exists: branchExists,
		hasOpenPr,
		prNumber,
		checkId: checkRun.id,
	};
}
