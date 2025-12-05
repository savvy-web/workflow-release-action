import { debug, endGroup, getBooleanInput, getInput, getState, info, startGroup, warning } from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { summaryWriter } from "./summary-writer.js";

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
 * Commit information
 */
interface CommitInfo {
	/** Commit SHA */
	sha: string;
	/** Commit message */
	message: string;
	/** Commit author */
	author: string;
}

/**
 * Link issues result
 */
interface LinkIssuesResult {
	/** Linked issues found */
	linkedIssues: LinkedIssue[];
	/** Commits with full info */
	commits: CommitInfo[];
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
		/* v8 ignore next -- @preserve - Defensive: regex \d+ always captures valid digits */
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
export async function linkIssuesFromCommits(): Promise<LinkIssuesResult> {
	// Read all inputs
	const token = getState("token");
	if (!token) {
		throw new Error("No token available from state - ensure pre.ts ran successfully");
	}
	const releaseBranch = getInput("release-branch") || "changeset-release/main";
	const targetBranch = getInput("target-branch") || "main";
	const dryRun = getBooleanInput("dry-run") || false;

	const github = getOctokit(token);
	startGroup("Linking issues from commits");

	// Compare commits between release branch and target branch
	info(`Comparing ${releaseBranch}...${targetBranch}`);

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

	info(`Found ${commits.length} commit(s) in release branch`);

	// Extract issue references from all commits
	const issueMap = new Map<number, string[]>();

	for (const commit of commits) {
		const issues = extractIssueReferences(commit.message);
		debug(`Commit ${commit.sha.slice(0, 7)}: found ${issues.length} issue reference(s)`);

		for (const issueNumber of issues) {
			if (!issueMap.has(issueNumber)) {
				issueMap.set(issueNumber, []);
			}
			issueMap.get(issueNumber)?.push(commit.sha);
		}
	}

	info(`Found ${issueMap.size} unique issue reference(s)`);

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

			info(`✓ Issue #${issueNumber}: ${issue.title} (${issue.state})`);
		} catch (error) {
			warning(`Failed to fetch issue #${issueNumber}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	endGroup();

	// Create GitHub check run
	const checkTitle = dryRun ? "🧪 Link Issues from Commits (Dry Run)" : "Link Issues from Commits";
	const checkSummary =
		linkedIssues.length > 0
			? `Found ${linkedIssues.length} linked issue(s) from ${commits.length} commit(s)`
			: `No issue references found in ${commits.length} commit(s)`;

	// Build linked issues section using GFM shorthand
	const issuesContent =
		linkedIssues.length > 0
			? linkedIssues
					.map((issue) => {
						const stateIcon = issue.state === "open" ? "🟢" : "🟣";
						return `- ${stateIcon} #${issue.number} — ${issue.title}`;
					})
					.join("\n")
			: "_No issue references found in commits_";

	// Build commits section with blockquotes
	const commitsContent =
		commits.length > 0
			? commits
					.map((commit) => {
						const shortSha = commit.sha.slice(0, 7);
						const commitUrl = `https://github.com/${context.repo.owner}/${context.repo.repo}/commit/${commit.sha}`;
						// Get first line of commit message
						const firstLine = commit.message.split("\n")[0];
						return `[\`${shortSha}\`](${commitUrl})\n> ${firstLine}`;
					})
					.join("\n\n")
			: "_No commits found_";

	const checkDetails = summaryWriter.build([
		{ heading: "🔗 Linked Issues", level: 3, content: issuesContent },
		{ heading: "📝 Commits Analyzed", level: 3, content: commitsContent },
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

	return {
		linkedIssues,
		commits,
		checkId: checkRun.id,
	};
}
