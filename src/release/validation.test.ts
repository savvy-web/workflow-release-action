/**
 * Unit tests for runValidation (Phase-2 orchestrator).
 *
 * All dependencies are provided via in-memory test layers; no real filesystem,
 * registry, git, or SBOM tooling is exercised.
 */

import { ActionsConfigProvider } from "@savvy-web/github-action-effects";
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
			expect(report.validationPackages).toHaveLength(1);
			expect(report.hasVersionOnlyPackages).toBe(false);
			// dryRun was called once
			expect(pubState.dryRunCalls).toHaveLength(1);
			expect(pubState.dryRunCalls[0]?.packageDir).toBe("/tmp/dist/alpha");
		});

		it("detects a single-root-workspace release (relativePath: '.') as a publishable package", async () => {
			// Regression: `github-action-builder` ships a `pnpm-workspace.yaml`
			// with `packages: [.]` — the root IS the only workspace, with
			// `private: true` and `publishConfig.targets`. The version-diff
			// detector must include root workspaces; the prior
			// `.filter((p) => !p.isRootWorkspace)` silently dropped the only
			// thing the action was supposed to release.
			const rootPkg = new WorkspacePackage({
				name: "@savvy-web/github-action-builder",
				version: "0.7.1",
				path: "/tmp/test-workspace",
				packageJsonPath: "/tmp/test-workspace/package.json",
				relativePath: ".", // identifies this as the root workspace
				private: true,
			});
			const target = makeNpmTarget("@savvy-web/github-action-builder", "/tmp/test-workspace/dist/npm");

			const commandResponses = new Map<string, CommandResponse>([
				[
					"git show main:package.json",
					{
						exitCode: 0,
						stdout: JSON.stringify({ name: "@savvy-web/github-action-builder", version: "0.7.0" }),
						stderr: "",
					},
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
				makeWorkspaceDiscoveryLayer([rootPkg]),
				makePublishabilityLayer(new Map([["@savvy-web/github-action-builder", [target]]])),
			);

			const report = await Effect.runPromise(
				runValidation({ packageManager: "pnpm", targetBranch: "main", dryRun: false }).pipe(Effect.provide(layers)),
			);

			// Root workspace should be detected and counted, not silently dropped.
			expect(rootPkg.isRootWorkspace).toBe(true);
			expect(report.validationPackages).toHaveLength(1);
			expect(report.validationPackages[0]?.name).toBe("@savvy-web/github-action-builder");
			expect(report.validationPackages[0]?.baseVersion).toBe("0.7.0");
			expect(report.validationPackages[0]?.version).toBe("0.7.1");
			expect(report.totalTargets).toBe(1);
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
			expect(report.validationPackages).toHaveLength(0);
		});

		it("emits a warning-severity finding scoped to Publish Validation when zero packages have version diffs", async () => {
			// A release branch with no version diffs is valid-but-suspicious:
			// either the release has already merged, or Phase 1 dropped the
			// version-bump commit. The validation phase must surface a warning
			// rather than silently emit an empty report.
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

			const report = await Effect.runPromise(
				runValidation({ packageManager: "pnpm", targetBranch: "main", dryRun: false }).pipe(Effect.provide(layers)),
			);

			// The run still succeeds — this is a warning, not an error.
			expect(report.publishOk).toBe(true);
			expect(report.validationPackages).toHaveLength(0);

			// Exactly one finding (the no-packages warning); scope is global
			// (null), severity is warning, check is Publish Validation.
			expect(report.findings).toHaveLength(1);
			const finding = report.findings[0];
			expect(finding?.severity).toBe("warning");
			expect(finding?.check).toBe("Publish Validation");
			expect(finding?.scope).toBeNull();
			expect(finding?.message).toMatch(/No packages have version differences/);
			expect(finding?.message).toMatch(/Phase 1/);
		});
	});

	describe("changeset counting (target-branch .changeset directory)", () => {
		it("runs to completion when the target branch carries changeset files", async () => {
			// Arrange — a released package plus a seeded `.changeset` directory on
			// the target branch. `countChangesetsPerPackage` reads these via git;
			// the run must still complete successfully.
			const pkg = makeWsPkg("@test/counted", "2.1.0", "packages/counted");
			const target = makeNpmTarget("@test/counted", "/tmp/dist/counted");

			const commandResponses = new Map<string, CommandResponse>([
				[
					"git show main:packages/counted/package.json",
					{ exitCode: 0, stdout: JSON.stringify({ name: "@test/counted", version: "2.0.0" }), stderr: "" },
				],
				[
					"git ls-tree --name-only main .changeset/",
					{ exitCode: 0, stdout: [".changeset/README.md", ".changeset/one.md"].join("\n"), stderr: "" },
				],
				[
					"git show main:.changeset/one.md",
					{ exitCode: 0, stdout: ["---", '"@test/counted": minor', "---", "", "A change", ""].join("\n"), stderr: "" },
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
				makePublishabilityLayer(new Map([["@test/counted", [target]]])),
			);

			// Act
			const report = await Effect.runPromise(
				runValidation({ packageManager: "pnpm", targetBranch: "main", dryRun: false }).pipe(Effect.provide(layers)),
			);

			// Assert — the changeset-counting git path does not disrupt the run.
			expect(report.publishOk).toBe(true);
			expect(report.packages).toHaveLength(1);
			expect(report.packages[0]?.name).toBe("@test/counted");
		});

		it("runs to completion when git ls-tree for changesets fails (best-effort)", async () => {
			// Arrange — only the version-diff git show is registered; the
			// changeset `ls-tree` has no response and therefore fails. The
			// best-effort helper must absorb that without failing the run.
			const pkg = makeWsPkg("@test/no-changesets", "1.2.0", "packages/no-changesets");
			const target = makeNpmTarget("@test/no-changesets", "/tmp/dist/no-changesets");

			const commandResponses = new Map<string, CommandResponse>([
				[
					"git show main:packages/no-changesets/package.json",
					{ exitCode: 0, stdout: JSON.stringify({ name: "@test/no-changesets", version: "1.1.0" }), stderr: "" },
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
				makePublishabilityLayer(new Map([["@test/no-changesets", [target]]])),
			);

			// Act
			const report = await Effect.runPromise(
				runValidation({ packageManager: "pnpm", targetBranch: "main", dryRun: false }).pipe(Effect.provide(layers)),
			);

			// Assert
			expect(report.publishOk).toBe(true);
			expect(report.packages).toHaveLength(1);
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

	describe("validation findings", () => {
		it("produces an error finding when a publish dry-run fails", async () => {
			// Arrange
			const pkg = makeWsPkg("@test/finding-fail", "2.0.0", "packages/finding-fail");
			const target = makeNpmTarget("@test/finding-fail", "/tmp/dist/finding-fail");

			const commandResponses = new Map<string, CommandResponse>([
				[
					"git show main:packages/finding-fail/package.json",
					{ exitCode: 0, stdout: JSON.stringify({ name: "@test/finding-fail", version: "1.9.0" }), stderr: "" },
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
				makePublishabilityLayer(new Map([["@test/finding-fail", [target]]])),
			);

			// Act
			const report = await Effect.runPromise(
				runValidation({ packageManager: "pnpm", targetBranch: "main", dryRun: false }).pipe(Effect.provide(layers)),
			);

			// Assert — the failed dry-run surfaces as an error finding.
			const errorFindings = report.findings.filter((f) => f.severity === "error");
			expect(errorFindings.length).toBeGreaterThanOrEqual(1);
			const publishError = errorFindings.find((f) => f.check === "Publish Validation");
			expect(publishError).toBeDefined();
			expect(publishError?.scope?.package).toBe("@test/finding-fail");
			expect(publishError?.message).toContain("dry-run failed");
		});

		it("produces a warning finding when the generated SBOM is NTIA-incomplete", async () => {
			// Arrange — the default SbomTest BOM JSON lacks supplier/PURL/author/
			// timestamp and carries zero components, so it is NTIA-incomplete.
			const pkg = makeWsPkg("@test/ntia-incomplete", "1.0.1", "packages/ntia-incomplete");
			const target = makeNpmTarget("@test/ntia-incomplete", "/tmp/dist/ntia-incomplete");

			const commandResponses = new Map<string, CommandResponse>([
				[
					"git show main:packages/ntia-incomplete/package.json",
					{ exitCode: 0, stdout: JSON.stringify({ name: "@test/ntia-incomplete", version: "1.0.0" }), stderr: "" },
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
				makePublishabilityLayer(new Map([["@test/ntia-incomplete", [target]]])),
			);

			// Act
			const report = await Effect.runPromise(
				runValidation({ packageManager: "pnpm", targetBranch: "main", dryRun: false }).pipe(Effect.provide(layers)),
			);

			// Assert — NTIA-incomplete BOM yields a warning finding; SBOM still "ok".
			expect(report.sbomOk).toBe(true);
			const ntiaWarning = report.findings.find(
				(f) => f.severity === "warning" && f.check === "SBOM Preview" && f.message.includes("NTIA fields"),
			);
			expect(ntiaWarning).toBeDefined();
			expect(ntiaWarning?.scope?.package).toBe("@test/ntia-incomplete");
		});

		it("yields findings: [] for an all-pass run with an NTIA-complete SBOM", async () => {
			// Arrange — an NTIA-complete BOM with at least one component, fed via
			// the SbomTest `jsonResponse` override.
			const pkg = makeWsPkg("@test/all-pass", "1.0.1", "packages/all-pass");
			const target = makeNpmTarget("@test/all-pass", "/tmp/dist/all-pass");

			const commandResponses = new Map<string, CommandResponse>([
				[
					"git show main:packages/all-pass/package.json",
					{ exitCode: 0, stdout: JSON.stringify({ name: "@test/all-pass", version: "1.0.0" }), stderr: "" },
				],
			]);

			const compliantBomJson = JSON.stringify({
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {
					timestamp: "2026-05-19T00:00:00.000Z",
					supplier: { name: "Savvy Web Systems" },
					component: {
						type: "library",
						name: "@test/all-pass",
						version: "1.0.1",
						publisher: "Savvy Web Systems",
						purl: "pkg:npm/%40test/all-pass@1.0.1",
					},
				},
				components: [{ type: "library", name: "dep-a", version: "1.0.0" }],
			});

			const sbomTestState = {
				generateCalls: [] as import("@savvy-web/github-action-effects/testing").SbomInput[],
				saves: new Map(),
				jsonResponse: compliantBomJson,
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
				makePublishabilityLayer(new Map([["@test/all-pass", [target]]])),
			);

			// Act
			const report = await Effect.runPromise(
				runValidation({ packageManager: "pnpm", targetBranch: "main", dryRun: false }).pipe(Effect.provide(layers)),
			);

			// Assert — no errors, no warnings.
			expect(report.publishOk).toBe(true);
			expect(report.sbomOk).toBe(true);
			expect(report.findings).toEqual([]);
		});
	});

	describe("directory-keyed builds", () => {
		it("groups two targets sharing a directory into one build with one SBOM", async () => {
			// Arrange — two registry targets that publish from the same `dist/npm`
			// directory. They must collapse into a single build node with a single
			// SBOM (the tarball is identical across the two registries).
			const pkg = makeWsPkg("@test/shared-dir", "1.1.0", "packages/shared-dir");
			const targetA = new PublishTarget({
				name: "@test/shared-dir",
				registry: "https://registry.one.example.com/",
				directory: "/tmp/dist/shared-dir/npm",
				access: "public",
				provenance: false,
			});
			const targetB = new PublishTarget({
				name: "@test/shared-dir",
				registry: "https://registry.two.example.com/",
				directory: "/tmp/dist/shared-dir/npm",
				access: "public",
				provenance: false,
			});

			const commandResponses = new Map<string, CommandResponse>([
				[
					"git show main:packages/shared-dir/package.json",
					{ exitCode: 0, stdout: JSON.stringify({ name: "@test/shared-dir", version: "1.0.0" }), stderr: "" },
				],
			]);

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
				makePublishabilityLayer(new Map([["@test/shared-dir", [targetA, targetB]]])),
			);

			// Act
			const report = await Effect.runPromise(
				runValidation({ packageManager: "pnpm", targetBranch: "main", dryRun: false }).pipe(Effect.provide(layers)),
			);

			// Assert — one build node, one SBOM, two registry targets.
			expect(report.validationPackages).toHaveLength(1);
			const builds = report.validationPackages[0]?.builds ?? [];
			expect(builds).toHaveLength(1);
			expect(builds[0]?.targets).toHaveLength(2);
			expect(builds[0]?.sbom).not.toBeNull();
			// SBOM generated exactly once despite two registry targets.
			expect(sbomTestState.generateCalls).toHaveLength(1);
			// Both registries still counted as targets.
			expect(report.totalTargets).toBe(2);
		});

		it("produces two builds when a package's targets span two directories", async () => {
			// Arrange — one target in `dist/npm`, one in `dist/github`.
			const pkg = makeWsPkg("@test/two-dirs", "2.1.0", "packages/two-dirs");
			const npmTarget = new PublishTarget({
				name: "@test/two-dirs",
				registry: "https://registry.npmjs.org/",
				directory: "/tmp/dist/two-dirs/npm",
				access: "public",
				provenance: false,
			});
			const ghTarget = new PublishTarget({
				name: "@test/two-dirs",
				registry: "https://npm.pkg.github.com/",
				directory: "/tmp/dist/two-dirs/github",
				access: "restricted",
				provenance: false,
			});

			const commandResponses = new Map<string, CommandResponse>([
				[
					"git show main:packages/two-dirs/package.json",
					{ exitCode: 0, stdout: JSON.stringify({ name: "@test/two-dirs", version: "2.0.0" }), stderr: "" },
				],
			]);

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
				makePublishabilityLayer(new Map([["@test/two-dirs", [npmTarget, ghTarget]]])),
			);

			// Act
			const report = await Effect.runPromise(
				runValidation({ packageManager: "pnpm", targetBranch: "main", dryRun: false }).pipe(Effect.provide(layers)),
			);

			// Assert — two builds, one SBOM each.
			const builds = report.validationPackages[0]?.builds ?? [];
			expect(builds).toHaveLength(2);
			expect(builds.every((b) => b.targets.length === 1)).toBe(true);
			expect(sbomTestState.generateCalls).toHaveLength(2);
			expect(report.sbomSummary).toBe("2 SBOM(s) generated successfully");
		});

		it("carries the package-relative build directory (not an absolute path) into the report", async () => {
			// Arrange — a package whose target publishes from `dist/npm`. The build
			// directory that reaches `PackageBuildResult.directory` (and from there
			// `ValidationOutput` and the rendered comment) must be the
			// package-relative `dist/npm`, never the resolved absolute path. A
			// relative `target.directory` is carried verbatim; an absolute one is
			// relativised against the package root.
			const pkg = makeWsPkg("@test/relative-dir", "1.1.0", "packages/relative-dir");
			const relativeTarget = makeNpmTarget("@test/relative-dir", "dist/npm");
			const absoluteTarget = new PublishTarget({
				name: "@test/relative-dir",
				registry: "https://npm.pkg.github.com/",
				// An absolute path under the package root — must relativise to `dist/github`.
				directory: "/tmp/test-workspace/@test/relative-dir/dist/github",
				access: "public",
				provenance: false,
			});

			const commandResponses = new Map<string, CommandResponse>([
				[
					"git show main:packages/relative-dir/package.json",
					{ exitCode: 0, stdout: JSON.stringify({ name: "@test/relative-dir", version: "1.0.0" }), stderr: "" },
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
				makePublishabilityLayer(new Map([["@test/relative-dir", [relativeTarget, absoluteTarget]]])),
			);

			// Act
			const report = await Effect.runPromise(
				runValidation({ packageManager: "pnpm", targetBranch: "main", dryRun: false }).pipe(Effect.provide(layers)),
			);

			// Assert — both build directories are package-relative, never absolute.
			const builds = report.validationPackages[0]?.builds ?? [];
			expect(builds).toHaveLength(2);
			const directories = builds.map((b) => b.directory).sort();
			expect(directories).toEqual(["dist/github", "dist/npm"]);
			for (const build of builds) {
				expect(build.directory.startsWith("/")).toBe(false);
			}
		});

		it("passes sbom-config supplier to Sbom.generate so the real BOM carries it and NTIA passes", async () => {
			// Arrange — the `sbom-config` supplier must be threaded into the
			// `Sbom.generate` input (`SbomInput.supplier` / `authors`); the library
			// then carries it onto the emitted BOM's `metadata.supplier` / `authors`.
			// The `jsonResponse` here stands in for that real emitted BOM — it
			// carries the supplier the consumer passed, so NTIA genuinely passes.
			const pkg = makeWsPkg("@test/metadata", "1.0.1", "packages/metadata");
			const target = makeNpmTarget("@test/metadata", "/tmp/dist/metadata");

			const commandResponses = new Map<string, CommandResponse>([
				[
					"git show main:packages/metadata/package.json",
					{ exitCode: 0, stdout: JSON.stringify({ name: "@test/metadata", version: "1.0.0" }), stderr: "" },
				],
			]);

			// The BOM `Sbom.generate` emits when handed `SbomInput.supplier` —
			// `metadata.supplier` and `metadata.authors` are present, as the real
			// `SbomLive` now produces. NTIA validates this actual artifact.
			const bomJsonWithSupplier = JSON.stringify({
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {
					timestamp: "2026-05-19T00:00:00.000Z",
					supplier: { name: "Savvy Web Systems" },
					authors: [{ name: "Savvy Web Systems" }],
					component: {
						type: "library",
						name: "@test/metadata",
						version: "1.0.1",
						purl: "pkg:npm/%40test/metadata@1.0.1",
					},
				},
				components: [{ type: "library", name: "dep-a", version: "1.0.0" }],
			});

			const sbomTestState = {
				generateCalls: [] as import("@savvy-web/github-action-effects/testing").SbomInput[],
				saves: new Map(),
				jsonResponse: bomJsonWithSupplier,
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
				makePublishabilityLayer(new Map([["@test/metadata", [target]]])),
			);

			// The `sbom-config` action input is read via the canonical GitHub
			// Actions env convention: `core.getInput("sbom-config")` reads
			// `INPUT_SBOM-CONFIG` (hyphens preserved; only spaces map to
			// underscores). `ActionsConfigProvider` — wired into `main.ts` and
			// supplied by `runValidation`'s caller — implements the same rule.
			const ENV_KEY = "INPUT_SBOM-CONFIG";
			const prev = process.env[ENV_KEY];
			process.env[ENV_KEY] = JSON.stringify({
				sbom: { supplier: { name: "Savvy Web Systems", url: "https://savvyweb.systems" } },
			});
			// `ActionsConfigProvider` makes `Config.string("sbom-config")` resolve
			// to `INPUT_SBOM-CONFIG` — matching `main.ts`'s runtime — so the test
			// exercises the real env-var convention, not Effect's default mapping.
			const runReport = () =>
				Effect.runPromise(
					runValidation({ packageManager: "pnpm", targetBranch: "main", dryRun: false }).pipe(
						Effect.provide(layers),
						Effect.withConfigProvider(ActionsConfigProvider),
					),
				);
			const report = await runReport().finally(() => {
				if (prev === undefined) {
					delete process.env[ENV_KEY];
				} else {
					process.env[ENV_KEY] = prev;
				}
			});

			// Assert — the resolved supplier was passed into `Sbom.generate` (so the
			// real BOM carries it), and NTIA passes against that BOM with no
			// SBOM-Preview warning. (`authors` stays absent here: the template
			// supplies only a supplier and the synthetic dist dir has no
			// package.json author to infer from.)
			expect(sbomTestState.generateCalls).toHaveLength(1);
			expect(sbomTestState.generateCalls[0]?.supplier?.name).toBe("Savvy Web Systems");
			// `resolveSBOMMetadata` normalises `supplier.url` to a string array.
			expect(sbomTestState.generateCalls[0]?.supplier?.url).toEqual(["https://savvyweb.systems"]);
			const build = report.validationPackages[0]?.builds[0];
			expect(build?.sbom?.ntiaCompliant).toBe(true);
			expect(build?.sbom?.missingNtiaFields).toEqual([]);
			const sbomWarnings = report.findings.filter((f) => f.check === "SBOM Preview");
			expect(sbomWarnings).toEqual([]);
		});

		it("does not warn about a component-less BOM for a dependency-free package", async () => {
			// Arrange — the default SbomTest BOM carries `components: []`. A
			// dependency-free package legitimately has a component-less BOM, so no
			// "no components" warning must be emitted.
			const pkg = makeWsPkg("@test/no-deps", "1.0.1", "packages/no-deps");
			const target = makeNpmTarget("@test/no-deps", "/tmp/dist/no-deps");

			const commandResponses = new Map<string, CommandResponse>([
				[
					"git show main:packages/no-deps/package.json",
					{ exitCode: 0, stdout: JSON.stringify({ name: "@test/no-deps", version: "1.0.0" }), stderr: "" },
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
				makePublishabilityLayer(new Map([["@test/no-deps", [target]]])),
			);

			// Act
			const report = await Effect.runPromise(
				runValidation({ packageManager: "pnpm", targetBranch: "main", dryRun: false }).pipe(Effect.provide(layers)),
			);

			// Assert — the build has a component-less SBOM but no "no components" finding.
			const build = report.validationPackages[0]?.builds[0];
			expect(build?.sbom?.componentCount).toBe(0);
			const noComponentsWarning = report.findings.find((f) => f.message.includes("no components"));
			expect(noComponentsWarning).toBeUndefined();
		});
	});
});
