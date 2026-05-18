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
import type { AttestError, GitHubReleaseError, GitTagError, SigstoreSigner } from "@savvy-web/github-action-effects";
import {
	ActionLogger,
	Attest,
	GitHubClient,
	GitHubRelease,
	GitTag,
	OidcTokenIssuer,
	buildSLSAProvenancePredicate,
	decodeJwtClaims,
} from "@savvy-web/github-action-effects";
import { Effect, Redacted } from "effect";

import { WorkspaceDiscovery } from "workspaces-effect";
import { getRegistryDisplayName, isGitHubPackagesRegistry } from "../utils/registry-utils.js";
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
	GitTag | GitHubRelease | Attest | OidcTokenIssuer | GitHubClient | SigstoreSigner | WorkspaceDiscovery
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

		yield* gitTagSvc.create(tag.name, headSha).pipe(
			Effect.catchAll((e: GitTagError) => {
				// Idempotent: if tag already exists at same SHA, treat as success.
				// Log a warning and continue; the release step will handle existing
				// releases via getByTag.
				return Effect.logWarning(`runReleases: tag ${tag.name} create failed (${e.reason}) — proceeding`);
			}),
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

		// The `GitHubRelease` service does not expose `updateRelease` or
		// `listReleaseAssets` — use `GitHubClient.rest` for those two calls
		// (mirrors the pattern used in `createStorageRecord` above).
		const client = yield* GitHubClient;

		// Pre-fetch existing release assets for idempotency: if a re-run
		// encounters an asset name already attached to this release, skip the
		// upload and reuse the existing URL (ports `uploadAssetIdempotent` +
		// the `existingAssetsByName` pre-fetch from `create-github-releases.ts`).
		const existingAssetsByName = yield* client
			.rest("repos.listReleaseAssets", async (octokit) => {
				const ok = octokit as {
					rest: {
						repos: {
							listReleaseAssets: (params: {
								owner: string;
								repo: string;
								release_id: number;
								per_page: number;
							}) => Promise<{ data: Array<{ name: string; browser_download_url: string; size: number }> }>;
						};
					};
				};
				return ok.rest.repos.listReleaseAssets({ owner, repo, release_id: releaseData.id, per_page: 100 });
			})
			.pipe(
				Effect.map(
					(assets) => new Map(assets.map((a) => [a.name, { url: a.browser_download_url, size: a.size }] as const)),
				),
				Effect.catchAll((e: unknown) =>
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
						sbomAssetUrls.set(targetResult.target.directory, sbomExisting.url);
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
							sbomAssetUrls.set(targetResult.target.directory, sbomAsset.url);
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
						apiDocAssetUrls.set(targetResult.target.directory, apiExisting.url);
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
							apiDocAssetUrls.set(targetResult.target.directory, apiDocAsset.url);
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

			// Replace SBOM placeholder cells with real download links
			for (const [_dir, sbomUrl] of sbomAssetUrls) {
				releaseNotes = releaseNotes.replace(
					/\| 📦 \| (📄|—) \| (\[Sigstore\]|\[GitHub\]|\[SBOM\]|—)/,
					`| [📦](${sbomUrl}) | $1 | $2`,
				);
			}

			// Replace API-doc placeholder cells with real download links
			for (const [_dir, apiDocUrl] of apiDocAssetUrls) {
				releaseNotes = releaseNotes.replace(
					/\| 📄 \| (\[Sigstore\]|\[GitHub\]|\[SBOM\]|—)/,
					`| [📄](${apiDocUrl}) | $1`,
				);
			}
		}

		// ── Step 5: Refresh release body with real asset links ────────────────────
		if (releaseInfo.assets.length > 0) {
			yield* client
				.rest("repos.updateRelease", async (octokit) => {
					const ok = octokit as {
						rest: {
							repos: {
								updateRelease: (params: {
									owner: string;
									repo: string;
									release_id: number;
									body: string;
								}) => Promise<{ data: unknown }>;
							};
						};
					};
					return ok.rest.repos.updateRelease({
						owner,
						repo,
						release_id: releaseData.id,
						body: releaseNotes.trim(),
					});
				})
				.pipe(
					Effect.flatMap(() => Effect.void),
					Effect.catchAll((e: unknown) =>
						Effect.logWarning(
							`runReleases: failed to update release body for ${tag.name}: ${e instanceof Error ? e.message : String(e)}`,
						),
					),
				);
			yield* Effect.logDebug(`runReleases: updated release body with asset links for ${tag.name}`);
		}

		yield* Effect.logInfo(`✅ release created — ${releaseData.id}`);
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
	GitTag | GitHubRelease | Attest | OidcTokenIssuer | GitHubClient | SigstoreSigner | ActionLogger | WorkspaceDiscovery
> =>
	Effect.gen(function* () {
		if (args.tags.length === 0) {
			yield* Effect.logDebug("runReleases: no tags to process");
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
				processOneTag(tag, associatedPackages, owner, repo, headSha, args.dryRun),
			);

			if (error !== null) {
				errors.push(error);
			} else if (releaseInfo !== null) {
				releases.push(releaseInfo);
			}
		}

		yield* Effect.logDebug(`runReleases: complete — ${releases.length} release(s) created, ${errors.length} error(s)`);

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
