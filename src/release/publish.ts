/**
 * Phase-3 publish orchestrator.
 *
 * Detects released packages from a merged PR or commit diff, resolves publish
 * targets via `PublishabilityDetector`, orders them topologically, builds the
 * workspace, and publishes each package to each configured registry —
 * accumulating errors per package so one failure does not abort the batch.
 *
 * @module release/publish
 */

import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import type {
	AttestError,
	CommandRunnerError,
	PackagePublishError,
	PullRequestError,
	ResolvedDependency,
	SbomError,
} from "@savvy-web/github-action-effects";
import {
	ActionLogger,
	ActionState,
	Attest,
	CommandRunner,
	ErrorAccumulator,
	GitHubCommit,
	GitHubContent,
	NpmRegistry,
	OidcTokenIssuer,
	PackagePublish,
	PullRequest,
	Sbom,
	buildSLSAProvenancePredicate,
	decodeJwtClaims,
	isGitHubPackagesRegistry,
	isNpmRegistry,
} from "@savvy-web/github-action-effects";
import { Config, Effect, Option, Redacted } from "effect";
import { PublishabilityDetector, TopologicalSorter, WorkspaceDiscovery, WorkspacePackage } from "workspaces-effect";

import { GithubPackagesTokenState, STATE_KEYS } from "../state.js";
import { isTargetPrivate } from "./resolve-targets.js";
import type { PackagePublishResult, PublishPackagesResult, TargetPublishResult } from "./types.js";

// ─── Public interfaces ────────────────────────────────────────────────────────

/**
 * Input arguments for the Phase-3 publish flow ({@link detectReleases},
 * {@link runBuildAndSbom}, {@link runPublishTargets}).
 *
 * @public
 */
export interface PublishInputArgs {
	readonly packageManager: string;
	readonly targetBranch: string;
	readonly dryRun: boolean;
	readonly mergedReleasePRNumber: number | undefined;
}

// ─── Internal types ───────────────────────────────────────────────────────────

/**
 * A detected release (name + version + source path).
 *
 * @public
 */
export interface DetectedRelease {
	readonly name: string;
	readonly version: string;
	readonly path: string;
}

/** Resolved target shape used internally (subset of the legacy ResolvedTarget). */
interface TargetSpec {
	readonly registry: string;
	readonly directory: string;
	readonly access: "public" | "restricted";
	readonly provenance: boolean;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Classify a registry URL and return the resolved token for it.
 *
 * Resolution:
 *  - npm public registry  → resolved npm token (from `Config` via caller)
 *  - GitHub Packages      → resolved GitHub Packages token (from `ActionState` via caller)
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
 * Infer the semver bump type from old/new version strings.
 *
 * @param oldVersion - The previous version string (e.g. `1.2.3`).
 * @param newVersion - The new version string (e.g. `1.3.0`).
 * @returns The bump type, or `"unknown"` when either version is not a
 *   three-part semver string.
 *
 * @public
 */
export function inferBumpType(oldVersion: string, newVersion: string): "major" | "minor" | "patch" | "unknown" {
	const oldParts = oldVersion.split(".").map(Number);
	const newParts = newVersion.split(".").map(Number);
	if (oldParts.length < 3 || newParts.length < 3) return "unknown";
	if ((newParts[0] ?? 0) > (oldParts[0] ?? 0)) return "major";
	if (newParts[0] === oldParts[0] && (newParts[1] ?? 0) > (oldParts[1] ?? 0)) return "minor";
	return "patch";
}

// ─── Detection helpers ────────────────────────────────────────────────────────

/**
 * Detect released packages from the merged PR's file diff.
 *
 * Ports `detectReleasedPackagesFromPR`. Reads the current `package.json` from
 * disk (it exists on the filesystem after the merge) and fetches the
 * base-branch version via the `GitHubContent` service.
 */
const detectFromPR = (
	prNumber: number,
): Effect.Effect<ReadonlyArray<DetectedRelease>, never, GitHubContent | PullRequest> =>
	Effect.gen(function* () {
		const pr = yield* PullRequest;
		const content = yield* GitHubContent;

		// List files changed in the merged PR
		const files = yield* pr.listFiles(prNumber).pipe(Effect.catchAll((_: PullRequestError) => Effect.succeed([])));

		// Filter to package.json files that were modified
		const modifiedPkgJsonFiles = files.filter(
			(f) => f.filename.endsWith("package.json") && (f.status === "modified" || f.status === "changed"),
		);

		// Also include the root package.json if modified
		const rootPkgJson = files.find((f) => f.filename === "package.json" && f.status === "modified");
		const allPkgJsonFiles = rootPkgJson
			? [rootPkgJson, ...modifiedPkgJsonFiles.filter((f) => f.filename !== "package.json")]
			: modifiedPkgJsonFiles;

		if (allPkgJsonFiles.length === 0) return [];

		// Get the base SHA from the PR
		const prData = yield* pr
			.get(prNumber)
			.pipe(Effect.catchAll((_: PullRequestError) => Effect.succeed({ baseSha: "" } as { baseSha?: string })));

		const baseSha = prData.baseSha ?? "";
		const releases: DetectedRelease[] = [];

		for (const file of allPkgJsonFiles) {
			const fullPath = join(process.cwd(), file.filename);
			if (!existsSync(fullPath)) continue;

			let currentContent: { name?: string; version?: string };
			try {
				currentContent = JSON.parse(readFileSync(fullPath, "utf-8")) as { name?: string; version?: string };
			} catch {
				continue;
			}

			const newVersion = currentContent.version ?? "0.0.0";
			let oldVersion = "0.0.0";

			if (baseSha) {
				const oldContent = yield* content
					.getFile(file.filename, baseSha)
					.pipe(Effect.catchAll(() => Effect.succeed("")));
				if (oldContent) {
					try {
						const oldPkg = JSON.parse(oldContent) as { version?: string };
						oldVersion = oldPkg.version ?? "0.0.0";
					} catch {
						// keep oldVersion
					}
				}
			}

			if (oldVersion === newVersion) continue;

			const packageDir = dirname(file.filename);
			const pkgPath = packageDir === "." ? process.cwd() : join(process.cwd(), packageDir);

			const bumpType = inferBumpType(oldVersion, newVersion);
			yield* Effect.logInfo(`  ${currentContent.name}: ${oldVersion} → ${newVersion} (${bumpType})`);

			releases.push({
				name: currentContent.name ?? packageDir,
				version: newVersion,
				path: pkgPath,
			});
		}

		return releases;
	}).pipe(Effect.catchAll(() => Effect.succeed([] as ReadonlyArray<DetectedRelease>)));

/**
 * Detect released packages by comparing HEAD with its first parent via the
 * GitHub compare API.
 *
 * Ports `detectReleasedPackagesFromCommit` using `GitHubCommit` for the
 * compare API and `GitHubContent` for the base-branch file read.
 */
const detectFromCommit = (): Effect.Effect<ReadonlyArray<DetectedRelease>, never, GitHubCommit | GitHubContent> =>
	Effect.gen(function* () {
		const commits = yield* GitHubCommit;
		const content = yield* GitHubContent;

		const sha = process.env.GITHUB_SHA ?? "";
		if (!sha) return [];

		const commitData = yield* commits
			.get(sha)
			.pipe(Effect.catchAll(() => Effect.succeed({ parents: [] as ReadonlyArray<{ sha: string }> })));

		const parents = commitData.parents;
		if (parents.length === 0) return [];

		const baseSha = parents[0]?.sha ?? "";

		const comparison = yield* commits
			.compare(baseSha, sha)
			.pipe(
				Effect.catchAll(() =>
					Effect.succeed({ commits: [], files: [] as ReadonlyArray<{ filename: string; status: string }> }),
				),
			);

		const modifiedPkgJsonFiles = comparison.files.filter(
			(f) => f.filename.endsWith("package.json") && (f.status === "modified" || f.status === "changed"),
		);

		if (modifiedPkgJsonFiles.length === 0) return [];

		const releases: DetectedRelease[] = [];

		for (const file of modifiedPkgJsonFiles) {
			const fullPath = join(process.cwd(), file.filename);
			if (!existsSync(fullPath)) continue;

			let currentContent: { name?: string; version?: string };
			try {
				currentContent = JSON.parse(readFileSync(fullPath, "utf-8")) as { name?: string; version?: string };
			} catch {
				continue;
			}

			const newVersion = currentContent.version ?? "0.0.0";
			let oldVersion = "0.0.0";

			const oldContent = yield* content.getFile(file.filename, baseSha).pipe(Effect.catchAll(() => Effect.succeed("")));
			if (oldContent) {
				try {
					const oldPkg = JSON.parse(oldContent) as { version?: string };
					oldVersion = oldPkg.version ?? "0.0.0";
				} catch {
					// keep oldVersion
				}
			}

			if (oldVersion === newVersion) continue;

			const packageDir = dirname(file.filename);
			const pkgPath = packageDir === "." ? process.cwd() : join(process.cwd(), packageDir);

			releases.push({
				name: currentContent.name ?? packageDir,
				version: newVersion,
				path: pkgPath,
			});
		}

		return releases;
	}).pipe(Effect.catchAll(() => Effect.succeed([] as ReadonlyArray<DetectedRelease>)));

// ─── Per-target publish ───────────────────────────────────────────────────────

/**
 * Build a SLSA provenance predicate from the GitHub Actions OIDC token.
 *
 * Ports the `runProvenanceAttestation` predicate construction from
 * `attest-runner.ts`: obtains an OIDC token, decodes the JWT claims, and
 * builds the SLSA predicate from those claims.
 *
 * Failures are caught and yield `null`; the caller falls back to logging a
 * warning so attestation failures remain non-fatal.
 */
const buildProvenancePredicate = (): Effect.Effect<Record<string, unknown> | null, never, OidcTokenIssuer> =>
	Effect.gen(function* () {
		const issuer = yield* OidcTokenIssuer;
		const oidcToken = yield* issuer.getToken("sigstore");
		const claims = yield* decodeJwtClaims(Redacted.value(oidcToken));
		const predicate = yield* buildSLSAProvenancePredicate(claims);
		return predicate;
	}).pipe(
		Effect.catchAll((e: unknown) =>
			Effect.gen(function* () {
				yield* Effect.logWarning(
					`Failed to build SLSA provenance predicate: ${e instanceof Error ? e.message : String(e)}`,
				);
				return null;
			}),
		),
	);

/**
 * Publish a single package to a single target, returning a `TargetPublishResult`.
 *
 * JSR targets are skipped — they require a different publish path that is
 * outside the scope of this orchestrator. A warning is logged and the result
 * is recorded as skipped.
 *
 * For npm targets, the decision tree is:
 * 1. `PackagePublish.pack(target.directory)` → content digest.
 * 2. `NpmRegistry.getVersions(packageName)` to determine if the package has
 *    ever been published:
 *    - `NpmRegistryError` (E404 / not found) → first-publish path:
 *      `PackagePublish.setupAuth` then `PackagePublish.publish`.
 *    - Versions list returned → existing package → `PackagePublish.publishIdempotent`
 *      (handles already-published-identical skip and content-mismatch error).
 * 3. On a `"published"` outcome with `provenance: true`:
 *    `Attest.provenance` (with real SLSA predicate from OIDC) + `Attest.sbom`.
 *
 * All errors are caught at the target level and turned into a failed
 * `TargetPublishResult` so the caller can accumulate without aborting.
 */
const publishOneTarget = (
	packageName: string,
	version: string,
	target: TargetSpec,
	npmToken: string | null,
	ghPkgsToken: string | null,
) => {
	const legacyTarget = {
		protocol: "npm" as const,
		registry: target.registry,
		directory: target.directory,
		access: target.access,
		provenance: target.provenance,
		tag: "latest" as const,
		tokenEnv: null,
	};

	// Check for JSR registry — skip with a clear warning
	const isJsr = target.registry.toLowerCase().includes("jsr.io") || target.registry.toLowerCase().includes("jsr:");

	if (isJsr) {
		return Effect.gen(function* () {
			yield* Effect.logWarning(
				`runPublishTargets: skipping JSR target for ${packageName}@${version} — JSR publishing is not yet supported in this orchestrator`,
			);
			return {
				target: { ...legacyTarget, protocol: "jsr" as const },
				success: true,
				alreadyPublished: false,
				error: undefined,
				// Use a synthetic "skipped" marker in the alreadyPublished fields
				// so the caller can distinguish JSR skips from real publishes.
			} satisfies TargetPublishResult;
		}).pipe(Effect.map((r): TargetPublishResult => r));
	}

	return Effect.gen(function* () {
		const publishSvc = yield* PackagePublish;
		const registrySvc = yield* NpmRegistry;
		const attestSvc = yield* Attest;

		// Step 1: Pack to get digest.
		const packResult = yield* publishSvc.pack(target.directory);

		// Set up registry auth before the publish decision — both the
		// first-publish path and the existing-package `publishIdempotent`
		// path publish to the registry and need it authenticated.
		const token = pickToken(target.registry, npmToken, ghPkgsToken);
		if (token !== null) {
			yield* publishSvc
				.setupAuth(target.registry, token)
				.pipe(
					Effect.catchAll((e: PackagePublishError) =>
						Effect.logWarning(`setupAuth failed for ${target.registry}: ${e.message}`),
					),
				);
		}

		// Step 2: First-publish vs. existing-package decision.
		const versionsCheck = yield* registrySvc.getVersions(packageName).pipe(
			Effect.map((versions) => ({ exists: true as const, versions })),
			Effect.catchAll(() => Effect.succeed({ exists: false as const })),
		);

		let publishStatus: "published" | "skipped" = "published";
		let skipReason: "already-published-identical" | undefined;

		if (!versionsCheck.exists) {
			// First publish.
			yield* publishSvc.publish(target.directory, {
				registry: target.registry,
				access: target.access,
				provenance: target.provenance,
			});
		} else {
			// Existing package: delegate to publishIdempotent for version/integrity check.
			const idempotentResult = yield* publishSvc.publishIdempotent({
				packageDir: target.directory,
				packageName,
				version,
				digest: packResult.digest,
				options: {
					registry: target.registry,
					access: target.access,
					provenance: target.provenance,
				},
			});

			publishStatus = idempotentResult.status;
			skipReason = idempotentResult.skipReason;
		}

		// Step 3: Attestation for freshly published packages.
		let attestationUrl: string | undefined;
		let sbomAttestationUrl: string | undefined;

		if (publishStatus === "published" && target.provenance) {
			// Build real SLSA predicate from OIDC claims (ports attest-runner.ts).
			const predicate = yield* buildProvenancePredicate();

			if (predicate !== null) {
				// Provenance attestation (SLSA).
				const provenanceRecord = yield* attestSvc
					.provenance({
						subjectName: `pkg:npm/${packageName}@${version}`,
						subjectSha256: packResult.digest.replace(/^sha256:/i, ""),
						predicate,
					})
					.pipe(
						Effect.catchAll((e: AttestError) =>
							Effect.gen(function* () {
								yield* Effect.logWarning(`Provenance attestation failed for ${packageName}@${version}: ${e.message}`);
								return null;
							}),
						),
					);

				if (provenanceRecord !== null) {
					attestationUrl = provenanceRecord.attestationUrl;
				}
			} else {
				yield* Effect.logWarning(
					`Skipping provenance attestation for ${packageName}@${version}: could not obtain OIDC claims`,
				);
			}

			// SBOM attestation (CycloneDX).
			const sbomRecord = yield* attestSvc
				.sbom({
					rootName: packageName,
					rootVersion: version,
					dependencies: [],
					subjectSha256: packResult.digest.replace(/^sha256:/i, ""),
				})
				.pipe(
					Effect.catchAll((e) => {
						const msg = e instanceof Error ? e.message : String(e);
						return Effect.gen(function* () {
							yield* Effect.logWarning(`SBOM attestation failed for ${packageName}@${version}: ${msg}`);
							return null;
						});
					}),
				);

			if (sbomRecord !== null) {
				sbomAttestationUrl = sbomRecord.attestationUrl;
			}
		}

		yield* Effect.logInfo(publishStatus === "skipped" ? "⏭ already published — skipped" : "✅ published");

		return {
			target: legacyTarget,
			success: true,
			alreadyPublished: publishStatus === "skipped" ? true : undefined,
			alreadyPublishedReason: skipReason !== undefined ? ("identical" as const) : undefined,
			attestationUrl,
			sbomAttestationUrl,
			tarballDigest: packResult.digest,
		} satisfies TargetPublishResult;
	}).pipe(
		Effect.catchAll((e: unknown) =>
			Effect.gen(function* () {
				const message = e instanceof Error ? e.message : String(e);
				yield* Effect.logError(
					`runPublishTargets: publishing ${packageName}@${version} to ${target.registry} failed — ${message}`,
				);
				return {
					target: legacyTarget,
					success: false,
					error: message,
				} satisfies TargetPublishResult;
			}),
		),
		Effect.map((r): TargetPublishResult => r),
	);
};

// ─── detectReleases ────────────────────────────────────────────────────────────

/**
 * Detect the released / in-scope packages for a publish run — Step 1 of the
 * Phase-3 flow.
 *
 * Prefers the merged-PR file diff; falls back to the commit diff when a PR
 * number is absent or the PR diff yields nothing. Never fails — detection
 * errors yield an empty array.
 *
 * @public
 */
export const detectReleases = (
	args: PublishInputArgs,
): Effect.Effect<ReadonlyArray<DetectedRelease>, never, GitHubCommit | GitHubContent | PullRequest> =>
	Effect.gen(function* () {
		let detected: ReadonlyArray<DetectedRelease>;

		if (args.mergedReleasePRNumber !== undefined) {
			yield* Effect.logDebug(`detectReleases: detecting from PR #${args.mergedReleasePRNumber}`);
			detected = yield* detectFromPR(args.mergedReleasePRNumber);
			if (detected.length === 0) {
				yield* Effect.logDebug("detectReleases: PR detection returned nothing, falling back to commit diff");
				detected = yield* detectFromCommit();
			}
		} else {
			yield* Effect.logDebug("detectReleases: detecting from commit diff");
			detected = yield* detectFromCommit();
		}

		yield* Effect.logDebug(`detectReleases: ${detected.length} package(s) detected`);
		return detected;
	});

// ─── runBuildAndSbom ───────────────────────────────────────────────────────────

/**
 * Result of {@link runBuildAndSbom} — the Phase-3 Build & SBOM gate.
 *
 * @public
 */
export interface BuildSbomResult {
	/** True when `ci:build` succeeded and every package's SBOM generated. */
	readonly ok: boolean;
	/** `ci:build` stderr/output when the build failed. */
	readonly buildError?: string;
	/** Names of packages whose SBOM generation failed. */
	readonly sbomFailures: ReadonlyArray<string>;
	/** Number of in-scope packages. */
	readonly packageCount: number;
}

/**
 * Build all in-scope packages and generate each one's SBOM — Step 3 of the
 * Phase-3 flow and its fail-fast gate.
 *
 * Runs `ci:build` once, then `Sbom.generate` per package. The caller must
 * abort the phase (skip publish and releases) when `ok` is `false`.
 *
 * @public
 */
export const runBuildAndSbom = (detected: ReadonlyArray<DetectedRelease>, args: PublishInputArgs) =>
	Effect.gen(function* () {
		const runner = yield* CommandRunner;
		const discovery = yield* WorkspaceDiscovery;
		const sbomSvc = yield* Sbom;
		const logger = yield* ActionLogger;

		// ── Build (ci:build, once) ─────────────────────────────────────────────
		const buildArgs = args.packageManager === "npm" ? ["run", "ci:build"] : ["ci:build"];

		const buildResult = yield* logger.group(
			"Build",
			Effect.gen(function* () {
				yield* Effect.logDebug(`runBuildAndSbom: ${args.packageManager} ${buildArgs.join(" ")}`);
				const result = yield* runner.execCapture(args.packageManager, buildArgs).pipe(
					Effect.map((output) => ({
						success: true as const,
						error: undefined as string | undefined,
						output: output.stdout,
					})),
					Effect.catchAll((e: CommandRunnerError) =>
						Effect.succeed({ success: false as const, error: e.stderr ?? e.message, output: "" }),
					),
				);
				if (result.success) {
					yield* Effect.logDebug(result.output);
					yield* Effect.logInfo("✅ ci:build succeeded");
				} else {
					yield* Effect.logError(`ci:build failed — ${result.error}`);
				}
				return result;
			}),
		);

		if (!buildResult.success) {
			return {
				ok: false,
				buildError: buildResult.error,
				sbomFailures: [],
				packageCount: detected.length,
			} satisfies BuildSbomResult;
		}

		// ── SBOM generation (per package) ──────────────────────────────────────
		const sbomFailures: string[] = [];

		for (const rel of detected) {
			// Resolve the WorkspacePackage for its dependency map; synthesise a
			// minimal one if discovery fails (e.g. a deleted monorepo member).
			const wsPkg = yield* discovery.getPackage(rel.name).pipe(
				Effect.catchAll(() =>
					Effect.succeed(
						new WorkspacePackage({
							name: rel.name,
							version: rel.version,
							path: rel.path,
							packageJsonPath: join(rel.path, "package.json"),
							relativePath: "",
						}),
					),
				),
			);

			const dependencies: ResolvedDependency[] = Object.entries(wsPkg.dependencies).map(([name, version]) => ({
				name,
				version,
			}));

			const ok = yield* logger.group(
				`SBOM · ${rel.name}`,
				Effect.gen(function* () {
					yield* Effect.logDebug(`runBuildAndSbom: generating SBOM for ${rel.name}@${rel.version}`);
					return yield* sbomSvc.generate({ rootName: rel.name, rootVersion: rel.version, dependencies }).pipe(
						Effect.flatMap((bom) =>
							Effect.gen(function* () {
								const bomJson = yield* sbomSvc.serializeJson(bom);
								yield* Effect.logDebug(`generated CycloneDX BOM:\n${bomJson}`);
								yield* Effect.logInfo("✅ SBOM generated");
								return true as const;
							}),
						),
						Effect.catchAll((e: SbomError) =>
							Effect.gen(function* () {
								yield* Effect.logError(`SBOM generation failed for ${rel.name}: ${e.message}`);
								return false as const;
							}),
						),
					);
				}),
			);

			if (!ok) sbomFailures.push(rel.name);
		}

		return {
			ok: sbomFailures.length === 0,
			sbomFailures,
			packageCount: detected.length,
		} satisfies BuildSbomResult;
	});

// ─── runPublishTargets ─────────────────────────────────────────────────────────

/**
 * Resolve publish targets for the detected packages, order them
 * topologically, and publish each to its registries — Step 4 of the Phase-3
 * flow.
 *
 * @remarks
 * Accumulates per-package / per-target errors into the returned
 * `PublishPackagesResult` (one failure does not abort the batch). The build
 * and detection that `runPublish` previously did internally are now Steps 3
 * and 1, performed by {@link runBuildAndSbom} and {@link detectReleases}.
 *
 * @public
 */
export const runPublishTargets = (
	detected: ReadonlyArray<DetectedRelease>,
	// `_args` is unused today; kept for signature parity with `detectReleases`
	// and `runBuildAndSbom` and for future dry-run support.
	_args: PublishInputArgs,
) =>
	Effect.gen(function* () {
		const discovery = yield* WorkspaceDiscovery;
		const detector = yield* PublishabilityDetector;
		const sorter = yield* TopologicalSorter;
		const state = yield* ActionState;
		const logger = yield* ActionLogger;

		// ── Resolve registry tokens once ───────────────────────────────────────
		const npmTokenOpt = yield* Config.string("npm-token").pipe(Config.option);
		const npmToken: string | null = Option.isSome(npmTokenOpt) && npmTokenOpt.value !== "" ? npmTokenOpt.value : null;

		const ghPkgsTokenOpt = yield* state
			.getOptional(STATE_KEYS.githubPackagesToken, GithubPackagesTokenState)
			.pipe(Effect.catchAll(() => Effect.succeed(Option.none<GithubPackagesTokenState>())));
		const ghPkgsToken: string | null =
			Option.isSome(ghPkgsTokenOpt) && ghPkgsTokenOpt.value.token !== "" ? ghPkgsTokenOpt.value.token : null;

		if (detected.length === 0) {
			return {
				success: true,
				packages: [],
				totalPackages: 0,
				successfulPackages: 0,
				totalTargets: 0,
				successfulTargets: 0,
			} satisfies PublishPackagesResult;
		}

		// ── Resolve publish targets ────────────────────────────────────────────
		yield* Effect.logDebug("runPublishTargets: resolving publish targets");

		const workspaceRoot = process.cwd();

		interface PkgEntry {
			readonly version: string;
			readonly targets: ReadonlyArray<{
				registry: string;
				directory: string;
				access: "public" | "restricted";
				provenance: boolean;
			}>;
		}
		const targetsByPackage = new Map<string, PkgEntry>();

		for (const rel of detected) {
			const wsPkg = yield* discovery.getPackage(rel.name).pipe(
				Effect.catchAll(() =>
					Effect.succeed(
						new WorkspacePackage({
							name: rel.name,
							version: rel.version,
							path: rel.path,
							packageJsonPath: join(rel.path, "package.json"),
							relativePath: "",
						}),
					),
				),
			);

			const publishTargets = yield* detector.detect(wsPkg, workspaceRoot).pipe(
				Effect.catchAll((e: unknown) =>
					Effect.gen(function* () {
						yield* Effect.logWarning(`Failed to resolve targets for ${rel.name}: ${String(e)}`);
						return [] as ReadonlyArray<{
							registry: string;
							directory: string;
							access: "public" | "restricted";
							provenance: boolean;
						}>;
					}),
				),
			);

			const jsrTargets = publishTargets.filter(
				(t) => t.registry.toLowerCase().includes("jsr.io") || t.registry.toLowerCase().includes("jsr:"),
			);
			const npmTargets = publishTargets.filter(
				(t) => !t.registry.toLowerCase().includes("jsr.io") && !t.registry.toLowerCase().includes("jsr:"),
			);

			for (const t of jsrTargets) {
				yield* Effect.logWarning(
					`runPublishTargets: skipping JSR target ${t.registry} for ${rel.name} — JSR publishing is not yet supported`,
				);
			}

			// Resolve each target's directory to an absolute path, then drop any
			// whose built `package.json` is `private` — the build pipeline keeps
			// `private: true` on dev-only outputs as the "never publish" signal.
			const resolvedTargets: Array<{
				registry: string;
				directory: string;
				access: "public" | "restricted";
				provenance: boolean;
			}> = [];
			let privateSkipped = 0;
			for (const t of npmTargets) {
				const directory = isAbsolute(t.directory) ? t.directory : join(wsPkg.path, t.directory);
				if (isTargetPrivate(directory)) {
					privateSkipped++;
					yield* Effect.logInfo(
						`⏭ ${rel.name} · ${basename(directory)} — package.json is private, not a publish target`,
					);
					continue;
				}
				resolvedTargets.push({
					registry: t.registry,
					directory,
					access: t.access,
					provenance: t.provenance ?? false,
				});
			}

			targetsByPackage.set(rel.name, { version: rel.version, targets: resolvedTargets });

			yield* Effect.logDebug(
				`runPublishTargets: ${rel.name}@${rel.version}: ${resolvedTargets.length} target(s)` +
					(jsrTargets.length > 0 ? ` (${jsrTargets.length} JSR skipped)` : "") +
					(privateSkipped > 0 ? ` (${privateSkipped} private skipped)` : ""),
			);
		}

		// ── Topological ordering ───────────────────────────────────────────────
		yield* Effect.logDebug("runPublishTargets: sorting packages topologically");

		// `sortSubset` returns the transitive-dependency closure of the given
		// packages; keep only the packages actually being released so a
		// non-bumped dependency is not treated as a publish target.
		const detectedNames = new Set(detected.map((r) => r.name));
		const sortedNames = yield* sorter.sortSubset(detected.map((r) => r.name)).pipe(
			Effect.map((closure) => closure.filter((name) => detectedNames.has(name))),
			Effect.catchAll((e: unknown) =>
				Effect.gen(function* () {
					yield* Effect.logWarning(`Topological sort failed, using insertion order: ${String(e)}`);
					return detected.map((r) => r.name) as ReadonlyArray<string>;
				}),
			),
		);

		// ── Publish each package (accumulate errors) ───────────────────────────
		const totalTargets = [...targetsByPackage.values()].reduce((sum, p) => sum + p.targets.length, 0);
		yield* Effect.logDebug(
			`runPublishTargets: publishing ${sortedNames.length} package(s), ${totalTargets} total target(s)`,
		);

		const accumulateResult = yield* ErrorAccumulator.forEachAccumulate(sortedNames, (name) =>
			Effect.gen(function* () {
				const pkgEntry = targetsByPackage.get(name);
				if (pkgEntry === undefined) {
					yield* Effect.logWarning(`runPublishTargets: no target info for ${name}, skipping`);
					return null;
				}

				const { version, targets } = pkgEntry;
				yield* Effect.logDebug(`runPublishTargets: publishing ${name}@${version}`);

				if (targets.length === 0) {
					yield* Effect.logDebug(`runPublishTargets: ${name} has no publish targets (version-only)`);
					return { name, version, targets: [] } satisfies PackagePublishResult;
				}

				const targetResults: TargetPublishResult[] = [];

				for (const target of targets) {
					const distDir = basename(target.directory);
					const result = yield* logger.group(
						`Publish · ${name} · ${distDir} · ${target.registry}`,
						publishOneTarget(name, version, target, npmToken, ghPkgsToken),
					);
					targetResults.push(result);
				}

				return { name, version, targets: targetResults } satisfies PackagePublishResult;
			}),
		);

		// ── Assemble PublishPackagesResult ─────────────────────────────────────
		const packages: PackagePublishResult[] = [];
		let successfulPackages = 0;
		let successfulTargets = 0;

		for (const result of accumulateResult.successes) {
			if (result === null) continue;
			packages.push(result);
			const allTargetsOk = result.targets.length === 0 || result.targets.every((t) => t.success);
			if (allTargetsOk) {
				successfulPackages++;
			}
			successfulTargets += result.targets.filter((t) => t.success).length;
		}

		for (const { item: name, error: rawError } of accumulateResult.failures) {
			const err: unknown = rawError;
			yield* Effect.logError(
				`runPublishTargets: publishing ${name} failed — ${err instanceof Error ? err.message : String(err)}`,
			);
			const version = targetsByPackage.get(name)?.version ?? "unknown";
			packages.push({
				name,
				version,
				targets: [
					{
						target: {
							protocol: "npm" as const,
							registry: null,
							directory: "",
							access: "restricted" as const,
							provenance: false,
							tag: "latest" as const,
							tokenEnv: null,
						},
						success: false,
						error: err instanceof Error ? err.message : String(err),
					},
				],
			});
		}

		const allSuccess = successfulPackages === targetsByPackage.size;

		return {
			success: allSuccess,
			packages,
			totalPackages: targetsByPackage.size,
			successfulPackages,
			totalTargets,
			successfulTargets,
		} satisfies PublishPackagesResult;
	});
