/**
 * Stable type home for publish-chain result shapes consumed by the schema
 * projection layer and the Effect orchestration in `src/release/`.
 *
 * @remarks
 * These types were originally co-located with their producing modules
 * (`publish-packages.ts`, `create-github-releases.ts`,
 * `generate-publish-summary.ts`). They are gathered here so the projection
 * layer (`src/schema/projections.ts`) and future Effect-based orchestration
 * can share them without importing from implementation modules.
 */

import type { AlreadyPublishedReason, ResolvedTarget } from "../types/publish-config.js";

/**
 * Result for a single target publish
 *
 * @public
 */
export interface TargetPublishResult {
	target: ResolvedTarget;
	success: boolean;
	/**
	 * Explicit per-target publish status — the canonical three-way decision
	 * recorded by the orchestrator. `success` (the boolean) is derived from
	 * this for backwards compatibility: `published` and `skipped` map to
	 * `success: true`; `failed` maps to `success: false`. New code should
	 * read `status` directly.
	 */
	status?: "published" | "skipped" | "failed" | undefined;
	/**
	 * Per-target skip reason. Lifted onto the target level so a fully-
	 * recovered run can report which targets were recovered (the package-
	 * level `PublishPackage.skipReason` only fires when every target was
	 * skipped).
	 */
	skipReason?: "already-published-identical" | undefined;
	/**
	 * Pair of digests when the orchestrator made a recovery decision — both
	 * `status: "skipped"` with `skipReason: "already-published-identical"`
	 * (local matches what the registry already has) and the fatal
	 * `status: "failed"` integrity-mismatch outcome (local differs from
	 * what the registry has).
	 */
	recovery?:
		| {
				readonly localDigest: string;
				readonly remoteDigest: string;
		  }
		| undefined;
	registryUrl?: string | undefined;
	attestationUrl?: string | undefined;
	error?: string | undefined;
	/** Full stdout from publish command */
	stdout?: string | undefined;
	/** Full stderr from publish command */
	stderr?: string | undefined;
	/** Exit code from publish command */
	exitCode?: number | undefined;
	/** True if version was already published - not an error, just skipped */
	alreadyPublished?: boolean | undefined;
	/** Reason for already published state */
	alreadyPublishedReason?: AlreadyPublishedReason | undefined;
	/** Path to the tarball that was published */
	tarballPath?: string | undefined;
	/** SHA-256 digest of the published tarball (format: "sha256:hex") */
	tarballDigest?: string | undefined;
	/** Path to the SBOM JSON file for this target */
	sbomPath?: string | undefined;
	/** URL to SBOM attestation for this target */
	sbomAttestationUrl?: string | undefined;
	/** Packed (tarball) size in bytes reported by the publish dry-run */
	packedSize?: number | undefined;
	/** Unpacked size in bytes reported by the publish dry-run */
	unpackedSize?: number | undefined;
	/** Number of files in the tarball reported by the publish dry-run */
	fileCount?: number | undefined;
	/**
	 * Recovery state for the per-build attestation step.
	 *
	 * @remarks
	 * Populated when the publish orchestrator probed the GitHub
	 * attestation store with `Attest.listForSubject` before writing,
	 * and on a per-attestation-kind basis:
	 *
	 *  - `provenance: true` — a SLSA provenance attestation already
	 *    existed for this tarball's `sha256` and the orchestrator
	 *    reused the existing URL instead of writing a fresh one.
	 *  - `sbom: true` — same, but for the CycloneDX SBOM attestation.
	 *  - `false` (either field) — the attestation was newly written
	 *    this run.
	 *
	 * Absent when no attestation step ran (every target in the group
	 * had `provenance: false`). The schema projection layer turns
	 * `undefined` into `null` for the two `*AttestationRecovered`
	 * fields on `PublishTarget`.
	 */
	recovered?:
		| {
				readonly provenance: boolean;
				readonly sbom: boolean;
		  }
		| undefined;
}

/**
 * Result for a package publish
 *
 * @public
 */
export interface PackagePublishResult {
	name: string;
	version: string;
	targets: TargetPublishResult[];
	/** URL to GitHub attestation (SLSA provenance) */
	githubAttestationUrl?: string | undefined;
	/** Version on the target branch; `null` for a brand-new package */
	baseVersion?: string | null | undefined;
	/** Number of changesets attributed to this package on the target branch */
	changesetCount?: number | undefined;
}

/**
 * Result of the publish packages operation
 *
 * @public
 */
export interface PublishPackagesResult {
	/** Whether all packages published successfully */
	success: boolean;
	/** Results for each package */
	packages: PackagePublishResult[];
	/** Total packages attempted */
	totalPackages: number;
	/** Packages that succeeded */
	successfulPackages: number;
	/** Total targets attempted */
	totalTargets: number;
	/** Targets that succeeded */
	successfulTargets: number;
	/** Build error if build failed */
	buildError?: string;
	/** Build stdout output */
	buildOutput?: string;
	/** Pre-validation details when pre-validation fails */
	preValidationDetails?: PreValidationDetails;
}

/**
 * The package / build directory a {@link ValidationFinding} concerns.
 *
 * @remarks
 * A repo-wide finding (e.g. a build failure) carries `null`. A package-scoped
 * finding sets `package` and leaves `directory` `null`. A build-scoped finding
 * (e.g. an SBOM issue for one build directory) sets both.
 *
 * @public
 */
export interface ValidationFindingScope {
	/** The package the finding concerns, or `null` for a repo-wide finding. */
	readonly package: string | null;
	/** The build directory the finding concerns, or `null` when not build-scoped. */
	readonly directory: string | null;
}

/**
 * A non-pass outcome from a validation check.
 *
 * @remarks
 * Findings are additive to the existing boolean `ValidationReport` fields.
 * An `error` finding fails the check (check-run conclusion `failure`); a
 * `warning` is advisory — the release PR remains mergeable.
 *
 * @public
 */
export interface ValidationFinding {
	/** `"error"` fails the check; `"warning"` is advisory (release still proceeds). */
	readonly severity: "error" | "warning";
	/** The check that produced it, e.g. `"Publish Validation"`, `"SBOM Preview"`. */
	readonly check: string;
	/** The package / build directory it concerns; `null` for repo-wide findings. */
	readonly scope: ValidationFindingScope | null;
	/** Human-readable detail. */
	readonly message: string;
}

/**
 * The SBOM preview computed once per build directory.
 *
 * @public
 */
export interface BuildSbom {
	/** Number of components (direct runtime dependencies) in the BOM. */
	readonly componentCount: number;
	/** Whether the BOM satisfies all seven NTIA minimum elements. */
	readonly ntiaCompliant: boolean;
	/** Names of the NTIA minimum elements the BOM is missing. */
	readonly missingNtiaFields: ReadonlyArray<string>;
}

/**
 * A single registry target under a build — its per-registry publish readiness.
 *
 * @public
 */
export interface BuildTargetResult {
	/** Registry URL the target publishes to. */
	readonly registry: string;
	/** Per-registry publish readiness. */
	readonly status: "ready" | "skipped" | "failed";
	/** npm access level. */
	readonly access: "public" | "restricted";
	/** Whether provenance attestation is enabled for this target. */
	readonly provenance: boolean;
	/** Failure detail when `status` is `"failed"`. */
	readonly error?: string | undefined;
}

/**
 * A build — one per unique target directory of a released package.
 *
 * @remarks
 * Each build packs once (one tarball → one set of sizes) and generates one
 * SBOM; it then publishes to N registry {@link BuildTargetResult | targets}
 * that share the directory.
 *
 * @public
 */
export interface PackageBuildResult {
	/** Package-relative build directory (e.g. `dist/npm`). */
	readonly directory: string;
	/** Packed tarball size in bytes, or `null` when the dry-run did not report it. */
	readonly packedBytes: number | null;
	/** Unpacked size in bytes, or `null` when the dry-run did not report it. */
	readonly unpackedBytes: number | null;
	/** File count in the tarball, or `null` when the dry-run did not report it. */
	readonly fileCount: number | null;
	/** SBOM preview for this build, or `null` when generation failed. */
	readonly sbom: BuildSbom | null;
	/** Registry targets that publish this build. */
	readonly targets: ReadonlyArray<BuildTargetResult>;
}

/**
 * A released package and its builds — the build-centric validation result.
 *
 * @remarks
 * The Phase-2 validation path uses this in place of {@link PackagePublishResult}
 * (which the Phase-3 publish path shares and must not be restructured).
 *
 * @public
 */
export interface ValidationPackageResult {
	/** Package name. */
	readonly name: string;
	/** Version being released. */
	readonly version: string;
	/** Version on the target branch; `null` for a brand-new package. */
	readonly baseVersion: string | null;
	/** Number of changesets attributed to this package, or `null` when unknown. */
	readonly changesetCount: number | null;
	/** Builds — one per unique target directory. Empty for a version-only package. */
	readonly builds: ReadonlyArray<PackageBuildResult>;
	/**
	 * The extracted `CHANGELOG.md` section for the new version, or a
	 * discriminated "why nothing was extracted" status.
	 *
	 * @remarks
	 * Computed during `runValidation` by reading the package's `CHANGELOG.md`
	 * (already written by `changeset version` on the release branch) and
	 * locating the heading for {@link ValidationPackageResult.version}.
	 * Rendered on the Release Notes Preview check-run page; also surfaced on
	 * the canonical `ValidationOutput` so downstream consumers can post the
	 * extracted notes wherever they like.
	 */
	readonly releaseNotes: import("../utils/extract-release-notes.js").ReleaseNotesExtraction;
}

/**
 * Pre-detected release information for publishing
 *
 * @public
 */
export interface PreDetectedRelease {
	/** Package name */
	name: string;
	/** New version to publish */
	version: string;
	/** Path to the package directory */
	path: string;
}

/**
 * Information about a created release
 *
 * @public
 */
export interface ReleaseInfo {
	/** Release tag name */
	tag: string;
	/** Release URL */
	url: string;
	/** Release ID */
	id: number;
	/** Uploaded assets */
	assets: AssetInfo[];
}

/**
 * Information about an uploaded asset
 *
 * @public
 */
export interface AssetInfo {
	/** Asset name */
	name: string;
	/** Download URL */
	downloadUrl: string;
	/** Asset size in bytes */
	size: number;
	/** Attestation URL if attestation was created */
	attestationUrl?: string | undefined;
	/** Registry this tarball was published to (if multi-target) */
	registry?: string | undefined;
}

/**
 * Pre-validation status for a single target
 *
 * @public
 */
export type PreValidationStatus =
	| "ready" // Can publish - version doesn't exist
	| "skip" // Version exists with identical content - safe to skip
	| "error"; // Auth error, network error, or content mismatch

/**
 * Pre-validation result for a single target
 *
 * @public
 */
export interface PreValidationTarget {
	/** Target registry display name */
	registryName: string;
	/** Target protocol (npm, jsr) */
	protocol: string;
	/** Package name */
	packageName: string;
	/** Package version */
	version: string;
	/** Validation status */
	status: PreValidationStatus;
	/** Error message if status is 'error' */
	error?: string | undefined;
	/** Local tarball shasum */
	localIntegrity?: string | undefined;
	/** Remote tarball shasum */
	remoteIntegrity?: string | undefined;
	/** Original registry URL */
	registryUrl?: string | null | undefined;
}

/**
 * Full pre-validation result
 *
 * @public
 */
export interface PreValidationDetails {
	/** All validated targets */
	targets: PreValidationTarget[];
	/** Targets ready to publish */
	readyTargets: PreValidationTarget[];
	/** Targets that would be skipped */
	skipTargets: PreValidationTarget[];
	/** Targets with errors */
	errorTargets: PreValidationTarget[];
}

export type { TagInfo } from "../utils/determine-tag-strategy.js";
