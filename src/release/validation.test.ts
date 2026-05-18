/**
 * Unit tests for runValidation (Phase-2 orchestrator).
 *
 * Provides in-memory test layers for all dependencies so no real
 * filesystem, registry, or SBOM tooling is exercised.
 */

import {
	ActionLoggerTest,
	AttestTest,
	ChangesetAnalyzerTest,
	CommandRunnerTest,
	NpmRegistryTest,
	PackagePublish,
	PackagePublishError,
	PackagePublishTest,
	SbomTest,
} from "@savvy-web/github-action-effects/testing";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { PublishTarget, PublishabilityDetector, WorkspaceDiscovery, WorkspacePackage } from "workspaces-effect";

import { runValidation } from "./validation.js";

// ─── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Build a minimal WorkspacePackage for tests.
 */
const makeWsPkg = (name: string, version = "1.0.0", isPrivate = false): WorkspacePackage =>
	new WorkspacePackage({
		name,
		version,
		path: `/tmp/test-workspace/${name}`,
		packageJsonPath: `/tmp/test-workspace/${name}/package.json`,
		relativePath: name,
		private: isPrivate,
	});

/**
 * Build a minimal PublishTarget for tests.
 */
const makeNpmTarget = (name: string, directory = "."): PublishTarget =>
	new PublishTarget({
		name,
		registry: "https://registry.npmjs.org/",
		directory,
		access: "public",
	});

/**
 * Create a WorkspaceDiscovery test layer that returns the given packages.
 */
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

/**
 * Create a PublishabilityDetector test layer that returns the given targets per package.
 */
const makePublishabilityLayer = (targetsByName: Map<string, PublishTarget[]>): Layer.Layer<PublishabilityDetector> =>
	Layer.succeed(PublishabilityDetector, {
		detect: (pkg: WorkspacePackage, _root: string) =>
			Effect.succeed((targetsByName.get(pkg.name) ?? []) as ReadonlyArray<PublishTarget>),
	});

// ─── Shared base layers ───────────────────────────────────────────────────────

const loggerState = ActionLoggerTest.empty();
const loggerLayer = ActionLoggerTest.layer(loggerState);
const commandRunnerLayer = CommandRunnerTest.empty();
const { layer: packagePublishLayer } = PackagePublishTest.empty();
const npmRegistryLayer = NpmRegistryTest.empty();
const sbomLayer = SbomTest.empty();
const attestLayer = AttestTest.empty();

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("runValidation", () => {
	describe("no packages to validate (no changesets)", () => {
		it("returns publishOk: true and empty packages when there are no changesets", async () => {
			// Arrange
			const pkg = makeWsPkg("@test/alpha");

			const changesetLayer = ChangesetAnalyzerTest.layer({
				changesets: [],
				generated: [],
			});

			const workspaceLayer = makeWorkspaceDiscoveryLayer([pkg]);
			const publishabilityLayer = makePublishabilityLayer(new Map());

			const layers = Layer.mergeAll(
				loggerLayer,
				commandRunnerLayer,
				packagePublishLayer,
				npmRegistryLayer,
				sbomLayer,
				attestLayer,
				changesetLayer,
				workspaceLayer,
				publishabilityLayer,
			);

			// Act
			const report = await Effect.runPromise(
				runValidation({ packageManager: "pnpm", targetBranch: "main", dryRun: false }).pipe(Effect.provide(layers)),
			);

			// Assert
			expect(report.publishOk).toBe(true);
			expect(report.npmReady).toBe(true);
			expect(report.githubPackagesReady).toBe(true);
			expect(report.totalTargets).toBe(0);
			expect(report.readyTargets).toBe(0);
			expect(report.packages).toHaveLength(0);
			expect(report.publishSummary).toBeTruthy();
			expect(report.sbomOk).toBe(true);
		});
	});

	describe("one publishable package with a changeset", () => {
		it("reports publishOk: true and the package present in packages", async () => {
			// Arrange
			const pkg = makeWsPkg("@test/alpha", "1.1.0");
			const target = makeNpmTarget("@test/alpha", "/tmp/test-workspace/@test/alpha/dist");

			const changesetLayer = ChangesetAnalyzerTest.layer({
				changesets: [{ id: "cs-001", packages: [{ name: "@test/alpha", bump: "minor" }], summary: "feat: new thing" }],
				generated: [],
			});

			const workspaceLayer = makeWorkspaceDiscoveryLayer([pkg]);
			const publishabilityLayer = makePublishabilityLayer(new Map([["@test/alpha", [target]]]));

			// PackagePublishTest.empty() returns a state where pack succeeds by default
			const { state: pubState, layer: pubLayer } = PackagePublishTest.empty();

			const layers = Layer.mergeAll(
				loggerLayer,
				commandRunnerLayer,
				pubLayer,
				npmRegistryLayer,
				sbomLayer,
				attestLayer,
				changesetLayer,
				workspaceLayer,
				publishabilityLayer,
			);

			// Act
			const report = await Effect.runPromise(
				runValidation({ packageManager: "pnpm", targetBranch: "main", dryRun: false }).pipe(Effect.provide(layers)),
			);

			// Assert
			expect(report.publishOk).toBe(true);
			expect(report.totalTargets).toBe(1);
			expect(report.readyTargets).toBe(1);
			expect(report.packages).toHaveLength(1);
			expect(report.packages[0]?.name).toBe("@test/alpha");
			expect(report.packages[0]?.version).toBe("1.1.0");
			expect(report.packages[0]?.ready).toBe(true);
			expect(report.publishSummary.length).toBeGreaterThan(0);
			// pack was called
			expect(pubState.packCalls).toHaveLength(1);
		});
	});

	describe("pack failure → publishOk: false", () => {
		it("reports publishOk: false when pack fails", async () => {
			// Arrange
			const pkg = makeWsPkg("@test/beta", "2.0.0");
			const target = makeNpmTarget("@test/beta", "/tmp/test-workspace/@test/beta/dist");

			const changesetLayer = ChangesetAnalyzerTest.layer({
				changesets: [{ id: "cs-002", packages: [{ name: "@test/beta", bump: "major" }], summary: "feat!: breaking" }],
				generated: [],
			});

			const workspaceLayer = makeWorkspaceDiscoveryLayer([pkg]);
			const publishabilityLayer = makePublishabilityLayer(new Map([["@test/beta", [target]]]));

			// Override pack to fail by providing a publish layer that always fails pack
			const failingPublishLayer = Layer.succeed(PackagePublish, {
				setupAuth: () => Effect.void,
				pack: () =>
					Effect.fail(
						new PackagePublishError({
							operation: "pack",
							reason: "tarball creation failed",
						}),
					),
				publish: () => Effect.void,
				verifyIntegrity: () => Effect.succeed(true),
				publishToRegistries: () => Effect.void,
				publishIdempotent: () => Effect.succeed({ skipped: false, alreadyPublished: false } as never),
			});

			const layers = Layer.mergeAll(
				loggerLayer,
				commandRunnerLayer,
				failingPublishLayer,
				npmRegistryLayer,
				sbomLayer,
				attestLayer,
				changesetLayer,
				workspaceLayer,
				publishabilityLayer,
			);

			// Act
			const report = await Effect.runPromise(
				runValidation({ packageManager: "pnpm", targetBranch: "main", dryRun: false }).pipe(Effect.provide(layers)),
			);

			// Assert
			expect(report.publishOk).toBe(false);
			expect(report.npmReady).toBe(false);
			expect(report.readyTargets).toBe(0);
			expect(report.packages[0]?.ready).toBe(false);
		});
	});

	describe("version-only package (no targets)", () => {
		it("reports hasVersionOnlyPackages: true when package has changesets but no publish targets", async () => {
			// Arrange
			const pkg = makeWsPkg("@test/internal", "0.5.0", true);

			const changesetLayer = ChangesetAnalyzerTest.layer({
				changesets: [{ id: "cs-003", packages: [{ name: "@test/internal", bump: "patch" }], summary: "fix: bug" }],
				generated: [],
			});

			const workspaceLayer = makeWorkspaceDiscoveryLayer([pkg]);
			// No publish targets for this package
			const publishabilityLayer = makePublishabilityLayer(new Map());

			const layers = Layer.mergeAll(
				loggerLayer,
				commandRunnerLayer,
				packagePublishLayer,
				npmRegistryLayer,
				sbomLayer,
				attestLayer,
				changesetLayer,
				workspaceLayer,
				publishabilityLayer,
			);

			// Act
			const report = await Effect.runPromise(
				runValidation({ packageManager: "pnpm", targetBranch: "main", dryRun: false }).pipe(Effect.provide(layers)),
			);

			// Assert
			expect(report.publishOk).toBe(true);
			expect(report.totalTargets).toBe(0);
			expect(report.hasVersionOnlyPackages).toBe(true);
			expect(report.packages).toHaveLength(1);
			expect(report.packages[0]?.ready).toBe(true); // version-only is still "ready"
		});
	});

	describe("dry-run mode flag", () => {
		it("passes dryRun flag through to publish summary", async () => {
			// Arrange
			const changesetLayer = ChangesetAnalyzerTest.layer({
				changesets: [],
				generated: [],
			});

			const workspaceLayer = makeWorkspaceDiscoveryLayer([]);
			const publishabilityLayer = makePublishabilityLayer(new Map());

			const layers = Layer.mergeAll(
				loggerLayer,
				commandRunnerLayer,
				packagePublishLayer,
				npmRegistryLayer,
				sbomLayer,
				attestLayer,
				changesetLayer,
				workspaceLayer,
				publishabilityLayer,
			);

			// Act
			const report = await Effect.runPromise(
				runValidation({ packageManager: "pnpm", targetBranch: "main", dryRun: true }).pipe(Effect.provide(layers)),
			);

			// Assert: dry-run label appears in the summary
			expect(report.publishSummary).toContain("Dry Run");
		});
	});
});
