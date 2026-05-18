/**
 * Phase-3 release orchestrator: git tags, GitHub releases, release-asset
 * attestation, and artifact-metadata storage records.
 *
 * Ports the behaviour preserved in `src/utils/create-github-releases.ts`
 * (`createGitHubReleases`) and the release-asset attestation logic in
 * `src/utils/create-attestation.ts` (`createReleaseAssetAttestation`) plus
 * the storage-record call in `src/utils/attest-runner.ts`
 * (`runCreateStorageRecord`) to a pure Effect program.
 *
 * Per-tag failures are collected into the `errors` array without aborting the
 * rest of the batch (mirrors the `ErrorAccumulator` pattern used in Phase 3
 * publish).  The overall `success` flag is `true` only when `errors` is empty.
 *
 * @module release/releases
 */

import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type {
	ActionLogger,
	AttestError,
	GitHubReleaseError,
	GitTagError,
	SigstoreSigner,
} from "@savvy-web/github-action-effects";
import {
	Attest,
	GitHubClient,
	GitHubRelease,
	GitTag,
	OidcTokenIssuer,
	buildSLSAProvenancePredicate,
	decodeJwtClaims,
} from "@savvy-web/github-action-effects";
import { Effect, Redacted } from "effect";

import { findPackagePath } from "../utils/find-package-path.js";
import { getPackagePageUrl } from "../utils/generate-publish-summary.js";
import { getRegistryDisplayName, isGitHubPackagesRegistry } from "../utils/registry-utils.js";
import { ReleasesError } from "./errors.js";
import type { AssetInfo, PackagePublishResult, PublishPackagesResult, ReleaseInfo, TagInfo } from "./types.js";

// ─── Public interfaces ────────────────────────────────────────────────────────

/**
 * Input arguments for {@link runReleases}.
 *
 * @public
 */
export interface ReleasesInputArgs {
	/** Tags to create releases for. */
	readonly tags: ReadonlyArray<TagInfo>;
	/** Results from the preceding publish step. */
	readonly publishResult: PublishPackagesResult;
	/** Package manager used (pnpm / npm / yarn / bun). */
	readonly packageManager: string;
	/** When true skip all real mutations and return a synthetic report. */
	readonly dryRun: boolean;
}

/**
 * Aggregated result from {@link runReleases}.
 *
 * @public
 */
export interface ReleasesReport {
	/** Whether all tags/releases were created without error. */
	readonly success: boolean;
	/** Per-tag release descriptors. */
	readonly releases: ReadonlyArray<ReleaseInfo>;
	/** Human-readable error strings accumulated over the batch. */
	readonly errors: ReadonlyArray<string>;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Extract release notes from a CHANGELOG.md for a specific version.
 *
 * Ports `extractReleaseNotes` from `create-github-releases.ts` verbatim.
 */
function extractReleaseNotes(changelogPath: string, version: string): string | undefined {
	if (!existsSync(changelogPath)) {
		return undefined;
	}

	const content = readFileSync(changelogPath, "utf-8");
	const lines = content.split("\n");

	// Changesets format: ## 1.0.0 or ## @scope/pkg@1.0.0
	const versionPattern = new RegExp(`^##\\s+(?:@[^@]+@)?${version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);
	const nextVersionPattern = /^##\s+/;

	let inSection = false;
	const sectionLines: string[] = [];

	for (const line of lines) {
		if (versionPattern.test(line)) {
			inSection = true;
			continue;
		}
		if (inSection) {
			if (nextVersionPattern.test(line)) break;
			sectionLines.push(line);
		}
	}

	if (sectionLines.length === 0) return undefined;

	while (sectionLines.length > 0 && sectionLines[0]?.trim() === "") sectionLines.shift();
	while (sectionLines.length > 0 && sectionLines[sectionLines.length - 1]?.trim() === "") sectionLines.pop();

	return sectionLines.join("\n");
}

/**
 * Return the last segment of a directory path.
 *
 * E.g. `"dist/npm"` → `"npm"`.
 */
function getDirectoryPrefix(directory: string): string {
	const parts = directory.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? "dist";
}

/**
 * Return the unscoped package name.
 *
 * @example
 * getUnscopedName("@savvy-web/pkg") // "pkg"
 */
function getUnscopedName(packageName: string): string {
	if (packageName.startsWith("@") && packageName.includes("/")) {
		return packageName.split("/")[1] ?? packageName;
	}
	return packageName;
}

/**
 * Build the release-notes markdown for a set of packages associated with a tag.
 *
 * Ports the changelog-extraction + publish-summary-table logic from
 * `createGitHubReleases` in `create-github-releases.ts`.
 */
function buildReleaseNotes(packages: PackagePublishResult[], owner: string, repo: string): string {
	let notes = "";

	// Changelog sections
	for (const pkg of packages) {
		const pkgPath = findPackagePath(pkg.name);
		const changelogPaths: string[] = [];
		if (pkgPath) changelogPaths.push(join(pkgPath, "CHANGELOG.md"));
		changelogPaths.push(join(process.cwd(), "CHANGELOG.md"));

		let changelog: string | undefined;
		for (const cp of changelogPaths) {
			changelog = extractReleaseNotes(cp, pkg.version);
			if (changelog) break;
		}

		if (packages.length > 1) notes += `## ${pkg.name}\n\n`;
		notes += changelog ?? `Released version ${pkg.version}`;
		notes += "\n\n";
	}

	// Publish summary table
	const publishedTargets: Array<{
		pkg: PackagePublishResult;
		target: PackagePublishResult["targets"][number];
		registryName: string;
		packageUrl: string | undefined;
	}> = [];

	for (const pkg of packages) {
		for (const target of pkg.targets.filter((t) => t.success)) {
			const registryName = getRegistryDisplayName(target.target.registry ?? undefined);
			const packageUrl = getPackagePageUrl(target.target.registry ?? null, pkg.name, pkg.version);
			publishedTargets.push({ pkg, target, registryName, packageUrl });
		}
	}

	if (publishedTargets.length === 0) {
		notes += "> This is a version-only release. No packages were published to a registry.\n\n";
		return notes;
	}

	notes += "---\n\n";
	notes += "### Publish Summary\n\n";
	notes += "| Registry | Package | SBOM | API | Provenance |\n";
	notes += "|----------|---------|------|-----|------------|\n";

	for (const { pkg, target, registryName, packageUrl } of publishedTargets) {
		const packageCell = packageUrl ? `[${pkg.name}@${pkg.version}](${packageUrl})` : `${pkg.name}@${pkg.version}`;
		const sbomCell = target.sbomPath ? "📦" : "—";
		const provenanceParts: string[] = [];
		if (target.attestationUrl) provenanceParts.push(`[Sigstore](${target.attestationUrl})`);
		if (pkg.githubAttestationUrl) provenanceParts.push(`[GitHub](${pkg.githubAttestationUrl})`);
		if (target.sbomAttestationUrl) provenanceParts.push(`[SBOM](${target.sbomAttestationUrl})`);
		const provenanceCell = provenanceParts.length > 0 ? provenanceParts.join(", ") : "—";
		notes += `| ${registryName} | ${packageCell} | ${sbomCell} | — | ${provenanceCell} |\n`;
	}

	// Suppress unused-parameter lint warning for owner/repo — kept for future
	// release-URL construction if the table format evolves.
	void owner;
	void repo;

	return notes;
}

/**
 * Build a SLSA Provenance v1 predicate from the runner's OIDC token.
 *
 * Returns `null` on failure so the caller can log and skip attestation rather
 * than fail the whole batch (mirrors the same helper in `publish.ts`).
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
					`runReleases: failed to build SLSA provenance predicate: ${e instanceof Error ? e.message : String(e)}`,
				);
				return null;
			}),
		),
	);

/**
 * Create the artifact-metadata storage record that links an attestation to a
 * GitHub Packages artifact.
 *
 * Ports `runCreateStorageRecord` from `attest-runner.ts` as a pure Effect using
 * `GitHubClient.rest`.  Non-fatal — failures are logged as warnings.
 *
 * Only called for GitHub Packages targets.
 */
const createStorageRecord = (
	packageName: string,
	version: string,
	digest: string,
): Effect.Effect<readonly number[] | undefined, never, GitHubClient> =>
	Effect.gen(function* () {
		const client = yield* GitHubClient;
		const { owner } = yield* client.repo;

		const purlName = `pkg:npm/${packageName}@${version}`;
		const unscopedName = getUnscopedName(packageName);
		const artifactUrl = `https://github.com/${owner}/pkgs/npm/${unscopedName}`;

		const body = {
			name: purlName,
			digest,
			version,
			registry_url: "https://npm.pkg.github.com/",
			artifact_url: artifactUrl,
			repo: unscopedName,
		};

		const ids = yield* client.rest("orgs.createArtifactStorageRecord", async (octokit) => {
			const ok = octokit as {
				request: (route: string, params: Record<string, unknown>) => Promise<{ data: unknown }>;
			};
			const response = await ok.request("POST /orgs/{owner}/artifacts/metadata/storage-record", { owner, ...body });
			const data = typeof response.data === "string" ? (JSON.parse(response.data) as unknown) : response.data;
			const storageIds = (data as { storage_records?: Array<{ id: number }> } | null)?.storage_records?.map(
				(r) => r.id,
			);
			return { data: storageIds };
		});

		return ids ?? undefined;
	}).pipe(
		Effect.catchAll((e: unknown) =>
			Effect.gen(function* () {
				yield* Effect.logWarning(
					`runReleases: failed to create storage record for ${packageName}@${version}: ${e instanceof Error ? e.message : String(e)}`,
				);
				return undefined;
			}),
		),
	);

/**
 * Attest a single release asset (tarball) with SLSA provenance.
 *
 * Ports `createReleaseAssetAttestation` from `create-attestation.ts`.
 * Uses the real OIDC token path (no empty predicate).  Non-fatal — on failure
 * returns `undefined` so the batch can continue.
 */
const attestAsset = (
	artifactPath: string,
	packageName: string,
	version: string,
	tarballDigest: string,
): Effect.Effect<string | undefined, never, Attest | OidcTokenIssuer | GitHubClient | SigstoreSigner> =>
	Effect.gen(function* () {
		const attest = yield* Attest;
		const predicate = yield* buildProvenancePredicate();

		if (predicate === null) {
			yield* Effect.logWarning(
				`runReleases: skipping attestation for ${basename(artifactPath)}: could not obtain OIDC claims`,
			);
			return undefined;
		}

		const purlName = `pkg:npm/${packageName}@${version}`;
		const sha256 = tarballDigest.replace(/^sha256:/i, "");

		const record = yield* attest
			.provenance({
				subjectName: purlName,
				subjectSha256: sha256,
				predicate,
			})
			.pipe(
				Effect.catchAll((e: AttestError) =>
					Effect.gen(function* () {
						yield* Effect.logWarning(`runReleases: attestation failed for ${basename(artifactPath)}: ${e.message}`);
						return null;
					}),
				),
			);

		if (record === null) return undefined;
		return record.attestationUrl;
	});

// ─── Per-tag processing ────────────────────────────────────────────────────────

/**
 * Process a single tag: create the git tag, create the GitHub release, upload
 * assets, attest each asset, and write the storage record for GitHub Packages.
 *
 * Returns a tuple `[ReleaseInfo | null, string | null]` — the release info and
 * an error string (mutually exclusive).
 */
const processOneTag = (
	tag: TagInfo,
	associatedPackages: PackagePublishResult[],
	owner: string,
	repo: string,
	headSha: string,
	dryRun: boolean,
): Effect.Effect<
	readonly [ReleaseInfo | null, string | null],
	never,
	GitTag | GitHubRelease | Attest | OidcTokenIssuer | GitHubClient | SigstoreSigner
> =>
	Effect.gen(function* () {
		yield* Effect.logInfo(`runReleases: processing ${tag.name}`);

		if (associatedPackages.length === 0) {
			yield* Effect.logWarning(`runReleases: no packages found for tag ${tag.name}`);
			return [null, null] as const;
		}

		// ── Dry-run shortcut ─────────────────────────────────────────────────────
		if (dryRun) {
			yield* Effect.logInfo(`runReleases: [DRY RUN] would create tag and release for ${tag.name}`);
			return [
				{
					tag: tag.name,
					url: `https://github.com/${owner}/${repo}/releases/tag/${tag.name}`,
					id: 0,
					assets: [],
				} satisfies ReleaseInfo,
				null,
			] as const;
		}

		// ── Step 1: Create git tag ────────────────────────────────────────────────
		const gitTagSvc = yield* GitTag;

		yield* gitTagSvc.create(tag.name, headSha).pipe(
			Effect.catchAll((e: GitTagError) => {
				// Idempotent: if tag already exists at same SHA, treat as success.
				// Log a warning and continue; the release step will handle existing
				// releases via getByTag.
				return Effect.logWarning(`runReleases: tag ${tag.name} create failed (${e.reason}) — proceeding`);
			}),
		);

		// ── Step 2: Build release notes ───────────────────────────────────────────
		const notes = buildReleaseNotes(associatedPackages, owner, repo);

		// ── Step 3: Create GitHub release ─────────────────────────────────────────
		const releaseSvc = yield* GitHubRelease;

		const releaseData = yield* releaseSvc
			.create({
				tag: tag.name,
				name: tag.name,
				body: notes.trim(),
				draft: false,
				prerelease: tag.version.includes("-"),
			})
			.pipe(
				Effect.catchAll((createErr: GitHubReleaseError) =>
					// On re-run the release may already exist — fall back to getByTag.
					createErr.reason?.match(/already_exists|already exists/i)
						? releaseSvc.getByTag(tag.name)
						: Effect.fail(createErr),
				),
			);

		yield* Effect.logInfo(`runReleases: release created — ${releaseData.id}`);

		// ── Step 4: Upload assets and attest ──────────────────────────────────────
		const releaseInfo: ReleaseInfo = {
			tag: tag.name,
			url: `https://github.com/${owner}/${repo}/releases/tag/${tag.name}`,
			id: releaseData.id,
			assets: [],
		};

		for (const pkg of associatedPackages) {
			const targetsWithTarballs = pkg.targets.filter((t) => t.success && t.tarballPath);

			if (targetsWithTarballs.length === 0) {
				yield* Effect.logWarning(`runReleases: no tarball path for ${pkg.name}@${pkg.version} — skipping asset upload`);
				continue;
			}

			const uniqueDirectories = new Set(targetsWithTarballs.map((t) => t.target.directory));
			const needsPrefix = uniqueDirectories.size > 1;
			const uploadedPaths = new Set<string>();

			for (const targetResult of targetsWithTarballs) {
				const artifactPath = targetResult.tarballPath;
				if (!artifactPath) continue;
				if (uploadedPaths.has(artifactPath)) continue;
				uploadedPaths.add(artifactPath);

				if (!existsSync(artifactPath)) {
					yield* Effect.logWarning(`runReleases: tarball not found at ${artifactPath} — skipping`);
					continue;
				}

				const originalFileName = basename(artifactPath);
				const fileName = needsPrefix
					? `${getDirectoryPrefix(targetResult.target.directory)}-${originalFileName}`
					: originalFileName;

				const fileContent = readFileSync(artifactPath);

				yield* Effect.logInfo(`runReleases: uploading asset ${fileName}`);

				const asset = yield* releaseSvc
					.uploadAsset(releaseData.id, fileName, fileContent, "application/octet-stream")
					.pipe(
						Effect.catchAll((e: GitHubReleaseError) =>
							Effect.gen(function* () {
								yield* Effect.logWarning(`runReleases: upload failed for ${fileName}: ${e.reason}`);
								return null;
							}),
						),
					);

				if (asset === null) continue;

				yield* Effect.logInfo(`runReleases: uploaded ${fileName} → ${asset.url}`);

				// Attest the asset
				const digest = targetResult.tarballDigest ?? `sha256:${fileName}`;
				const attestationUrl = yield* attestAsset(artifactPath, pkg.name, pkg.version, digest);

				const assetInfo: AssetInfo = {
					name: fileName,
					downloadUrl: asset.url,
					size: asset.size,
					attestationUrl,
					registry: targetResult.target.registry ?? undefined,
				};

				(releaseInfo.assets as AssetInfo[]).push(assetInfo);

				// Storage record for GitHub Packages
				if (isGitHubPackagesRegistry(targetResult.target.registry ?? undefined)) {
					const storageIds = yield* createStorageRecord(pkg.name, pkg.version, digest);
					if (storageIds && storageIds.length > 0) {
						yield* Effect.logInfo(
							`runReleases: storage record created for ${pkg.name}@${pkg.version} (IDs: ${storageIds.join(",")})`,
						);
					}
				}
			}
		}

		return [releaseInfo, null] as const;
	}).pipe(
		Effect.catchAll((e: unknown) => {
			const msg = `runReleases: failed to create release for ${tag.name}: ${e instanceof Error ? e.message : String(e)}`;
			return Effect.gen(function* () {
				yield* Effect.logWarning(msg);
				return [null, msg] as const;
			});
		}),
	);

// ─── runReleases ───────────────────────────────────────────────────────────────

/**
 * Effect-based Phase-3 release orchestrator.
 *
 * @remarks
 * Creates git tags and GitHub releases for every `TagInfo` entry, uploading
 * release-asset tarballs, attesting them with SLSA provenance, and creating
 * GitHub Packages storage records where applicable.
 *
 * Per-tag failures are accumulated into the returned `errors` array — one
 * failure does not abort the rest of the batch.
 *
 * The effect never fails (all errors are captured into `ReleasesReport`).
 * Providing the Effect is the caller's responsibility (use
 * `GitTagLive`, `GitHubReleaseLive`, `AttestLive`, `GitHubClientLive`, and
 * `OidcTokenIssuerLive` in production).
 *
 * @public
 */
export const runReleases = (
	args: ReleasesInputArgs,
): Effect.Effect<
	ReleasesReport,
	ReleasesError,
	GitTag | GitHubRelease | Attest | OidcTokenIssuer | GitHubClient | SigstoreSigner | ActionLogger
> =>
	Effect.gen(function* () {
		if (args.tags.length === 0) {
			yield* Effect.logInfo("runReleases: no tags to process");
			return {
				success: true,
				releases: [],
				errors: [],
			} satisfies ReleasesReport;
		}

		// Resolve owner/repo from GitHub client
		const client = yield* GitHubClient;
		const { owner, repo } = yield* client.repo;

		// Resolve HEAD SHA — used for git tag creation.
		// `GITHUB_SHA` is always set in GitHub Actions; fall back to empty string
		// so the Test layer can exercise the code path in tests.
		const headSha = process.env.GITHUB_SHA ?? "";

		yield* Effect.logInfo(`runReleases: processing ${args.tags.length} tag(s)`);

		const releases: ReleaseInfo[] = [];
		const errors: string[] = [];

		for (const tag of args.tags) {
			// Find packages associated with this tag (mirrors the original logic)
			const associatedPackages = args.publishResult.packages.filter((pkg) => {
				if (tag.packageName.includes(", ")) {
					return tag.packageName.includes(pkg.name);
				}
				return pkg.name === tag.packageName;
			});

			const [releaseInfo, error] = yield* processOneTag(tag, associatedPackages, owner, repo, headSha, args.dryRun);

			if (error !== null) {
				errors.push(error);
			} else if (releaseInfo !== null) {
				releases.push(releaseInfo);
			}
		}

		yield* Effect.logInfo(`runReleases: complete — ${releases.length} release(s) created, ${errors.length} error(s)`);

		return {
			success: errors.length === 0,
			releases,
			errors,
		} satisfies ReleasesReport;
	}).pipe(
		Effect.catchAll((e: unknown) =>
			Effect.fail(
				new ReleasesError({
					reason: "release",
					message: `runReleases: fatal error: ${e instanceof Error ? e.message : String(e)}`,
					cause: e,
				}),
			),
		),
	);
