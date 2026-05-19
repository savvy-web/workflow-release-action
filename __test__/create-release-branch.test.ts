/**
 * Fixture tests for the create-release-branch stage.
 *
 * @remarks
 * Exercises the path rewired onto the `PullRequest` library service:
 * `addLabels` called after the release PR is created via the still-raw
 * `client.graphql` `createPullRequest` mutation. `GitHubClientTest`
 * satisfies all raw REST calls (`repos.get`) and the GraphQL mutation
 * (keyed by the full mutation string per the test-layer contract).
 *
 * The `git status --porcelain` command response drives whether the version
 * bump produced changes. An empty `-z` status response keeps `finalCommitSha`
 * empty so the tree/commit/ref creation path is skipped, which simplifies the
 * fixture setup while still exercising the PR creation and label steps.
 */

import { FileSystem } from "@effect/platform";
import type {
	ActionOutputsTestState,
	ActionStateTestState,
	CheckRunTestState,
	GitCommitTestState,
	GitHubClientTestState,
	PullRequestTestState,
} from "@savvy-web/github-action-effects/testing";
import {
	ActionEnvironmentTest,
	ActionOutputsTest,
	ActionStateTest,
	CheckRunTest,
	CommandRunnerTest,
	GitCommitTest,
	GitHubClientTest,
	GitTagTest,
	PullRequestTest,
} from "@savvy-web/github-action-effects/testing";
import { ConfigProvider, Effect, Layer, Logger } from "effect";
import { describe, expect, it } from "vitest";
import type { CreateReleaseBranchResult } from "../src/utils/create-release-branch.js";
import { CREATE_PULL_REQUEST_MUTATION, createReleaseBranch } from "../src/utils/create-release-branch.js";

const RELEASE_BRANCH = "changeset-release/main";
const TARGET_BRANCH = "main";
const CREATED_PR_NUMBER = 42;

interface Fixtures {
	outputsState: ActionOutputsTestState;
	stateState: ActionStateTestState;
	checkRunState: CheckRunTestState;
	commitState: GitCommitTestState;
	prState: PullRequestTestState;
	clientState: GitHubClientTestState;
}

const makeFixtures = (
	params: {
		/** Whether to pre-populate PullRequestTest with the created PR (required for addLabels to succeed). */
		seedPr?: boolean;
		prNumber?: number;
	} = {},
): Fixtures => {
	const prNumber = params.prNumber ?? CREATED_PR_NUMBER;

	const prState = PullRequestTest.empty();
	if (params.seedPr) {
		prState.prs.push({
			number: prNumber,
			nodeId: `PR_node_${prNumber}`,
			url: `https://github.com/owner/repo/pull/${prNumber}`,
			title: "chore: release",
			body: "",
			state: "open",
			head: RELEASE_BRANCH,
			base: TARGET_BRANCH,
			draft: false,
			merged: false,
			mergedAt: null,
			labels: [],
			reviewers: [],
			teamReviewers: [],
			autoMerge: undefined,
			// biome-ignore lint/suspicious/noExplicitAny: minimal PullRequestRecord fixture
		} as any);
		prState.nextNumber = prNumber + 1;
	}

	const clientState: GitHubClientTestState = {
		restResponses: new Map([["repos.get", { data: { node_id: "repo-node-123" } }]]),
		graphqlResponses: new Map([
			[
				CREATE_PULL_REQUEST_MUTATION,
				{
					createPullRequest: {
						pullRequest: {
							number: prNumber,
							url: `https://github.com/owner/repo/pull/${prNumber}`,
							id: `PR_node_${prNumber}`,
						},
					},
				},
			],
		]),
		paginateResponses: new Map([["listCommits", [[]]]]),
		repo: { owner: "owner", repo: "repo" },
	};

	return {
		outputsState: ActionOutputsTest.empty(),
		stateState: ActionStateTest.empty(),
		checkRunState: CheckRunTest.empty(),
		commitState: GitCommitTest.empty(),
		prState,
		clientState,
	};
};

/**
 * Command responses that simulate a version bump with changes.
 *
 * - `git status --porcelain` returns a modified `package.json` line so the
 *   function sees changes and does not exit early.
 * - `git rev-parse HEAD` returns the parent SHA.
 * - `git status --porcelain -z` returns empty so `files.length === 0` and
 *   the tree/commit/ref creation is skipped (simplifying the fixture).
 */
const versionChangeCommands: Array<[string, string]> = [
	["git status --porcelain", "M package.json\nM CHANGELOG.md"],
	["git rev-parse HEAD", "abc123parent"],
	["git status --porcelain -z", ""],
];

const runStage = (
	f: Fixtures,
	commandResponses: Array<[string, string]> = versionChangeCommands,
): Promise<CreateReleaseBranchResult> => {
	const layer = Layer.mergeAll(
		ActionEnvironmentTest.layer({
			GITHUB_SHA: "abc123",
			GITHUB_REF: "refs/heads/main",
			GITHUB_REPOSITORY: "owner/repo",
			GITHUB_REPOSITORY_OWNER: "owner",
			GITHUB_WORKSPACE: "/workspace",
			GITHUB_EVENT_NAME: "push",
			GITHUB_EVENT_PATH: "/dev/null",
			GITHUB_RUN_ID: "1",
			GITHUB_RUN_NUMBER: "1",
			GITHUB_ACTOR: "test",
			GITHUB_SERVER_URL: "https://github.com",
			GITHUB_API_URL: "https://api.github.com",
		}),
		ActionOutputsTest.layer(f.outputsState),
		ActionStateTest.layer(f.stateState),
		CheckRunTest.layer(f.checkRunState),
		CommandRunnerTest.layer(
			new Map(commandResponses.map(([key, stdout]) => [key, { exitCode: 0, stdout, stderr: "" }])),
		),
		GitCommitTest.layer(f.commitState),
		GitHubClientTest.layer(f.clientState),
		GitTagTest.empty().layer,
		PullRequestTest.layer(f.prState),
		FileSystem.layerNoop({}),
	);
	const config = ConfigProvider.fromMap(
		new Map([
			["release-branch", RELEASE_BRANCH],
			["target-branch", TARGET_BRANCH],
			["version-command", ""],
			["pr-title-prefix", "chore: release"],
			["dry-run", "false"],
		]),
	);
	return Effect.runPromise(
		createReleaseBranch("pnpm").pipe(
			Effect.provide(layer),
			Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
			Effect.withConfigProvider(config),
		),
	);
};

describe("createReleaseBranch", () => {
	it("creates the release branch and PR, and applies automated/release labels", async () => {
		const f = makeFixtures({ seedPr: true });

		const result = await runStage(f);

		expect(result.created).toBe(true);
		expect(result.prNumber).toBe(CREATED_PR_NUMBER);
		expect(typeof result.checkId).toBe("number");

		// The PR record in PullRequestTest should have the two labels applied.
		const pr = f.prState.prs.find((p) => p.number === CREATED_PR_NUMBER);
		expect(pr).toBeDefined();
		expect(pr?.labels).toEqual(["automated", "release"]);
	});

	it("exits early when the version bump produces no changes", async () => {
		const f = makeFixtures();

		const result = await runStage(f, [["git status --porcelain", ""]]);

		expect(result.created).toBe(false);
		expect(result.prNumber).toBeNull();
		// No PR was created, so PullRequestTest state stays empty.
		expect(f.prState.prs).toHaveLength(0);
	});

	it("fails when addLabels cannot find the PR in the service (non-seeded state)", async () => {
		// The GraphQL mock returns PR #42, but PullRequestTest has no PR #42.
		// addLabels is called directly (not wrapped in Effect.either), so the
		// effect must fail with a PullRequestError.
		const f = makeFixtures({ seedPr: false });

		await expect(runStage(f)).rejects.toThrow();
	});
});
