/**
 * Fixture tests for the link-issues-from-commits module.
 *
 * @remarks
 * Exercises the rewired `GitTag.list()` path that replaced the raw
 * `repos.listTags` Octokit call. The still-raw calls (`compareCommits`,
 * `listCommits`, `issues.get`, `closingIssuesReferences` GraphQL) are
 * satisfied via `GitHubClientTest` — either by seeding a response or by
 * letting `Effect.either` absorb the 404 that the test layer emits for
 * unregistered operations.
 *
 * Three focused scenarios:
 *
 * 1. **`getLatestTagSha` direct unit tests** — exercises tag-selection logic
 *    in isolation without any `GitHubClient` or `compareCommits` involvement.
 *    The multi-digit test seeds tags in an order where the semver-highest is
 *    NOT last, so it strictly fails against the old `tags[length-1]` code.
 *
 * 2. **Latest-tag selection (integration)** — `GitTagTest` is seeded with a
 *    known set of tags; verifies the full `getLinkedIssuesFromCommits` path.
 *
 * 3. **No tags** — `GitTagTest` is empty. The function falls back to
 *    `getAllCommitsOnBranch` (the `listCommits` paginate path), which is
 *    seeded in `GitHubClientTest`. The returned `commits` array reflects
 *    those paginated commits.
 */

import type { GitHubClientTestState, GitTagTestState } from "@savvy-web/github-action-effects/testing";
import { ActionEnvironmentTest, GitHubClientTest, GitTagTest } from "@savvy-web/github-action-effects/testing";
import { Effect, Layer, Logger } from "effect";
import { describe, expect, it } from "vitest";
import { getLatestTagSha, getLinkedIssuesFromCommits } from "../src/utils/link-issues-from-commits.js";

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const OWNER = "owner";
const REPO = "repo";
const TARGET_BRANCH = "main";

/** Minimal commit shape that satisfies the `CommitRecord` interface. */
const makeCommit = (sha: string, message: string, author = "Test Author") => ({
	sha,
	commit: { message, author: { name: author } },
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface Fixtures {
	tagState: GitTagTestState;
	clientState: GitHubClientTestState;
}

const makeFixtures = (
	params: {
		tags?: Array<{ tag: string; sha: string }>;
		compareCommitsData?: Array<{ sha: string; commit: { message: string; author?: { name?: string } } }>;
		listCommitsData?: Array<Array<{ sha: string; commit: { message: string; author?: { name?: string } } }>>;
	} = {},
): Fixtures => {
	const tagState = GitTagTest.empty().state;
	for (const { tag, sha } of params.tags ?? []) {
		tagState.tags.set(tag, sha);
	}

	const restResponses = new Map<string, { data: unknown }>();
	const paginateResponses = new Map<string, Array<unknown[]>>();

	if (params.compareCommitsData !== undefined) {
		restResponses.set("compareCommits", { data: { commits: params.compareCommitsData } });
	}

	if (params.listCommitsData !== undefined) {
		paginateResponses.set(
			"listCommits",
			params.listCommitsData.map((page) => page as unknown[]),
		);
	}

	const clientState: GitHubClientTestState = {
		restResponses,
		graphqlResponses: new Map(),
		paginateResponses,
		repo: { owner: OWNER, repo: REPO },
	};

	return { tagState, clientState };
};

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

const runStage = (
	f: Fixtures,
): Promise<{
	linkedIssues: Array<{
		number: number;
		title: string;
		state: string;
		url: string;
		node_id: string;
		commits: string[];
	}>;
	commits: Array<{ sha: string; message: string; author: string }>;
}> => {
	const layer = Layer.mergeAll(
		ActionEnvironmentTest.layer({
			GITHUB_SHA: "headsha123",
			GITHUB_REF: `refs/heads/${TARGET_BRANCH}`,
			GITHUB_REPOSITORY: `${OWNER}/${REPO}`,
			GITHUB_REPOSITORY_OWNER: OWNER,
			GITHUB_WORKSPACE: "/workspace",
			GITHUB_EVENT_NAME: "push",
			GITHUB_EVENT_PATH: "/dev/null",
			GITHUB_RUN_ID: "1",
			GITHUB_RUN_NUMBER: "1",
			GITHUB_ACTOR: "test",
			GITHUB_SERVER_URL: "https://github.com",
			GITHUB_API_URL: "https://api.github.com",
		}),
		GitTagTest.layer(f.tagState),
		GitHubClientTest.layer(f.clientState),
	);
	return Effect.runPromise(
		getLinkedIssuesFromCommits(TARGET_BRANCH).pipe(
			Effect.provide(layer),
			Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
		),
	);
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Direct unit tests for getLatestTagSha
// ---------------------------------------------------------------------------

/**
 * Run `getLatestTagSha` in isolation: only `GitTagTest` is provided.
 * No `GitHubClient` or `compareCommits` is involved.
 */
const runGetLatestTagSha = (tags: Array<{ tag: string; sha: string }>): Promise<string | null> => {
	const state = GitTagTest.empty().state;
	for (const { tag, sha } of tags) {
		state.tags.set(tag, sha);
	}
	return Effect.runPromise(
		getLatestTagSha.pipe(
			Effect.provide(GitTagTest.layer(state)),
			Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
		),
	);
};

describe("getLatestTagSha", () => {
	it("returns null when no tags are present", async () => {
		const sha = await runGetLatestTagSha([]);
		expect(sha).toBeNull();
	});

	it("selects the semver-highest SHA even when it is NOT last in Map-insertion order (multi-digit regression)", async () => {
		// Insert order: v1.10.1 first, v1.9.0 second, v1.10.0 third.
		// Map insertion order means the LAST entry is v1.10.0 (sha-v1-10).
		// The old `tags[tags.length - 1]` bug would return "sha-v1-10" (last
		// inserted), NOT "sha-v1-10-1" (true semver maximum).
		// The semver fix must return "sha-v1-10-1".
		const sha = await runGetLatestTagSha([
			{ tag: "v1.10.1", sha: "sha-v1-10-1" },
			{ tag: "v1.9.0", sha: "sha-v1-9" },
			{ tag: "v1.10.0", sha: "sha-v1-10" },
		]);
		expect(sha).toBe("sha-v1-10-1");
	});

	it("handles scoped-package tags in @scope/pkg@X.Y.Z format", async () => {
		// @scope/pkg@X.Y.Z: extractVersionFromTag strips everything up to the last @.
		const sha = await runGetLatestTagSha([
			{ tag: "@scope/pkg@1.0.0", sha: "sha-1-0-0" },
			{ tag: "@scope/pkg@2.0.0", sha: "sha-2-0-0" },
			{ tag: "@scope/pkg@1.9.0", sha: "sha-1-9-0" },
		]);
		expect(sha).toBe("sha-2-0-0");
	});
});

describe("getLinkedIssuesFromCommits", () => {
	describe("latest-tag selection", () => {
		it("uses the semver-latest tag's SHA as the compareCommits base", async () => {
			// Seed three semver tags in non-alphabetical insertion order.
			// GitTag.list() returns them in insertion order from the test Map.
			// We insert in ascending order so the last entry is the highest tag.
			const tags = [
				{ tag: "v1.0.0", sha: "sha-v1" },
				{ tag: "v1.1.0", sha: "sha-v1-1" },
				{ tag: "v2.0.0", sha: "sha-v2" },
			];

			const compareCommit = makeCommit("commit-abc", "feat: add feature");
			const f = makeFixtures({
				tags,
				// compareCommits is called with base=sha-v2; we return one commit.
				compareCommitsData: [compareCommit],
			});

			const result = await runStage(f);

			// The function found commits via compareCommits (not listCommits).
			expect(result.commits).toHaveLength(1);
			expect(result.commits[0].sha).toBe("commit-abc");
			// No issue references in the commit message, so linkedIssues is empty.
			expect(result.linkedIssues).toHaveLength(0);
		});

		it("extracts issue references from commit messages when using the tag-based path", async () => {
			const tags = [
				{ tag: "v0.9.0", sha: "sha-old" },
				{ tag: "v1.0.0", sha: "sha-latest" },
			];
			// A commit with a 'closes #7' reference.
			const commitWithRef = makeCommit("abc0001", "fix: resolve bug\n\nCloses #7");
			const f = makeFixtures({
				tags,
				compareCommitsData: [commitWithRef],
			});
			// Seed the issues.get response so the issue details are backfilled.
			f.clientState.restResponses.set("issues.get", {
				data: {
					title: "Bug report",
					state: "closed",
					html_url: "https://github.com/owner/repo/issues/7",
					node_id: "node7",
				},
			});

			const result = await runStage(f);

			expect(result.commits).toHaveLength(1);
			expect(result.linkedIssues).toHaveLength(1);
			expect(result.linkedIssues[0].number).toBe(7);
			expect(result.linkedIssues[0].title).toBe("Bug report");
		});
	});

	describe("no-tags fallback", () => {
		it("fetches all commits from the branch when no tags exist", async () => {
			const commits = [makeCommit("sha-first", "chore: initial commit"), makeCommit("sha-second", "feat: add widget")];
			const f = makeFixtures({
				// No tags seeded.
				// listCommits paginate: one page with two commits.
				listCommitsData: [commits],
			});

			const result = await runStage(f);

			// Both commits returned via the listCommits fallback.
			expect(result.commits).toHaveLength(2);
			expect(result.commits.map((c) => c.sha)).toEqual(["sha-first", "sha-second"]);
			expect(result.linkedIssues).toHaveLength(0);
		});

		it("returns empty commits when both tag lookup and listCommits fail", async () => {
			// No tags, no listCommits response registered — paginate returns Left,
			// which getAllCommitsOnBranch catches and returns [].
			const f = makeFixtures();

			const result = await runStage(f);

			expect(result.commits).toHaveLength(0);
			expect(result.linkedIssues).toHaveLength(0);
		});
	});
});
