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
	AttestError,
	GitHubArtifactMetadataError,
	GitHubClientError,
	GitHubReleaseError,
	GitTagError,
	SigstoreSigner,
} from "@savvy-web/github-action-effects";
import {
	ActionLogger,
	Attest,
	GitHubArtifactMetadata,
	GitHubClient,
	GitHubRelease,
	GitTag,
	OidcTokenIssuer,
	Step,
	buildSLSAProvenancePredicate,
	decodeJwtClaims,
	getRegistryDisplayName,
	isGitHubPackagesRegistry,
} from "@savvy-web/github-action-effects";
import { Effect, Redacted } from "effect";

import { WorkspaceDiscovery } from "workspaces-effect";
import { ReleasesError } from "./errors.js";
import { getPackagePageUrl } from "./report.js";
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
 * Find the API Extractor doc file (`<unscopedName>.api.json`) in a target
 * directory.
 *
 * Ports `findApiDocFile` from `create-github-releases.ts` verbatim.
 *
 * @param directory - Target directory to search (may be undefined)
 * @param packageName - Full package name used to derive the unscoped file name
 * @returns Absolute path to the `.api.json` file, or `undefined` if not found
 */
function findApiDocFile(directory: string | undefined, packageName: string): string | undefined {
	if (!directory) return undefined;
	const unscopedName = getUnscopedName(packageName);
	const apiFilePath = join(directory, `${unscopedName}.api.json`);
	return existsSync(apiFilePath) ? apiFilePath : undefined;
}

/**
 * Build the release-notes markdown for a set of packages associated with a tag.
 *
 * Ports the changelog-extraction + publish-summary-table logic from
 * `createGitHubReleases` in `create-github-releases.ts`.
 *
 * Uses `WorkspaceDiscovery.getPackage` to resolve each package's filesystem
 * path so CHANGELOG.md can be located.  Falls back to `process.cwd()` if
 * discovery fails (e.g. a deleted monorepo member).
 */
const buildReleaseNotes = (
	packages: PackagePublishResult[],
	owner: string,
	repo: string,
): Effect.Effect<string, never, WorkspaceDiscovery> =>
	Effect.gen(function* () {
		const discovery = yield* WorkspaceDiscovery;
		let notes = "";

		// Changelog sections
		for (const pkg of packages) {
			const wsPkg = yield* discovery.getPackage(pkg.name).pipe(Effect.option);
			const pkgPath = wsPkg._tag === "Some" ? wsPkg.value.path : undefined;
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
			const apiDocExists = findApiDocFile(target.target.directory, pkg.name) !== undefined;
			const apiCell = apiDocExists ? "📄" : "—";
			const provenanceParts: string[] = [];
			if (target.attestationUrl) provenanceParts.push(`[Sigstore](${target.attestationUrl})`);
			if (pkg.githubAttestationUrl) provenanceParts.push(`[GitHub](${pkg.githubAttestationUrl})`);
			if (target.sbomAttestationUrl) provenanceParts.push(`[SBOM](${target.sbomAttestationUrl})`);
			const provenanceCell = provenanceParts.length > 0 ? provenanceParts.join(", ") : "—";
			notes += `| ${registryName} | ${packageCell} | ${sbomCell} | ${apiCell} | ${provenanceCell} |\n`;
		}

		// Suppress unused-parameter lint warning for owner/repo — kept for future
		// release-URL construction if the table format evolves.
		void owner;
		void repo;

		return notes;
	});

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
 * the `GitHubArtifactMetadata` service.  Non-fatal — failures are logged as
 * warnings.
 *
 * Only called for GitHub Packages targets.
 */
const createStorageRecord = (
	packageName: string,
	version: string,
	digest: string,
): Effect.Effect<readonly number[] | undefined, never, GitHubClient | GitHubArtifactMetadata> =>
	Effect.gen(function* () {
		const client = yield* GitHubClient;
		const artifactMetadata = yield* GitHubArtifactMetadata;
		const { owner } = yield* client.repo;

		const purlName = `pkg:npm/${packageName}@${version}`;
		const unscopedName = getUnscopedName(packageName);
		const artifactUrl = `https://github.com/${owner}/pkgs/npm/${unscopedName}`;

		const ids = yield* artifactMetadata.createStorageRecord({
			name: purlName,
			digest,
			version,
			registryUrl: "https://npm.pkg.github.com/",
			artifactUrl,
			repo: unscopedName,
		});

		return ids;
	}).pipe(
		Effect.catchAll((e: GitHubArtifactMetadataError | GitHubClientError) =>
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
	| GitTag
	| GitHubRelease
	| GitHubArtifactMetadata
	| Attest
	| OidcTokenIssuer
	| GitHubClient
	| SigstoreSigner
	| WorkspaceDiscovery
> =>
	Effect.gen(function* () {
		yield* Effect.logDebug(`runReleases: processing ${tag.name}`);

		if (associatedPackages.length === 0) {
			yield* Effect.logWarning(`runReleases: no packages found for tag ${tag.name}`);
			return [null, null] as const;
		}

		// ── Dry-run shortcut ─────────────────────────────────────────────────────
		if (dryRun) {
			yield* Effect.logInfo(`✅ [DRY RUN] would create tag and release for ${tag.name}`);
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

		yield* Step.withStep(
			`tag ${tag.name}`,
			gitTagSvc.create(tag.name, headSha).pipe(
				Effect.tap(() => Step.success(`created at ${headSha}`)),
				Effect.catchAll((createErr: GitTagError) =>
					// Distinguish the idempotent "tag already exists at the right SHA"
					// case from a true divergence. Resolve the existing tag's SHA and
					// compare against the head we tried to point at: equal → info-level
					// recovery (no GitHub Actions warning annotation), different →
					// warning that names both SHAs so the divergence is forensically
					// auditable, resolve-failure → preserve prior best-effort warning.
					gitTagSvc.resolve(tag.name).pipe(
						Effect.flatMap((existingSha) =>
							existingSha === headSha
								? Effect.gen(function* () {
										yield* Effect.logDebug(
											`runReleases: tag ${tag.name} already at ${headSha} — idempotent recovery, proceeding`,
										);
										yield* Step.success(`already at ${headSha} — idempotent recovery`);
									})
								: Effect.gen(function* () {
										yield* Effect.logWarning(
											`runReleases: tag ${tag.name} create failed (${createErr.reason}); existing tag points at ${existingSha} but head is ${headSha} — proceeding`,
										);
										yield* Step.success(`diverged — existing ${existingSha} ≠ head ${headSha} (proceeding)`);
									}),
						),
						Effect.catchAll((resolveErr: GitTagError) =>
							Effect.gen(function* () {
								yield* Effect.logWarning(
									`runReleases: tag ${tag.name} create failed (${createErr.reason}) and resolve failed (${resolveErr.reason}) — proceeding`,
								);
								yield* Step.success(`create+resolve failed — proceeding`);
							}),
						),
					),
				),
			),
		);

		// ── Step 2: Build release notes ───────────────────────────────────────────
		const notes = yield* buildReleaseNotes(associatedPackages, owner, repo);

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

		yield* Effect.logDebug(`runReleases: release object ready — ${releaseData.id}`);

		// ── Step 4: Upload assets and attest ──────────────────────────────────────

		// Pre-fetch existing release assets for idempotency: if a re-run
		// encounters an asset name already attached to this release, skip the
		// upload and reuse the existing URL (ports `uploadAssetIdempotent` +
		// the `existingAssetsByName` pre-fetch from `create-github-releases.ts`).
		const existingAssetsByName = yield* releaseSvc.listReleaseAssets(releaseData.id).pipe(
			Effect.map((assets) => new Map(assets.map((a) => [a.name, { url: a.url, size: a.size }] as const))),
			Effect.catchAll((e) =>
				Effect.gen(function* () {
					yield* Effect.logWarning(
						`runReleases: failed to list existing assets for ${tag.name}: ${e instanceof Error ? e.message : String(e)}`,
					);
					return new Map<string, { url: string; size: number }>();
				}),
			),
		);

		const releaseInfo: ReleaseInfo = {
			tag: tag.name,
			url: `https://github.com/${owner}/${repo}/releases/tag/${tag.name}`,
			id: releaseData.id,
			assets: [],
		};

		// Mutable release-notes string; updated after asset uploads to replace
		// placeholder cells (📦 / 📄) with real download URLs, then pushed back
		// to GitHub via repos.updateRelease (same pattern as original).
		let releaseNotes = notes;

		for (const pkg of associatedPackages) {
			const targetsWithTarballs = pkg.targets.filter((t) => t.success && t.tarballPath);

			if (targetsWithTarballs.length === 0) {
				yield* Effect.logWarning(`runReleases: no tarball path for ${pkg.name}@${pkg.version} — skipping asset upload`);
				continue;
			}

			const uniqueDirectories = new Set(targetsWithTarballs.map((t) => t.target.directory));
			const needsPrefix = uniqueDirectories.size > 1;
			const uploadedPaths = new Set<string>();

			// Accumulate SBOM / API-doc URLs so we can replace placeholder cells.
			// Keyed by package name (NOT directory) because the summary table
			// has one row per `(package, registry)` pair, and the placeholder
			// regex anchors on the package name to identify which rows to
			// rewrite. Two targets of the same package share one SBOM upload
			// and one API doc, so a single map entry covers every row for
			// that package.
			const sbomAssetUrls = new Map<string, string>();
			const apiDocAssetUrls = new Map<string, string>();

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

				// ── Tarball upload (idempotent) ─────────────────────────────────────
				const existing = existingAssetsByName.get(fileName);
				let assetUrl: string;
				let assetSize: number;

				if (existing) {
					yield* Effect.logDebug(`runReleases: asset ${fileName} already attached — reusing`);
					assetUrl = existing.url;
					assetSize = existing.size;
				} else {
					const fileContent = readFileSync(artifactPath);
					yield* Effect.logDebug(`runReleases: uploading asset ${fileName}`);

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

					yield* Effect.logDebug(`runReleases: uploaded ${fileName} → ${asset.url}`);
					assetUrl = asset.url;
					assetSize = asset.size;
					existingAssetsByName.set(fileName, { url: asset.url, size: asset.size });
				}

				// Attest the asset
				const digest = targetResult.tarballDigest ?? `sha256:${fileName}`;
				const attestationUrl = yield* attestAsset(artifactPath, pkg.name, pkg.version, digest);

				(releaseInfo.assets as AssetInfo[]).push({
					name: fileName,
					downloadUrl: assetUrl,
					size: assetSize,
					attestationUrl,
					registry: targetResult.target.registry ?? undefined,
				});

				// Storage record for GitHub Packages
				if (isGitHubPackagesRegistry(targetResult.target.registry ?? undefined)) {
					const storageIds = yield* createStorageRecord(pkg.name, pkg.version, digest);
					if (storageIds && storageIds.length > 0) {
						yield* Effect.logDebug(
							`runReleases: storage record created for ${pkg.name}@${pkg.version} (IDs: ${storageIds.join(",")})`,
						);
					}
				}

				// ── SBOM upload ─────────────────────────────────────────────────────
				if (targetResult.sbomPath && existsSync(targetResult.sbomPath)) {
					const sbomFileName = basename(targetResult.sbomPath);
					const sbomExisting = existingAssetsByName.get(sbomFileName);

					if (sbomExisting) {
						yield* Effect.logDebug(`runReleases: SBOM ${sbomFileName} already attached — reusing`);
						sbomAssetUrls.set(pkg.name, sbomExisting.url);
					} else {
						const sbomContent = readFileSync(targetResult.sbomPath);
						yield* Effect.logDebug(`runReleases: uploading SBOM ${sbomFileName}`);

						const sbomAsset = yield* releaseSvc
							.uploadAsset(releaseData.id, sbomFileName, sbomContent, "application/json")
							.pipe(
								Effect.catchAll((e: GitHubReleaseError) =>
									Effect.gen(function* () {
										yield* Effect.logWarning(`runReleases: SBOM upload failed for ${sbomFileName}: ${e.reason}`);
										return null;
									}),
								),
							);

						if (sbomAsset !== null) {
							yield* Effect.logDebug(`runReleases: uploaded SBOM ${sbomFileName} → ${sbomAsset.url}`);
							sbomAssetUrls.set(pkg.name, sbomAsset.url);
							existingAssetsByName.set(sbomFileName, { url: sbomAsset.url, size: sbomAsset.size });
							(releaseInfo.assets as AssetInfo[]).push({
								name: sbomFileName,
								downloadUrl: sbomAsset.url,
								size: sbomAsset.size,
							});
						}
					}
				}

				// ── API doc upload ──────────────────────────────────────────────────
				const apiDocPath = findApiDocFile(targetResult.target.directory, pkg.name);
				if (apiDocPath) {
					const apiDocFileName = needsPrefix
						? `${getDirectoryPrefix(targetResult.target.directory)}-${basename(apiDocPath)}`
						: basename(apiDocPath);
					const apiExisting = existingAssetsByName.get(apiDocFileName);

					if (apiExisting) {
						yield* Effect.logDebug(`runReleases: API doc ${apiDocFileName} already attached — reusing`);
						apiDocAssetUrls.set(pkg.name, apiExisting.url);
					} else {
						const apiDocContent = readFileSync(apiDocPath);
						yield* Effect.logDebug(`runReleases: uploading API doc ${apiDocFileName}`);

						const apiDocAsset = yield* releaseSvc
							.uploadAsset(releaseData.id, apiDocFileName, apiDocContent, "application/json")
							.pipe(
								Effect.catchAll((e: GitHubReleaseError) =>
									Effect.gen(function* () {
										yield* Effect.logWarning(`runReleases: API doc upload failed for ${apiDocFileName}: ${e.reason}`);
										return null;
									}),
								),
							);

						if (apiDocAsset !== null) {
							yield* Effect.logDebug(`runReleases: uploaded API doc ${apiDocFileName} → ${apiDocAsset.url}`);
							apiDocAssetUrls.set(pkg.name, apiDocAsset.url);
							existingAssetsByName.set(apiDocFileName, { url: apiDocAsset.url, size: apiDocAsset.size });
							(releaseInfo.assets as AssetInfo[]).push({
								name: apiDocFileName,
								downloadUrl: apiDocAsset.url,
								size: apiDocAsset.size,
							});
						}
					}
				}
			}

			// Replace SBOM and API-doc placeholder cells with real download
			// links. The maps are keyed by package name; the regex anchors
			// on the package's row identifier (`@scope/name@version` in the
			// Package cell) so every row owned by that package — one per
			// registry — gets the link, and rows owned by a DIFFERENT
			// package are left alone. The `g` flag is required because a
			// single package commonly has multiple targets (one row each)
			// sharing the same SBOM/API doc upload.
			const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

			for (const [pkgName, sbomUrl] of sbomAssetUrls) {
				const escapedPkg = escapeRe(pkgName);
				releaseNotes = releaseNotes.replace(
					new RegExp(`(\\| [^|\\n]+ \\| [^|\\n]*${escapedPkg}@[^|\\n]+ \\|) 📦 \\|`, "g"),
					`$1 [📦](${sbomUrl}) |`,
				);
			}

			for (const [pkgName, apiDocUrl] of apiDocAssetUrls) {
				const escapedPkg = escapeRe(pkgName);
				releaseNotes = releaseNotes.replace(
					new RegExp(`(\\| [^|\\n]+ \\| [^|\\n]*${escapedPkg}@[^|\\n]+ \\|(?: [^|\\n]+ \\|)?) 📄 \\|`, "g"),
					`$1 [📄](${apiDocUrl}) |`,
				);
			}
		}

		// ── Step 5: Refresh release body with real asset links ────────────────────
		if (releaseInfo.assets.length > 0) {
			yield* releaseSvc
				.updateRelease(releaseData.id, { body: releaseNotes.trim() })
				.pipe(
					Effect.catchAll((e) =>
						Effect.logWarning(
							`runReleases: failed to update release body for ${tag.name}: ${e instanceof Error ? e.message : String(e)}`,
						),
					),
				);
			yield* Effect.logDebug(`runReleases: updated release body with asset links for ${tag.name}`);
		}

		const releaseAssetCount = releaseInfo.assets.length;
		yield* Step.success(
			`release created — ${releaseData.id} (${associatedPackages.length} package(s), ${releaseAssetCount} asset(s))`,
		);
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
 * `GitTagLive`, `GitHubReleaseLive`, `GitHubArtifactMetadataLive`,
 * `AttestLive`, `GitHubClientLive`, and `OidcTokenIssuerLive` in production).
 *
 * @public
 */
export const runReleases = (
	args: ReleasesInputArgs,
): Effect.Effect<
	ReleasesReport,
	ReleasesError,
	| GitTag
	| GitHubRelease
	| GitHubArtifactMetadata
	| Attest
	| OidcTokenIssuer
	| GitHubClient
	| SigstoreSigner
	| ActionLogger
	| WorkspaceDiscovery
> =>
	Step.withStep(
		"Create releases",
		Effect.gen(function* () {
			if (args.tags.length === 0) {
				yield* Effect.logDebug("runReleases: no tags to process");
				yield* Step.success("0 release(s) created — no tags");
				return {
					success: true,
					releases: [],
					errors: [],
				} satisfies ReleasesReport;
			}

			// Resolve owner/repo from GitHub client
			const client = yield* GitHubClient;
			const logger = yield* ActionLogger;
			const { owner, repo } = yield* client.repo;

			// Resolve HEAD SHA — used for git tag creation.
			// `GITHUB_SHA` is always set in GitHub Actions; fall back to empty string
			// so the Test layer can exercise the code path in tests.
			const headSha = process.env.GITHUB_SHA ?? "";

			yield* Effect.logDebug(`runReleases: processing ${args.tags.length} tag(s)`);

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

				const [releaseInfo, error] = yield* logger.group(
					`Release · ${tag.packageName}@${tag.version}`,
					Step.withStep(
						`Release · ${tag.packageName}@${tag.version}`,
						processOneTag(tag, associatedPackages, owner, repo, headSha, args.dryRun),
					),
				);

				if (error !== null) {
					errors.push(error);
				} else if (releaseInfo !== null) {
					releases.push(releaseInfo);
				}
			}

			yield* Effect.logDebug(
				`runReleases: complete — ${releases.length} release(s) created, ${errors.length} error(s)`,
			);
			yield* Step.success(
				errors.length === 0
					? `${releases.length} release(s) created`
					: `${releases.length} release(s) created, ${errors.length} error(s)`,
			);

			return {
				success: errors.length === 0,
				releases,
				errors,
			} satisfies ReleasesReport;
		}),
	).pipe(
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
