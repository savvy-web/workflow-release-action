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
	/** Issue node ID (for GraphQL mutations) */
	node_id: string;
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
 * Get the latest release tag SHA
 *
 * @param github - Authenticated Octokit instance
 * @returns Latest tag SHA or null if no tags exist
 */
async function getLatestTagSha(github: ReturnType<typeof getOctokit>): Promise<string | null> {
	try {
		const { data: tags } = await github.rest.repos.listTags({
			owner: context.repo.owner,
			repo: context.repo.repo,
			per_page: 1,
		});

		if (tags.length === 0) {
			return null;
		}

		return tags[0].commit.sha;
	} catch (error) {
		warning(`Failed to get latest tag: ${error instanceof Error ? error.message : String(error)}`);
		return null;
	}
}

/**
 * Get all commits on a branch using pagination
 *
 * @param github - Authenticated Octokit instance
 * @param branch - Branch name to get commits from
 * @returns Array of all commits
 */
async function getAllCommitsOnBranch(github: ReturnType<typeof getOctokit>, branch: string): Promise<CommitInfo[]> {
	const commits: CommitInfo[] = [];
	let page = 1;
	const perPage = 100; // GitHub API max

	info(`Fetching all commits from ${branch} branch...`);

	while (true) {
		const { data } = await github.rest.repos.listCommits({
			owner: context.repo.owner,
			repo: context.repo.repo,
			sha: branch,
			per_page: perPage,
			page,
		});

		if (data.length === 0) {
			break;
		}

		commits.push(
			...data.map((c) => ({
				sha: c.sha,
				message: c.commit.message,
				author: c.commit.author?.name || "Unknown",
			})),
		);

		debug(`Fetched page ${page} with ${data.length} commit(s)`);

		// If we got fewer commits than the page size, we've reached the end
		if (data.length < perPage) {
			break;
		}

		page++;
	}

	info(`Fetched total of ${commits.length} commit(s) from ${branch}`);
	return commits;
}

/**
 * Get linked issues from a merged PR using GraphQL API
 *
 * This fetches ALL linked issues including:
 * 1. Issues with closing keywords (Closes #N, Fixes #N)
 * 2. Manually linked issues from the GitHub UI sidebar
 *
 * @param github - Authenticated Octokit instance
 * @param prNumber - PR number
 * @returns Array of linked issues
 */
async function getLinkedIssuesFromPR(
	github: ReturnType<typeof getOctokit>,
	prNumber: number,
): Promise<Array<{ number: number; title: string; state: string; url: string; node_id: string }>> {
	try {
		const query = `
			query ($owner: String!, $repo: String!, $prNumber: Int!) {
				repository(owner: $owner, name: $repo) {
					pullRequest(number: $prNumber) {
						# Get ALL linked issues (both closing keywords and manually linked)
						allLinked: closingIssuesReferences(first: 50) {
							nodes {
								id
								number
								title
								state
								url
							}
						}
						# Get only manually linked issues (linked via UI sidebar)
						manuallyLinked: closingIssuesReferences(first: 50, userLinkedOnly: true) {
							nodes {
								id
								number
								title
								state
								url
							}
						}
					}
				}
			}
		`;

		const result: {
			repository: {
				pullRequest: {
					allLinked: {
						nodes: Array<{ id: string; number: number; title: string; state: string; url: string }>;
					};
					manuallyLinked: {
						nodes: Array<{ id: string; number: number; title: string; state: string; url: string }>;
					};
				};
			};
		} = await github.graphql(query, {
			owner: context.repo.owner,
			repo: context.repo.repo,
			prNumber,
		});

		const issuesMap = new Map<number, { number: number; title: string; state: string; url: string; node_id: string }>();

		// Add all linked issues (this includes both closing keywords and manually linked)
		for (const node of result.repository.pullRequest.allLinked.nodes) {
			issuesMap.set(node.number, {
				...node,
				node_id: node.id,
			});
		}

		// Ensure manually linked issues are included (should already be in allLinked, but being explicit)
		for (const node of result.repository.pullRequest.manuallyLinked.nodes) {
			if (!issuesMap.has(node.number)) {
				issuesMap.set(node.number, {
					...node,
					node_id: node.id,
				});
			}
		}

		return Array.from(issuesMap.values());
	} catch (error) {
		warning(
			`Failed to get linked issues for PR #${prNumber}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return [];
	}
}

/**
 * Extract PR number from merge commit message
 *
 * GitHub merge commits have format: "Title (#123)"
 *
 * @param message - Commit message
 * @returns PR number or null
 */
function extractPRNumber(message: string): number | null {
	const match = message.match(/\(#(\d+)\)$/m);
	if (match) {
		return Number.parseInt(match[1], 10);
	}
	return null;
}

/**
 * Gets linked issues from commits without creating check runs or linking to PRs
 *
 * This function:
 * 1. Gets all commits in target branch since last release tag
 * 2. For each merge commit, queries GitHub API for linked issues
 * 3. Also extracts issue references from commit messages (fallback)
 * 4. Returns combined list of unique linked issues
 *
 * @param github - Authenticated Octokit instance
 * @param targetBranch - Target branch to analyze
 * @returns Object containing linked issues and commits
 */
export async function getLinkedIssuesFromCommits(
	github: ReturnType<typeof getOctokit>,
	targetBranch: string,
): Promise<{ linkedIssues: LinkedIssue[]; commits: CommitInfo[] }> {
	// Get the latest release tag to determine the commit range
	const latestTagSha = await getLatestTagSha(github);

	let commits: CommitInfo[];

	if (latestTagSha) {
		// If we have a tag, compare from that tag to target branch
		info(`Comparing ${latestTagSha}...${targetBranch}`);

		const { data: comparison } = await github.rest.repos.compareCommits({
			owner: context.repo.owner,
			repo: context.repo.repo,
			base: latestTagSha,
			head: targetBranch,
		});

		commits = comparison.commits.map((c) => ({
			sha: c.sha,
			message: c.commit.message,
			author: c.commit.author?.name || "Unknown",
		}));

		info(`Found ${commits.length} commit(s) since last release`);
	} else {
		// No tags exist - get all commits from the branch
		info("No tags found - fetching all commits from branch");
		commits = await getAllCommitsOnBranch(github, targetBranch);
	}

	// Extract issue references from all commits (fallback method)
	const issueMap = new Map<number, LinkedIssue>();

	// First pass: Extract from commit messages
	for (const commit of commits) {
		const issues = extractIssueReferences(commit.message);
		debug(`Commit ${commit.sha.slice(0, 7)}: found ${issues.length} issue reference(s) in message`);

		for (const issueNumber of issues) {
			if (!issueMap.has(issueNumber)) {
				issueMap.set(issueNumber, {
					number: issueNumber,
					title: "", // Will be filled in later
					state: "",
					url: "",
					node_id: "", // Will be filled in later
					commits: [],
				});
			}
			issueMap.get(issueNumber)?.commits.push(commit.sha);
		}
	}

	// Second pass: Check for merged PRs and get their linked issues via GraphQL
	info("Checking merged PRs for linked issues...");
	let prCount = 0;
	for (const commit of commits) {
		const prNumber = extractPRNumber(commit.message);
		if (prNumber) {
			prCount++;
			info(`  Commit ${commit.sha.slice(0, 7)}: "${commit.message.split("\n")[0]}" -> PR #${prNumber}`);

			const linkedIssues = await getLinkedIssuesFromPR(github, prNumber);
			info(`  PR #${prNumber} has ${linkedIssues.length} linked issue(s)`);

			for (const issue of linkedIssues) {
				info(`    - Issue #${issue.number}: ${issue.title}`);
				if (!issueMap.has(issue.number)) {
					issueMap.set(issue.number, {
						number: issue.number,
						title: issue.title,
						state: issue.state.toLowerCase(),
						url: issue.url,
						node_id: issue.node_id,
						commits: [commit.sha],
					});
				} else {
					// Update existing entry with full details
					const existing = issueMap.get(issue.number);
					if (existing) {
						existing.title = issue.title;
						existing.state = issue.state.toLowerCase();
						existing.url = issue.url;
						existing.node_id = issue.node_id;
						if (!existing.commits.includes(commit.sha)) {
							existing.commits.push(commit.sha);
						}
					}
				}
			}
		}
	}
	info(`Found ${prCount} PR merge commit(s) to check`);

	info(`Found ${issueMap.size} unique issue reference(s)`);

	// Fetch issue details for any that don't have them yet (from commit message extraction)
	const linkedIssues: LinkedIssue[] = [];

	for (const [issueNumber, issue] of issueMap.entries()) {
		// If we already have details from GraphQL, use them
		if (issue.title) {
			linkedIssues.push(issue);
			info(`✓ Issue #${issueNumber}: ${issue.title} (${issue.state})`);
			continue;
		}

		// Otherwise, fetch from REST API
		try {
			const { data: issueData } = await github.rest.issues.get({
				owner: context.repo.owner,
				repo: context.repo.repo,
				issue_number: issueNumber,
			});

			linkedIssues.push({
				number: issueNumber,
				title: issueData.title,
				state: issueData.state,
				url: issueData.html_url,
				node_id: issueData.node_id,
				commits: issue.commits,
			});

			info(`✓ Issue #${issueNumber}: ${issueData.title} (${issueData.state})`);
		} catch (error) {
			warning(`Failed to fetch issue #${issueNumber}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	return { linkedIssues, commits };
}

/**
 * Links issues from commits between release branch and target branch
 *
 * This function:
 * 1. Gets all commits in target branch since last release tag
 * 2. For each merge commit, queries GitHub API for linked issues
 * 3. Also extracts issue references from commit messages (fallback)
 * 4. Creates a check run with results
 * 5. Returns combined list of unique linked issues
 *
 * @returns Link issues result
 */
export async function linkIssuesFromCommits(): Promise<LinkIssuesResult> {
	// Read all inputs
	const token = getState("token");
	if (!token) {
		throw new Error("No token available from state - ensure pre.ts ran successfully");
	}
	const targetBranch = getInput("target-branch") || "main";
	const dryRun = getBooleanInput("dry-run") || false;

	const github = getOctokit(token);
	startGroup("Linking issues from commits");

	// Get linked issues and commits
	const { linkedIssues, commits } = await getLinkedIssuesFromCommits(github, targetBranch);

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

	// If we have linked issues and we're on a release branch, update the PR body to link them
	if (linkedIssues.length > 0 && !dryRun) {
		await linkIssuesToPR(github, linkedIssues);
	}

	return {
		linkedIssues,
		commits,
		checkId: checkRun.id,
	};
}

/**
 * Links issues to the current PR by adding comments to issues
 *
 * This creates cross-reference links without modifying PR or issue bodies.
 *
 * @param github - Authenticated Octokit instance
 * @param linkedIssues - Issues to link to the PR
 */
async function linkIssuesToPR(github: ReturnType<typeof getOctokit>, linkedIssues: LinkedIssue[]): Promise<void> {
	try {
		startGroup("Linking issues to PR");
		info(`Looking for PR associated with commit ${context.sha}`);

		// Find the PR associated with the current commit
		const { data: prs } = await github.rest.repos.listPullRequestsAssociatedWithCommit({
			owner: context.repo.owner,
			repo: context.repo.repo,
			commit_sha: context.sha,
		});

		info(`Found ${prs.length} PR(s) associated with commit`);

		if (prs.length === 0) {
			warning("No PR found for current commit, skipping issue linking");
			endGroup();
			return;
		}

		// Use the first PR (should be the release PR)
		const pr = prs[0];
		info(`Found PR #${pr.number}: ${pr.title}`);

		// For each linked issue, check if it already has a cross-reference to this PR
		let linkedCount = 0;
		for (const issue of linkedIssues) {
			try {
				// Check if this issue already has a cross-reference to our PR
				const timelineData = await github.graphql<{
					repository: {
						issue: {
							timelineItems: {
								nodes: Array<{
									__typename: string;
									source?: { __typename: string; number?: number };
								}>;
							};
						};
					};
				}>(
					`
					query ($owner: String!, $repo: String!, $issueNumber: Int!, $prNumber: Int!) {
						repository(owner: $owner, name: $repo) {
							issue(number: $issueNumber) {
								timelineItems(last: 50, itemTypes: CROSS_REFERENCED_EVENT) {
									nodes {
										__typename
										... on CrossReferencedEvent {
											source {
												__typename
												... on PullRequest {
													number
												}
											}
										}
									}
								}
							}
						}
					}
				`,
					{
						owner: context.repo.owner,
						repo: context.repo.repo,
						issueNumber: issue.number,
						prNumber: pr.number,
					},
				);

				// Check if PR is already cross-referenced
				const alreadyLinked = timelineData.repository.issue.timelineItems.nodes.some(
					(node) => node.source?.__typename === "PullRequest" && node.source.number === pr.number,
				);

				if (alreadyLinked) {
					info(`  Issue #${issue.number} already linked to PR #${pr.number}`);
					continue;
				}

				// Add comment to issue to create cross-reference
				const commentBody = `🔗 Linked to release PR #${pr.number}`;

				await github.graphql(
					`
					mutation ($subjectId: ID!, $body: String!) {
						addComment(input: { subjectId: $subjectId, body: $body }) {
							commentEdge {
								node {
									id
								}
							}
						}
					}
				`,
					{
						subjectId: issue.node_id,
						body: commentBody,
					},
				);

				info(`  ✓ Added cross-reference comment to issue #${issue.number}`);
				linkedCount++;
			} catch (error) {
				warning(`  Failed to link issue #${issue.number}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}

		if (linkedCount > 0) {
			info(`✓ Successfully linked ${linkedCount} issue(s) to PR #${pr.number}`);
		} else {
			info("All issues already linked to PR");
		}

		endGroup();
	} catch (error) {
		warning(`Failed to link issues to PR: ${error instanceof Error ? error.message : String(error)}`);
		endGroup();
	}
}
