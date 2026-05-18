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
import { dirname, isAbsolute, join } from "node:path";
import type { AttestError, CommandRunnerError, PackagePublishError } from "@savvy-web/github-action-effects";
import {
	ActionState,
	Attest,
	CommandRunner,
	ErrorAccumulator,
	GitHubClient,
	NpmRegistry,
	OidcTokenIssuer,
	PackagePublish,
	buildSLSAProvenancePredicate,
	decodeJwtClaims,
} from "@savvy-web/github-action-effects";
import { Config, Effect, Option, Redacted } from "effect";
import { PublishabilityDetector, TopologicalSorter, WorkspaceDiscovery, WorkspacePackage } from "workspaces-effect";

import { GithubPackagesTokenState, STATE_KEYS } from "../state.js";
import { isGitHubPackagesRegistry, isNpmRegistry } from "../utils/registry-utils.js";
import type { PackagePublishResult, PublishPackagesResult, TargetPublishResult } from "./types.js";

// ─── Public interfaces ────────────────────────────────────────────────────────

/**
 * Input arguments for {@link runPublish}.
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

/** Detected release (name + version + source path) used internally. */
interface DetectedRelease {
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

/** Infer bump type from old/new version strings (for logging). */
function inferBumpType(oldVersion: string, newVersion: string): "major" | "minor" | "patch" | "unknown" {
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
 * Ports `detectReleasedPackagesFromPR` using `GitHubClient.rest` for all
 * Octokit calls.  Reads the current `package.json` from disk (it exists on
 * the filesystem after the merge) and fetches the base-branch version via the
 * GitHub Contents API.
 */
const detectFromPR = (prNumber: number): Effect.Effect<ReadonlyArray<DetectedRelease>, never, GitHubClient> =>
	Effect.gen(function* () {
		const client = yield* GitHubClient;
		const { owner, repo } = yield* client.repo;

		// List files changed in the merged PR
		interface PrFile {
			filename: string;
			status: string;
		}
		const files = yield* client
			.rest<PrFile[]>("pulls.listFiles", (octokit) => {
				const ok = octokit as {
					rest: {
						pulls: {
							listFiles: (p: Record<string, unknown>) => Promise<{ data: PrFile[] }>;
						};
					};
				};
				return ok.rest.pulls.listFiles({ owner, repo, pull_number: prNumber, per_page: 100 });
			})
			.pipe(Effect.catchAll(() => Effect.succeed([] as PrFile[])));

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
		interface PrData {
			base: { sha: string };
		}
		const prData = yield* client
			.rest<PrData>("pulls.get", (octokit) => {
				const ok = octokit as {
					rest: { pulls: { get: (p: Record<string, unknown>) => Promise<{ data: PrData }> } };
				};
				return ok.rest.pulls.get({ owner, repo, pull_number: prNumber });
			})
			.pipe(Effect.catchAll(() => Effect.succeed({ base: { sha: "" } } as PrData)));

		const baseSha = prData.base.sha;
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
				interface ContentData {
					content?: string;
				}
				const oldContent = yield* client
					.rest<ContentData>("repos.getContent", (octokit) => {
						const ok = octokit as {
							rest: { repos: { getContent: (p: Record<string, unknown>) => Promise<{ data: ContentData }> } };
						};
						return ok.rest.repos.getContent({ owner, repo, path: file.filename, ref: baseSha });
					})
					.pipe(Effect.catchAll(() => Effect.succeed({} as ContentData)));

				if (oldContent.content) {
					try {
						const decoded = Buffer.from(oldContent.content, "base64").toString("utf-8");
						const oldPkg = JSON.parse(decoded) as { version?: string };
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
 * Ports `detectReleasedPackagesFromCommit` using `GitHubClient.rest`.
 */
const detectFromCommit = (): Effect.Effect<ReadonlyArray<DetectedRelease>, never, GitHubClient> =>
	Effect.gen(function* () {
		const client = yield* GitHubClient;
		const { owner, repo } = yield* client.repo;

		const sha = process.env.GITHUB_SHA ?? "";
		if (!sha) return [];

		interface CommitData {
			parents?: Array<{ sha: string }>;
		}
		const commitData = yield* client
			.rest<CommitData>("repos.getCommit", (octokit) => {
				const ok = octokit as {
					rest: { repos: { getCommit: (p: Record<string, unknown>) => Promise<{ data: CommitData }> } };
				};
				return ok.rest.repos.getCommit({ owner, repo, ref: sha });
			})
			.pipe(Effect.catchAll(() => Effect.succeed({} as CommitData)));

		const parents = commitData.parents;
		if (!parents || parents.length === 0) return [];

		const baseSha = parents[0]?.sha ?? "";

		interface CompareData {
			files?: Array<{ filename: string; status: string }>;
		}
		const comparison = yield* client
			.rest<CompareData>("repos.compareCommits", (octokit) => {
				const ok = octokit as {
					rest: { repos: { compareCommits: (p: Record<string, unknown>) => Promise<{ data: CompareData }> } };
				};
				return ok.rest.repos.compareCommits({ owner, repo, base: baseSha, head: sha });
			})
			.pipe(Effect.catchAll(() => Effect.succeed({} as CompareData)));

		const modifiedPkgJsonFiles = (comparison.files ?? []).filter(
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

			interface ContentData {
				content?: string;
			}
			const oldContent = yield* client
				.rest<ContentData>("repos.getContent", (octokit) => {
					const ok = octokit as {
						rest: { repos: { getContent: (p: Record<string, unknown>) => Promise<{ data: ContentData }> } };
					};
					return ok.rest.repos.getContent({ owner, repo, path: file.filename, ref: baseSha });
				})
				.pipe(Effect.catchAll(() => Effect.succeed({} as ContentData)));

			if (oldContent.content) {
				try {
					const decoded = Buffer.from(oldContent.content, "base64").toString("utf-8");
					const oldPkg = JSON.parse(decoded) as { version?: string };
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
				`runPublish: skipping JSR target for ${packageName}@${version} — JSR publishing is not yet supported in this orchestrator`,
			);
			return {
				target: { ...legacyTarget, protocol: "jsr" as const },
				success: true,
				alreadyPublished: false,
				error: undefined,
				// Use a synthetic "skipped" marker in the alreadyPublished fields
				// so the caller can distinguish JSR skips from real publishes.
			} satisfies TargetPublishResult;
		});
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
					`runPublish: publishing ${packageName}@${version} to ${target.registry} failed — ${message}`,
				);
				return {
					target: legacyTarget,
					success: false,
					error: message,
				} satisfies TargetPublishResult;
			}),
		),
	);
};

// ─── runPublish ───────────────────────────────────────────────────────────────

/**
 * Effect-based Phase-3 publish orchestrator.
 *
 * @remarks
 * Orchestrates the build, package detection, target resolution, topological
 * ordering, and multi-registry publishing. Accumulates errors per package so
 * one failure does not abort the batch.
 *
 * The returned effect fails with {@link PublishError} only for fatal
 * infrastructure errors (e.g., workspace discovery or topological sort failure).
 * Per-package / per-target errors are captured in the returned
 * `PublishPackagesResult` (with `success: false`).
 *
 * @public
 */
export const runPublish = (args: PublishInputArgs) =>
	Effect.gen(function* () {
		const runner = yield* CommandRunner;
		const discovery = yield* WorkspaceDiscovery;
		const detector = yield* PublishabilityDetector;
		const sorter = yield* TopologicalSorter;
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

		// ── Step 1: Build ──────────────────────────────────────────────────────

		yield* Effect.logInfo("runPublish: running ci:build");

		const buildArgs = args.packageManager === "npm" ? ["run", "ci:build"] : ["ci:build"];
		const buildResult = yield* runner.execCapture(args.packageManager, buildArgs).pipe(
			Effect.map((output) => ({ success: true as const, output })),
			Effect.catchAll((e: CommandRunnerError) =>
				Effect.succeed({
					success: false as const,
					error: e.stderr ?? e.message,
					output: "",
				}),
			),
		);

		if (!buildResult.success) {
			yield* Effect.logWarning("runPublish: build failed, aborting publish");
			return {
				success: false,
				packages: [],
				totalPackages: 0,
				successfulPackages: 0,
				totalTargets: 0,
				successfulTargets: 0,
				buildError: buildResult.error,
				buildOutput: "",
			} satisfies PublishPackagesResult;
		}

		yield* Effect.logInfo("runPublish: build succeeded");

		// ── Step 2: Detect released packages ──────────────────────────────────

		yield* Effect.logInfo("runPublish: detecting released packages");

		let detected: ReadonlyArray<DetectedRelease>;

		if (args.mergedReleasePRNumber !== undefined) {
			yield* Effect.logInfo(`runPublish: detecting from PR #${args.mergedReleasePRNumber}`);
			detected = yield* detectFromPR(args.mergedReleasePRNumber);
			if (detected.length === 0) {
				yield* Effect.logInfo("runPublish: PR detection returned nothing, falling back to commit diff");
				detected = yield* detectFromCommit();
			}
		} else {
			yield* Effect.logInfo("runPublish: detecting from commit diff");
			detected = yield* detectFromCommit();
		}

		if (detected.length === 0) {
			yield* Effect.logInfo("runPublish: no packages to publish");
			return {
				success: true,
				packages: [],
				totalPackages: 0,
				successfulPackages: 0,
				totalTargets: 0,
				successfulTargets: 0,
			} satisfies PublishPackagesResult;
		}

		// ── Step 3: Resolve publish targets ───────────────────────────────────

		yield* Effect.logInfo("runPublish: resolving publish targets");

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
			// Resolve the WorkspacePackage from discovery, synthesising a minimal
			// one if the package is not in the workspace (e.g. deleted monorepo member).
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

			// Filter out JSR targets — log a warning for each
			const jsrTargets = publishTargets.filter(
				(t) => t.registry.toLowerCase().includes("jsr.io") || t.registry.toLowerCase().includes("jsr:"),
			);
			const npmTargets = publishTargets.filter(
				(t) => !t.registry.toLowerCase().includes("jsr.io") && !t.registry.toLowerCase().includes("jsr:"),
			);

			for (const t of jsrTargets) {
				yield* Effect.logWarning(
					`runPublish: skipping JSR target ${t.registry} for ${rel.name} — JSR publishing is not yet supported`,
				);
			}

			targetsByPackage.set(rel.name, {
				version: rel.version,
				targets: npmTargets.map((t) => ({
					registry: t.registry,
					// `t.directory` (e.g. "dist/dev") is package-relative; resolve it
					// to an absolute path so spawn's `cwd` option and fs reads work
					// correctly regardless of the action's process cwd.
					directory: isAbsolute(t.directory) ? t.directory : join(wsPkg.path, t.directory),
					access: t.access,
					provenance: t.provenance ?? false,
				})),
			});

			yield* Effect.logInfo(
				`runPublish: ${rel.name}@${rel.version}: ${npmTargets.length} target(s)` +
					(jsrTargets.length > 0 ? ` (${jsrTargets.length} JSR skipped)` : ""),
			);
		}

		// ── Step 4: Topological ordering ───────────────────────────────────────

		yield* Effect.logInfo("runPublish: sorting packages topologically");

		// `sortSubset` returns the transitive-dependency closure of the given
		// packages, so a workspace dependency of a released package gets pulled
		// in. Keep only the packages actually being released — a dependency that
		// was not itself version-bumped must not be treated as a publish target.
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

		// ── Step 5: Publish each package (accumulate errors) ───────────────────

		const totalTargets = [...targetsByPackage.values()].reduce((sum, p) => sum + p.targets.length, 0);
		yield* Effect.logInfo(`runPublish: publishing ${sortedNames.length} package(s), ${totalTargets} total target(s)`);

		const accumulateResult = yield* ErrorAccumulator.forEachAccumulate(sortedNames, (name) =>
			Effect.gen(function* () {
				const pkgEntry = targetsByPackage.get(name);
				if (pkgEntry === undefined) {
					yield* Effect.logWarning(`runPublish: no target info for ${name}, skipping`);
					return null;
				}

				const { version, targets } = pkgEntry;
				yield* Effect.logInfo(`runPublish: publishing ${name}@${version}`);

				if (targets.length === 0) {
					yield* Effect.logInfo(`runPublish: ${name} has no publish targets (version-only)`);
					return {
						name,
						version,
						targets: [],
					} satisfies PackagePublishResult;
				}

				const targetResults: TargetPublishResult[] = [];

				for (const target of targets) {
					const result = yield* publishOneTarget(name, version, target, npmToken, ghPkgsToken);
					targetResults.push(result);
				}

				return {
					name,
					version,
					targets: targetResults,
				} satisfies PackagePublishResult;
			}),
		);

		// ── Step 6: Assemble PublishPackagesResult ─────────────────────────────

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

		// Packages that errored inside forEachAccumulate appear in failures.
		for (const { item: name, error: rawError } of accumulateResult.failures) {
			const error: unknown = rawError;
			yield* Effect.logError(
				`runPublish: publishing ${name} failed — ${error instanceof Error ? error.message : String(error)}`,
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
						error: error instanceof Error ? error.message : String(error),
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
