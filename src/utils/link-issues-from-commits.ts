import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";

/**
 * Linked issue information
 */
interface LinkedIssue {
	/** Issue number */
	number: number;
	/** Issue title */
	title: string;
	/** Issue state */
	state: string;
	/** Issue URL */
	url: string;
	/** Commits that reference this issue */
	commits: string[];
}

/**
 * Link issues result
 */
interface LinkIssuesResult {
	/** Linked issues found */
	linkedIssues: LinkedIssue[];
	/** Commit SHAs processed */
	commits: string[];
	/** GitHub check run ID */
	checkId: number;
}

/**
 * Extracts issue references from commit messages
 *
 * Supports patterns:
 * - closes #123
 * - fixes #123
 * - resolves #123
 * - close #123, fix #123, resolve #123
 * - (case insensitive)
 *
 * @param message - Commit message to parse
 * @returns Array of issue numbers referenced
 */
function extractIssueReferences(message: string): number[] {
	const pattern = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi;
	const matches = message.matchAll(pattern);
	const issues = new Set<number>();

	for (const match of matches) {
		const issueNumber = Number.parseInt(match[1], 10);
		if (!Number.isNaN(issueNumber)) {
			issues.add(issueNumber);
		}
	}

	return Array.from(issues);
}

/**
 * Links issues from commits between release branch and target branch
 *



 * @param releaseBranch - Release branch name
 * @param targetBranch - Target branch to compare against
 * @param dryRun - Whether this is a dry-run
 * @returns Link issues result
 */
export async function linkIssuesFromCommits(
	releaseBranch: string,
	targetBranch: string,
	dryRun: boolean,
): Promise<LinkIssuesResult> {
	const token = core.getInput("token", { required: true });
	const github = getOctokit(token);
	core.startGroup("Linking issues from commits");

	// Compare commits between release branch and target branch
	core.info(`Comparing ${releaseBranch}...${targetBranch}`);

	const { data: comparison } = await github.rest.repos.compareCommits({
		owner: context.repo.owner,
		repo: context.repo.repo,
		base: targetBranch,
		head: releaseBranch,
	});

	const commits = comparison.commits.map((c) => ({
		sha: c.sha,
		message: c.commit.message,
		author: c.commit.author?.name || "Unknown",
	}));

	core.info(`Found ${commits.length} commit(s) in release branch`);

	// Extract issue references from all commits
	const issueMap = new Map<number, string[]>();

	for (const commit of commits) {
		const issues = extractIssueReferences(commit.message);
		core.debug(`Commit ${commit.sha.slice(0, 7)}: found ${issues.length} issue reference(s)`);

		for (const issueNumber of issues) {
			if (!issueMap.has(issueNumber)) {
				issueMap.set(issueNumber, []);
			}
			issueMap.get(issueNumber)?.push(commit.sha);
		}
	}

	core.info(`Found ${issueMap.size} unique issue reference(s)`);

	// Fetch issue details for each referenced issue
	const linkedIssues: LinkedIssue[] = [];

	for (const [issueNumber, commitShas] of issueMap.entries()) {
		try {
			const { data: issue } = await github.rest.issues.get({
				owner: context.repo.owner,
				repo: context.repo.repo,
				issue_number: issueNumber,
			});

			linkedIssues.push({
				number: issueNumber,
				title: issue.title,
				state: issue.state,
				url: issue.html_url,
				commits: commitShas,
			});

			core.info(`✓ Issue #${issueNumber}: ${issue.title} (${issue.state})`);
		} catch (error) {
			core.warning(`Failed to fetch issue #${issueNumber}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	core.endGroup();

	// Create GitHub check run
	const checkTitle = dryRun ? "🧪 Link Issues from Commits (Dry Run)" : "Link Issues from Commits";
	const checkSummary =
		linkedIssues.length > 0
			? `Found ${linkedIssues.length} linked issue(s) from ${commits.length} commit(s)`
			: `No issue references found in ${commits.length} commit(s)`;

	// Build check details using core.summary methods
	const checkSummaryBuilder = core.summary.addHeading("Linked Issues", 2).addEOL();

	if (linkedIssues.length > 0) {
		checkSummaryBuilder.addRaw(
			linkedIssues
				.map(
					(issue) =>
						`- [#${issue.number}](${issue.url}) - ${issue.title} (${issue.state})\n  Referenced by: ${issue.commits.map((sha) => `\`${sha.slice(0, 7)}\``).join(", ")}`,
				)
				.join("\n"),
		);
	} else {
		checkSummaryBuilder.addRaw("_No issue references found_");
	}

	checkSummaryBuilder
		.addEOL()
		.addEOL()
		.addHeading("Commits Analyzed", 2)
		.addEOL()
		.addRaw(`${commits.length} commit(s) between \`${targetBranch}\` and \`${releaseBranch}\``);

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
	const summaryBuilder = core.summary
		.addHeading(checkTitle, 2)
		.addRaw(checkSummary)
		.addEOL()
		.addHeading("Linked Issues", 3);

	if (linkedIssues.length > 0) {
		summaryBuilder.addTable([
			[
				{ data: "Issue", header: true },
				{ data: "Title", header: true },
				{ data: "State", header: true },
				{ data: "Commits", header: true },
			],
			...linkedIssues.map((issue) => [
				`[#${issue.number}](${issue.url})`,
				issue.title,
				issue.state,
				issue.commits.length.toString(),
			]),
		]);
	} else {
		summaryBuilder.addRaw("_No issue references found_").addEOL();
	}

	summaryBuilder.addHeading("Commits Analyzed", 3).addRaw(`${commits.length} commit(s)`).addEOL();

	await summaryBuilder.write();

	return {
		linkedIssues,
		commits: commits.map((c) => c.sha),
		checkId: checkRun.id,
	};
}
