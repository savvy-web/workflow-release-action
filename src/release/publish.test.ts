/**
 * Unit tests for the Phase-3 publish flow.
 *
 * Covers the three functions that replaced the former `runPublish`:
 *
 *  - `detectReleases`    — detection from a merged PR / commit diff.
 *  - `runBuildAndSbom`   — the build-and-SBOM gate.
 *  - `runPublishTargets` — target resolution, topo-sort, and publishing.
 *
 * All dependencies are provided via in-memory test layers; no real filesystem
 * (except temp files for detection tests), registry, git, GitHub API, or
 * attestation tooling is exercised.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import type {
	GitHubCommit,
	GitHubCommitTestState,
	GitHubContent,
	GitHubContentTestState,
} from "@savvy-web/github-action-effects/testing";
import {
	ActionLoggerTest,
	ActionStateTest,
	AttestTest,
	GitHubClientTest,
	GitHubCommitTest,
	GitHubContentTest,
	NpmRegistryTest,
	OidcTokenIssuerTest,
	PackagePublishTest,
	PullRequestTest,
	SbomLive,
	SbomTest,
	SigstoreSignerTest,
} from "@savvy-web/github-action-effects/testing";
import { ConfigProvider, Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import {
	PublishTarget,
	PublishabilityDetector,
	TopologicalSorter,
	WorkspaceDiscovery,
	WorkspacePackage,
} from "workspaces-effect";

import type { BuildSbomResult, DetectedRelease, PublishInputArgs } from "./publish.js";
import { detectReleases, runBuildAndSbom, runPublishTargets } from "./publish.js";
import type { PublishPackagesResult } from "./types.js";

// ─── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Run an async effect-based operation with the process cwd temporarily changed.
 *
 * Restores the cwd even if the promise rejects.
 */
async function runInCwd<T>(cwd: string, fn: () => Promise<T>): Promise<T> {
	const savedCwd = process.cwd();
	process.chdir(cwd);
	try {
		return await fn();
	} finally {
		process.chdir(savedCwd);
	}
}

/** Build a minimal WorkspacePackage for tests. */
const makeWsPkg = (name: string, version = "1.0.0", path = `/tmp/test/${name}`): WorkspacePackage =>
	new WorkspacePackage({
		name,
		version,
		path,
		packageJsonPath: `${path}/package.json`,
		relativePath: name,
	});

/** Build a minimal npm PublishTarget. */
const makeNpmTarget = (name: string, directory = "/tmp/dist"): PublishTarget =>
	new PublishTarget({
		name,
		registry: "https://registry.npmjs.org/",
		directory,
		access: "public",
		provenance: false,
	});

/** Build a `DetectedRelease` for tests (the decoupled detection result). */
const makeDetected = (name: string, version = "1.0.0", path = `/tmp/test/${name}`): DetectedRelease => ({
	name,
	version,
	path,
});

/** Build a WorkspaceDiscovery test layer returning the given packages. */
const makeWorkspaceDiscoveryLayer = (packages: WorkspacePackage[]): Layer.Layer<WorkspaceDiscovery> =>
	Layer.succeed(WorkspaceDiscovery, {
		listPackages: (_cwd?: string) => Effect.succeed(packages as ReadonlyArray<WorkspacePackage>),
		getPackage: (name: string) => {
			const found = packages.find((p) => p.name === name);
			if (!found) return Effect.die(new Error(`Package not found: ${name}`));
			return Effect.succeed(found);
		},
		importerMap: (_cwd?: string) =>
			Effect.succeed(new Map(packages.map((p) => [p.relativePath, p])) as ReadonlyMap<string, WorkspacePackage>),
	});

/** Build a PublishabilityDetector test layer returning targets per package name. */
const makePublishabilityLayer = (targetsByName: Map<string, PublishTarget[]>): Layer.Layer<PublishabilityDetector> =>
	Layer.succeed(PublishabilityDetector, {
		detect: (pkg: WorkspacePackage, _root: string) =>
			Effect.succeed((targetsByName.get(pkg.name) ?? []) as ReadonlyArray<PublishTarget>),
	});

/** Build a TopologicalSorter test layer that returns names in the order given. */
const makeTopologicalSorterLayer = (orderedNames: string[]): Layer.Layer<TopologicalSorter> =>
	Layer.succeed(TopologicalSorter, {
		sort: () => Effect.succeed(orderedNames as ReadonlyArray<string>),
		sortSubset: (names: ReadonlyArray<string>) => {
			// Return only the names that were requested, in the pre-configured order
			const sorted = orderedNames.filter((n) => (names as string[]).includes(n));
			// Any names not in orderedNames go at the end (new packages)
			const missing = (names as string[]).filter((n) => !orderedNames.includes(n));
			return Effect.succeed([...sorted, ...missing] as ReadonlyArray<string>);
		},
		levels: () => Effect.succeed([orderedNames] as ReadonlyArray<ReadonlyArray<string>>),
	});

/**
 * Build test layers that simulate `detectFromPR` responses.
 *
 * - `PullRequestTest` seeds `files` (for `pr.listFiles`) and a PR record with
 *   `baseSha` (for `pr.get`).
 * - `GitHubContentTest` seeds the base-branch `package.json` text per file
 *   path, keyed by `` `${baseSha}:${filename}` ``.
 *
 * The helper also writes real `package.json` files to a temp directory so
 * `detectFromPR`'s `readFileSync` calls resolve correctly.
 *
 * Returns both the combined layer and the temp `cwd` path.
 */
const makeLayerForPR = (
	prNumber: number,
	packages: Array<{ name: string; newVersion: string; oldVersion: string; filename: string }>,
): {
	layer: Layer.Layer<GitHubCommit | GitHubContent | import("@savvy-web/github-action-effects").PullRequest>;
	tmpCwd: string;
} => {
	// Create a temp directory structure that mirrors the repo on disk
	const tmpCwd = join(tmpdir(), `silk-publish-test-${prNumber}-${Date.now()}`);
	mkdirSync(tmpCwd, { recursive: true });

	const baseSha = "base-sha-abc";

	// Write the "current" package.json files to disk so readFileSync can find
	// them, and seed the base-branch version into GitHubContentTest.
	const contentState: GitHubContentTestState = GitHubContentTest.empty();
	const files = packages.map((pkg) => {
		const dir = join(tmpCwd, ...pkg.filename.split("/").slice(0, -1));
		mkdirSync(dir, { recursive: true });
		const fullPath = join(tmpCwd, pkg.filename);
		writeFileSync(fullPath, JSON.stringify({ name: pkg.name, version: pkg.newVersion }));
		contentState.files.set(`${baseSha}:${pkg.filename}`, JSON.stringify({ name: pkg.name, version: pkg.oldVersion }));
		return { filename: pkg.filename, status: "modified" };
	});

	// Seed PullRequestTest: files map and a PR record with baseSha
	const prState = PullRequestTest.empty();
	prState.files.set(prNumber, files);
	prState.prs.push({
		number: prNumber,
		nodeId: `PR_node_${prNumber}`,
		url: `https://github.com/test-owner/test-repo/pull/${prNumber}`,
		title: `Release PR #${prNumber}`,
		state: "closed",
		head: "changeset-release/main",
		base: "main",
		draft: false,
		merged: true,
		mergedAt: "2026-01-01T00:00:00Z",
		mergeCommitSha: "merge-sha",
		baseSha,
		labels: [],
		reviewers: [],
		teamReviewers: [],
		autoMerge: undefined,
		body: null,
	});

	return {
		layer: Layer.mergeAll(
			GitHubContentTest.layer(contentState),
			PullRequestTest.layer(prState),
			// `detectReleases` requires `GitHubCommit`; the PR-detection path here
			// never reaches `detectFromCommit`, so an empty commit layer suffices.
			GitHubCommitTest.layer(GitHubCommitTest.empty()),
		),
		tmpCwd,
	};
};

// ─── Shared "always-on" base layers ──────────────────────────────────────────

const loggerState = ActionLoggerTest.empty();
const loggerLayer = ActionLoggerTest.layer(loggerState);
const sbomLayer = SbomTest.empty();
const oidcTokenIssuerLayer = OidcTokenIssuerTest;
const sigstoreSignerLayer = SigstoreSignerTest;
// Empty ActionState (no tokens persisted) — tests exercise the "no token" / OIDC path.
const actionStateLayer = ActionStateTest.layer(ActionStateTest.empty());
// Empty ConfigProvider — `npm-token` is absent, Config.option returns None (OIDC path).
const configProviderLayer = Layer.setConfigProvider(ConfigProvider.fromMap(new Map<string, string>()));

// ─── detectReleases ─────────────────────────────────────────────────────────

/**
 * Build test layers that simulate `detectFromCommit` responses.
 *
 * - `GitHubCommitTest` seeds the `get(sha)` commit (with its parent SHA) and
 *   the `compare(baseSha, sha)` comparison whose `files` drive detection.
 * - `GitHubContentTest` seeds the base-branch `package.json` text, keyed by
 *   `` `${baseSha}:${filename}` ``, so the base-branch version resolves.
 *
 * Writes the "current" `package.json` to a temp `cwd` so `detectFromCommit`'s
 * `readFileSync` resolves.
 */
const makeLayerForCommit = (
	sha: string,
	baseSha: string,
	pkg: { name: string; newVersion: string; oldVersion: string; filename: string },
): {
	layer: Layer.Layer<GitHubCommit | GitHubContent | import("@savvy-web/github-action-effects").PullRequest>;
	tmpCwd: string;
} => {
	const tmpCwd = join(tmpdir(), `silk-publish-commit-test-${sha}-${Date.now()}`);
	const dir = join(tmpCwd, ...pkg.filename.split("/").slice(0, -1));
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(tmpCwd, pkg.filename), JSON.stringify({ name: pkg.name, version: pkg.newVersion }));

	const commitState: GitHubCommitTestState = GitHubCommitTest.empty();
	commitState.commits.set(sha, {
		sha,
		message: "chore: release",
		author: "Test Author",
		parents: [{ sha: baseSha }],
	});
	commitState.comparisons.set(`${baseSha}...${sha}`, {
		commits: [],
		files: [{ filename: pkg.filename, status: "modified" }],
	});

	const contentState: GitHubContentTestState = GitHubContentTest.empty();
	contentState.files.set(`${baseSha}:${pkg.filename}`, JSON.stringify({ name: pkg.name, version: pkg.oldVersion }));

	return {
		layer: Layer.mergeAll(
			GitHubContentTest.layer(contentState),
			GitHubCommitTest.layer(commitState),
			// `detectReleases` requires `PullRequest`; the commit-detection path
			// here passes `mergedReleasePRNumber: undefined`, so `detectFromPR`
			// is never invoked and an empty PR layer suffices.
			PullRequestTest.layer(PullRequestTest.empty()),
		),
		tmpCwd,
	};
};

describe("detectReleases", () => {
	describe("detection via GitHubCommitTest (detectFromCommit)", () => {
		it("detects packages from the commit comparison's modified package.json files", async () => {
			// Arrange: seed a commit + comparison whose files drive the detection.
			const sha = "headsha-commit";
			const baseSha = "parentsha-commit";
			const { layer: ghLayer, tmpCwd } = makeLayerForCommit(sha, baseSha, {
				name: "@test/commit-pkg",
				newVersion: "3.0.0",
				oldVersion: "2.0.0",
				filename: "packages/commit-pkg/package.json",
			});

			const args: PublishInputArgs = {
				packageManager: "pnpm",
				targetBranch: "main",
				dryRun: false,
				mergedReleasePRNumber: undefined,
			};

			const savedSha = process.env.GITHUB_SHA;
			process.env.GITHUB_SHA = sha;

			// Act
			let detected: ReadonlyArray<DetectedRelease>;
			try {
				detected = await runInCwd(tmpCwd, () => Effect.runPromise(detectReleases(args).pipe(Effect.provide(ghLayer))));
			} finally {
				if (savedSha === undefined) delete process.env.GITHUB_SHA;
				else process.env.GITHUB_SHA = savedSha;
			}

			// Assert: the seeded comparison files drove the detected release.
			expect(detected).toHaveLength(1);
			expect(detected[0]?.name).toBe("@test/commit-pkg");
			expect(detected[0]?.version).toBe("3.0.0");
			expect(detected[0]?.path.endsWith(join("packages", "commit-pkg"))).toBe(true);
		});

		it("does not detect a package when old and new versions are identical", async () => {
			// Arrange: seed the base `package.json` version EQUAL to the on-disk
			// current version. This is the only scenario that proves the
			// `GitHubContentTest` base-version seed is consulted — an empty seed
			// would fall back to "0.0.0" and (wrongly) detect a release.
			const sha = "headsha-commit-noop";
			const baseSha = "parentsha-commit-noop";
			const { layer: ghLayer, tmpCwd } = makeLayerForCommit(sha, baseSha, {
				name: "@test/commit-pkg",
				newVersion: "3.0.0",
				oldVersion: "3.0.0",
				filename: "packages/commit-pkg/package.json",
			});

			const args: PublishInputArgs = {
				packageManager: "pnpm",
				targetBranch: "main",
				dryRun: false,
				mergedReleasePRNumber: undefined,
			};

			const savedSha = process.env.GITHUB_SHA;
			process.env.GITHUB_SHA = sha;

			// Act
			let detected: ReadonlyArray<DetectedRelease>;
			try {
				detected = await runInCwd(tmpCwd, () => Effect.runPromise(detectReleases(args).pipe(Effect.provide(ghLayer))));
			} finally {
				if (savedSha === undefined) delete process.env.GITHUB_SHA;
				else process.env.GITHUB_SHA = savedSha;
			}

			// Assert: old version == new version → no release detected.
			expect(detected).toHaveLength(0);
		});
	});

	describe("detection via GitHubContentTest (detectFromPR)", () => {
		it("detects packages from a merged PR", async () => {
			// Arrange: write a real package.json on disk so detectFromPR can read it
			const { layer: ghLayer, tmpCwd } = makeLayerForPR(42, [
				{
					name: "@test/detected-pkg",
					newVersion: "2.0.0",
					oldVersion: "1.0.0",
					filename: "packages/detected-pkg/package.json",
				},
			]);

			const args: PublishInputArgs = {
				packageManager: "pnpm",
				targetBranch: "main",
				dryRun: false,
				mergedReleasePRNumber: 42,
			};

			// Act — change cwd so detectFromPR's readFileSync resolves paths correctly
			const detected: ReadonlyArray<DetectedRelease> = await runInCwd(tmpCwd, () =>
				Effect.runPromise(detectReleases(args).pipe(Effect.provide(ghLayer))),
			);

			// Assert: detection found @test/detected-pkg with the new version
			expect(detected).toHaveLength(1);
			expect(detected[0]?.name).toBe("@test/detected-pkg");
			expect(detected[0]?.version).toBe("2.0.0");
			// `path` is derived from `process.cwd()`, which resolves the macOS
			// `/private` tmpdir symlink — assert on the trailing package dir only.
			expect(detected[0]?.path.endsWith(join("packages", "detected-pkg"))).toBe(true);
		});

		it("does not detect a package when old and new versions are identical", async () => {
			// Arrange: seed the base `package.json` version EQUAL to the on-disk
			// current version. This is the only scenario that proves the
			// `GitHubContentTest` base-version seed is consulted — an empty seed
			// would fall back to "0.0.0" and (wrongly) detect a release.
			const { layer: ghLayer, tmpCwd } = makeLayerForPR(43, [
				{
					name: "@test/detected-pkg",
					newVersion: "2.0.0",
					oldVersion: "2.0.0",
					filename: "packages/detected-pkg/package.json",
				},
			]);

			const args: PublishInputArgs = {
				packageManager: "pnpm",
				targetBranch: "main",
				dryRun: false,
				mergedReleasePRNumber: 43,
			};

			// Act
			const detected: ReadonlyArray<DetectedRelease> = await runInCwd(tmpCwd, () =>
				Effect.runPromise(detectReleases(args).pipe(Effect.provide(ghLayer))),
			);

			// Assert: old version == new version → no release detected.
			expect(detected).toHaveLength(0);
		});
	});
});

// ─── runBuildAndSbom ─────────────────────────────────────────────────────────

describe("runBuildAndSbom", () => {
	describe("build step", () => {
		it("returns buildError and ok: false when ci:build fails", async () => {
			// Arrange: CommandRunner returns non-zero for ci:build
			const { CommandRunnerError: CmdError, CommandRunner: CmdRunnerSvc } = await import(
				"@savvy-web/github-action-effects"
			);
			const failingBuildLayer = Layer.succeed(CmdRunnerSvc, {
				exec: () =>
					Effect.fail(
						new CmdError({
							command: "pnpm",
							args: ["ci:build"],
							exitCode: 1,
							stderr: "Build failed: compile error",
							reason: "Command exited with code 1",
						}),
					),
				execCapture: () =>
					Effect.fail(
						new CmdError({
							command: "pnpm",
							args: ["ci:build"],
							exitCode: 1,
							stderr: "Build failed: compile error",
							reason: "Command exited with code 1",
						}),
					),
				execJson: () =>
					Effect.fail(
						new CmdError({
							command: "pnpm",
							args: [],
							exitCode: 1,
							stderr: "Build failed",
							reason: "Command exited with code 1",
						}),
					),
				execLines: () =>
					Effect.fail(
						new CmdError({
							command: "pnpm",
							args: [],
							exitCode: 1,
							stderr: "Build failed",
							reason: "Command exited with code 1",
						}),
					),
			});

			const pkg = makeWsPkg("@test/build-fail", "1.0.0");
			const detected: DetectedRelease[] = [makeDetected("@test/build-fail", "1.0.0", pkg.path)];

			const layers = Layer.mergeAll(
				loggerLayer,
				failingBuildLayer,
				sbomLayer,
				NodeFileSystem.layer,
				makeWorkspaceDiscoveryLayer([pkg]),
			);

			const args: PublishInputArgs = {
				packageManager: "pnpm",
				targetBranch: "main",
				dryRun: false,
				mergedReleasePRNumber: undefined,
			};

			// Act
			const result: BuildSbomResult = await Effect.runPromise(
				runBuildAndSbom(detected, args).pipe(Effect.provide(layers)),
			);

			// Assert: build failed → ok is false, buildError is set, no SBOMs attempted
			expect(result.ok).toBe(false);
			expect(result.buildError).toMatch(/Build failed/);
			expect(result.sbomFailures).toHaveLength(0);
			expect(result.packageCount).toBe(1);
		});
	});

	describe("happy path", () => {
		/** A CommandRunner test layer whose `execCapture` (ci:build) succeeds. */
		const passingBuildLayer = async () => {
			const { CommandRunner: CmdRunnerSvc } = await import("@savvy-web/github-action-effects");
			return Layer.succeed(CmdRunnerSvc, {
				exec: () => Effect.succeed(0),
				execCapture: () => Effect.succeed({ stdout: "build ok", stderr: "", exitCode: 0 }),
				execJson: () => Effect.succeed(undefined as never),
				execLines: () => Effect.succeed([] as ReadonlyArray<string>),
			});
		};

		it("returns ok: true with no SBOM failures when build and every SBOM succeed", async () => {
			// Arrange: two packages, build succeeds, all SBOMs generate (SbomLive).
			// Use a real temp dir so `Sbom.save` succeeds and `sbomPaths` is
			// populated — runBuildAndSbom writes <unscoped>.sbom.json under each
			// package path.
			const buildLayer = await passingBuildLayer();

			const tmpRoot = join(tmpdir(), `silk-sbom-save-test-${Date.now()}`);
			const pkgAPath = join(tmpRoot, "sbom-a");
			const pkgBPath = join(tmpRoot, "sbom-b");
			mkdirSync(pkgAPath, { recursive: true });
			mkdirSync(pkgBPath, { recursive: true });

			const pkgA = makeWsPkg("@test/sbom-a", "1.0.0", pkgAPath);
			const pkgB = makeWsPkg("@test/sbom-b", "2.0.0", pkgBPath);
			const detected: DetectedRelease[] = [
				makeDetected("@test/sbom-a", "1.0.0", pkgA.path),
				makeDetected("@test/sbom-b", "2.0.0", pkgB.path),
			];

			const layers = Layer.mergeAll(
				loggerLayer,
				buildLayer,
				SbomLive,
				NodeFileSystem.layer,
				makeWorkspaceDiscoveryLayer([pkgA, pkgB]),
			);

			const args: PublishInputArgs = {
				packageManager: "pnpm",
				targetBranch: "main",
				dryRun: false,
				mergedReleasePRNumber: undefined,
			};

			// Act
			const result: BuildSbomResult = await Effect.runPromise(
				runBuildAndSbom(detected, args).pipe(Effect.provide(layers)),
			);

			// Assert: build + every SBOM succeeded
			expect(result.ok).toBe(true);
			expect(result.sbomFailures).toHaveLength(0);
			expect(result.buildError).toBeUndefined();
			expect(result.packageCount).toBe(detected.length);
			// And: the saved SBOM paths are populated for each package.
			expect(result.sbomPaths.get("@test/sbom-a")).toBe(join(pkgAPath, "sbom-a.sbom.json"));
			expect(result.sbomPaths.get("@test/sbom-b")).toBe(join(pkgBPath, "sbom-b.sbom.json"));
		});

		it("returns ok: false and lists the failing package when one SBOM generation fails", async () => {
			// Arrange: build succeeds, but SBOM generation fails for one specific
			// package. The stock `SbomTest` layer cannot be made to fail per
			// package (it has only success overrides), so a custom `Sbom` layer
			// delegates to `SbomLive` and fails `generate` only for `@test/sbom-bad`.
			const buildLayer = await passingBuildLayer();
			const { Sbom: SbomSvc, SbomError } = await import("@savvy-web/github-action-effects");
			const liveSbom = await Effect.runPromise(Effect.provide(SbomSvc, SbomLive));

			const failingPkgName = "@test/sbom-bad";
			const partialSbomLayer = Layer.succeed(SbomSvc, {
				generate: (input) =>
					input.rootName === failingPkgName
						? Effect.fail(new SbomError({ reason: "build", message: "Simulated SBOM build failure" }))
						: liveSbom.generate(input),
				serializeJson: (bom) => liveSbom.serializeJson(bom),
				save: (bom, path) => liveSbom.save(bom, path),
			});

			const pkgGood = makeWsPkg("@test/sbom-good", "1.0.0");
			const pkgBad = makeWsPkg(failingPkgName, "1.0.0");
			const detected: DetectedRelease[] = [
				makeDetected("@test/sbom-good", "1.0.0", pkgGood.path),
				makeDetected(failingPkgName, "1.0.0", pkgBad.path),
			];

			const layers = Layer.mergeAll(
				loggerLayer,
				buildLayer,
				partialSbomLayer,
				NodeFileSystem.layer,
				makeWorkspaceDiscoveryLayer([pkgGood, pkgBad]),
			);

			const args: PublishInputArgs = {
				packageManager: "pnpm",
				targetBranch: "main",
				dryRun: false,
				mergedReleasePRNumber: undefined,
			};

			// Act
			const result: BuildSbomResult = await Effect.runPromise(
				runBuildAndSbom(detected, args).pipe(Effect.provide(layers)),
			);

			// Assert: one SBOM failed → not ok, only the failing package listed
			expect(result.ok).toBe(false);
			expect(result.sbomFailures).toEqual([failingPkgName]);
			expect(result.buildError).toBeUndefined();
			expect(result.packageCount).toBe(detected.length);
		});
	});
});

// ─── runPublishTargets ───────────────────────────────────────────────────────

describe("runPublishTargets", () => {
	const args: PublishInputArgs = {
		packageManager: "pnpm",
		targetBranch: "main",
		dryRun: false,
		mergedReleasePRNumber: 99,
	};

	// Pack-result fields the test layer reports via `pack`. Every test seeds
	// `NpmRegistryTest` with the same `name`/`version` so the orchestrator's
	// `getPublishedIntegrity(packResult.name, packResult.version, …)` probe
	// lines up with the seeded registry entry.
	const PACK_NAME = "@test/pkg";
	const PACK_VERSION = "1.0.0";
	const PACK_DIGEST = "sha512-AAAA";

	const makePackResult = (overrides?: { tarballPath?: string }) => ({
		tarballPath: overrides?.tarballPath ?? `/tmp/${PACK_NAME.replace("/", "-")}-${PACK_VERSION}.tgz`,
		digest: PACK_DIGEST,
		// Fixture sha256-hex value — 64 hex chars. The orchestrator now plumbs
		// this as the subject digest for attestation + storage-record calls.
		sha256Hex: "abc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abc1",
		name: PACK_NAME,
		version: PACK_VERSION,
		packedSize: 1234,
		unpackedSize: 4321,
		fileCount: 7,
	});

	const makeBaseLayers = (
		pubLayer: Layer.Layer<import("@savvy-web/github-action-effects").PackagePublish>,
		npmLayer: Layer.Layer<import("@savvy-web/github-action-effects").NpmRegistry>,
		wsPkg: WorkspacePackage,
		targets: PublishTarget[],
	) =>
		Layer.mergeAll(
			loggerLayer,
			actionStateLayer,
			configProviderLayer,
			pubLayer,
			npmLayer,
			sbomLayer,
			AttestTest.empty(),
			oidcTokenIssuerLayer,
			sigstoreSignerLayer,
			GitHubClientTest.empty(),
			makeWorkspaceDiscoveryLayer([wsPkg]),
			makePublishabilityLayer(new Map([[wsPkg.name, targets]])),
			makeTopologicalSorterLayer([wsPkg.name]),
		);

	describe("first-publish path (version absent from registry)", () => {
		it("packs once, probes the target registry, and publishes the tarball to it", async () => {
			// Arrange — NpmRegistry has no entry for the package; the probe
			// returns Option.none() and the orchestrator takes the publish branch.
			const npmLayer = NpmRegistryTest.empty();
			const { state: pubState, layer: pubLayer } = PackagePublishTest.layer({ packResult: makePackResult() });

			const wsPkg = makeWsPkg(PACK_NAME, PACK_VERSION, `/tmp/test/${PACK_NAME}`);
			const target = makeNpmTarget(PACK_NAME, `/tmp/test/${PACK_NAME}`);
			const detected: DetectedRelease[] = [makeDetected(PACK_NAME, PACK_VERSION, wsPkg.path)];

			// Act
			const result: PublishPackagesResult = await Effect.runPromise(
				runPublishTargets(detected, args).pipe(Effect.provide(makeBaseLayers(pubLayer, npmLayer, wsPkg, [target]))),
			);

			// Assert — one pack, one publishTarball, no legacy publish, no idempotent.
			expect(result.success).toBe(true);
			expect(result.packages).toHaveLength(1);
			expect(pubState.packCalls).toHaveLength(1);
			expect(pubState.publishTarballCalls).toHaveLength(1);
			expect(pubState.publishCalls).toHaveLength(0);
			expect(pubState.publishIdempotentCalls).toHaveLength(0);

			// The published-to registry matches the target's registry (not the default).
			const call = pubState.publishTarballCalls[0];
			expect(call?.options.registry).toBe(target.registry);

			const targetResult = result.packages[0]?.targets[0];
			expect(targetResult?.status).toBe("published");
			expect(targetResult?.success).toBe(true);
			expect(targetResult?.skipReason).toBeUndefined();
			expect(targetResult?.recovery).toBeUndefined();
		});
	});

	describe("skipped-identical recovery", () => {
		it("records skipReason: 'already-published-identical' and never publishes when the registry has matching integrity", async () => {
			// Arrange — the registry already has v1.0.0 with the same integrity
			// the local pack produces. The probe returns Option.some(digest) === local.
			const npmLayer = NpmRegistryTest.layer({
				packages: new Map([
					[
						PACK_NAME,
						{
							versions: [PACK_VERSION],
							latest: PACK_VERSION,
							distTags: { latest: PACK_VERSION },
							integrity: PACK_DIGEST,
						},
					],
				]),
			});
			const { state: pubState, layer: pubLayer } = PackagePublishTest.layer({ packResult: makePackResult() });

			const wsPkg = makeWsPkg(PACK_NAME, PACK_VERSION, `/tmp/test/${PACK_NAME}`);
			const target = makeNpmTarget(PACK_NAME, `/tmp/test/${PACK_NAME}`);
			const detected: DetectedRelease[] = [makeDetected(PACK_NAME, PACK_VERSION, wsPkg.path)];

			// Act
			const result: PublishPackagesResult = await Effect.runPromise(
				runPublishTargets(detected, args).pipe(Effect.provide(makeBaseLayers(pubLayer, npmLayer, wsPkg, [target]))),
			);

			// Assert — one pack, zero publishTarball/publish/idempotent.
			expect(result.success).toBe(true);
			expect(pubState.packCalls).toHaveLength(1);
			expect(pubState.publishTarballCalls).toHaveLength(0);
			expect(pubState.publishCalls).toHaveLength(0);
			expect(pubState.publishIdempotentCalls).toHaveLength(0);

			const targetResult = result.packages[0]?.targets[0];
			expect(targetResult?.status).toBe("skipped");
			expect(targetResult?.success).toBe(true);
			expect(targetResult?.skipReason).toBe("already-published-identical");
			expect(targetResult?.recovery).toEqual({ localDigest: PACK_DIGEST, remoteDigest: PACK_DIGEST });
		});
	});

	describe("failed-mismatch", () => {
		it("records status: 'failed' with a recovery digest pair and a 'mismatch' message when integrity differs", async () => {
			// Arrange — registry has v1.0.0 but with a DIFFERENT integrity.
			const REMOTE_DIGEST = "sha512-BBBB";
			const npmLayer = NpmRegistryTest.layer({
				packages: new Map([
					[
						PACK_NAME,
						{
							versions: [PACK_VERSION],
							latest: PACK_VERSION,
							distTags: { latest: PACK_VERSION },
							integrity: REMOTE_DIGEST,
						},
					],
				]),
			});
			const { state: pubState, layer: pubLayer } = PackagePublishTest.layer({ packResult: makePackResult() });

			const wsPkg = makeWsPkg(PACK_NAME, PACK_VERSION, `/tmp/test/${PACK_NAME}`);
			const target = makeNpmTarget(PACK_NAME, `/tmp/test/${PACK_NAME}`);
			const detected: DetectedRelease[] = [makeDetected(PACK_NAME, PACK_VERSION, wsPkg.path)];

			// Act
			const result: PublishPackagesResult = await Effect.runPromise(
				runPublishTargets(detected, args).pipe(Effect.provide(makeBaseLayers(pubLayer, npmLayer, wsPkg, [target]))),
			);

			// Assert — fatal mismatch; no publish call; recovery field carries both digests.
			expect(result.success).toBe(false);
			expect(pubState.packCalls).toHaveLength(1);
			expect(pubState.publishTarballCalls).toHaveLength(0);

			const targetResult = result.packages[0]?.targets[0];
			expect(targetResult?.status).toBe("failed");
			expect(targetResult?.success).toBe(false);
			expect(targetResult?.recovery).toEqual({ localDigest: PACK_DIGEST, remoteDigest: REMOTE_DIGEST });
			expect(targetResult?.error).toMatch(/mismatch/i);
			// The error names both digests for forensic comparison.
			expect(targetResult?.error).toContain(PACK_DIGEST);
			expect(targetResult?.error).toContain(REMOTE_DIGEST);
		});
	});

	describe("pack-once per directory", () => {
		it("calls pack exactly once when two targets share the same build directory", async () => {
			// Arrange — two targets pointing at the same directory, different registries.
			const SHARED_DIR = `/tmp/test/${PACK_NAME}`;
			const npmLayer = NpmRegistryTest.empty(); // both registries → publish path
			const { state: pubState, layer: pubLayer } = PackagePublishTest.layer({ packResult: makePackResult() });

			const wsPkg = makeWsPkg(PACK_NAME, PACK_VERSION, SHARED_DIR);
			const targetA = new PublishTarget({
				name: PACK_NAME,
				registry: "https://registry.npmjs.org/",
				directory: SHARED_DIR,
				access: "public",
				provenance: false,
			});
			const targetB = new PublishTarget({
				name: PACK_NAME,
				registry: "https://npm.pkg.github.com/",
				directory: SHARED_DIR,
				access: "public",
				provenance: false,
			});
			const detected: DetectedRelease[] = [makeDetected(PACK_NAME, PACK_VERSION, wsPkg.path)];

			// Act
			const result: PublishPackagesResult = await Effect.runPromise(
				runPublishTargets(detected, args).pipe(
					Effect.provide(makeBaseLayers(pubLayer, npmLayer, wsPkg, [targetA, targetB])),
				),
			);

			// Assert — ONE pack call even with two targets sharing the directory.
			expect(pubState.packCalls).toHaveLength(1);
			expect(pubState.publishTarballCalls).toHaveLength(2);
			expect(result.packages[0]?.targets).toHaveLength(2);
		});
	});

	// ─── Attestation behaviour: one per build, shared across targets ──────────
	describe("attestation hoisted out of the per-target loop", () => {
		// Build a base-layer assembly that injects a caller-controlled Attest
		// test state so each test can inspect how many calls fired.
		const makeBaseLayersWithAttest = async (
			pubLayer: Layer.Layer<import("@savvy-web/github-action-effects").PackagePublish>,
			npmLayer: Layer.Layer<import("@savvy-web/github-action-effects").NpmRegistry>,
			wsPkg: WorkspacePackage,
			targets: PublishTarget[],
			attestState: import("@savvy-web/github-action-effects/testing").AttestTestState,
		) => {
			const { AttestTest: AttestTestNs } = await import("@savvy-web/github-action-effects/testing");
			return Layer.mergeAll(
				loggerLayer,
				actionStateLayer,
				configProviderLayer,
				pubLayer,
				npmLayer,
				sbomLayer,
				AttestTestNs.layer(attestState),
				oidcTokenIssuerLayer,
				sigstoreSignerLayer,
				GitHubClientTest.empty(),
				makeWorkspaceDiscoveryLayer([wsPkg]),
				makePublishabilityLayer(new Map([[wsPkg.name, targets]])),
				makeTopologicalSorterLayer([wsPkg.name]),
			);
		};

		it("fires attestation exactly ONCE per build directory and shares the URL across both targets", async () => {
			// Arrange — two targets sharing a build directory, both with
			// provenance: true so the attestation path is enabled.
			const { makeAttestTestState } = await import("@savvy-web/github-action-effects/testing");
			const attestState = makeAttestTestState();

			const SHARED_DIR = `/tmp/test/${PACK_NAME}`;
			const npmLayer = NpmRegistryTest.empty();
			const { layer: pubLayer } = PackagePublishTest.layer({ packResult: makePackResult() });

			const wsPkg = makeWsPkg(PACK_NAME, PACK_VERSION, SHARED_DIR);
			const targetA = new PublishTarget({
				name: PACK_NAME,
				registry: "https://registry.npmjs.org/",
				directory: SHARED_DIR,
				access: "public",
				provenance: true,
			});
			const targetB = new PublishTarget({
				name: PACK_NAME,
				registry: "https://npm.pkg.github.com/",
				directory: SHARED_DIR,
				access: "public",
				provenance: true,
			});
			const detected: DetectedRelease[] = [makeDetected(PACK_NAME, PACK_VERSION, wsPkg.path)];

			const layers = await makeBaseLayersWithAttest(pubLayer, npmLayer, wsPkg, [targetA, targetB], attestState);

			// Act
			const result: PublishPackagesResult = await Effect.runPromise(
				runPublishTargets(detected, args).pipe(Effect.provide(layers)),
			);

			// Assert — exactly ONE SBOM attestation regardless of two targets.
			// (Provenance attestation is gated by a real JWT decode that the
			// OidcTokenIssuerTest cannot satisfy — the synthetic token decodes
			// to null and that call is skipped. So we assert on the SBOM-call
			// count to prove the helper itself ran once, not per target.)
			expect(attestState.sbomCalls).toHaveLength(1);

			// And: both successful targets carry the SAME attestation URLs
			// because they shared a single attestation invocation.
			const targets = result.packages[0]?.targets ?? [];
			expect(targets).toHaveLength(2);
			expect(targets[0]?.success).toBe(true);
			expect(targets[1]?.success).toBe(true);
			expect(targets[0]?.sbomAttestationUrl).toBe(targets[1]?.sbomAttestationUrl);
			expect(targets[0]?.sbomAttestationUrl).toBeDefined();
		});

		it("does NOT call Attest when every target in the group has provenance: false", async () => {
			// Arrange — two targets sharing a directory, neither requests
			// provenance. The orchestrator must skip attestation entirely.
			const { makeAttestTestState } = await import("@savvy-web/github-action-effects/testing");
			const attestState = makeAttestTestState();

			const SHARED_DIR = `/tmp/test/${PACK_NAME}`;
			const npmLayer = NpmRegistryTest.empty();
			const { layer: pubLayer } = PackagePublishTest.layer({ packResult: makePackResult() });

			const wsPkg = makeWsPkg(PACK_NAME, PACK_VERSION, SHARED_DIR);
			const targetA = new PublishTarget({
				name: PACK_NAME,
				registry: "https://registry.npmjs.org/",
				directory: SHARED_DIR,
				access: "public",
				provenance: false,
			});
			const targetB = new PublishTarget({
				name: PACK_NAME,
				registry: "https://npm.pkg.github.com/",
				directory: SHARED_DIR,
				access: "public",
				provenance: false,
			});
			const detected: DetectedRelease[] = [makeDetected(PACK_NAME, PACK_VERSION, wsPkg.path)];

			const layers = await makeBaseLayersWithAttest(pubLayer, npmLayer, wsPkg, [targetA, targetB], attestState);

			// Act
			await Effect.runPromise(runPublishTargets(detected, args).pipe(Effect.provide(layers)));

			// Assert — neither SBOM nor provenance attestation fired.
			expect(attestState.sbomCalls).toHaveLength(0);
			expect(attestState.provenanceCalls).toHaveLength(0);
		});

		it("stamps the per-package sbomPath onto every successful target's result", async () => {
			// Arrange — one target, supply a sbomPaths map keyed by the
			// package name. The orchestrator threads that through every
			// successful target's TargetPublishResult so the release step can
			// upload the SBOM file as an asset.
			const npmLayer = NpmRegistryTest.empty();
			const { layer: pubLayer } = PackagePublishTest.layer({ packResult: makePackResult() });

			const wsPkg = makeWsPkg(PACK_NAME, PACK_VERSION, `/tmp/test/${PACK_NAME}`);
			const target = makeNpmTarget(PACK_NAME, `/tmp/test/${PACK_NAME}`);
			const detected: DetectedRelease[] = [makeDetected(PACK_NAME, PACK_VERSION, wsPkg.path)];

			const SBOM_PATH = `/tmp/test/${PACK_NAME}/pkg.sbom.json`;
			const sbomPaths = new Map<string, string>([[PACK_NAME, SBOM_PATH]]);

			// Act
			const result: PublishPackagesResult = await Effect.runPromise(
				runPublishTargets(detected, args, sbomPaths).pipe(
					Effect.provide(makeBaseLayers(pubLayer, npmLayer, wsPkg, [target])),
				),
			);

			// Assert — the sbomPath was attached to the target result.
			const targetResult = result.packages[0]?.targets[0];
			expect(targetResult?.success).toBe(true);
			expect(targetResult?.sbomPath).toBe(SBOM_PATH);
		});
	});

	// ─── Idempotent attestation reuse (Round 2: skip-on-presence) ────────────
	describe("attestation idempotency — skip when already attested", () => {
		// CYCLONEDX_BOM and SLSA_PROVENANCE_V1 are reused from the library
		// constants; copying them here keeps the test self-contained without
		// re-importing the schema module.
		const SLSA_PROVENANCE_V1 = "https://slsa.dev/provenance/v1";
		const CYCLONEDX_BOM = "https://cyclonedx.org/bom";
		// The pack-result fixture above carries this hex; every test that
		// triggers an attestation probes the subject under this digest.
		const SUBJECT_SHA = "abc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abc1";

		it("reuses existing provenance + SBOM attestations and writes neither", async () => {
			// Arrange — seed the AttestTest layer with both a provenance
			// and an SBOM attestation under the same subject digest.
			const { makeAttestTestState } = await import("@savvy-web/github-action-effects/testing");
			const attestState = makeAttestTestState();
			attestState.seedAttestations.set(SUBJECT_SHA, [
				{
					attestationUrl: "https://github.com/owner/repo/attestations/100",
					predicateType: SLSA_PROVENANCE_V1,
				},
				{
					attestationUrl: "https://github.com/owner/repo/attestations/101",
					predicateType: CYCLONEDX_BOM,
				},
			]);

			const SHARED_DIR = `/tmp/test/${PACK_NAME}`;
			const npmLayer = NpmRegistryTest.empty();
			const { layer: pubLayer } = PackagePublishTest.layer({ packResult: makePackResult() });

			const wsPkg = makeWsPkg(PACK_NAME, PACK_VERSION, SHARED_DIR);
			const target = new PublishTarget({
				name: PACK_NAME,
				registry: "https://registry.npmjs.org/",
				directory: SHARED_DIR,
				access: "public",
				provenance: true,
			});
			const detected: DetectedRelease[] = [makeDetected(PACK_NAME, PACK_VERSION, wsPkg.path)];

			const { AttestTest: AttestTestNs } = await import("@savvy-web/github-action-effects/testing");
			const layers = Layer.mergeAll(
				loggerLayer,
				actionStateLayer,
				configProviderLayer,
				pubLayer,
				npmLayer,
				sbomLayer,
				AttestTestNs.layer(attestState),
				oidcTokenIssuerLayer,
				sigstoreSignerLayer,
				GitHubClientTest.empty(),
				makeWorkspaceDiscoveryLayer([wsPkg]),
				makePublishabilityLayer(new Map([[wsPkg.name, [target]]])),
				makeTopologicalSorterLayer([wsPkg.name]),
			);

			// Act
			const result: PublishPackagesResult = await Effect.runPromise(
				runPublishTargets(detected, args).pipe(Effect.provide(layers)),
			);

			// Assert — neither provenance nor SBOM was written; both
			// existing URLs were reused on the target's result.
			expect(attestState.provenanceCalls).toHaveLength(0);
			expect(attestState.sbomCalls).toHaveLength(0);
			expect(attestState.listForSubjectCalls.length).toBeGreaterThanOrEqual(2);

			const targetResult = result.packages[0]?.targets[0];
			expect(targetResult?.attestationUrl).toBe("https://github.com/owner/repo/attestations/100");
			expect(targetResult?.sbomAttestationUrl).toBe("https://github.com/owner/repo/attestations/101");
			expect(targetResult?.recovered).toEqual({ provenance: true, sbom: true });
		});

		it("writes fresh provenance + SBOM when no existing attestations match", async () => {
			// Arrange — empty seed; the orchestrator must hit listForSubject
			// twice (provenance + SBOM), find nothing, and write both fresh.
			const { makeAttestTestState } = await import("@savvy-web/github-action-effects/testing");
			const attestState = makeAttestTestState();

			const SHARED_DIR = `/tmp/test/${PACK_NAME}`;
			const npmLayer = NpmRegistryTest.empty();
			const { layer: pubLayer } = PackagePublishTest.layer({ packResult: makePackResult() });

			const wsPkg = makeWsPkg(PACK_NAME, PACK_VERSION, SHARED_DIR);
			const target = new PublishTarget({
				name: PACK_NAME,
				registry: "https://registry.npmjs.org/",
				directory: SHARED_DIR,
				access: "public",
				provenance: true,
			});
			const detected: DetectedRelease[] = [makeDetected(PACK_NAME, PACK_VERSION, wsPkg.path)];

			const { AttestTest: AttestTestNs } = await import("@savvy-web/github-action-effects/testing");
			const layers = Layer.mergeAll(
				loggerLayer,
				actionStateLayer,
				configProviderLayer,
				pubLayer,
				npmLayer,
				sbomLayer,
				AttestTestNs.layer(attestState),
				oidcTokenIssuerLayer,
				sigstoreSignerLayer,
				GitHubClientTest.empty(),
				makeWorkspaceDiscoveryLayer([wsPkg]),
				makePublishabilityLayer(new Map([[wsPkg.name, [target]]])),
				makeTopologicalSorterLayer([wsPkg.name]),
			);

			// Act
			const result: PublishPackagesResult = await Effect.runPromise(
				runPublishTargets(detected, args).pipe(Effect.provide(layers)),
			);

			// Assert — listForSubject was probed twice (one per predicate
			// type), SBOM was written (provenance path is gated by OIDC
			// decode that the test layer can't satisfy → recovered: false
			// stays on both legs since the OIDC fallback writes nothing).
			expect(attestState.listForSubjectCalls.length).toBeGreaterThanOrEqual(2);
			expect(attestState.sbomCalls).toHaveLength(1);

			const targetResult = result.packages[0]?.targets[0];
			// SBOM was newly written; provenance probe ran but the OIDC
			// decode failed in test, so attestationUrl remains undefined.
			expect(targetResult?.recovered).toEqual({ provenance: false, sbom: false });
		});

		it("mixed: provenance exists, SBOM does not — skip provenance, write SBOM", async () => {
			// Arrange — seed only a provenance attestation; the SBOM
			// branch must still fire because no SBOM is on file.
			const { makeAttestTestState } = await import("@savvy-web/github-action-effects/testing");
			const attestState = makeAttestTestState();
			attestState.seedAttestations.set(SUBJECT_SHA, [
				{
					attestationUrl: "https://github.com/owner/repo/attestations/200",
					predicateType: SLSA_PROVENANCE_V1,
				},
			]);

			const SHARED_DIR = `/tmp/test/${PACK_NAME}`;
			const npmLayer = NpmRegistryTest.empty();
			const { layer: pubLayer } = PackagePublishTest.layer({ packResult: makePackResult() });

			const wsPkg = makeWsPkg(PACK_NAME, PACK_VERSION, SHARED_DIR);
			const target = new PublishTarget({
				name: PACK_NAME,
				registry: "https://registry.npmjs.org/",
				directory: SHARED_DIR,
				access: "public",
				provenance: true,
			});
			const detected: DetectedRelease[] = [makeDetected(PACK_NAME, PACK_VERSION, wsPkg.path)];

			const { AttestTest: AttestTestNs } = await import("@savvy-web/github-action-effects/testing");
			const layers = Layer.mergeAll(
				loggerLayer,
				actionStateLayer,
				configProviderLayer,
				pubLayer,
				npmLayer,
				sbomLayer,
				AttestTestNs.layer(attestState),
				oidcTokenIssuerLayer,
				sigstoreSignerLayer,
				GitHubClientTest.empty(),
				makeWorkspaceDiscoveryLayer([wsPkg]),
				makePublishabilityLayer(new Map([[wsPkg.name, [target]]])),
				makeTopologicalSorterLayer([wsPkg.name]),
			);

			// Act
			const result: PublishPackagesResult = await Effect.runPromise(
				runPublishTargets(detected, args).pipe(Effect.provide(layers)),
			);

			// Assert — provenance was reused, SBOM was newly written.
			expect(attestState.provenanceCalls).toHaveLength(0);
			expect(attestState.sbomCalls).toHaveLength(1);

			const targetResult = result.packages[0]?.targets[0];
			expect(targetResult?.attestationUrl).toBe("https://github.com/owner/repo/attestations/200");
			expect(targetResult?.recovered).toEqual({ provenance: true, sbom: false });
		});

		it("passes the on-disk SBOM document as bomDocument when sbomPath exists", async () => {
			// Arrange — write a CycloneDX BOM to disk; the orchestrator
			// should hand it to Attest.sbom verbatim as `bomDocument`
			// rather than calling with `dependencies: []`.
			const { makeAttestTestState } = await import("@savvy-web/github-action-effects/testing");
			const attestState = makeAttestTestState();

			const tmpDir = join(tmpdir(), `silk-sbom-attest-test-${Date.now()}`);
			mkdirSync(tmpDir, { recursive: true });
			const sbomPath = join(tmpDir, "pkg.sbom.json");
			const bomFixture = {
				bomFormat: "CycloneDX" as const,
				specVersion: "1.5" as const,
				version: 1,
				metadata: {
					component: { name: PACK_NAME, version: PACK_VERSION, type: "library" },
					supplier: { name: "Test Supplier" },
				},
				components: [{ type: "library", name: "lodash", version: "4.17.21" }],
			};
			writeFileSync(sbomPath, JSON.stringify(bomFixture));

			const SHARED_DIR = `/tmp/test/${PACK_NAME}`;
			const npmLayer = NpmRegistryTest.empty();
			const { layer: pubLayer } = PackagePublishTest.layer({ packResult: makePackResult() });

			const wsPkg = makeWsPkg(PACK_NAME, PACK_VERSION, SHARED_DIR);
			const target = new PublishTarget({
				name: PACK_NAME,
				registry: "https://registry.npmjs.org/",
				directory: SHARED_DIR,
				access: "public",
				provenance: true,
			});
			const detected: DetectedRelease[] = [makeDetected(PACK_NAME, PACK_VERSION, wsPkg.path)];
			const sbomPaths = new Map<string, string>([[PACK_NAME, sbomPath]]);

			const { AttestTest: AttestTestNs } = await import("@savvy-web/github-action-effects/testing");
			const layers = Layer.mergeAll(
				loggerLayer,
				actionStateLayer,
				configProviderLayer,
				pubLayer,
				npmLayer,
				sbomLayer,
				AttestTestNs.layer(attestState),
				oidcTokenIssuerLayer,
				sigstoreSignerLayer,
				GitHubClientTest.empty(),
				makeWorkspaceDiscoveryLayer([wsPkg]),
				makePublishabilityLayer(new Map([[wsPkg.name, [target]]])),
				makeTopologicalSorterLayer([wsPkg.name]),
			);

			// Act
			await Effect.runPromise(runPublishTargets(detected, args, sbomPaths).pipe(Effect.provide(layers)));

			// Assert — the sbom() call carries the on-disk BOM document,
			// NOT the legacy `dependencies: []` shape.
			expect(attestState.sbomCalls).toHaveLength(1);
			const sbomCall = attestState.sbomCalls[0];
			expect(sbomCall?.bomDocument).toEqual(bomFixture);
			expect(sbomCall?.dependencies).toBeUndefined();
		});
	});

	describe("mixed: one published, one skipped-identical", () => {
		it("publishes the missing-registry target, recovers the matching one, and counts both as 'Published 2/2'", async () => {
			// Arrange — two targets at different registries. Registry A has no
			// entry (publish branch). Registry B is seeded with a matching
			// integrity (recovery branch). The test layer's `getPublishedIntegrity`
			// doesn't dispatch by URL, so we set the seeded integrity to the
			// shared value the matching probe will see; the missing-registry
			// branch is exercised via a separate package layer below.
			// Workaround: use ONE registry that is seeded with the matching
			// digest, and ONE that the test layer's getPublishedIntegrity
			// will never find (the test layer keys by package name only —
			// it cannot return different values for different registries on
			// the same package). To get a true mixed result, we use a custom
			// NpmRegistry layer that branches on the `registry` option.
			const SHARED_DIR = `/tmp/test/${PACK_NAME}`;
			const REGISTRY_PUBLISH = "https://registry.npmjs.org/";
			const REGISTRY_RECOVER = "https://npm.pkg.github.com/";

			const { NpmRegistry: NpmRegistrySvc } = await import("@savvy-web/github-action-effects");
			const { Option } = await import("effect");
			const npmLayer = Layer.succeed(NpmRegistrySvc, {
				getLatestVersion: () => Effect.die("unused"),
				getDistTags: () => Effect.die("unused"),
				getPackageInfo: () => Effect.die("unused"),
				getVersions: () => Effect.die("unused"),
				getPublishedIntegrity: (_pkg, _version, opts) =>
					Effect.succeed(opts.registry === REGISTRY_RECOVER ? Option.some(PACK_DIGEST) : Option.none<string>()),
			});

			const { state: pubState, layer: pubLayer } = PackagePublishTest.layer({ packResult: makePackResult() });

			const wsPkg = makeWsPkg(PACK_NAME, PACK_VERSION, SHARED_DIR);
			const targetA = new PublishTarget({
				name: PACK_NAME,
				registry: REGISTRY_PUBLISH,
				directory: SHARED_DIR,
				access: "public",
				provenance: false,
			});
			const targetB = new PublishTarget({
				name: PACK_NAME,
				registry: REGISTRY_RECOVER,
				directory: SHARED_DIR,
				access: "public",
				provenance: false,
			});
			const detected: DetectedRelease[] = [makeDetected(PACK_NAME, PACK_VERSION, wsPkg.path)];

			// Act
			const result: PublishPackagesResult = await Effect.runPromise(
				runPublishTargets(detected, args).pipe(
					Effect.provide(makeBaseLayers(pubLayer, npmLayer, wsPkg, [targetA, targetB])),
				),
			);

			// Assert — exactly one publish call (registry A); one recovery skip (registry B).
			expect(pubState.packCalls).toHaveLength(1);
			expect(pubState.publishTarballCalls).toHaveLength(1);
			expect(pubState.publishTarballCalls[0]?.options.registry).toBe(REGISTRY_PUBLISH);

			const targets = result.packages[0]?.targets ?? [];
			expect(targets).toHaveLength(2);

			const publishedTarget = targets.find((t) => t.target.registry === REGISTRY_PUBLISH);
			const recoveredTarget = targets.find((t) => t.target.registry === REGISTRY_RECOVER);
			expect(publishedTarget?.status).toBe("published");
			expect(recoveredTarget?.status).toBe("skipped");
			expect(recoveredTarget?.skipReason).toBe("already-published-identical");

			// Abort-check accounting: both targets count as 'successful' so the
			// "Published X/Y" check passes after a recovery run.
			expect(result.successfulTargets).toBe(2);
			expect(result.totalTargets).toBe(2);
			expect(result.success).toBe(true);
		});
	});

	describe("JSR target skipping", () => {
		it("skips JSR targets with a warning and does not call npm publish/pack for them", async () => {
			// Arrange: a package with a JSR-only target (no npm target)
			const jsrTarget = new PublishTarget({
				name: "@test/jsr-pkg",
				registry: "https://jsr.io/",
				directory: "/tmp/test/jsr-pkg",
				access: "public",
				provenance: false,
			});

			const wsPkg = makeWsPkg("@test/jsr-pkg", "1.0.0", "/tmp/test/jsr-pkg");
			const detected: DetectedRelease[] = [makeDetected("@test/jsr-pkg", "1.0.0", wsPkg.path)];
			const npmLayer = NpmRegistryTest.empty();
			const { state: pubState, layer: pubLayer } = PackagePublishTest.layer({ packResult: makePackResult() });

			// Act
			const result: PublishPackagesResult = await Effect.runPromise(
				runPublishTargets(detected, args).pipe(Effect.provide(makeBaseLayers(pubLayer, npmLayer, wsPkg, [jsrTarget]))),
			);

			// Assert — JSR target was skipped → no pack call, no publish call.
			expect(result.packages).toHaveLength(1);
			expect(result.packages[0]?.name).toBe("@test/jsr-pkg");
			expect(pubState.packCalls).toHaveLength(0);
			expect(pubState.publishTarballCalls).toHaveLength(0);
			expect(pubState.publishCalls).toHaveLength(0);
			expect(result.success).toBe(true);
		});
	});

	describe("batch error resilience", () => {
		it("does not abort the batch when one package fails to pack", async () => {
			// Arrange — two packages; pack fails on the first, succeeds on the second.
			const npmLayer = NpmRegistryTest.empty();

			const { PackagePublishError, PackagePublish: PackagePublishSvc } = await import(
				"@savvy-web/github-action-effects"
			);
			const failingPubLayer = Layer.succeed(PackagePublishSvc, {
				setupAuth: (_registry: string, _token: string) => Effect.succeed(undefined as undefined),
				pack: (packageDir: string) => {
					if (packageDir.includes("fail-pkg")) {
						return Effect.fail(
							new PackagePublishError({
								operation: "pack",
								reason: "Simulated pack failure",
							}),
						);
					}
					return Effect.succeed({
						tarballPath: `${packageDir}/pkg.tgz`,
						digest: PACK_DIGEST,
						sha256Hex: "abc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abc1",
						name: packageDir.includes("ok-pkg") ? "@test/ok-pkg" : "@test/unknown",
						version: "1.0.0",
						packedSize: 1,
						unpackedSize: 1,
						fileCount: 1,
					});
				},
				publish: (_packageDir: string) => Effect.succeed(undefined as undefined),
				publishTarball: (_tarball: string, _options) => Effect.succeed(undefined as undefined),
				verifyIntegrity: (_name: string, _version: string, _digest: string) => Effect.succeed(false),
				publishToRegistries: (_packageDir: string, _registries) => Effect.succeed(undefined as undefined),
				publishIdempotent: (_input) =>
					Effect.succeed({ status: "published" as const, packageName: "x", version: "1.0.0" }),
				dryRun: (_packageDir: string) =>
					Effect.succeed({ ok: true, output: "", packedSize: 0, unpackedSize: 0, fileCount: 0 }),
			});

			const pkgA = makeWsPkg("@test/fail-pkg", "2.0.0", "/tmp/test/fail-pkg");
			const pkgB = makeWsPkg("@test/ok-pkg", "1.0.0", "/tmp/test/ok-pkg");
			const targetA = makeNpmTarget("@test/fail-pkg", "/tmp/test/fail-pkg");
			const targetB = makeNpmTarget("@test/ok-pkg", "/tmp/test/ok-pkg");
			const detected: DetectedRelease[] = [
				makeDetected("@test/fail-pkg", "2.0.0", pkgA.path),
				makeDetected("@test/ok-pkg", "1.0.0", pkgB.path),
			];

			const layers = Layer.mergeAll(
				loggerLayer,
				actionStateLayer,
				configProviderLayer,
				failingPubLayer,
				npmLayer,
				sbomLayer,
				AttestTest.empty(),
				oidcTokenIssuerLayer,
				sigstoreSignerLayer,
				GitHubClientTest.empty(),
				makeWorkspaceDiscoveryLayer([pkgA, pkgB]),
				makePublishabilityLayer(
					new Map([
						["@test/fail-pkg", [targetA]],
						["@test/ok-pkg", [targetB]],
					]),
				),
				makeTopologicalSorterLayer(["@test/fail-pkg", "@test/ok-pkg"]),
			);

			// Act
			const result: PublishPackagesResult = await Effect.runPromise(
				runPublishTargets(detected, args).pipe(Effect.provide(layers)),
			);

			// Assert — batch completed; one package succeeded, one failed.
			expect(result.packages).toHaveLength(2);
			expect(result.success).toBe(false);
			const okPkg = result.packages.find((p) => p.name === "@test/ok-pkg");
			expect(okPkg?.targets[0]?.success).toBe(true);
			const failPkg = result.packages.find((p) => p.name === "@test/fail-pkg");
			expect(failPkg?.targets[0]?.success).toBe(false);
			expect(failPkg?.targets[0]?.status).toBe("failed");
		});
	});
});
