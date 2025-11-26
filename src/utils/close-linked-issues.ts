import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { summaryWriter } from "./summary-writer.js";

/**
 * Closed issue information
 */
interface ClosedIssue {
	/** Issue number */
	number: number;
	/** Issue title */
	title: string;
	/** Whether close was successful */
	closed: boolean;
	/** Error message if close failed */
	error?: string;
}

/**
 * Result of closing linked issues
 */
interface CloseLinkedIssuesResult {
	/** Number of issues successfully closed */
	closedCount: number;
	/** Number of issues that failed to close */
	failedCount: number;
	/** Details of each issue */
	issues: ClosedIssue[];
	/** GitHub check run ID */
	checkId: number;
}

/**
 * Extracts issue numbers from PR body's linked issues section
 *
 * Looks for patterns like:
 * - #123: Issue title
 * - ~~#123: Issue title~~ (strikethrough for closed)
 *
 * @param body - PR body text
 * @returns Array of unique issue numbers
 */
function extractIssuesFromPRBody(body: string): number[] {
	// Find the linked issues section
	const linkedIssuesStart = body.indexOf("## Linked Issues");
	if (linkedIssuesStart === -1) {
		return [];
	}

	// Find the end of the section (next ## heading or end of string)
	const nextHeadingIndex = body.indexOf("\n## ", linkedIssuesStart + 1);
	const sectionEnd = nextHeadingIndex !== -1 ? nextHeadingIndex : body.length;
	const linkedIssuesSection = body.substring(linkedIssuesStart, sectionEnd);

	// Extract issue numbers from "- #123" or "- ~~#123" patterns
	const pattern = /- (?:~~)?#(\d+)/g;
	const matches = linkedIssuesSection.matchAll(pattern);
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
 * Extracts commit info from PR body's linked issues section
 *
 * Looks for commit references that we added when collecting linked issues
 * Format: <!-- commit:SHA:title -->
 *
 * @param body - PR body text
 * @returns Array of commit info objects
 */
function extractCommitsFromPRBody(body: string): Array<{ sha: string; title: string }> {
	const commits: Array<{ sha: string; title: string }> = [];
	const pattern = /<!-- commit:([a-f0-9]+):(.+?) -->/gi;
	const matches = body.matchAll(pattern);

	for (const match of matches) {
		commits.push({
			sha: match[1],
			title: match[2],
		});
	}

	return commits;
}

/**
 * Closes linked issues when a release PR is merged
 *
 * Parses the PR body to find issues in the "## Linked Issues" section
 * that were added by updateReleaseBranch when collecting changeset commits.
 *
 * @param token - GitHub token
 * @param prNumber - PR number that was merged
 * @param dryRun - Whether this is a dry-run
 * @returns Result with closed issues count and details
 */
export async function closeLinkedIssues(
	token: string,
	prNumber: number,
	dryRun: boolean,
): Promise<CloseLinkedIssuesResult> {
	const github = getOctokit(token);
	const issues: ClosedIssue[] = [];
	let closedCount = 0;
	let failedCount = 0;

	core.startGroup("Closing linked issues");

	// Fetch the PR to get its body
	const { data: pr } = await github.rest.pulls.get({
		owner: context.repo.owner,
		repo: context.repo.repo,
		pull_number: prNumber,
	});

	const prBody = pr.body || "";

	// Log any commit info embedded in the PR body (for debugging)
	const commits = extractCommitsFromPRBody(prBody);
	if (commits.length > 0) {
		core.info("Changeset commits that introduced linked issues:");
		for (const commit of commits) {
			core.info(`  ${commit.sha.slice(0, 7)} ${commit.title}`);
		}
	}

	// Extract issue numbers from PR body
	const issueNumbers = extractIssuesFromPRBody(prBody);
	core.info(`Found ${issueNumbers.length} linked issue(s) in PR #${prNumber} body`);

	if (issueNumbers.length === 0) {
		core.info("No linked issues to close");
		core.endGroup();

		// Create check run even with no issues
		const { data: checkRun } = await github.rest.checks.create({
			owner: context.repo.owner,
			repo: context.repo.repo,
			name: dryRun ? "🧪 Close Linked Issues (Dry Run)" : "Close Linked Issues",
			head_sha: context.sha,
			status: "completed",
			conclusion: "success",
			output: {
				title: "No linked issues to close",
				summary: `PR #${prNumber} had no linked issues.`,
			},
		});

		return {
			closedCount: 0,
			failedCount: 0,
			issues: [],
			checkId: checkRun.id,
		};
	}

	// Close each linked issue
	for (const issueNumber of issueNumbers) {
		try {
			// Fetch issue details to check state
			const { data: issue } = await github.rest.issues.get({
				owner: context.repo.owner,
				repo: context.repo.repo,
				issue_number: issueNumber,
			});

			// Check if already closed
			if (issue.state === "closed") {
				core.info(`Issue #${issueNumber} is already closed, skipping`);
				issues.push({
					number: issueNumber,
					title: issue.title,
					closed: true,
					error: "Already closed",
				});
				continue;
			}

			if (!dryRun) {
				// Close the issue with a comment
				await github.rest.issues.createComment({
					owner: context.repo.owner,
					repo: context.repo.repo,
					issue_number: issueNumber,
					body: `Closed by release PR #${prNumber} merge.\n\n🤖 _Automated by workflow-release-action_`,
				});

				await github.rest.issues.update({
					owner: context.repo.owner,
					repo: context.repo.repo,
					issue_number: issueNumber,
					state: "closed",
					state_reason: "completed",
				});

				core.info(`✓ Closed issue #${issueNumber}: ${issue.title}`);
			} else {
				core.info(`[DRY RUN] Would close issue #${issueNumber}: ${issue.title}`);
			}

			issues.push({
				number: issueNumber,
				title: issue.title,
				closed: true,
			});
			closedCount++;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			core.warning(`Failed to close issue #${issueNumber}: ${errorMessage}`);
			issues.push({
				number: issueNumber,
				title: `Issue #${issueNumber}`,
				closed: false,
				error: errorMessage,
			});
			failedCount++;
		}
	}

	core.endGroup();

	// Create check run
	const checkTitle = dryRun ? "🧪 Close Linked Issues (Dry Run)" : "Close Linked Issues";

	const issuesTable = summaryWriter.table(
		["Issue", "Title", "Status"],
		issues.map((issue) => [
			`[#${issue.number}](https://github.com/${context.repo.owner}/${context.repo.repo}/issues/${issue.number})`,
			issue.title,
			issue.closed ? (issue.error === "Already closed" ? "⏭️ Already closed" : "✅ Closed") : `❌ ${issue.error}`,
		]),
	);

	const checkSections: Array<{ heading?: string; level?: 2 | 3; content: string }> = [
		{
			heading: "Linked Issues Closed",
			content: `Closed ${closedCount} issue(s) from PR #${prNumber}${failedCount > 0 ? ` (${failedCount} failed)` : ""}`,
		},
		{ heading: "Issues", level: 3, content: issuesTable },
	];

	const checkDetails = summaryWriter.build(checkSections);

	const { data: checkRun } = await github.rest.checks.create({
		owner: context.repo.owner,
		repo: context.repo.repo,
		name: checkTitle,
		head_sha: context.sha,
		status: "completed",
		conclusion: failedCount > 0 ? "neutral" : "success",
		output: {
			title: `Closed ${closedCount} linked issue(s)`,
			summary: checkDetails,
		},
	});

	core.info(`Created check run: ${checkRun.html_url}`);

	// Write job summary
	const jobSummary = summaryWriter.build([
		{
			heading: checkTitle,
			content: `Closed ${closedCount} issue(s) from PR #${prNumber}${failedCount > 0 ? ` (${failedCount} failed)` : ""}`,
		},
		{ heading: "Issues", level: 3, content: issuesTable },
	]);

	await summaryWriter.write(jobSummary);

	return {
		closedCount,
		failedCount,
		issues,
		checkId: checkRun.id,
	};
}
