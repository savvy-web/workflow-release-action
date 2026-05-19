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
import type { GitHubClient } from "@savvy-web/github-action-effects/testing";
import {
	ActionLoggerTest,
	ActionStateTest,
	AttestTest,
	GitHubClientTest,
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
 * - `GitHubClientTest` seeds `repos.getContent` (still a raw call — B7).
 *
 * The helper also writes real `package.json` files to a temp directory so
 * `detectFromPR`'s `readFileSync` calls resolve correctly.
 *
 * Returns both the combined layer and the temp `cwd` path.
 */
const makeGitHubClientLayerForPR = (
	prNumber: number,
	packages: Array<{ name: string; newVersion: string; oldVersion: string; filename: string }>,
): {
	layer: Layer.Layer<GitHubClient | import("@savvy-web/github-action-effects").PullRequest>;
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
		baseSha: "base-sha-abc",
		labels: [],
		reviewers: [],
		teamReviewers: [],
		autoMerge: undefined,
		body: null,
	});

	// GitHubClientTest still handles repos.getContent (B7 — not yet rewired)
	const clientState = {
		restResponses: new Map([["repos.getContent", { data: { content: oldContent } }]]),
		graphqlResponses: new Map<string, unknown>(),
		paginateResponses: new Map<string, Array<unknown[]>>(),
		repo: { owner: "test-owner", repo: "test-repo" },
	};

	return {
		layer: Layer.merge(GitHubClientTest.layer(clientState), PullRequestTest.layer(prState)) as never,
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

describe("detectReleases", () => {
	describe("detection via GitHubClientTest (detectFromPR)", () => {
		it("detects packages from a merged PR", async () => {
			// Arrange: write a real package.json on disk so detectFromPR can read it
			const { layer: ghLayer, tmpCwd } = makeGitHubClientLayerForPR(42, [
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

			const layers = Layer.mergeAll(loggerLayer, failingBuildLayer, sbomLayer, makeWorkspaceDiscoveryLayer([pkg]));

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
			const buildLayer = await passingBuildLayer();

			const pkgA = makeWsPkg("@test/sbom-a", "1.0.0");
			const pkgB = makeWsPkg("@test/sbom-b", "2.0.0");
			const detected: DetectedRelease[] = [
				makeDetected("@test/sbom-a", "1.0.0", pkgA.path),
				makeDetected("@test/sbom-b", "2.0.0", pkgB.path),
			];

			const layers = Layer.mergeAll(loggerLayer, buildLayer, SbomLive, makeWorkspaceDiscoveryLayer([pkgA, pkgB]));

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
	describe("first-publish path (version absent from registry)", () => {
		it("publishes and returns status: 'published' when version is not on the registry", async () => {
			// Arrange: NpmRegistry returns empty versions (package never published)
			const npmState = { packages: new Map() }; // No versions → getVersions fails with E404
			const npmLayer = NpmRegistryTest.layer(npmState);

			// PackagePublish: pack succeeds, publish succeeds; no versions published yet
			const { state: pubState, layer: pubLayer } = PackagePublishTest.layer({
				publishedVersions: [], // version not in registry → first-publish path
				integrityMatch: false, // irrelevant for first publish
			});

			const attestState = AttestTest.empty();

			const wsPkg = makeWsPkg("@test/first", "1.0.0", "/tmp/test/first");
			const target = makeNpmTarget("@test/first", "/tmp/test/first");
			const detected: DetectedRelease[] = [makeDetected("@test/first", "1.0.0", wsPkg.path)];

			const layers = Layer.mergeAll(
				loggerLayer,
				actionStateLayer,
				configProviderLayer,
				pubLayer,
				npmLayer,
				sbomLayer,
				attestState,
				oidcTokenIssuerLayer,
				sigstoreSignerLayer,
				// `Attest.provenance` / `Attest.sbom` transitively require `GitHubClient`.
				GitHubClientTest.empty(),
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
			const result: PublishPackagesResult = await Effect.runPromise(
				runPublishTargets(detected, args).pipe(Effect.provide(layers)),
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

			const wsPkg = makeWsPkg("@test/idempotent", "1.0.0", "/tmp/test/idempotent");
			const target = makeNpmTarget("@test/idempotent", "/tmp/test/idempotent");
			const detected: DetectedRelease[] = [makeDetected("@test/idempotent", "1.0.0", wsPkg.path)];

			const layers = Layer.mergeAll(
				loggerLayer,
				actionStateLayer,
				configProviderLayer,
				pubLayer,
				npmLayer,
				sbomLayer,
				attestState,
				oidcTokenIssuerLayer,
				sigstoreSignerLayer,
				// `Attest.provenance` / `Attest.sbom` transitively require `GitHubClient`.
				GitHubClientTest.empty(),
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
			const result: PublishPackagesResult = await Effect.runPromise(
				runPublishTargets(detected, args).pipe(Effect.provide(layers)),
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
			const { state: pubState, layer: pubLayer } = PackagePublishTest.layer({
				publishedVersions: [],
				integrityMatch: false,
			});
			const attestState = AttestTest.empty();

			const layers = Layer.mergeAll(
				loggerLayer,
				actionStateLayer,
				configProviderLayer,
				pubLayer,
				npmLayer,
				sbomLayer,
				attestState,
				oidcTokenIssuerLayer,
				sigstoreSignerLayer,
				// `Attest.provenance` / `Attest.sbom` transitively require `GitHubClient`.
				GitHubClientTest.empty(),
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
			const result: PublishPackagesResult = await Effect.runPromise(
				runPublishTargets(detected, args).pipe(Effect.provide(layers)),
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
				attestState,
				oidcTokenIssuerLayer,
				sigstoreSignerLayer,
				// `Attest.provenance` / `Attest.sbom` transitively require `GitHubClient`.
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

			const args: PublishInputArgs = {
				packageManager: "pnpm",
				targetBranch: "main",
				dryRun: false,
				mergedReleasePRNumber: 102,
			};

			// Act
			const result: PublishPackagesResult = await Effect.runPromise(
				runPublishTargets(detected, args).pipe(Effect.provide(layers)),
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
