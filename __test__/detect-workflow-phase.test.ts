/**
 * Fixture tests for the detect-workflow-phase module.
 *
 * @remarks
 * Exercises the `PullRequest.list` rewire (Strategy 2 — closed-PR / merge-SHA
 * lookup) and the fall-through path where no merged release PR is found.
 * Strategy 1 (`listPullRequestsAssociatedWithCommit`) is left raw ("Bucket B");
 * `GitHubClientTest.empty()` causes it to return a `Left` so the test falls
 * through to Strategy 2 on every run.
 */

import { FileSystem } from "@effect/platform";
import type { PullRequestTestState } from "@savvy-web/github-action-effects/testing";
import { ActionEnvironmentTest, GitHubClientTest, PullRequestTest } from "@savvy-web/github-action-effects/testing";
import { Effect, Layer, Logger } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PhaseDetectionResult } from "../src/utils/detect-workflow-phase.js";
import { detectWorkflowPhase } from "../src/utils/detect-workflow-phase.js";

const RELEASE_BRANCH = "changeset-release/main";
const TARGET_BRANCH = "main";
const MERGE_COMMIT_SHA = "deadbeef123456";

interface Fixtures {
	prState: PullRequestTestState;
}

const makeFixtures = (
	params: {
		prs?: Array<{
			number: number;
			head: string;
			base: string;
			state: "open" | "closed";
			mergedAt?: string | null;
			mergeCommitSha?: string | null;
		}>;
	} = {},
): Fixtures => {
	const prState = PullRequestTest.empty();
	let nextNumber = 1;
	for (const pr of params.prs ?? []) {
		prState.prs.push({
			number: pr.number,
			nodeId: `node-${pr.number}`,
			url: `https://github.com/owner/repo/pull/${pr.number}`,
			title: `PR #${pr.number}`,
			body: "",
			state: pr.state,
			head: pr.head,
			base: pr.base,
			draft: false,
			merged: (pr.mergedAt ?? null) !== null,
			mergedAt: pr.mergedAt ?? null,
			mergeCommitSha: pr.mergeCommitSha ?? null,
			labels: [],
			reviewers: [],
			teamReviewers: [],
			autoMerge: undefined,
		});
		nextNumber = Math.max(nextNumber, pr.number + 1);
	}
	prState.nextNumber = nextNumber;

	return { prState };
};

/**
 * Run `detectWorkflowPhase` against the given fixtures.
 *
 * @remarks
 * The SHA is set to `MERGE_COMMIT_SHA` so tests can control whether a seeded
 * PR's `mergeCommitSha` matches. `GitHubClientTest.empty()` is used so the
 * `listPullRequestsAssociatedWithCommit` call (Strategy 1) always fails with a
 * 404, driving execution to Strategy 2 (the rewired `pr.list` call).
 *
 * `GITHUB_EVENT_PATH` is intentionally blank so `readEventPayload` short-circuits
 * before touching the filesystem, avoiding any need for a real FileSystem layer.
 */
const runDetect = (f: Fixtures): Promise<PhaseDetectionResult> => {
	const layer = Layer.mergeAll(
		ActionEnvironmentTest.layer({
			GITHUB_SHA: MERGE_COMMIT_SHA,
			GITHUB_REF: `refs/heads/${TARGET_BRANCH}`,
			GITHUB_REPOSITORY: "owner/repo",
			GITHUB_REPOSITORY_OWNER: "owner",
			GITHUB_WORKSPACE: "/workspace",
			GITHUB_EVENT_NAME: "push",
			GITHUB_EVENT_PATH: "",
			GITHUB_RUN_ID: "1",
			GITHUB_RUN_NUMBER: "1",
			GITHUB_ACTOR: "test",
			GITHUB_SERVER_URL: "https://github.com",
			GITHUB_API_URL: "https://api.github.com",
		}),
		GitHubClientTest.empty(),
		PullRequestTest.layer(f.prState),
		FileSystem.layerNoop({ readFileString: () => Effect.succeed("{}") }),
	);

	return Effect.runPromise(
		detectWorkflowPhase({ releaseBranch: RELEASE_BRANCH, targetBranch: TARGET_BRANCH }).pipe(
			Effect.provide(layer),
			Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
		),
	);
};

describe("detectWorkflowPhase", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns phase=publishing when a closed PR with matching mergeCommitSha is found (Strategy 2)", async () => {
		// Seed a merged release PR whose merge_commit_sha matches the push SHA.
		// Strategy 1 will fail (GitHubClientTest.empty()), driving code to Strategy 2.
		const f = makeFixtures({
			prs: [
				{
					number: 7,
					head: RELEASE_BRANCH,
					base: TARGET_BRANCH,
					state: "closed",
					mergedAt: "2026-01-15T12:00:00Z",
					mergeCommitSha: MERGE_COMMIT_SHA,
				},
			],
		});

		const result = await runDetect(f);

		expect(result.phase).toBe("publishing");
		expect(result.isReleaseCommit).toBe(true);
		expect(result.mergedReleasePRNumber).toBe(7);
		expect(result.isMainBranch).toBe(true);
		expect(result.isReleaseBranch).toBe(false);
	});

	it("returns phase=branch-management when no merged PR matches the commit SHA (Strategy 2 fall-through)", async () => {
		// No PRs seeded — Strategy 2 finds nothing matching the SHA.
		// detectReleaseCommit retries 3× with 5s delays; fake timers skip the waits.
		vi.useFakeTimers();
		const f = makeFixtures();

		const resultPromise = runDetect(f);
		await vi.advanceTimersByTimeAsync(60000);
		const result = await resultPromise;

		expect(result.phase).toBe("branch-management");
		expect(result.isReleaseCommit).toBe(false);
		expect(result.mergedReleasePRNumber).toBeUndefined();
		expect(result.isMainBranch).toBe(true);
	});

	it("ignores a closed PR with a non-matching mergeCommitSha and falls through to branch-management", async () => {
		// A real merged PR exists, but its SHA does not match the push event SHA.
		// Still retries 3× before returning false; fake timers skip the waits.
		vi.useFakeTimers();
		const f = makeFixtures({
			prs: [
				{
					number: 3,
					head: RELEASE_BRANCH,
					base: TARGET_BRANCH,
					state: "closed",
					mergedAt: "2026-01-10T09:00:00Z",
					mergeCommitSha: "aaaa0000differentsha",
				},
			],
		});

		const resultPromise = runDetect(f);
		await vi.advanceTimersByTimeAsync(60000);
		const result = await resultPromise;

		expect(result.phase).toBe("branch-management");
		expect(result.isReleaseCommit).toBe(false);
		expect(result.mergedReleasePRNumber).toBeUndefined();
	});
});
