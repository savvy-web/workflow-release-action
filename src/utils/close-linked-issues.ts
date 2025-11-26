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
 * GraphQL response for closing issues references
 */
interface ClosingIssuesResponse {
	repository: {
		pullRequest: {
			closingIssuesReferences: {
				nodes: Array<{
					number: number;
					title: string;
					state: string;
				}>;
			};
		};
	};
}

/**
 * Gets issues linked to a PR using GitHub GraphQL API
 *
 * Uses the closingIssuesReferences field which returns issues that will be
 * closed when this PR is merged (based on "fixes #123" keywords in PR body/commits)
 *
 * @param github - GitHub Octokit client
 * @param prNumber - PR number
 * @returns Array of linked issues
 */
async function getLinkedIssues(
	github: ReturnType<typeof getOctokit>,
	prNumber: number,
): Promise<Array<{ number: number; title: string; state: string }>> {
	const query = `
		query($owner: String!, $repo: String!, $prNumber: Int!) {
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
	`;

	try {
		const response = await github.graphql<ClosingIssuesResponse>(query, {
			owner: context.repo.owner,
			repo: context.repo.repo,
			prNumber,
		});

		return response.repository.pullRequest.closingIssuesReferences.nodes;
	} catch (error) {
		core.warning(
			`Failed to fetch linked issues via GraphQL: ${error instanceof Error ? error.message : String(error)}`,
		);
		return [];
	}
}

/**
 * Closes linked issues when a release PR is merged
 *
 * Uses GitHub's GraphQL API to find issues linked to the PR via
 * "fixes #123" or similar keywords in the PR body or commits.
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

	// Get linked issues via GraphQL API
	const linkedIssues = await getLinkedIssues(github, prNumber);
	core.info(`Found ${linkedIssues.length} linked issue(s) for PR #${prNumber}`);

	if (linkedIssues.length === 0) {
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
	for (const linkedIssue of linkedIssues) {
		const issueNumber = linkedIssue.number;

		try {
			// Check if already closed (GraphQL gives us state)
			if (linkedIssue.state === "CLOSED") {
				core.info(`Issue #${issueNumber} is already closed, skipping`);
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

				core.info(`✓ Closed issue #${issueNumber}: ${linkedIssue.title}`);
			} else {
				core.info(`[DRY RUN] Would close issue #${issueNumber}: ${linkedIssue.title}`);
			}

			issues.push({
				number: issueNumber,
				title: linkedIssue.title,
				closed: true,
			});
			closedCount++;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			core.warning(`Failed to close issue #${issueNumber}: ${errorMessage}`);
			issues.push({
				number: issueNumber,
				title: linkedIssue.title,
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
