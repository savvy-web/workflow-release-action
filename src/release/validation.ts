/**
 * Phase-2 validation orchestrator.
 *
 * Enumerates workspace packages, diffs versions against the target branch to
 * discover which packages are being released, resolves publish targets, groups
 * them by build directory, runs a real dry-run per build directory via
 * `PackagePublish.dryRun`, generates one SBOM per build directory via `Sbom`
 * (with `sbom-config` metadata applied), and assembles a `ValidationReport`.
 *
 * The report is build-centric: the per-package `validationPackages` carry the
 * builds, sizes, SBOMs, and registry targets. `main.ts` projects them into the
 * canonical `ValidationOutput`, which is both emitted and rendered to the
 * sticky comment — this module does not render markdown.
 *
 * @module release/validation
 */

import { existsSync, readFileSync } from "node:fs";
import { basename, isAbsolute, join, relative } from "node:path";

import type { PackagePublishError, ResolvedDependency, SbomError, SbomInput } from "@savvy-web/github-action-effects";
import {
	ActionLogger,
	ActionState,
	CommandRunner,
	PackagePublish,
	Sbom,
	isGitHubPackagesRegistry,
	isNpmRegistry,
} from "@savvy-web/github-action-effects";
import { Config, Effect, Option } from "effect";
import type { PublishTarget, WorkspacePackage } from "workspaces-effect";
import { WorkspaceDiscovery } from "workspaces-effect";
import { GithubPackagesTokenState, STATE_KEYS } from "../state.js";
import type { EnhancedCycloneDXDocument, ResolvedSBOMMetadata, SBOMMetadataConfig } from "../types/sbom-config.js";
import { countChangesetsPerPackage } from "../utils/count-changesets.js";
import { extractReleaseNotes } from "../utils/extract-release-notes.js";
import { inferSBOMMetadata, resolveSBOMMetadata } from "../utils/infer-sbom-metadata.js";
import type { ConfigSource } from "../utils/load-release-config.js";
import { loadSBOMConfig } from "../utils/load-release-config.js";
import { validateNTIACompliance } from "../utils/validate-ntia-compliance.js";
import { ValidationError } from "./errors.js";
import { resolvePublishableTargets } from "./resolve-targets.js";
import type {
	BuildSbom,
	BuildTargetResult,
	PackageBuildResult,
	ValidationFinding,
	ValidationPackageResult,
} from "./types.js";

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
	/** Build-centric per-package validation results (builds → SBOM + targets). */
	readonly validationPackages: ReadonlyArray<ValidationPackageResult>;
	/** Whether SBOM generation passed for all applicable build directories. */
	readonly sbomOk: boolean;
	/** Human-readable SBOM status line. */
	readonly sbomSummary: string;
	/** Structured error/warning findings produced by the validation checks. */
	readonly findings: ReadonlyArray<ValidationFinding>;
	/**
	 * Debug-only — the resolved `sbom-config` metadata per build, keyed by
	 * `${pkg.name}:${build.directory}`. Threaded to the SBOM Preview check-run
	 * summary so config-or-mapping bugs are immediately visible; intentionally
	 * NOT exposed on the public `ValidationOutput` schema.
	 *
	 * Every populated value is a `ResolvedSBOMMetadata` — `resolveSBOMMetadata`
	 * never returns `null`, and the map only records builds the validation
	 * loop actually processed. A missing key for a known build means that
	 * build was filtered out before SBOM generation (e.g. version-only package
	 * with no publish targets). An entirely empty map signals "no sbom-config
	 * was resolved at all" (no released packages, or every released package
	 * was version-only).
	 */
	readonly resolvedSbomConfig: ReadonlyMap<string, ResolvedSBOMMetadata>;
	/**
	 * Debug-only — where the `sbom-config` was loaded from this run.
	 *
	 * `"input"` = the `sbom-config` action input was non-empty;
	 * `"local"` = `.github/silk-release.json[c]` matched;
	 * `"variable"` = the `SILK_RELEASE_SBOM_TEMPLATE` env var was set;
	 * `"none"` = no source supplied a config.
	 *
	 * Surfaced on the SBOM Preview check-run summary so a reader can see at a
	 * glance which source the action chose — invaluable when the NTIA warning
	 * fires despite a template being passed in by the caller.
	 *
	 * `null` only for the early-return path (no released packages), where the
	 * config is never consulted.
	 */
	readonly sbomConfigSource: ConfigSource | null;
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

/**
 * A build — a unique target directory of a released package and the registry
 * targets that share it.
 */
interface Build {
	/**
	 * Package-relative build directory (e.g. `dist/npm`) — the value carried
	 * into `PackageBuildResult.directory` and the `ValidationOutput`, and
	 * rendered verbatim in the comment.
	 */
	readonly directory: string;
	/**
	 * Resolved absolute path to the build directory — used for filesystem
	 * operations (the dry-run child process `cwd`, reading `package.json`).
	 */
	readonly absoluteDirectory: string;
	/** The resolved publish targets that publish from this directory. */
	readonly targets: ReadonlyArray<PublishTarget>;
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
 * Resolve a publish target's directory to an absolute filesystem path.
 *
 * `PublishabilityDetector` may return a package-relative `directory`; the
 * dry-run child process' `cwd` and the SBOM `package.json` read both need an
 * absolute path that exists on disk.
 */
function resolveTargetDir(pkg: WorkspacePackage, target: PublishTarget): string {
	return isAbsolute(target.directory) ? target.directory : join(pkg.path, target.directory);
}

/**
 * Reduce a publish target's directory to the package-relative form
 * (e.g. `dist/npm`) — the value that flows into `ValidationOutput` and the
 * rendered comment. An already-relative `target.directory` is kept as-is;
 * an absolute one is relativised against the package root.
 */
function packageRelativeTargetDir(pkg: WorkspacePackage, target: PublishTarget): string {
	return isAbsolute(target.directory) ? relative(pkg.path, target.directory) : target.directory;
}

/**
 * Group a package's resolved publish targets into builds — one per unique
 * target directory.
 *
 * The dedup map is keyed by the resolved **absolute** path (the identity of
 * the directory on disk); each {@link Build} carries both the package-relative
 * directory (for the output) and the absolute path (for filesystem ops).
 * Discovery order of the first target seen for each directory is preserved.
 */
function groupTargetsIntoBuilds(pkg: WorkspacePackage, targets: ReadonlyArray<PublishTarget>): ReadonlyArray<Build> {
	const byDirectory = new Map<string, { directory: string; absoluteDirectory: string; targets: PublishTarget[] }>();
	for (const target of targets) {
		const absoluteDirectory = resolveTargetDir(pkg, target);
		const existing = byDirectory.get(absoluteDirectory);
		if (existing === undefined) {
			byDirectory.set(absoluteDirectory, {
				directory: packageRelativeTargetDir(pkg, target),
				absoluteDirectory,
				targets: [target],
			});
		} else {
			existing.targets.push(target);
		}
	}
	return Array.from(byDirectory.values());
}

/**
 * Read the runtime dependencies of a built package from `dist/<dir>/package.json`.
 *
 * The built artifact's `package.json` is the one that actually ships, so its
 * `dependencies` are the BOM's components — not the workspace-source
 * `pkg.dependencies` (which carry workspace protocol refs and devDependencies
 * are absent from both).
 *
 * A missing or unreadable `package.json`, or one with no `dependencies`,
 * yields an empty list (a dependency-free package has a component-less BOM).
 */
function readBuiltDependencies(buildDirectory: string): ReadonlyArray<ResolvedDependency> {
	const pkgJsonPath = join(buildDirectory, "package.json");
	if (!existsSync(pkgJsonPath)) {
		return [];
	}
	try {
		const parsed = JSON.parse(readFileSync(pkgJsonPath, "utf-8")) as { dependencies?: Record<string, unknown> };
		const deps = parsed.dependencies;
		// The cast above does not reflect runtime: `JSON.parse` of a literal
		// `"dependencies": null` yields a real `null`, and `typeof null` is
		// `"object"` — so the explicit `null` check is what rejects it, not the
		// `typeof` clause.
		if (deps === undefined || deps === null || typeof deps !== "object") {
			return [];
		}
		return Object.entries(deps)
			.filter((entry): entry is [string, string] => typeof entry[1] === "string")
			.map(([name, version]) => ({ name, version }));
	} catch {
		return [];
	}
}

/**
 * The `supplier` / `authors` fields of {@link SbomInput} derived from a
 * resolved `sbom-config` metadata template.
 */
interface SbomMetadataInput {
	readonly supplier?: SbomInput["supplier"];
	readonly authors?: SbomInput["authors"];
}

/**
 * Map the resolved `sbom-config` metadata into the `supplier` / `authors`
 * shape that `Sbom.generate` threads onto the emitted BOM's
 * `metadata.supplier` / `metadata.authors`.
 *
 * @remarks
 * `Sbom.generate` now carries this metadata into the BOM it actually produces
 * (and ships), so `validateNTIACompliance` runs against the real artifact — no
 * post-serialization document mutation. An absent supplier name or author
 * yields `undefined` for that field (NTIA then genuinely warns).
 */
function toSbomMetadataInput(metadata: ResolvedSBOMMetadata): SbomMetadataInput {
	// `exactOptionalPropertyTypes` on the library types forbids explicit
	// `undefined` — each field is spread in only when it has a value.
	let supplier: SbomMetadataInput["supplier"];
	if (metadata.supplier?.name !== undefined && metadata.supplier.name !== "") {
		const contact = metadata.supplier.contact?.map((c) => ({
			...(c.name !== undefined && { name: c.name }),
			...(c.email !== undefined && { email: c.email }),
			...(c.phone !== undefined && { phone: c.phone }),
		}));
		supplier = {
			name: metadata.supplier.name,
			...(metadata.supplier.url !== undefined && { url: metadata.supplier.url }),
			...(contact !== undefined && { contact }),
		};
	}

	const authors: SbomMetadataInput["authors"] =
		metadata.author !== undefined && metadata.author !== "" ? [{ name: metadata.author }] : undefined;

	return {
		...(supplier !== undefined && { supplier }),
		...(authors !== undefined && { authors }),
	};
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
	// We deliberately do NOT filter out root workspaces here. In a typical
	// monorepo the root is a private orchestrator whose version never changes,
	// so it falls through the version-diff check naturally (currentVersion ===
	// baseVersion). In a single-root-workspace repo like `github-action-builder`
	// (pnpm-workspace.yaml `packages: [.]`), the root IS the publishable
	// package — filtering it out here would silently drop the only thing the
	// action is supposed to release. Downstream `resolvePublishableTargets`
	// handles the "private root without publishConfig" case correctly by
	// returning an empty target list, which validation then emits as a
	// version-only package entry.
	Effect.all(
		workspacePackages.map((pkg) => {
			// The relative path to package.json from the repo root, used for
			// `git show <branch>:<path>`. WorkspacePackage.relativePath is the
			// workspace-relative path from the root: `""` for the legacy "no
			// relative path" shape, `"."` for the canonical root workspace
			// (pnpm-workspace.yaml `packages: [.]`), or a nested path like
			// `"packages/alpha"`. Normalise the root shapes to an empty
			// string so the git ref path is the canonical `package.json`
			// rather than the non-canonical `./package.json` git rejects on
			// some platforms.
			const rel = pkg.relativePath === "." ? "" : pkg.relativePath;
			const relPkgJsonPath = rel !== "" ? `${rel}/package.json` : "package.json";

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
 * generation. Each released package's resolved targets are grouped by build
 * directory; per build a single dry-run determines the pack sizes and a single
 * SBOM is generated (with `sbom-config` metadata applied). Per-registry publish
 * readiness stays per target. Does NOT handle build validation, check-run
 * creation, or sticky-comment updates — those remain in the `main.ts` handler.
 *
 * The returned effect fails with {@link ValidationError} when a fatal error
 * is encountered (e.g., workspace discovery fails). Non-fatal errors per
 * build (dry-run failures, SBOM issues) are collected and reflected in the
 * returned `ValidationReport` rather than causing the effect to fail.
 *
 * @public
 */
export const runValidation = (args: ValidationInputArgs) =>
	Effect.gen(function* () {
		const logger = yield* ActionLogger;
		const discovery = yield* WorkspaceDiscovery;
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

		// ── Resolve the SBOM metadata template once ──────────────────────────
		// `loadSBOMConfig` looks up `.github/silk-release.json`, then the
		// `sbom-config` action input (read via `Config.string("sbom-config")`
		// under the ambient `ActionsConfigProvider`, which uses the canonical
		// GitHub Actions env-var convention `INPUT_SBOM-CONFIG` — hyphens
		// preserved, only spaces mapped to underscores), then the
		// `SILK_RELEASE_SBOM_TEMPLATE` variable. Each candidate is decoded
		// through the `SilkReleaseConfig` Effect Schema; a decode failure
		// returns `{ ok: false, error }` so the SBOM step can record a warning
		// finding and proceed with an empty resolved metadata (preserving the
		// "continue on bad template" behaviour of the prior cast).
		const sbomConfigResult = yield* loadSBOMConfig().pipe(
			Effect.catchAllDefect((e) => {
				const message = e instanceof Error ? e.message : String(e);
				return Effect.succeed({ ok: false as const, error: message, source: { source: "none" as const } });
			}),
		);

		let sbomConfig: SBOMMetadataConfig | undefined;
		const sbomConfigFindings: ValidationFinding[] = [];
		if (sbomConfigResult.ok) {
			sbomConfig = sbomConfigResult.config;
		} else {
			sbomConfig = undefined;
			sbomConfigFindings.push({
				severity: "warning",
				check: "SBOM Preview",
				scope: null,
				message: `Failed to parse sbom-config: ${sbomConfigResult.error}`,
			});
			yield* Effect.logWarning(`sbom-config decode failed: ${sbomConfigResult.error}`);
		}

		// ── Step 1: Discover workspace packages ──────────────────────────────

		yield* Effect.logDebug("runValidation: discovering workspace packages");
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

		yield* Effect.logDebug("runValidation: detecting released packages via version diff");
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

		yield* Effect.logDebug(`runValidation: ${releasedPackages.length} package(s) to validate`);

		if (releasedPackages.length === 0) {
			yield* Effect.logDebug("runValidation: no packages to validate");
			// A release branch with zero version diffs against the target branch
			// is a valid-but-suspicious state. Three causes are possible: the
			// release has already merged into the target branch (benign), Phase 1
			// did not commit the expected version bumps (an upstream bug worth
			// surfacing), or workspace discovery is misconfigured. Emit a
			// warning finding so the LLM reviewer and the sticky comment surface
			// the situation — the run still succeeds.
			const noPackagesWarning: ValidationFinding = {
				severity: "warning",
				check: "Publish Validation",
				scope: null,
				message:
					"No packages have version differences against the target branch. " +
					"This is benign if the release has already merged into the target branch. " +
					"Otherwise, investigate Phase 1: the version-bump commit may be missing, " +
					"or workspace discovery may be misconfigured.",
			};
			return {
				publishOk: true,
				npmReady: true,
				githubPackagesReady: true,
				totalTargets: 0,
				readyTargets: 0,
				hasVersionOnlyPackages: false,
				packages: [],
				validationPackages: [],
				sbomOk: true,
				sbomSummary: "No packages require SBOM",
				findings: [...sbomConfigFindings, noPackagesWarning],
				resolvedSbomConfig: new Map<string, ResolvedSBOMMetadata>(),
				sbomConfigSource: sbomConfigResult.source,
			} satisfies ValidationReport;
		}

		// Structured findings accumulated across the publish dry-run and SBOM
		// steps. Errors fail their check; warnings are advisory. Discovery order
		// is preserved (the comment renderer reorders errors-before-warnings).
		// Seeded with any sbom-config decode warning so the SBOM Preview check
		// surfaces a malformed template up-front.
		const findings: ValidationFinding[] = [...sbomConfigFindings];

		// ── Step 3: Resolve targets, group into builds, dry-run + SBOM ────────

		yield* Effect.logDebug("runValidation: resolving publish targets, grouping into builds");

		// Per-package changeset counts read from the target branch's `.changeset`
		// directory (still present there — Phase 1 consumed them only on the
		// release branch). Best-effort: an empty map on any failure.
		const changesetCounts = yield* countChangesetsPerPackage(runner, args.targetBranch);

		const workspaceRoot = process.cwd();
		const validationPackages: ValidationPackageResult[] = [];
		// Per-build resolved SBOM metadata, keyed by `${pkg.name}:${build.directory}`.
		// Debug-only — fed into the SBOM Preview check-run summary by `main.ts`.
		const resolvedSbomConfig = new Map<string, ResolvedSBOMMetadata>();
		let allPublishOk = true;
		let npmReadyAll = true;
		let githubPackagesReadyAll = true;
		let totalTargets = 0;
		let readyTargets = 0;
		let sbomOk = true;
		let sbomCount = 0;
		let sbomSuccess = 0;

		for (const { pkg, baseVersion } of releasedPackages) {
			// Resolve publish targets, then drop any whose built `package.json` is
			// `private` — validation only exercises what will actually be published.
			const targets = yield* resolvePublishableTargets(pkg, workspaceRoot);

			// Read the CHANGELOG.md `changeset version` already wrote — the
			// release branch carries the per-version section. The extractor
			// takes the body of the first H2 (always the newest entry); a
			// version-only package still has a CHANGELOG, same rule applies.
			const releaseNotes = extractReleaseNotes(pkg.path);

			if (targets.length === 0) {
				yield* Effect.logDebug(`${pkg.name}: no publish targets (version-only)`);
				validationPackages.push({
					name: pkg.name,
					version: pkg.version,
					baseVersion,
					changesetCount: changesetCounts.get(pkg.name) ?? null,
					builds: [],
					releaseNotes,
				});
				continue;
			}

			// Group the resolved targets by build directory — one build per unique
			// directory. Targets sharing a directory share one tarball and one SBOM.
			const builds = groupTargetsIntoBuilds(pkg, targets);
			const buildResults: PackageBuildResult[] = [];

			for (const build of builds) {
				const distDir = basename(build.directory);

				// ── Per-build dry-run (one per directory) ──────────────────────
				// The tarball is a property of the directory: identical across the
				// registries publishing it. Run the dry-run once; the first target's
				// access/provenance drive the npm-pack invocation (pack output is the
				// same regardless). Per-registry publish readiness is decided below.
				const sizingTarget = build.targets[0];

				const dryRunOutcome = yield* logger.group(
					`Dry-run · ${pkg.name} · ${distDir}`,
					Effect.gen(function* () {
						yield* Effect.logDebug(`cwd: ${build.absoluteDirectory}`);

						// Set up auth for the sizing target's registry before the dry-run.
						if (sizingTarget !== undefined) {
							const token = pickToken(sizingTarget.registry, npmToken, ghPkgsToken);
							if (token !== null) {
								yield* publish
									.setupAuth(sizingTarget.registry, token)
									.pipe(
										Effect.catchAll((e: PackagePublishError) =>
											Effect.logWarning(`setupAuth failed for ${sizingTarget.registry}: ${e.message}`),
										),
									);
							}
						}

						yield* Effect.logDebug(`npm publish --dry-run in ${build.absoluteDirectory}`);

						return yield* publish
							.dryRun(build.absoluteDirectory, {
								registry: sizingTarget?.registry ?? "https://registry.npmjs.org/",
								access: sizingTarget?.access ?? "public",
								provenance: sizingTarget?.provenance ?? false,
							})
							.pipe(
								Effect.map((dryRunResult) => ({
									success: dryRunResult.ok,
									output: dryRunResult.output,
									packedSize: dryRunResult.packedSize,
									unpackedSize: dryRunResult.unpackedSize,
									fileCount: dryRunResult.fileCount,
								})),
								Effect.catchAll((e: PackagePublishError) =>
									Effect.succeed({
										success: false as const,
										output: e.message,
										packedSize: undefined,
										unpackedSize: undefined,
										fileCount: undefined,
									}),
								),
								Effect.tap((result) =>
									result.success
										? Effect.logInfo(
												result.fileCount !== undefined
													? `✅ dry-run passed — ${result.fileCount} file(s)`
													: "✅ dry-run passed",
											)
										: Effect.logWarning(`dry-run failed for ${pkg.name} · ${distDir}: ${result.output}`),
								),
							);
					}),
				);

				// ── Per-registry publish readiness ─────────────────────────────
				const targetResults: BuildTargetResult[] = [];
				for (const target of build.targets) {
					totalTargets++;
					const targetIsNpm = isNpmRegistry(target.registry);
					const targetIsGhPkgs = isGitHubPackagesRegistry(target.registry);

					if (dryRunOutcome.success) {
						readyTargets++;
						targetResults.push({
							registry: target.registry,
							status: "ready",
							access: target.access,
							provenance: target.provenance,
						});
					} else {
						allPublishOk = false;
						if (targetIsNpm) npmReadyAll = false;
						if (targetIsGhPkgs) githubPackagesReadyAll = false;
						const detail = (dryRunOutcome.output ?? "").trim() || "unknown error";
						targetResults.push({
							registry: target.registry,
							status: "failed",
							access: target.access,
							provenance: target.provenance,
							error: detail,
						});
						findings.push({
							severity: "error",
							check: "Publish Validation",
							scope: { package: pkg.name, directory: build.directory },
							message: `dry-run failed: ${detail}`,
						});
					}
				}

				// ── Per-build SBOM (one per directory) ─────────────────────────
				// Dependencies come from the built `dist/<dir>/package.json` — the
				// artifact that actually ships. The resolved `sbom-config` metadata
				// (merged with package.json-inferred defaults) is passed to
				// `Sbom.generate` so the emitted BOM genuinely carries supplier and
				// author — NTIA then validates the real shipped artifact.
				sbomCount++;
				const dependencies = readBuiltDependencies(build.absoluteDirectory);
				const resolved = resolveSBOMMetadata(inferSBOMMetadata(build.absoluteDirectory), sbomConfig);
				resolvedSbomConfig.set(`${pkg.name}:${build.directory}`, resolved);
				const sbomMetadata = toSbomMetadataInput(resolved);

				const sbomOutcome = yield* logger.group(
					`SBOM · ${pkg.name} · ${distDir}`,
					Effect.gen(function* () {
						yield* Effect.logDebug(
							`workspace package: ${pkg.name}@${pkg.version} · dist-dir: ${distDir} · ${dependencies.length} dep(s)`,
						);

						return yield* sbomSvc
							.generate({
								rootName: pkg.name,
								rootVersion: pkg.version,
								dependencies,
								...(sbomMetadata.supplier !== undefined && { supplier: sbomMetadata.supplier }),
								...(sbomMetadata.authors !== undefined && { authors: sbomMetadata.authors }),
							})
							.pipe(
								Effect.flatMap((bom) =>
									Effect.gen(function* () {
										const bomJson = yield* sbomSvc.serializeJson(bom);
										yield* Effect.logDebug(`generated CycloneDX BOM:\n${bomJson}`);
										yield* Effect.logInfo("✅ SBOM generated");

										// The CycloneDX `Bom` model is a class instance, not the
										// plain `EnhancedCycloneDXDocument` the NTIA validator
										// reads. Parse the canonical CycloneDX JSON form (the BOM
										// `Sbom.generate` actually produced, metadata included)
										// into the plain document shape.
										let document: EnhancedCycloneDXDocument | null = null;
										try {
											document = JSON.parse(bomJson) as EnhancedCycloneDXDocument;
										} catch {
											document = null;
										}

										const sbomFindings: ValidationFinding[] = [];
										let sbom: BuildSbom | null = null;

										if (document !== null) {
											const ntia = validateNTIACompliance(document);
											const missing = ntia.fields.filter((f) => !f.passed).map((f) => f.name);
											const componentCount = document.components?.length ?? 0;

											if (!ntia.compliant) {
												sbomFindings.push({
													severity: "warning",
													check: "SBOM Preview",
													scope: { package: pkg.name, directory: build.directory },
													message: `SBOM generated but missing NTIA fields: ${missing.join(", ")}`,
												});
											}
											// A dependency-free package legitimately has a
											// component-less BOM — that is not a finding.

											sbom = {
												componentCount,
												ntiaCompliant: ntia.compliant,
												missingNtiaFields: missing,
											};
										}

										return { ok: true as const, sbom, findings: sbomFindings };
									}),
								),
								Effect.catchAll((e: SbomError) =>
									Effect.gen(function* () {
										yield* Effect.logWarning(`SBOM generation failed for ${pkg.name} · ${distDir}: ${e.message}`);
										return {
											ok: false as const,
											sbom: null as BuildSbom | null,
											findings: [
												{
													severity: "error" as const,
													check: "SBOM Preview",
													scope: { package: pkg.name, directory: build.directory },
													message: `SBOM generation failed: ${e.message}`,
												} satisfies ValidationFinding,
											],
										};
									}),
								),
							);
					}),
				);

				findings.push(...sbomOutcome.findings);
				if (sbomOutcome.ok) {
					sbomSuccess++;
				} else {
					sbomOk = false;
				}

				buildResults.push({
					directory: build.directory,
					packedBytes: dryRunOutcome.packedSize ?? null,
					unpackedBytes: dryRunOutcome.unpackedSize ?? null,
					fileCount: dryRunOutcome.fileCount ?? null,
					sbom: sbomOutcome.sbom,
					targets: targetResults,
				});
			}

			validationPackages.push({
				name: pkg.name,
				version: pkg.version,
				baseVersion,
				changesetCount: changesetCounts.get(pkg.name) ?? null,
				builds: buildResults,
				releaseNotes,
			});
		}

		const sbomSummary =
			sbomCount === 0
				? "No packages require SBOM"
				: sbomOk
					? `${sbomCount} SBOM(s) generated successfully`
					: `${sbomSuccess}/${sbomCount} SBOM(s) generated`;

		// ── Step 4: Assemble ValidationReport ────────────────────────────────
		// The report is build-centric — `validationPackages` carries the builds,
		// sizes, SBOMs, and registry targets. `main.ts` projects them into the
		// canonical `ValidationOutput` and renders the comment from that object;
		// this module no longer pre-renders markdown.

		const hasVersionOnlyPackages = totalTargets === 0 && validationPackages.length > 0;

		const reportPackages = validationPackages.map((p) => ({
			name: p.name,
			version: p.version,
			ready: p.builds.length === 0 || p.builds.every((b) => b.targets.every((t) => t.status !== "failed")),
		}));

		return {
			publishOk: allPublishOk,
			npmReady: npmReadyAll,
			githubPackagesReady: githubPackagesReadyAll,
			totalTargets,
			readyTargets,
			hasVersionOnlyPackages,
			packages: reportPackages,
			validationPackages,
			sbomOk,
			sbomSummary,
			findings,
			resolvedSbomConfig,
			sbomConfigSource: sbomConfigResult.source,
		} satisfies ValidationReport;
	});
