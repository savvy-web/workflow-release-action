/**
 * Unit tests for runPublish (Phase-3 orchestrator).
 *
 * All dependencies are provided via in-memory test layers; no real filesystem
 * (except temp files for detection tests), registry, git, GitHub API, or
 * attestation tooling is exercised.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	ActionLoggerTest,
	ActionStateTest,
	AttestTest,
	CommandRunnerTest,
	GitHubClientTest,
	NpmRegistryTest,
	OidcTokenIssuerTest,
	PackagePublishTest,
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

import type { PublishInputArgs } from "./publish.js";
import { runPublish } from "./publish.js";
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
 * Build a `GitHubClientTest` layer that simulates `detectFromPR` responses.
 *
 * `GitHubClientTest` looks up `restResponses` by **operation name only**
 * (e.g. `"pulls.listFiles"`), so we register one response per operation.
 *
 * The test also writes real `package.json` files to a temp directory under
 * `cwd` so `detectFromPR`'s `readFileSync` calls find current content.
 *
 * Returns both the layer and the temp `cwd` path so callers can change
 * directory before running the effect.
 */
const makeGitHubClientLayerForPR = (
	prNumber: number,
	packages: Array<{ name: string; newVersion: string; oldVersion: string; filename: string }>,
): {
	layer: Layer.Layer<import("@savvy-web/github-action-effects/testing").GitHubClient>;
	tmpCwd: string;
} => {
	// Create a temp directory structure that mirrors the repo on disk
	const tmpCwd = join(tmpdir(), `silk-publish-test-${prNumber}-${Date.now()}`);
	mkdirSync(tmpCwd, { recursive: true });

	// Write the "current" package.json files to disk so readFileSync can find them
	const files = packages.map((pkg) => {
		const dir = join(tmpCwd, ...pkg.filename.split("/").slice(0, -1));
		mkdirSync(dir, { recursive: true });
		const fullPath = join(tmpCwd, pkg.filename);
		writeFileSync(fullPath, JSON.stringify({ name: pkg.name, version: pkg.newVersion }));
		return { filename: pkg.filename, status: "modified" };
	});

	// Build base-content map: base64-encoded old package.json content
	// For simplicity, return the first package's old content for "repos.getContent"
	const firstPkg = packages[0];
	const oldContent = firstPkg
		? Buffer.from(JSON.stringify({ name: firstPkg.name, version: firstPkg.oldVersion })).toString("base64")
		: "";

	const state = {
		restResponses: new Map([
			["pulls.listFiles", { data: files }],
			["pulls.get", { data: { base: { sha: "base-sha-abc" } } }],
			["repos.getContent", { data: { content: oldContent } }],
		]),
		graphqlResponses: new Map<string, unknown>(),
		paginateResponses: new Map<string, Array<unknown[]>>(),
		repo: { owner: "test-owner", repo: "test-repo" },
	};

	return {
		layer: GitHubClientTest.layer(state) as never,
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("runPublish", () => {
	describe("detection via GitHubClientTest (detectFromPR)", () => {
		it("detects packages from a merged PR and publishes them", async () => {
			// Arrange: write a real package.json on disk so detectFromPR can read it
			const { layer: ghLayer, tmpCwd } = makeGitHubClientLayerForPR(42, [
				{
					name: "@test/detected-pkg",
					newVersion: "2.0.0",
					oldVersion: "1.0.0",
					filename: "packages/detected-pkg/package.json",
				},
			]);

			const pkg = makeWsPkg("@test/detected-pkg", "2.0.0", join(tmpCwd, "packages/detected-pkg"));
			const target = makeNpmTarget("@test/detected-pkg", join(tmpCwd, "packages/detected-pkg"));

			const npmLayer = NpmRegistryTest.empty(); // no versions → first-publish path

			const { state: pubState, layer: pubLayer } = PackagePublishTest.layer({
				publishedVersions: [],
				integrityMatch: false,
			});

			const attestState = AttestTest.empty();

			const layers = Layer.mergeAll(
				loggerLayer,
				actionStateLayer,
				configProviderLayer,
				CommandRunnerTest.empty(), // build succeeds (default exitCode: 0)
				pubLayer,
				npmLayer,
				sbomLayer,
				attestState,
				oidcTokenIssuerLayer,
				sigstoreSignerLayer,
				ghLayer,
				makeWorkspaceDiscoveryLayer([pkg]),
				makePublishabilityLayer(new Map([["@test/detected-pkg", [target]]])),
				makeTopologicalSorterLayer(["@test/detected-pkg"]),
			);

			const args: PublishInputArgs = {
				packageManager: "pnpm",
				targetBranch: "main",
				dryRun: false,
				mergedReleasePRNumber: 42,
			};

			// Act — change cwd so detectFromPR's readFileSync resolves paths correctly
			const result: PublishPackagesResult = await runInCwd(tmpCwd, () =>
				Effect.runPromise(runPublish(args).pipe(Effect.provide(layers))),
			);

			// Assert: detection found @test/detected-pkg and it was published
			expect(result.totalPackages).toBe(1);
			expect(result.packages).toHaveLength(1);
			expect(result.packages[0]?.name).toBe("@test/detected-pkg");
			expect(result.packages[0]?.version).toBe("2.0.0");
			// First-publish path: pack + publish called, not publishIdempotent
			expect(pubState.packCalls).toHaveLength(1);
			expect(pubState.publishCalls).toHaveLength(1);
			expect(pubState.publishIdempotentCalls).toHaveLength(0);
		});
	});

	describe("build step", () => {
		it("returns buildError and does not publish when ci:build fails", async () => {
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

			const ghLayer = GitHubClientTest.empty();
			const npmLayer = NpmRegistryTest.empty();
			const { layer: pubLayer } = PackagePublishTest.layer({
				publishedVersions: [],
				integrityMatch: false,
			});
			const attestState = AttestTest.empty();

			const pkg = makeWsPkg("@test/build-fail", "1.0.0");
			const target = makeNpmTarget("@test/build-fail", "/tmp/dist/build-fail");

			const layers = Layer.mergeAll(
				loggerLayer,
				actionStateLayer,
				configProviderLayer,
				failingBuildLayer,
				pubLayer,
				npmLayer,
				sbomLayer,
				attestState,
				oidcTokenIssuerLayer,
				sigstoreSignerLayer,
				ghLayer,
				makeWorkspaceDiscoveryLayer([pkg]),
				makePublishabilityLayer(new Map([["@test/build-fail", [target]]])),
				makeTopologicalSorterLayer(["@test/build-fail"]),
			);

			const args: PublishInputArgs = {
				packageManager: "pnpm",
				targetBranch: "main",
				dryRun: false,
				mergedReleasePRNumber: undefined,
			};

			// Act
			const result: PublishPackagesResult = await Effect.runPromise(runPublish(args).pipe(Effect.provide(layers)));

			// Assert: build failed → no packages published
			expect(result.success).toBe(false);
			expect(result.packages).toHaveLength(0);
			expect(result.buildError).toMatch(/Build failed/);
		});
	});

	describe("first-publish path (version absent from registry)", () => {
		it("publishes and returns status: 'published' when version is not on the registry", async () => {
			// Arrange: NpmRegistry returns empty versions (package never published)
			// Note: the workspace package and target are built below against the temp cwd.
			const npmState = { packages: new Map() }; // No versions → getVersions fails with E404
			const npmLayer = NpmRegistryTest.layer(npmState);

			// PackagePublish: pack succeeds, publish succeeds; no versions published yet
			const { state: pubState, layer: pubLayer } = PackagePublishTest.layer({
				publishedVersions: [], // version not in registry → first-publish path
				integrityMatch: false, // irrelevant for first publish
			});

			const attestState = AttestTest.empty();

			// GitHubClientTest with no responses → detectFromPR will fail and return []
			// We inject detection indirectly: since mergedReleasePRNumber is undefined,
			// detectFromCommit() runs, but GITHUB_SHA is not set → returns [] immediately.
			// However we still need packages — use a GitHubClientTest that returns a
			// PR file list, and set mergedReleasePRNumber so detectFromPR is called.
			//
			// For this test we want to exercise the publish path without caring about
			// detection details — use a PR number and a GitHubClientTest that simulates
			// a single file diff so detection resolves the package.
			const tmpCwd = join(tmpdir(), `silk-publish-first-${Date.now()}`);
			mkdirSync(join(tmpCwd, "packages", "first"), { recursive: true });
			writeFileSync(
				join(tmpCwd, "packages", "first", "package.json"),
				JSON.stringify({ name: "@test/first", version: "1.0.0" }),
			);

			const ghState = {
				restResponses: new Map([
					["pulls.listFiles", { data: [{ filename: "packages/first/package.json", status: "modified" }] }],
					["pulls.get", { data: { base: { sha: "base-sha-001" } } }],
					[
						"repos.getContent",
						{
							data: {
								content: Buffer.from(JSON.stringify({ name: "@test/first", version: "0.9.0" })).toString("base64"),
							},
						},
					],
				]),
				graphqlResponses: new Map<string, unknown>(),
				paginateResponses: new Map<string, Array<unknown[]>>(),
				repo: { owner: "test-owner", repo: "test-repo" },
			};
			const ghLayer = GitHubClientTest.layer(ghState);

			const wsPkg = makeWsPkg("@test/first", "1.0.0", join(tmpCwd, "packages", "first"));
			const target = makeNpmTarget("@test/first", join(tmpCwd, "packages", "first"));

			const layers = Layer.mergeAll(
				loggerLayer,
				actionStateLayer,
				configProviderLayer,
				CommandRunnerTest.empty(),
				pubLayer,
				npmLayer,
				sbomLayer,
				attestState,
				oidcTokenIssuerLayer,
				sigstoreSignerLayer,
				ghLayer,
				makeWorkspaceDiscoveryLayer([wsPkg]),
				makePublishabilityLayer(new Map([["@test/first", [target]]])),
				makeTopologicalSorterLayer(["@test/first"]),
			);

			const args: PublishInputArgs = {
				packageManager: "pnpm",
				targetBranch: "main",
				dryRun: false,
				mergedReleasePRNumber: 99,
			};

			// Act
			const result: PublishPackagesResult = await runInCwd(tmpCwd, () =>
				Effect.runPromise(runPublish(args).pipe(Effect.provide(layers))),
			);

			// Assert
			expect(result.success).toBe(true);
			expect(result.packages).toHaveLength(1);
			expect(result.totalPackages).toBe(1);
			expect(result.successfulPackages).toBe(1);

			// The first-publish path calls pack then publish (not publishIdempotent)
			expect(pubState.packCalls).toHaveLength(1);
			expect(pubState.publishCalls).toHaveLength(1);
			// publishIdempotent should NOT have been called
			expect(pubState.publishIdempotentCalls).toHaveLength(0);

			const pkg0 = result.packages[0];
			expect(pkg0?.name).toBe("@test/first");
			expect(pkg0?.version).toBe("1.0.0");
			expect(pkg0?.targets).toHaveLength(1);
			expect(pkg0?.targets[0]?.success).toBe(true);
			expect(pkg0?.targets[0]?.alreadyPublished).toBeFalsy();
		});
	});

	describe("already-published-identical path", () => {
		it("returns status: 'skipped' with skipReason: 'already-published-identical' when version exists with identical content", async () => {
			// Arrange: version 1.0.0 is already in the registry with matching integrity
			const npmState = {
				packages: new Map([
					[
						"@test/idempotent",
						{
							versions: ["1.0.0"],
							latest: "1.0.0",
							distTags: { latest: "1.0.0" },
						},
					],
				]),
			};
			const npmLayer = NpmRegistryTest.layer(npmState);

			// PackagePublish: 1.0.0 is already published with identical content
			const { state: pubState, layer: pubLayer } = PackagePublishTest.layer({
				publishedVersions: ["1.0.0"],
				integrityMatch: true, // identical content → skip
			});

			const attestState = AttestTest.empty();

			// Detection: set up a PR that bumped @test/idempotent from 0.9.0 → 1.0.0
			const tmpCwd = join(tmpdir(), `silk-publish-idempotent-${Date.now()}`);
			mkdirSync(join(tmpCwd, "packages", "idempotent"), { recursive: true });
			writeFileSync(
				join(tmpCwd, "packages", "idempotent", "package.json"),
				JSON.stringify({ name: "@test/idempotent", version: "1.0.0" }),
			);

			const ghState = {
				restResponses: new Map([
					["pulls.listFiles", { data: [{ filename: "packages/idempotent/package.json", status: "modified" }] }],
					["pulls.get", { data: { base: { sha: "base-sha-002" } } }],
					[
						"repos.getContent",
						{
							data: {
								content: Buffer.from(JSON.stringify({ name: "@test/idempotent", version: "0.9.0" })).toString("base64"),
							},
						},
					],
				]),
				graphqlResponses: new Map<string, unknown>(),
				paginateResponses: new Map<string, Array<unknown[]>>(),
				repo: { owner: "test-owner", repo: "test-repo" },
			};
			const ghLayer = GitHubClientTest.layer(ghState);

			const wsPkg = makeWsPkg("@test/idempotent", "1.0.0", join(tmpCwd, "packages", "idempotent"));
			const target = makeNpmTarget("@test/idempotent", join(tmpCwd, "packages", "idempotent"));

			const layers = Layer.mergeAll(
				loggerLayer,
				actionStateLayer,
				configProviderLayer,
				CommandRunnerTest.empty(),
				pubLayer,
				npmLayer,
				sbomLayer,
				attestState,
				oidcTokenIssuerLayer,
				sigstoreSignerLayer,
				ghLayer,
				makeWorkspaceDiscoveryLayer([wsPkg]),
				makePublishabilityLayer(new Map([["@test/idempotent", [target]]])),
				makeTopologicalSorterLayer(["@test/idempotent"]),
			);

			const args: PublishInputArgs = {
				packageManager: "pnpm",
				targetBranch: "main",
				dryRun: false,
				mergedReleasePRNumber: 100,
			};

			// Act
			const result: PublishPackagesResult = await runInCwd(tmpCwd, () =>
				Effect.runPromise(runPublish(args).pipe(Effect.provide(layers))),
			);

			// Assert
			expect(result.success).toBe(true);
			expect(result.packages).toHaveLength(1);
			expect(result.packages[0]?.targets).toHaveLength(1);
			expect(result.packages[0]?.targets[0]?.success).toBe(true);
			expect(result.packages[0]?.targets[0]?.alreadyPublished).toBe(true);
			expect(result.packages[0]?.targets[0]?.alreadyPublishedReason).toBe("identical");

			// publishIdempotent was called (existing package path)
			expect(pubState.publishIdempotentCalls).toHaveLength(1);
			// publish (first-publish path) was NOT called
			expect(pubState.publishCalls).toHaveLength(0);
		});
	});

	describe("JSR target skipping", () => {
		it("skips JSR targets with a warning and does not call npm publish for them", async () => {
			// Arrange: a package with a JSR target
			const tmpCwd = join(tmpdir(), `silk-publish-jsr-${Date.now()}`);
			mkdirSync(join(tmpCwd, "packages", "jsr-pkg"), { recursive: true });
			writeFileSync(
				join(tmpCwd, "packages", "jsr-pkg", "package.json"),
				JSON.stringify({ name: "@test/jsr-pkg", version: "1.0.0" }),
			);

			const ghState = {
				restResponses: new Map([
					["pulls.listFiles", { data: [{ filename: "packages/jsr-pkg/package.json", status: "modified" }] }],
					["pulls.get", { data: { base: { sha: "base-sha-003" } } }],
					[
						"repos.getContent",
						{
							data: {
								content: Buffer.from(JSON.stringify({ name: "@test/jsr-pkg", version: "0.5.0" })).toString("base64"),
							},
						},
					],
				]),
				graphqlResponses: new Map<string, unknown>(),
				paginateResponses: new Map<string, Array<unknown[]>>(),
				repo: { owner: "test-owner", repo: "test-repo" },
			};
			const ghLayer = GitHubClientTest.layer(ghState);

			// A JSR-only target (no npm target)
			const jsrTarget = new PublishTarget({
				name: "@test/jsr-pkg",
				registry: "https://jsr.io/",
				directory: join(tmpCwd, "packages", "jsr-pkg"),
				access: "public",
				provenance: false,
			});

			const wsPkg = makeWsPkg("@test/jsr-pkg", "1.0.0", join(tmpCwd, "packages", "jsr-pkg"));
			const npmLayer = NpmRegistryTest.empty();
			const { state: pubState, layer: pubLayer } = PackagePublishTest.layer({
				publishedVersions: [],
				integrityMatch: false,
			});
			const attestState = AttestTest.empty();

			const layers = Layer.mergeAll(
				loggerLayer,
				actionStateLayer,
				configProviderLayer,
				CommandRunnerTest.empty(),
				pubLayer,
				npmLayer,
				sbomLayer,
				attestState,
				oidcTokenIssuerLayer,
				sigstoreSignerLayer,
				ghLayer,
				makeWorkspaceDiscoveryLayer([wsPkg]),
				makePublishabilityLayer(new Map([["@test/jsr-pkg", [jsrTarget]]])),
				makeTopologicalSorterLayer(["@test/jsr-pkg"]),
			);

			const args: PublishInputArgs = {
				packageManager: "pnpm",
				targetBranch: "main",
				dryRun: false,
				mergedReleasePRNumber: 101,
			};

			// Act
			const result: PublishPackagesResult = await runInCwd(tmpCwd, () =>
				Effect.runPromise(runPublish(args).pipe(Effect.provide(layers))),
			);

			// Assert: package was detected but JSR target was skipped → 0 npm targets
			// The package has no npm targets so it counts as a version-only publish
			expect(result.packages).toHaveLength(1);
			expect(result.packages[0]?.name).toBe("@test/jsr-pkg");
			// No npm pack/publish calls made
			expect(pubState.packCalls).toHaveLength(0);
			expect(pubState.publishCalls).toHaveLength(0);
			// success is true (version-only packages count as successful)
			expect(result.success).toBe(true);
		});
	});

	describe("batch error resilience", () => {
		it("does not abort the batch when one package fails to publish", async () => {
			// Arrange: two packages — the first fails to pack, the second succeeds.
			// Both packages are detected by injecting a PR that modified their package.jsons.
			const tmpCwd = join(tmpdir(), `silk-publish-batch-${Date.now()}`);
			mkdirSync(join(tmpCwd, "packages", "fail-pkg"), { recursive: true });
			mkdirSync(join(tmpCwd, "packages", "ok-pkg"), { recursive: true });
			writeFileSync(
				join(tmpCwd, "packages", "fail-pkg", "package.json"),
				JSON.stringify({ name: "@test/fail-pkg", version: "2.0.0" }),
			);
			writeFileSync(
				join(tmpCwd, "packages", "ok-pkg", "package.json"),
				JSON.stringify({ name: "@test/ok-pkg", version: "1.0.0" }),
			);

			// GitHubClientTest: listFiles returns both package.json files.
			// "repos.getContent" returns a single response — for simplicity, both
			// packages will share the same base content (different versions).
			// We register "repos.getContent" twice — but the test layer only stores
			// one response per key, so we use the first package's old content.
			// Since the new version differs from the old, detection will include both.
			const ghState = {
				restResponses: new Map([
					[
						"pulls.listFiles",
						{
							data: [
								{ filename: "packages/fail-pkg/package.json", status: "modified" },
								{ filename: "packages/ok-pkg/package.json", status: "modified" },
							],
						},
					],
					["pulls.get", { data: { base: { sha: "base-sha-004" } } }],
					// Single "repos.getContent" response → used for both packages.
					// old version "0.5.0" differs from new versions "2.0.0" / "1.0.0" → both detected.
					[
						"repos.getContent",
						{
							data: {
								content: Buffer.from(JSON.stringify({ version: "0.5.0" })).toString("base64"),
							},
						},
					],
				]),
				graphqlResponses: new Map<string, unknown>(),
				paginateResponses: new Map<string, Array<unknown[]>>(),
				repo: { owner: "test-owner", repo: "test-repo" },
			};
			const ghLayer = GitHubClientTest.layer(ghState);

			// Empty NpmRegistry — both packages are new (no versions)
			const npmLayer = NpmRegistryTest.empty();

			// Custom PackagePublish layer that causes the first package to fail at pack
			const { PackagePublishError } = await import("@savvy-web/github-action-effects");
			const failingPubLayer = Layer.succeed((await import("@savvy-web/github-action-effects")).PackagePublish, {
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
					return Effect.succeed({ tarball: `${packageDir}/pkg.tgz`, digest: "sha256:abc123" });
				},
				publish: (_packageDir: string) => Effect.succeed(undefined as undefined),
				verifyIntegrity: (_name: string, _version: string, _digest: string) => Effect.succeed(false),
				publishToRegistries: (_packageDir: string, _registries: unknown[]) => Effect.succeed(undefined as undefined),
				publishIdempotent: (_input: unknown) =>
					Effect.succeed({ status: "published" as const, packageName: "x", version: "1.0.0" }),
				dryRun: (_packageDir: string) =>
					Effect.succeed({ ok: true, output: "", packedSize: 0, unpackedSize: 0, fileCount: 0 }),
			});

			const attestState = AttestTest.empty();

			const pkgA = makeWsPkg("@test/fail-pkg", "2.0.0", join(tmpCwd, "packages", "fail-pkg"));
			const pkgB = makeWsPkg("@test/ok-pkg", "1.0.0", join(tmpCwd, "packages", "ok-pkg"));
			const targetA = makeNpmTarget("@test/fail-pkg", join(tmpCwd, "packages", "fail-pkg"));
			const targetB = makeNpmTarget("@test/ok-pkg", join(tmpCwd, "packages", "ok-pkg"));

			const layers = Layer.mergeAll(
				loggerLayer,
				actionStateLayer,
				configProviderLayer,
				CommandRunnerTest.empty(),
				failingPubLayer,
				npmLayer,
				sbomLayer,
				attestState,
				oidcTokenIssuerLayer,
				sigstoreSignerLayer,
				ghLayer,
				makeWorkspaceDiscoveryLayer([pkgA, pkgB]),
				makePublishabilityLayer(
					new Map([
						["@test/fail-pkg", [targetA]],
						["@test/ok-pkg", [targetB]],
					]),
				),
				makeTopologicalSorterLayer(["@test/fail-pkg", "@test/ok-pkg"]),
			);

			const args: PublishInputArgs = {
				packageManager: "pnpm",
				targetBranch: "main",
				dryRun: false,
				mergedReleasePRNumber: 102,
			};

			// Act
			const result: PublishPackagesResult = await runInCwd(tmpCwd, () =>
				Effect.runPromise(runPublish(args).pipe(Effect.provide(layers))),
			);

			// Assert: batch completed (no early abort), result has both packages
			expect(result.packages).toHaveLength(2);
			// success is false because one package failed
			expect(result.success).toBe(false);
			// The ok-pkg succeeded
			const okPkg = result.packages.find((p) => p.name === "@test/ok-pkg");
			expect(okPkg).toBeDefined();
			expect(okPkg?.targets[0]?.success).toBe(true);
			// The fail-pkg failed
			const failPkg = result.packages.find((p) => p.name === "@test/fail-pkg");
			expect(failPkg).toBeDefined();
			expect(failPkg?.targets[0]?.success).toBe(false);
		});
	});
});
