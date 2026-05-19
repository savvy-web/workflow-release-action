/**
 * Link issues to a release from commit history.
 *
 * @remarks
 * Walks commits since the last release tag (or all commits when there is
 * no tag) and harvests linked issues from two sources:
 *
 * 1. Conventional close-keyword references in commit messages
 *    (`closes #N`, `fixes #N`, `resolves #N`, plus their variants).
 * 2. GitHub's `closingIssuesReferences` GraphQL field on merged PRs —
 *    covers both keyword-linked and manually-linked-via-sidebar issues.
 *
 * Top-level entry point `linkIssuesFromCommits` reports through a Check
 * Run and cross-references the linked issues on the active PR. The
 * helper `getLinkedIssuesFromCommits` returns just the data (used by
 * `create-release-branch`).
 */

import type {
	ActionEnvironmentError,
	ActionOutputError,
	CheckRunError,
	GitHubClientError,
	GitHubIssueError,
	IssueData,
	PullRequestError,
} from "@savvy-web/github-action-effects";
import {
	ActionEnvironment,
	ActionEnvironmentLive,
	ActionOutputs,
	CheckRun,
	GitHubClient,
	GitHubClientLive,
	GitHubCommit,
	GitHubCommitLive,
	GitHubGraphQLLive,
	GitHubIssue,
	GitHubIssueLive,
	GitTag,
	GitTagLive,
	PullRequest,
	SemverResolver,
} from "@savvy-web/github-action-effects";
import type { ConfigError } from "effect";
import { Config, Effect, Layer } from "effect";
import { summaryWriter } from "./summary-writer.js";
import { appToken } from "./tokens.js";

/** Linked issue, with the SHA(s) of the commits that reference it. */
export interface LinkedIssue {
	number: number;
	title: string;
	state: string;
	url: string;
	node_id: string;
	commits: string[];
}

/** Commit info captured from the listing or comparison API. */
export interface CommitInfo {
	sha: string;
	message: string;
	author: string;
}

/** Aggregate result of the linkIssuesFromCommits stage. */
export interface LinkIssuesResult {
	linkedIssues: LinkedIssue[];
	commits: CommitInfo[];
	checkId: number;
	/** Web URL of the Link Issues check run, for the checks-table link. */
	htmlUrl: string;
}

const CLOSE_KEYWORD_PATTERN = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi;
const MERGE_COMMIT_PR_PATTERN = /\(#(\d+)\)$/m;

/**
 * Extract `closes #N` / `fixes #N` / `resolves #N` references from a
 * commit message.
 *
 * @internal
 */
const extractIssueReferences = (message: string): number[] => {
	const issues = new Set<number>();
	for (const match of message.matchAll(CLOSE_KEYWORD_PATTERN)) {
		const n = Number.parseInt(match[1], 10);
		if (!Number.isNaN(n)) issues.add(n);
	}
	return Array.from(issues);
};

/**
 * Extract a PR number from a GitHub merge-commit message
 * (`Title (#123)`).
 *
 * @internal
 */
const extractPRNumber = (message: string): number | null => {
	const match = message.match(MERGE_COMMIT_PR_PATTERN);
	return match ? Number.parseInt(match[1], 10) : null;
};

/** A tag entry enriched with its extracted semver version string. @internal */
interface TagEntry {
	tag: string;
	sha: string;
	version: string;
}

/**
 * Extract the version string from a tag name.
 *
 * Handles both `vX.Y.Z` (single-package / `v`-prefixed) and
 * `@scope/pkg@X.Y.Z` (monorepo per-package) formats by taking the
 * substring after the last `@` sign when present, or stripping a
 * leading `v` otherwise.
 *
 * @internal
 */
const extractVersionFromTag = (tag: string): string => {
	const atIdx = tag.lastIndexOf("@");
	if (atIdx !== -1) return tag.slice(atIdx + 1);
	return tag.startsWith("v") ? tag.slice(1) : tag;
};

/**
 * Fetch the latest release tag's SHA. Returns `null` when no tags exist,
 * none yield a parseable semver, or the API call fails.
 *
 * @remarks
 * Selects the tag with the highest **semantic** version using
 * `SemverResolver.compare`, so multi-digit version components (e.g.
 * `v1.10.0` vs `v1.9.0`) are ordered correctly regardless of how
 * `GitTag.list()` returns the entries.
 *
 * Exported for direct unit testing; consuming modules should prefer
 * {@link getLinkedIssuesFromCommits} which composes this internally.
 *
 * @public
 */
export const getLatestTagSha = Effect.gen(function* () {
	const gitTag = yield* GitTag;
	const result = yield* Effect.either(gitTag.list());
	if (result._tag === "Left") {
		yield* Effect.logWarning(`Failed to get latest tag: ${result.left.reason}`);
		return null;
	}
	const tags = result.right;
	if (tags.length === 0) return null;

	// Filter to tags with parseable semver versions.
	const parseable: TagEntry[] = [];
	for (const entry of tags) {
		const version = extractVersionFromTag(entry.tag);
		const parseResult = yield* Effect.either(SemverResolver.parse(version));
		if (parseResult._tag === "Right") {
			parseable.push({ ...entry, version });
		}
	}

	if (parseable.length === 0) return null;

	// Select the tag with the highest semantic version.
	let latest = parseable[0] as TagEntry;
	for (let i = 1; i < parseable.length; i++) {
		const candidate = parseable[i] as TagEntry;
		const cmp = yield* Effect.either(SemverResolver.compare(candidate.version, latest.version));
		// On parse failure, keep the current latest.
		if (cmp._tag === "Right" && cmp.right === 1) {
			latest = candidate;
		}
	}

	return latest.sha;
});

/**
 * Fetch all commits on a branch, paginated.
 *
 * @internal
 */
const getAllCommitsOnBranch = (branch: string): Effect.Effect<CommitInfo[], never, GitHubCommit> =>
	Effect.gen(function* () {
		const commits = yield* GitHubCommit;
		yield* Effect.logInfo(`Fetching all commits from ${branch} branch...`);

		const all = yield* commits.list(branch).pipe(
			Effect.catchAll((e) =>
				Effect.gen(function* () {
					yield* Effect.logWarning(`Failed to fetch commits: ${e.reason}`);
					return [] as ReadonlyArray<{ sha: string; message: string; author: string }>;
				}),
			),
		);

		yield* Effect.logInfo(`Fetched total of ${all.length} commit(s) from ${branch}`);
		return all.map((c) => ({ sha: c.sha, message: c.message, author: c.author }));
	});

/** GraphQL response for the closingIssuesReferences query. */
interface ClosingIssuesResponse {
	repository: {
		pullRequest: {
			allLinked: {
				nodes: Array<{
					id: string;
					number: number;
					title: string;
					state: string;
					url: string;
				}>;
			};
			manuallyLinked: {
				nodes: Array<{
					id: string;
					number: number;
					title: string;
					state: string;
					url: string;
				}>;
			};
		};
	};
}

const CLOSING_ISSUES_QUERY = `
	query ($owner: String!, $repo: String!, $prNumber: Int!) {
		repository(owner: $owner, name: $repo) {
			pullRequest(number: $prNumber) {
				allLinked: closingIssuesReferences(first: 50) {
					nodes { id number title state url }
				}
				manuallyLinked: closingIssuesReferences(first: 50, userLinkedOnly: true) {
					nodes { id number title state url }
				}
			}
		}
	}
`;

/**
 * Fetch all issues linked to a merged PR via the GraphQL
 * `closingIssuesReferences` field.
 *
 * @internal
 */
const getLinkedIssuesFromPR = (
	prNumber: number,
): Effect.Effect<
	Array<{ number: number; title: string; state: string; url: string; node_id: string }>,
	ActionEnvironmentError,
	ActionEnvironment | GitHubClient
> =>
	Effect.gen(function* () {
		const client = yield* GitHubClient;
		const env = yield* ActionEnvironment;
		const { repository } = yield* env.github;
		const [owner, repo] = repository.split("/");
		const result = yield* Effect.either(
			client.graphql<ClosingIssuesResponse>(CLOSING_ISSUES_QUERY, { owner, repo, prNumber }),
		);
		if (result._tag === "Left") {
			yield* Effect.logWarning(`Failed to get linked issues for PR #${prNumber}: ${result.left.reason}`);
			return [];
		}

		const issuesMap = new Map<number, { number: number; title: string; state: string; url: string; node_id: string }>();
		for (const node of result.right.repository.pullRequest.allLinked.nodes) {
			issuesMap.set(node.number, { ...node, node_id: node.id });
		}
		for (const node of result.right.repository.pullRequest.manuallyLinked.nodes) {
			if (!issuesMap.has(node.number)) {
				issuesMap.set(node.number, { ...node, node_id: node.id });
			}
		}
		return Array.from(issuesMap.values());
	});

/**
 * Fetch issue details (title/state/url/node_id) for an issue we only
 * found in commit-message text.
 *
 * @internal
 */
const fetchIssueDetails = (issueNumber: number): Effect.Effect<IssueData | null, GitHubIssueError, GitHubIssue> =>
	Effect.gen(function* () {
		const issues = yield* GitHubIssue;
		const result = yield* Effect.either(issues.get(issueNumber));
		if (result._tag === "Left") {
			yield* Effect.logWarning(`Failed to fetch issue #${issueNumber}: ${result.left.reason}`);
			return null;
		}
		return result.right;
	});

/**
 * Walk commits since the last release tag, collect linked issues from
 * both close-keyword references and PR `closingIssuesReferences`.
 *
 * @public
 */
export const getLinkedIssuesFromCommits = (
	targetBranch: string,
): Effect.Effect<
	{ linkedIssues: LinkedIssue[]; commits: CommitInfo[] },
	ActionEnvironmentError | GitHubIssueError,
	ActionEnvironment | GitHubClient | GitHubCommit | GitHubIssue | GitTag
> =>
	Effect.gen(function* () {
		const commitsSvc = yield* GitHubCommit;
		const latestTagSha = yield* getLatestTagSha;

		let commits: CommitInfo[];
		if (latestTagSha !== null) {
			yield* Effect.logInfo(`Comparing ${latestTagSha}...${targetBranch}`);
			const compareResult = yield* Effect.either(commitsSvc.compare(latestTagSha, targetBranch));
			if (compareResult._tag === "Left") {
				yield* Effect.logWarning(`Failed to compare commits: ${compareResult.left.reason}`);
				commits = [];
			} else {
				commits = compareResult.right.commits.map((c) => ({ sha: c.sha, message: c.message, author: c.author }));
				yield* Effect.logInfo(`Found ${commits.length} commit(s) since last release`);
			}
		} else {
			yield* Effect.logInfo("No tags found - fetching all commits from branch");
			commits = yield* getAllCommitsOnBranch(targetBranch);
		}

		const issueMap = new Map<number, LinkedIssue>();

		// Pass 1: extract from commit messages.
		for (const commit of commits) {
			const refs = extractIssueReferences(commit.message);
			yield* Effect.logDebug(`Commit ${commit.sha.slice(0, 7)}: found ${refs.length} issue reference(s) in message`);
			for (const issueNumber of refs) {
				if (!issueMap.has(issueNumber)) {
					issueMap.set(issueNumber, { number: issueNumber, title: "", state: "", url: "", node_id: "", commits: [] });
				}
				const existing = issueMap.get(issueNumber);
				if (existing) existing.commits.push(commit.sha);
			}
		}

		// Pass 2: for each merge commit, query the linked issues on its PR.
		yield* Effect.logInfo("Checking merged PRs for linked issues...");
		let prCount = 0;
		for (const commit of commits) {
			const prNumber = extractPRNumber(commit.message);
			if (prNumber === null) continue;
			prCount++;
			yield* Effect.logInfo(
				`  Commit ${commit.sha.slice(0, 7)}: "${commit.message.split("\n")[0]}" -> PR #${prNumber}`,
			);
			const linked = yield* getLinkedIssuesFromPR(prNumber);
			yield* Effect.logInfo(`  PR #${prNumber} has ${linked.length} linked issue(s)`);
			for (const issue of linked) {
				yield* Effect.logInfo(`    - Issue #${issue.number}: ${issue.title}`);
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
					const existing = issueMap.get(issue.number);
					if (existing) {
						existing.title = issue.title;
						existing.state = issue.state.toLowerCase();
						existing.url = issue.url;
						existing.node_id = issue.node_id;
						if (!existing.commits.includes(commit.sha)) existing.commits.push(commit.sha);
					}
				}
			}
		}
		yield* Effect.logInfo(`Found ${prCount} PR merge commit(s) to check`);
		yield* Effect.logInfo(`Found ${issueMap.size} unique issue reference(s)`);

		// Pass 3: backfill details for issues only found via commit-message text.
		const linkedIssues: LinkedIssue[] = [];
		for (const [issueNumber, issue] of issueMap) {
			if (issue.title !== "") {
				linkedIssues.push(issue);
				yield* Effect.logInfo(`✓ Issue #${issueNumber}: ${issue.title} (${issue.state})`);
				continue;
			}
			const details = yield* fetchIssueDetails(issueNumber);
			if (details !== null) {
				linkedIssues.push({
					number: issueNumber,
					title: details.title,
					state: details.state,
					url: details.htmlUrl ?? "",
					node_id: details.nodeId ?? "",
					commits: issue.commits,
				});
				yield* Effect.logInfo(`✓ Issue #${issueNumber}: ${details.title} (${details.state})`);
			}
		}

		return { linkedIssues, commits };
	});

/**
 * Cross-reference linked issues against the current PR by adding a
 * comment to each issue (avoids duplicate cross-references via timeline
 * inspection).
 *
 * @internal
 */
const linkIssuesToPR = (
	linkedIssues: ReadonlyArray<LinkedIssue>,
): Effect.Effect<void, ActionEnvironmentError | PullRequestError, ActionEnvironment | GitHubClient | PullRequest> =>
	Effect.gen(function* () {
		const env = yield* ActionEnvironment;
		const client = yield* GitHubClient;
		const prSvc = yield* PullRequest;
		const { sha, repository } = yield* env.github;
		const [owner, repo] = repository.split("/");

		yield* Effect.logInfo(`Looking for PR associated with commit ${sha}`);

		const prsResult = yield* Effect.either(prSvc.listAssociatedWithCommit(sha));

		if (prsResult._tag === "Left") {
			yield* Effect.logWarning(`Failed to look up PR for commit: ${prsResult.left.reason}`);
			return;
		}
		if (prsResult.right.length === 0) {
			yield* Effect.logWarning("No PR found for current commit, skipping issue linking");
			return;
		}

		const pr = prsResult.right[0];
		yield* Effect.logInfo(`Found ${prsResult.right.length} PR(s) associated with commit`);
		yield* Effect.logInfo(`Found PR #${pr.number}: ${pr.title}`);

		let linkedCount = 0;
		for (const issue of linkedIssues) {
			const timelineResult = yield* Effect.either(
				client.graphql<{
					repository: {
						issue: {
							timelineItems: {
								nodes: Array<{ __typename: string; source?: { __typename: string; number?: number } }>;
							};
						};
					};
				}>(
					`
					query ($owner: String!, $repo: String!, $issueNumber: Int!) {
						repository(owner: $owner, name: $repo) {
							issue(number: $issueNumber) {
								timelineItems(last: 50, itemTypes: CROSS_REFERENCED_EVENT) {
									nodes {
										__typename
										... on CrossReferencedEvent {
											source { __typename ... on PullRequest { number } }
										}
									}
								}
							}
						}
					}
				`,
					{ owner, repo, issueNumber: issue.number },
				),
			);

			if (timelineResult._tag === "Left") {
				yield* Effect.logWarning(`Failed to inspect issue #${issue.number} timeline: ${timelineResult.left.reason}`);
				continue;
			}

			const alreadyLinked = timelineResult.right.repository.issue.timelineItems.nodes.some(
				(node) => node.source?.__typename === "PullRequest" && node.source.number === pr.number,
			);

			if (alreadyLinked) {
				yield* Effect.logInfo(`  Issue #${issue.number} already linked to PR #${pr.number}`);
				continue;
			}

			const addCommentResult = yield* Effect.either(
				client.graphql(
					`
					mutation ($subjectId: ID!, $body: String!) {
						addComment(input: { subjectId: $subjectId, body: $body }) {
							commentEdge { node { id } }
						}
					}
				`,
					{ subjectId: issue.node_id, body: `🔗 Linked to release PR #${pr.number}` },
				),
			);

			if (addCommentResult._tag === "Left") {
				yield* Effect.logWarning(`  Failed to link issue #${issue.number}: ${addCommentResult.left.reason}`);
				continue;
			}

			yield* Effect.logInfo(`  ✓ Added cross-reference comment to issue #${issue.number}`);
			linkedCount++;
		}

		if (linkedCount > 0) {
			yield* Effect.logInfo(`✓ Successfully linked ${linkedCount} issue(s) to PR #${pr.number}`);
		} else {
			yield* Effect.logInfo("All issues already linked to PR");
		}
	});

/**
 * Top-level stage Effect — gathers linked issues, reports through a
 * Check Run, and cross-references each issue on the active PR.
 *
 * @public
 */
export const linkIssuesFromCommits: Effect.Effect<
	LinkIssuesResult,
	| ActionEnvironmentError
	| ActionOutputError
	| CheckRunError
	| ConfigError.ConfigError
	| GitHubClientError
	| GitHubIssueError
	| PullRequestError,
	ActionEnvironment | ActionOutputs | CheckRun | GitHubClient | GitHubCommit | GitHubIssue | GitTag | PullRequest
> = Effect.gen(function* () {
	const env = yield* ActionEnvironment;
	const outputs = yield* ActionOutputs;
	const checks = yield* CheckRun;

	const targetBranch = yield* Config.string("target-branch").pipe(Config.withDefault("main"));
	const dryRun = yield* Config.boolean("dry-run").pipe(Config.withDefault(false));

	const { sha, repository } = yield* env.github;
	const [owner, repo] = repository.split("/");

	yield* Effect.logInfo("Linking issues from commits");
	const { linkedIssues, commits } = yield* getLinkedIssuesFromCommits(targetBranch);

	const checkTitle = dryRun ? "🧪 Link Issues from Commits (Dry Run)" : "Link Issues from Commits";
	const checkSummary =
		linkedIssues.length > 0
			? `Found ${linkedIssues.length} linked issue(s) from ${commits.length} commit(s)`
			: `No issue references found in ${commits.length} commit(s)`;

	const issuesContent =
		linkedIssues.length > 0
			? linkedIssues
					.map((issue) => `- ${issue.state === "open" ? "🟢" : "🟣"} #${issue.number} — ${issue.title}`)
					.join("\n")
			: "_No issue references found in commits_";

	const commitsContent =
		commits.length > 0
			? commits
					.map((commit) => {
						const shortSha = commit.sha.slice(0, 7);
						const commitUrl = `https://github.com/${owner}/${repo}/commit/${commit.sha}`;
						const firstLine = commit.message.split("\n")[0];
						return `[\`${shortSha}\`](${commitUrl})\n> ${firstLine}`;
					})
					.join("\n\n")
			: "_No commits found_";

	const checkDetails = summaryWriter.build([
		{ heading: "🔗 Linked Issues", level: 3, content: issuesContent },
		{ heading: "📝 Commits Analyzed", level: 3, content: commitsContent },
	]);

	const { id: checkId, htmlUrl } = yield* checks.create(checkTitle, sha);
	yield* checks.complete(checkId, "success", { title: checkSummary, summary: checkDetails });
	yield* outputs.summary(checkDetails);

	if (linkedIssues.length > 0 && !dryRun) {
		yield* linkIssuesToPR(linkedIssues);
	}

	return { linkedIssues, commits, checkId, htmlUrl } satisfies LinkIssuesResult;
});

/**
 * Temporary Promise-shaped bridge for callers still in imperative form.
 * Runs {@link getLinkedIssuesFromCommits} with the live layer stack.
 *
 * @deprecated Use the Effect export directly once the caller migrates.
 * @internal
 */
export const getLinkedIssuesFromCommitsPromise = (
	targetBranch: string,
): Promise<{ linkedIssues: LinkedIssue[]; commits: CommitInfo[] }> => {
	const client = GitHubClientLive.fromToken(appToken());
	return Effect.runPromise(
		getLinkedIssuesFromCommits(targetBranch).pipe(
			Effect.provide(
				Layer.mergeAll(
					ActionEnvironmentLive,
					client,
					GitHubCommitLive.pipe(Layer.provide(client)),
					GitTagLive.pipe(Layer.provide(client)),
					GitHubIssueLive.pipe(Layer.provide(GitHubGraphQLLive), Layer.provide(client)),
				),
			),
		),
	);
};
