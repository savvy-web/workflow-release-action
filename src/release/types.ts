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
