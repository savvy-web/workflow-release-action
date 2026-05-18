/**
 * Phase-2 validation orchestrator.
 *
 * Enumerates workspace packages, diffs versions against the target branch to
 * discover which packages are being released, resolves publish targets, runs a
 * real dry-run per target via `PackagePublish.dryRun`, generates an SBOM
 * preview via `Sbom`, and assembles a `ValidationReport`.
 *
 * @module release/validation
 */

import { isAbsolute, join } from "node:path";

import type { PackagePublishError, ResolvedDependency, SbomError } from "@savvy-web/github-action-effects";
import { ActionLogger, ActionState, CommandRunner, PackagePublish, Sbom } from "@savvy-web/github-action-effects";
import { Config, Effect, Option } from "effect";
import type { WorkspacePackage } from "workspaces-effect";
import { PublishabilityDetector, WorkspaceDiscovery } from "workspaces-effect";

import { GithubPackagesTokenState, STATE_KEYS } from "../state.js";
import { isGitHubPackagesRegistry, isNpmRegistry } from "../utils/registry-utils.js";
import { ValidationError } from "./errors.js";
import { buildPublishSummary } from "./report.js";
import type { PackagePublishResult, PublishPackagesResult, TargetPublishResult } from "./types.js";

// ─── Public interfaces ────────────────────────────────────────────────────────

/**
 * Input arguments for {@link runValidation}.
 *
 * @public
 */
export interface ValidationInputArgs {
	readonly packageManager: string;
	readonly targetBranch: string;
	readonly dryRun: boolean;
}

/**
 * Aggregated validation report returned by {@link runValidation}.
 *
 * @public
 */
export interface ValidationReport {
	/** Whether all publish dry-runs passed. */
	readonly publishOk: boolean;
	/** Whether all npm targets passed. */
	readonly npmReady: boolean;
	/** Whether all GitHub Packages targets passed. */
	readonly githubPackagesReady: boolean;
	/** Total number of publish targets across all packages. */
	readonly totalTargets: number;
	/** Number of targets that passed dry-run. */
	readonly readyTargets: number;
	/** True when every changing package has no publish targets (version-only). */
	readonly hasVersionOnlyPackages: boolean;
	/** Per-package summary for the release output. */
	readonly packages: ReadonlyArray<{ readonly name: string; readonly version: string; readonly ready: boolean }>;
	/** Markdown publish-results summary produced by `buildPublishSummary`. */
	readonly publishSummary: string;
	/** Whether SBOM generation passed for all applicable packages. */
	readonly sbomOk: boolean;
	/** Human-readable SBOM status line. */
	readonly sbomSummary: string;
}

// ─── Internal types ───────────────────────────────────────────────────────────

/** A workspace package that has a version bump (current ≠ target-branch). */
interface ReleasedPackage {
	readonly pkg: WorkspacePackage;
	/** Version on the release branch (bumped). */
	readonly currentVersion: string;
	/** Version on the target branch (old), or `null` for a brand-new package. */
	readonly baseVersion: string | null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Classify a registry URL and return the resolved token for it.
 *
 * Resolution:
 *  - npm public registry  → resolved npm token from `Config` (Option)
 *  - GitHub Packages      → resolved GitHub Packages token from `ActionState` (Option)
 *  - Custom registries    → env var derived from the registry URL (unchanged)
 *
 * Returns `null` when no token is found (OIDC / first-time publish).
 */
function pickToken(registry: string, npmToken: string | null, ghPkgsToken: string | null): string | null {
	if (isNpmRegistry(registry)) {
		return npmToken;
	}
	if (isGitHubPackagesRegistry(registry)) {
		return ghPkgsToken;
	}
	// Custom registry: derive env var name from URL
	// e.g. https://registry.example.com/ → REGISTRY_EXAMPLE_COM_TOKEN
	const envName = registry
		.replace(/^https?:\/\//, "")
		.replace(/[^a-zA-Z0-9]/g, "_")
		.toUpperCase()
		.replace(/_+/g, "_")
		.replace(/^_|_$/g, "")
		.concat("_TOKEN");
	return process.env[envName] ?? null;
}

/**
 * Attempt to read the version of a package from the target branch using git.
 *
 * @param runner - CommandRunner service instance.
 * @param targetBranch - Local git ref (already fetched by `main.ts`).
 * @param relativePackageJsonPath - Path to `package.json` relative to the repo
 *   root (e.g. `packages/foo/package.json`).
 * @returns The version string, or `null` if the file does not exist on that
 *   branch (brand-new package).
 */
const readVersionOnBranch = (
	runner: typeof CommandRunner.Service,
	targetBranch: string,
	relativePackageJsonPath: string,
): Effect.Effect<string | null, ValidationError> =>
	runner.execCapture("git", ["show", `${targetBranch}:${relativePackageJsonPath}`]).pipe(
		Effect.map((output) => {
			try {
				const parsed = JSON.parse(output.stdout) as { version?: unknown };
				return typeof parsed.version === "string" ? parsed.version : null;
			} catch {
				return null;
			}
		}),
		Effect.catchAll(() =>
			// git show fails when the path doesn't exist on the target branch →
			// brand-new package, treat as released with null base version.
			Effect.succeed(null),
		),
	);

/**
 * Collect workspace packages that are being released (version differs from
 * target branch, or package is brand-new on the target branch).
 */
const detectReleasedPackages = (
	workspacePackages: ReadonlyArray<WorkspacePackage>,
	runner: typeof CommandRunner.Service,
	targetBranch: string,
): Effect.Effect<ReadonlyArray<ReleasedPackage>, ValidationError> =>
	Effect.all(
		workspacePackages
			.filter((p) => !p.isRootWorkspace)
			.map((pkg) => {
				// The relative path to package.json from the repo root, used for
				// `git show <branch>:<path>`. WorkspacePackage.relativePath is the
				// workspace-relative path from the root, so appending package.json
				// gives us the correct ref path.
				const relPkgJsonPath = pkg.relativePath !== "" ? `${pkg.relativePath}/package.json` : "package.json";

				return readVersionOnBranch(runner, targetBranch, relPkgJsonPath).pipe(
					Effect.map((baseVersion): ReleasedPackage | null => {
						const currentVersion = pkg.version;
						// Brand-new package (doesn't exist on target branch) → released.
						// Changed version → released.
						// Same version → NOT released, excluded from validation.
						if (baseVersion === null || currentVersion !== baseVersion) {
							return { pkg, currentVersion, baseVersion };
						}
						return null;
					}),
				);
			}),
		{ concurrency: "unbounded" },
	).pipe(Effect.map((results) => results.filter((r): r is ReleasedPackage => r !== null)));

// ─── runValidation ────────────────────────────────────────────────────────────

/**
 * Effect-based Phase-2 validation orchestrator.
 *
 * @remarks
 * Orchestrates publish dry-run validation across registries and SBOM preview
 * generation. Does NOT handle build validation, check-run creation, or
 * sticky-comment updates — those remain in the `main.ts` handler.
 *
 * The returned effect fails with {@link ValidationError} when a fatal error
 * is encountered (e.g., workspace discovery fails). Non-fatal errors per
 * target (dry-run failures, SBOM issues) are collected and reflected in the
 * returned `ValidationReport` rather than causing the effect to fail.
 *
 * @public
 */
export const runValidation = (args: ValidationInputArgs) =>
	Effect.gen(function* () {
		const logger = yield* ActionLogger;
		const discovery = yield* WorkspaceDiscovery;
		const detector = yield* PublishabilityDetector;
		const publish = yield* PackagePublish;
		const sbomSvc = yield* Sbom;
		const runner = yield* CommandRunner;
		const state = yield* ActionState;

		// ── Resolve registry tokens once (Effect-native) ─────────────────────
		// npm token: read via Config from the `npm-token` action input.
		// An absent or empty input yields null (OIDC / no token).
		const npmTokenOpt = yield* Config.string("npm-token").pipe(Config.option);
		const npmToken: string | null = Option.isSome(npmTokenOpt) && npmTokenOpt.value !== "" ? npmTokenOpt.value : null;

		// GitHub Packages token: read from ActionState (persisted by pre.ts).
		// getOptional returns Option.none when the key is absent; any error is
		// caught and treated as "no token".
		const ghPkgsTokenOpt = yield* state
			.getOptional(STATE_KEYS.githubPackagesToken, GithubPackagesTokenState)
			.pipe(Effect.catchAll(() => Effect.succeed(Option.none<GithubPackagesTokenState>())));
		const ghPkgsToken: string | null =
			Option.isSome(ghPkgsTokenOpt) && ghPkgsTokenOpt.value.token !== "" ? ghPkgsTokenOpt.value.token : null;

		// ── Step 1: Discover workspace packages ──────────────────────────────

		yield* Effect.logInfo("runValidation: discovering workspace packages");
		const workspacePackages = yield* discovery.listPackages().pipe(
			Effect.mapError(
				(e) =>
					new ValidationError({
						reason: "dry-run",
						message: `Workspace discovery failed: ${e.message}`,
						cause: e,
					}),
			),
		);

		// ── Step 2: Identify released packages via version diff ───────────────
		// Phase 2 runs on the release branch where `changeset version` has
		// already consumed all .changeset/*.md files, so ChangesetAnalyzer
		// returns empty. Instead, diff each package's current version against
		// the target branch to discover what is being released.

		yield* Effect.logInfo("runValidation: detecting released packages via version diff");
		const releasedPackages = yield* detectReleasedPackages(workspacePackages, runner, args.targetBranch).pipe(
			Effect.mapError(
				(e) =>
					new ValidationError({
						reason: "dry-run",
						message: `Version diff failed: ${e.message}`,
						cause: e,
					}),
			),
		);

		yield* Effect.logInfo(`runValidation: ${releasedPackages.length} package(s) to validate`);

		if (releasedPackages.length === 0) {
			yield* Effect.logInfo("runValidation: no packages to validate");
			const emptyResult: PublishPackagesResult = {
				success: true,
				packages: [],
				totalPackages: 0,
				successfulPackages: 0,
				totalTargets: 0,
				successfulTargets: 0,
			};
			return {
				publishOk: true,
				npmReady: true,
				githubPackagesReady: true,
				totalTargets: 0,
				readyTargets: 0,
				hasVersionOnlyPackages: false,
				packages: [],
				publishSummary: buildPublishSummary(emptyResult, { dryRun: args.dryRun }),
				sbomOk: true,
				sbomSummary: "No packages require SBOM",
			} satisfies ValidationReport;
		}

		// ── Step 3: Resolve publish targets + dry-run per package ─────────────

		yield* Effect.logInfo("runValidation: resolving publish targets and running dry-runs");

		// ── Diagnostic: surface the runtime environment for the npm dry-run ──
		// `spawn npm ENOENT` was observed here even though git/pnpm resolve fine;
		// log PATH and probe the toolchain so the cause is visible in the run log.
		yield* Effect.logInfo(`runValidation[diag]: PATH=${process.env.PATH ?? "<unset>"}`);
		for (const probe of [
			["node", ["--version"]],
			["npm", ["--version"]],
			["pnpm", ["--version"]],
			["which", ["npm"]],
			["which", ["node"]],
		] as const) {
			const outcome = yield* runner.execCapture(probe[0], probe[1]).pipe(
				Effect.map((o) => `ok: ${o.stdout.trim() || o.stderr.trim()}`),
				Effect.catchAll((e) => Effect.succeed(`FAILED: ${e.reason}`)),
			);
			yield* Effect.logInfo(`runValidation[diag]: ${probe[0]} ${probe[1].join(" ")} → ${outcome}`);
		}

		const workspaceRoot = process.cwd();
		const pkgResults: PackagePublishResult[] = [];
		let allPublishOk = true;
		let npmReadyAll = true;
		let githubPackagesReadyAll = true;
		let totalTargets = 0;
		let readyTargets = 0;

		for (const { pkg } of releasedPackages) {
			// Single detect call — result reused for both dry-run and SBOM steps.
			const targets = yield* detector.detect(pkg, workspaceRoot);

			if (targets.length === 0) {
				yield* Effect.logInfo(`${pkg.name}: no publish targets (version-only)`);
				pkgResults.push({ name: pkg.name, version: pkg.version, targets: [] });
				continue;
			}

			const targetResults: TargetPublishResult[] = [];

			for (const target of targets) {
				totalTargets++;

				// Classify the target by registry URL.
				// NOTE: workspaces-effect's PublishTarget has no `protocol` field;
				// all targets resolved through PublishabilityDetector are npm-compatible.
				// JSR targets are only reachable via the imperative publish chain and
				// are not currently modelled in this Effect-based path.
				const registryUrl = target.registry;
				const targetIsNpm = isNpmRegistry(registryUrl);
				const targetIsGhPkgs = isGitHubPackagesRegistry(registryUrl);

				// `target.directory` (e.g. "dist/dev") is package-relative; resolve it
				// against the package's absolute path so the dry-run child process'
				// `cwd` exists. A non-existent `cwd` makes `spawn` fail with a
				// misleading "spawn npm ENOENT".
				const targetDir = isAbsolute(target.directory) ? target.directory : join(pkg.path, target.directory);

				yield* Effect.logInfo(`${pkg.name}: setting up auth and dry-run for ${registryUrl} in ${targetDir}`);

				const dryRunOutcome = yield* logger.group(
					`Dry-run ${pkg.name} → ${registryUrl}`,
					Effect.gen(function* () {
						// Set up registry auth before dry-run.
						const token = pickToken(registryUrl, npmToken, ghPkgsToken);
						if (token !== null) {
							yield* publish.setupAuth(registryUrl, token).pipe(
								Effect.catchAll((e: PackagePublishError) => {
									return Effect.logWarning(`setupAuth failed for ${registryUrl}: ${e.message}`);
								}),
							);
						}

						// Run the real dry-run via PackagePublish.dryRun.
						const result = yield* publish
							.dryRun(targetDir, {
								registry: registryUrl,
								access: target.access,
								provenance: target.provenance,
							})
							.pipe(
								Effect.map((dryRunResult) => ({
									success: dryRunResult.ok as boolean,
									output: dryRunResult.output,
									packedSize: dryRunResult.packedSize,
									unpackedSize: dryRunResult.unpackedSize,
									fileCount: dryRunResult.fileCount,
								})),
								Effect.catchAll((e: PackagePublishError) => {
									// Structural dryRun failure (npm could not be spawned, etc.)
									return Effect.succeed({
										success: false as const,
										output: e.message,
										packedSize: undefined,
										unpackedSize: undefined,
										fileCount: undefined,
									});
								}),
							);

						if (!result.success) {
							yield* Effect.logWarning(`dry-run failed for ${pkg.name} → ${registryUrl}: ${result.output}`);
						}
						return result;
					}),
				);

				// Build the legacy ResolvedTarget shape for TargetPublishResult.
				// Since PublishTarget has no protocol field, we use "npm" for all targets.
				const targetResult: TargetPublishResult = {
					target: {
						protocol: "npm",
						registry: registryUrl,
						directory: targetDir,
						access: target.access,
						provenance: target.provenance,
						tag: "latest",
						tokenEnv: null,
					},
					success: dryRunOutcome.success,
					error: dryRunOutcome.success ? undefined : dryRunOutcome.output,
					stdout: dryRunOutcome.success ? dryRunOutcome.output : undefined,
				};

				targetResults.push(targetResult);

				if (dryRunOutcome.success) {
					readyTargets++;
				} else {
					allPublishOk = false;
					if (targetIsNpm) npmReadyAll = false;
					if (targetIsGhPkgs) githubPackagesReadyAll = false;
				}
			}

			pkgResults.push({ name: pkg.name, version: pkg.version, targets: targetResults });
		}

		// ── Step 4: SBOM preview ─────────────────────────────────────────────

		yield* Effect.logInfo("runValidation: generating SBOM preview");

		let sbomOk = true;
		let sbomCount = 0;
		let sbomSuccess = 0;

		for (const { pkg } of releasedPackages) {
			// Re-use previously resolved targets (avoid second detector.detect call).
			// We need targets here to check for provenance — re-run detect since we
			// don't cache them above. In practice the number of packages is small
			// enough that the extra call is not a concern.
			const targets = yield* detector.detect(pkg, workspaceRoot);
			const hasProvenance = targets.some((t) => t.provenance);
			if (!hasProvenance) continue;

			sbomCount++;

			// Build a real SbomInput from the package's resolved dependencies.
			// The WorkspacePackage.dependencies map contains direct dependencies
			// as { [name]: version } — map these to ResolvedDependency records.
			const dependencies: ResolvedDependency[] = Object.entries(pkg.dependencies).map(([name, version]) => ({
				name,
				version,
			}));

			const sbomEffect = sbomSvc
				.generate({
					rootName: pkg.name,
					rootVersion: pkg.version,
					dependencies,
				})
				.pipe(
					Effect.flatMap((bom) => sbomSvc.serializeJson(bom)),
					Effect.map(() => true as const),
					Effect.catchAll((e: SbomError) =>
						Effect.gen(function* () {
							yield* Effect.logWarning(`SBOM generation failed for ${pkg.name}: ${e.message}`);
							return false as const;
						}),
					),
				);

			const ok = yield* sbomEffect;
			if (ok) {
				sbomSuccess++;
			} else {
				sbomOk = false;
			}
		}

		const sbomSummary =
			sbomCount === 0
				? "No packages require SBOM"
				: sbomOk
					? `${sbomCount} SBOM(s) generated successfully`
					: `${sbomSuccess}/${sbomCount} SBOM(s) generated`;

		// ── Step 5: Assemble ValidationReport ────────────────────────────────

		const hasVersionOnlyPackages = totalTargets === 0 && pkgResults.length > 0;

		const publishResult: PublishPackagesResult = {
			success: allPublishOk,
			packages: pkgResults,
			totalPackages: pkgResults.length,
			successfulPackages: pkgResults.filter((p) => p.targets.every((t) => t.success)).length,
			totalTargets,
			successfulTargets: readyTargets,
		};

		const summary = buildPublishSummary(publishResult, { dryRun: args.dryRun });

		const reportPackages = pkgResults.map((p) => ({
			name: p.name,
			version: p.version,
			ready: p.targets.length === 0 || p.targets.every((t) => t.success),
		}));

		return {
			publishOk: allPublishOk,
			npmReady: npmReadyAll,
			githubPackagesReady: githubPackagesReadyAll,
			totalTargets,
			readyTargets,
			hasVersionOnlyPackages,
			packages: reportPackages,
			publishSummary: summary,
			sbomOk,
			sbomSummary,
		} satisfies ValidationReport;
	});
