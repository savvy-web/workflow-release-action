import { endGroup, info, startGroup, warning } from "@actions/core";
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
 * GraphQL response for closing issues references
 */
interface ClosingIssuesResponse {
	repository: {
		pullRequest: {
			closingIssuesReferences: {
				nodes: Array<{
					number: number;
					title: string;
					state: "OPEN" | "CLOSED";
				}>;
			};
		};
	};
}

/**
 * Gets linked issues from a PR using GitHub's GraphQL closingIssuesReferences
 *
 * This finds issues that are linked to the PR via:
 * - Keywords in PR body/title (fixes #123, closes #123, etc.)
 * - linkBranch GraphQL mutation (Development section linking)
 *
 * @param github - GitHub API client
 * @param prNumber - PR number to query
 * @returns Array of linked issues with their state
 */
async function getLinkedIssues(
	github: ReturnType<typeof getOctokit>,
	prNumber: number,
): Promise<Array<{ number: number; title: string; state: string }>> {
	try {
		const response = await github.graphql<ClosingIssuesResponse>(
			`
			query GetClosingIssues($owner: String!, $repo: String!, $prNumber: Int!) {
				repository(owner: $owner, name: $repo) {
					pullRequest(number: $prNumber) {
						closingIssuesReferences(first: 50) {
							nodes {
								number
								title
								state
							}
						}
					}
				}
			}
			`,
			{
				owner: context.repo.owner,
				repo: context.repo.repo,
				prNumber,
			},
		);

		return response.repository.pullRequest.closingIssuesReferences.nodes;
	} catch (err) {
		warning(`Failed to query linked issues via GraphQL: ${err instanceof Error ? err.message : String(err)}`);
		return [];
	}
}

/**
 * Closes linked issues when a release PR is merged
 *
 * Uses GitHub's GraphQL API to find issues linked to the PR via
 * closingIssuesReferences, which includes issues linked via:
 * - Keywords in PR body/title
 * - linkBranch mutations (Development section)
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

	startGroup("Closing linked issues");

	// Get linked issues via GraphQL
	const linkedIssues = await getLinkedIssues(github, prNumber);
	info(`Found ${linkedIssues.length} linked issue(s) for PR #${prNumber}`);

	if (linkedIssues.length === 0) {
		info("No linked issues to close");
		endGroup();

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
	for (const linkedIssue of linkedIssues) {
		const issueNumber = linkedIssue.number;

		try {
			// Check if already closed (GraphQL gives us state)
			if (linkedIssue.state === "CLOSED") {
				info(`Issue #${issueNumber} is already closed, skipping`);
				issues.push({
					number: issueNumber,
					title: linkedIssue.title,
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

				info(`✓ Closed issue #${issueNumber}: ${linkedIssue.title}`);
			} else {
				info(`[DRY RUN] Would close issue #${issueNumber}: ${linkedIssue.title}`);
			}

			issues.push({
				number: issueNumber,
				title: linkedIssue.title,
				closed: true,
			});
			closedCount++;
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			warning(`Failed to close issue #${issueNumber}: ${errorMessage}`);
			issues.push({
				number: issueNumber,
				title: linkedIssue.title,
				closed: false,
				error: errorMessage,
			});
			failedCount++;
		}
	}

	endGroup();

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

	info(`Created check run: ${checkRun.html_url}`);

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
