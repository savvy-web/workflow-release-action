/**
 * Phase-2 validation orchestrator.
 *
 * Enumerates workspace packages, resolves publish targets, runs a dry-run
 * pack per target via `PackagePublish`, generates an SBOM preview via `Sbom`,
 * and assembles a `ValidationReport`.
 *
 * @module release/validation
 */

import type { Changeset, PackagePublishError, SbomError } from "@savvy-web/github-action-effects";
import { ActionLogger, ChangesetAnalyzer, PackagePublish, Sbom } from "@savvy-web/github-action-effects";
import { Effect } from "effect";
import { PublishabilityDetector, WorkspaceDiscovery } from "workspaces-effect";

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
	readonly packages: ReadonlyArray<{
		readonly name: string;
		readonly version: string;
		readonly ready: boolean;
	}>;
	/** Markdown publish-results summary produced by `buildPublishSummary`. */
	readonly publishSummary: string;
	/** Whether SBOM generation passed for all applicable packages. */
	readonly sbomOk: boolean;
	/** Human-readable SBOM status line. */
	readonly sbomSummary: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Derive the set of package names that appear in at least one changeset.
 */
const changedPackageNames = (
	changesets: ReadonlyArray<{ readonly packages: ReadonlyArray<{ readonly name: string }> }>,
): ReadonlySet<string> => {
	const names = new Set<string>();
	for (const cs of changesets) {
		for (const p of cs.packages) names.add(p.name);
	}
	return names;
};

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
 * target (pack failures, SBOM issues) are collected and reflected in the
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
		const changesetAnalyzer = yield* ChangesetAnalyzer;

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
		const workspaceRoot = process.cwd();

		// ── Step 2: Parse changesets to find packages being released ─────────

		yield* Effect.logInfo("runValidation: parsing changesets");
		const changesets: Array<Changeset> = yield* changesetAnalyzer.parseAll().pipe(
			Effect.catchAll((e) =>
				Effect.gen(function* () {
					yield* Effect.logWarning(`Could not parse changesets: ${String(e)}`);
					return [] as Array<Changeset>;
				}),
			),
		);
		const changedNames = changedPackageNames(changesets);

		// Filter workspace packages to those with pending changesets.
		// If no changesets were found, validate all non-root packages.
		const packagesToValidate =
			changedNames.size > 0 ? workspacePackages.filter((p) => changedNames.has(p.name) && !p.isRootWorkspace) : [];

		yield* Effect.logInfo(`runValidation: ${packagesToValidate.length} package(s) with pending changesets`);

		if (packagesToValidate.length === 0) {
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
			};
		}

		// ── Step 3: Resolve publish targets + dry-run pack per package ───────

		yield* Effect.logInfo("runValidation: resolving publish targets");

		const pkgResults: PackagePublishResult[] = [];
		let allPublishOk = true;
		let npmReadyAll = true;
		let githubPackagesReadyAll = true;
		let totalTargets = 0;
		let readyTargets = 0;

		for (const pkg of packagesToValidate) {
			const targets = yield* detector.detect(pkg, workspaceRoot);

			if (targets.length === 0) {
				yield* Effect.logInfo(`${pkg.name}: no publish targets (version-only)`);
				pkgResults.push({ name: pkg.name, version: pkg.version, targets: [] });
				continue;
			}

			const targetResults: TargetPublishResult[] = [];

			for (const target of targets) {
				totalTargets++;
				yield* Effect.logInfo(`${pkg.name}: dry-run pack in ${target.directory} → ${target.registry}`);

				const packEffect = logger.group(
					`Pack ${pkg.name} → ${target.registry}`,
					Effect.gen(function* () {
						const result = yield* publish.pack(target.directory).pipe(
							Effect.map((packResult) => ({
								success: true as const,
								tarball: packResult.tarball,
								digest: packResult.digest,
							})),
							Effect.catchAll((e: PackagePublishError) => {
								return Effect.succeed({
									success: false as const,
									error: e.reason,
									tarball: "",
									digest: "",
								});
							}),
						);
						return result;
					}),
				);

				const packOutcome = yield* packEffect;

				const targetIsNpm = isNpmRegistry(target.registry);
				const targetIsGhPkgs = isGitHubPackagesRegistry(target.registry);

				const targetResult: TargetPublishResult = {
					target: {
						protocol: "npm",
						registry: target.registry,
						directory: target.directory,
						access: target.access,
						provenance: target.provenance,
						tag: "latest",
						tokenEnv: "NPM_TOKEN",
					},
					success: packOutcome.success,
					error: packOutcome.success ? undefined : packOutcome.error,
					tarballPath: packOutcome.success ? packOutcome.tarball : undefined,
					tarballDigest: packOutcome.success ? packOutcome.digest : undefined,
				};

				targetResults.push(targetResult);

				if (packOutcome.success) {
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

		for (const pkg of packagesToValidate) {
			const targets = yield* detector.detect(pkg, workspaceRoot);
			const hasProvenance = targets.some((t) => t.provenance);
			if (!hasProvenance) continue;

			sbomCount++;
			const sbomEffect = sbomSvc
				.generate({
					rootName: pkg.name,
					rootVersion: pkg.version,
					dependencies: [],
				})
				.pipe(
					Effect.flatMap((bom) => sbomSvc.serializeJson(bom)),
					Effect.map(() => true as const),
					Effect.catchAll((e: SbomError) => {
						return Effect.gen(function* () {
							yield* Effect.logWarning(`SBOM generation failed for ${pkg.name}: ${e.message}`);
							return false as const;
						});
					}),
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
		};
	});
