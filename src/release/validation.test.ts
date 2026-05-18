/**
 * Unit tests for runValidation (Phase-2 orchestrator).
 *
 * All dependencies are provided via in-memory test layers; no real filesystem,
 * registry, git, or SBOM tooling is exercised.
 */

import type { CommandResponse } from "@savvy-web/github-action-effects/testing";
import {
	ActionLoggerTest,
	ActionStateTest,
	AttestTest,
	CommandRunnerTest,
	NpmRegistryTest,
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
 *
 * `relativePath` is used to build the `git show` key.  For example, if
 * `relativePath = "packages/alpha"` then the command runner must respond to
 * `"git show main:packages/alpha/package.json"`.
 */
const makeWsPkg = (name: string, version = "1.0.0", relativePath = name, isPrivate = false): WorkspacePackage =>
	new WorkspacePackage({
		name,
		version,
		path: `/tmp/test-workspace/${name}`,
		packageJsonPath: `/tmp/test-workspace/${name}/package.json`,
		relativePath,
		private: isPrivate,
	});

/**
 * Build a minimal PublishTarget (npm public registry by default).
 */
const makeNpmTarget = (name: string, directory = "."): PublishTarget =>
	new PublishTarget({
		name,
		registry: "https://registry.npmjs.org/",
		directory,
		access: "public",
		provenance: false,
	});

/**
 * Build a minimal GitHub Packages PublishTarget.
 */
const makeGhPkgsTarget = (name: string, directory = "."): PublishTarget =>
	new PublishTarget({
		name,
		registry: "https://npm.pkg.github.com/",
		directory,
		access: "restricted",
		provenance: false,
	});

/**
 * Build a WorkspaceDiscovery test layer returning the given packages.
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
 * Build a PublishabilityDetector test layer returning targets per package name.
 */
const makePublishabilityLayer = (targetsByName: Map<string, PublishTarget[]>): Layer.Layer<PublishabilityDetector> =>
	Layer.succeed(PublishabilityDetector, {
		detect: (pkg: WorkspacePackage, _root: string) =>
			Effect.succeed((targetsByName.get(pkg.name) ?? []) as ReadonlyArray<PublishTarget>),
	});

/**
 * Build a CommandRunner layer pre-configured with git-show responses.
 *
 * The map key format is `"git show <branch>:<relativePath>/package.json"`.
 * Pass `undefined` to use an empty runner (all commands succeed with `""`).
 */
const makeCommandRunnerLayer = (
	responses?: ReadonlyMap<string, CommandResponse>,
): Layer.Layer<import("@savvy-web/github-action-effects/testing").CommandRunner> => {
	if (responses === undefined) return CommandRunnerTest.empty() as never;
	return CommandRunnerTest.layer(responses) as never;
};

// ─── Shared "always-on" base layers ──────────────────────────────────────────

const loggerState = ActionLoggerTest.empty();
const loggerLayer = ActionLoggerTest.layer(loggerState);
const npmRegistryLayer = NpmRegistryTest.empty();
const sbomLayer = SbomTest.empty();
const attestLayer = AttestTest.empty();
// Empty ActionState (no tokens persisted) — tests exercise the "no token" path.
const actionStateLayer = ActionStateTest.layer(ActionStateTest.empty());

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("runValidation", () => {
	describe("released package (version diff succeeds)", () => {
		it("reports publishOk: true and package present in packages when dryRun passes", async () => {
			// Arrange
			const pkg = makeWsPkg("@test/alpha", "1.1.0", "packages/alpha");
			const target = makeNpmTarget("@test/alpha", "/tmp/dist/alpha");

			// git show main:packages/alpha/package.json → version 1.0.0 (old version)
			const commandResponses = new Map<string, CommandResponse>([
				[
					"git show main:packages/alpha/package.json",
					{ exitCode: 0, stdout: JSON.stringify({ name: "@test/alpha", version: "1.0.0" }), stderr: "" },
				],
			]);

			const { state: pubState, layer: pubLayer } = PackagePublishTest.empty();

			const layers = Layer.mergeAll(
				loggerLayer,
				actionStateLayer,
				makeCommandRunnerLayer(commandResponses),
				pubLayer,
				npmRegistryLayer,
				sbomLayer,
				attestLayer,
				makeWorkspaceDiscoveryLayer([pkg]),
				makePublishabilityLayer(new Map([["@test/alpha", [target]]])),
			);

			// Act
			const report = await Effect.runPromise(
				runValidation({ packageManager: "pnpm", targetBranch: "main", dryRun: false }).pipe(Effect.provide(layers)),
			);

			// Assert
			expect(report.publishOk).toBe(true);
			expect(report.npmReady).toBe(true);
			expect(report.totalTargets).toBe(1);
			expect(report.readyTargets).toBe(1);
			expect(report.packages).toHaveLength(1);
			expect(report.packages[0]?.name).toBe("@test/alpha");
			expect(report.packages[0]?.version).toBe("1.1.0");
			expect(report.packages[0]?.ready).toBe(true);
			expect(report.publishSummary.length).toBeGreaterThan(0);
			expect(report.hasVersionOnlyPackages).toBe(false);
			// dryRun was called once
			expect(pubState.dryRunCalls).toHaveLength(1);
			expect(pubState.dryRunCalls[0]?.packageDir).toBe("/tmp/dist/alpha");
		});
	});

	describe("dry-run failure", () => {
		it("reports publishOk: false and npmReady: false when dryRun fails for an npm target", async () => {
			// Arrange
			const pkg = makeWsPkg("@test/beta", "2.0.0", "packages/beta");
			const target = makeNpmTarget("@test/beta", "/tmp/dist/beta");

			const commandResponses = new Map<string, CommandResponse>([
				[
					"git show main:packages/beta/package.json",
					{ exitCode: 0, stdout: JSON.stringify({ name: "@test/beta", version: "1.9.0" }), stderr: "" },
				],
			]);

			// dryRunOk: false → every dry-run attempt returns ok: false
			const { layer: pubLayer } = PackagePublishTest.layer({ dryRunOk: false });

			const layers = Layer.mergeAll(
				loggerLayer,
				actionStateLayer,
				makeCommandRunnerLayer(commandResponses),
				pubLayer,
				npmRegistryLayer,
				sbomLayer,
				attestLayer,
				makeWorkspaceDiscoveryLayer([pkg]),
				makePublishabilityLayer(new Map([["@test/beta", [target]]])),
			);

			// Act
			const report = await Effect.runPromise(
				runValidation({ packageManager: "pnpm", targetBranch: "main", dryRun: false }).pipe(Effect.provide(layers)),
			);

			// Assert
			expect(report.publishOk).toBe(false);
			expect(report.npmReady).toBe(false);
			expect(report.githubPackagesReady).toBe(true); // no GitHub Packages targets
			expect(report.readyTargets).toBe(0);
			expect(report.packages).toHaveLength(1);
			expect(report.packages[0]?.ready).toBe(false);
		});

		it("reports githubPackagesReady: false when a GitHub Packages dry-run fails", async () => {
			// Arrange
			const pkg = makeWsPkg("@test/gamma", "3.0.0", "packages/gamma");
			const target = makeGhPkgsTarget("@test/gamma", "/tmp/dist/gamma");

			const commandResponses = new Map<string, CommandResponse>([
				[
					"git show main:packages/gamma/package.json",
					{ exitCode: 0, stdout: JSON.stringify({ name: "@test/gamma", version: "2.9.0" }), stderr: "" },
				],
			]);

			const { layer: pubLayer } = PackagePublishTest.layer({ dryRunOk: false });

			const layers = Layer.mergeAll(
				loggerLayer,
				actionStateLayer,
				makeCommandRunnerLayer(commandResponses),
				pubLayer,
				npmRegistryLayer,
				sbomLayer,
				attestLayer,
				makeWorkspaceDiscoveryLayer([pkg]),
				makePublishabilityLayer(new Map([["@test/gamma", [target]]])),
			);

			// Act
			const report = await Effect.runPromise(
				runValidation({ packageManager: "pnpm", targetBranch: "main", dryRun: false }).pipe(Effect.provide(layers)),
			);

			// Assert
			expect(report.publishOk).toBe(false);
			expect(report.npmReady).toBe(true); // no npm targets
			expect(report.githubPackagesReady).toBe(false);
		});
	});

	describe("package not released (same version as target branch)", () => {
		it("excludes the package from validation when current version equals base version", async () => {
			// Arrange — both current and target-branch version are "1.0.0"
			const pkg = makeWsPkg("@test/unchanged", "1.0.0", "packages/unchanged");
			const target = makeNpmTarget("@test/unchanged");

			const commandResponses = new Map<string, CommandResponse>([
				[
					"git show main:packages/unchanged/package.json",
					{ exitCode: 0, stdout: JSON.stringify({ name: "@test/unchanged", version: "1.0.0" }), stderr: "" },
				],
			]);

			const { state: pubState, layer: pubLayer } = PackagePublishTest.empty();

			const layers = Layer.mergeAll(
				loggerLayer,
				actionStateLayer,
				makeCommandRunnerLayer(commandResponses),
				pubLayer,
				npmRegistryLayer,
				sbomLayer,
				attestLayer,
				makeWorkspaceDiscoveryLayer([pkg]),
				makePublishabilityLayer(new Map([["@test/unchanged", [target]]])),
			);

			// Act
			const report = await Effect.runPromise(
				runValidation({ packageManager: "pnpm", targetBranch: "main", dryRun: false }).pipe(Effect.provide(layers)),
			);

			// Assert — package is excluded because no version bump occurred
			expect(report.publishOk).toBe(true);
			expect(report.packages).toHaveLength(0);
			expect(report.totalTargets).toBe(0);
			// No dry-run calls were made
			expect(pubState.dryRunCalls).toHaveLength(0);
		});
	});

	describe("brand-new package (not on target branch)", () => {
		it("includes a brand-new package when git show fails (package doesn't exist on target branch)", async () => {
			// Arrange — git show exits non-zero (file absent on target branch)
			const pkg = makeWsPkg("@test/new-pkg", "1.0.0", "packages/new-pkg");
			const target = makeNpmTarget("@test/new-pkg");

			const commandResponses = new Map<string, CommandResponse>([
				["git show main:packages/new-pkg/package.json", { exitCode: 128, stdout: "", stderr: "fatal: Path not found" }],
			]);

			const { state: pubState, layer: pubLayer } = PackagePublishTest.empty();

			const layers = Layer.mergeAll(
				loggerLayer,
				actionStateLayer,
				makeCommandRunnerLayer(commandResponses),
				pubLayer,
				npmRegistryLayer,
				sbomLayer,
				attestLayer,
				makeWorkspaceDiscoveryLayer([pkg]),
				makePublishabilityLayer(new Map([["@test/new-pkg", [target]]])),
			);

			// Act
			const report = await Effect.runPromise(
				runValidation({ packageManager: "pnpm", targetBranch: "main", dryRun: false }).pipe(Effect.provide(layers)),
			);

			// Assert — brand-new package is validated
			expect(report.publishOk).toBe(true);
			expect(report.packages).toHaveLength(1);
			expect(report.packages[0]?.name).toBe("@test/new-pkg");
			expect(report.totalTargets).toBe(1);
			expect(pubState.dryRunCalls).toHaveLength(1);
		});
	});

	describe("version-only package (no publish targets)", () => {
		it("reports hasVersionOnlyPackages: true when a released package has no publish targets", async () => {
			// Arrange — version bumped but no publish targets (private internal package)
			const pkg = makeWsPkg("@test/internal", "0.5.1", "packages/internal", true);

			const commandResponses = new Map<string, CommandResponse>([
				[
					"git show main:packages/internal/package.json",
					{ exitCode: 0, stdout: JSON.stringify({ name: "@test/internal", version: "0.5.0" }), stderr: "" },
				],
			]);

			const { state: pubState, layer: pubLayer } = PackagePublishTest.empty();

			const layers = Layer.mergeAll(
				loggerLayer,
				actionStateLayer,
				makeCommandRunnerLayer(commandResponses),
				pubLayer,
				npmRegistryLayer,
				sbomLayer,
				attestLayer,
				makeWorkspaceDiscoveryLayer([pkg]),
				makePublishabilityLayer(new Map()), // no targets for this package
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
			expect(report.packages[0]?.name).toBe("@test/internal");
			expect(report.packages[0]?.ready).toBe(true); // version-only is still "ready"
			// No dry-run calls for a version-only package
			expect(pubState.dryRunCalls).toHaveLength(0);
		});
	});

	describe("no packages released (all versions unchanged)", () => {
		it("returns publishOk: true and empty packages when no version changes are detected", async () => {
			// Arrange — package present but same version on both branches
			const pkg = makeWsPkg("@test/stable", "2.0.0", "packages/stable");

			const commandResponses = new Map<string, CommandResponse>([
				[
					"git show main:packages/stable/package.json",
					{ exitCode: 0, stdout: JSON.stringify({ name: "@test/stable", version: "2.0.0" }), stderr: "" },
				],
			]);

			const { layer: pubLayer } = PackagePublishTest.empty();

			const layers = Layer.mergeAll(
				loggerLayer,
				actionStateLayer,
				makeCommandRunnerLayer(commandResponses),
				pubLayer,
				npmRegistryLayer,
				sbomLayer,
				attestLayer,
				makeWorkspaceDiscoveryLayer([pkg]),
				makePublishabilityLayer(new Map([["@test/stable", [makeNpmTarget("@test/stable")]]])),
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
		});
	});

	describe("dry-run mode flag", () => {
		it("includes 'Dry Run' label in publish summary when dryRun: true", async () => {
			// Arrange — no packages (empty workspace), just verifying the flag passes through.
			const commandRunnerLayer = CommandRunnerTest.empty();
			const { layer: pubLayer } = PackagePublishTest.empty();

			const layers = Layer.mergeAll(
				loggerLayer,
				actionStateLayer,
				commandRunnerLayer,
				pubLayer,
				npmRegistryLayer,
				sbomLayer,
				attestLayer,
				makeWorkspaceDiscoveryLayer([]),
				makePublishabilityLayer(new Map()),
			);

			// Act
			const report = await Effect.runPromise(
				runValidation({ packageManager: "pnpm", targetBranch: "main", dryRun: true }).pipe(Effect.provide(layers)),
			);

			// Assert — dry-run label should appear in the summary
			expect(report.publishSummary).toContain("Dry Run");
		});
	});

	describe("SBOM generation", () => {
		it("generates SBOM for packages with provenance-enabled targets", async () => {
			// Arrange — package with provenance: true target
			const pkg = makeWsPkg("@test/provenance-pkg", "1.0.1", "packages/provenance-pkg");
			const provenanceTarget = new PublishTarget({
				name: "@test/provenance-pkg",
				registry: "https://registry.npmjs.org/",
				directory: "/tmp/dist/provenance-pkg",
				access: "public",
				provenance: true, // provenance enabled → SBOM should be generated
			});

			const commandResponses = new Map<string, CommandResponse>([
				[
					"git show main:packages/provenance-pkg/package.json",
					{ exitCode: 0, stdout: JSON.stringify({ name: "@test/provenance-pkg", version: "1.0.0" }), stderr: "" },
				],
			]);

			// We use the stateful version to inspect calls
			const sbomTestState = {
				generateCalls: [] as import("@savvy-web/github-action-effects/testing").SbomInput[],
				saves: new Map(),
			};
			const sbomTestLayer = SbomTest.layer(sbomTestState);

			const { layer: pubLayer } = PackagePublishTest.empty();

			const layers = Layer.mergeAll(
				loggerLayer,
				actionStateLayer,
				makeCommandRunnerLayer(commandResponses),
				pubLayer,
				npmRegistryLayer,
				sbomTestLayer,
				attestLayer,
				makeWorkspaceDiscoveryLayer([pkg]),
				makePublishabilityLayer(new Map([["@test/provenance-pkg", [provenanceTarget]]])),
			);

			// Act
			const report = await Effect.runPromise(
				runValidation({ packageManager: "pnpm", targetBranch: "main", dryRun: false }).pipe(Effect.provide(layers)),
			);

			// Assert — SBOM was generated successfully
			expect(report.sbomOk).toBe(true);
			expect(report.sbomSummary).toContain("SBOM");
			// generate was called with real dependencies (empty in this case since pkg has none)
			expect(sbomTestState.generateCalls).toHaveLength(1);
			expect(sbomTestState.generateCalls[0]?.rootName).toBe("@test/provenance-pkg");
			expect(sbomTestState.generateCalls[0]?.rootVersion).toBe("1.0.1");
		});

		it("generates SBOM for every published target regardless of provenance flag", async () => {
			// Arrange — target with provenance: false (default). SBOM is now generated
			// for every published target, not just provenance-enabled ones.
			const pkg = makeWsPkg("@test/no-provenance", "1.0.1", "packages/no-provenance");
			const target = makeNpmTarget("@test/no-provenance"); // provenance: false

			const commandResponses = new Map<string, CommandResponse>([
				[
					"git show main:packages/no-provenance/package.json",
					{ exitCode: 0, stdout: JSON.stringify({ name: "@test/no-provenance", version: "1.0.0" }), stderr: "" },
				],
			]);

			const { layer: pubLayer } = PackagePublishTest.empty();

			const layers = Layer.mergeAll(
				loggerLayer,
				actionStateLayer,
				makeCommandRunnerLayer(commandResponses),
				pubLayer,
				npmRegistryLayer,
				sbomLayer,
				attestLayer,
				makeWorkspaceDiscoveryLayer([pkg]),
				makePublishabilityLayer(new Map([["@test/no-provenance", [target]]])),
			);

			// Act
			const report = await Effect.runPromise(
				runValidation({ packageManager: "pnpm", targetBranch: "main", dryRun: false }).pipe(Effect.provide(layers)),
			);

			// Assert — SBOM is generated for the published target even without provenance
			expect(report.sbomOk).toBe(true);
			expect(report.sbomSummary).toBe("1 SBOM(s) generated successfully");
		});
	});
});
