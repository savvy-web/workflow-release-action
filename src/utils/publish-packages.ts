import * as fs from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import type { PackageJson, ResolvedTarget, VersionCheckResult } from "../types/publish-config.js";
import { createPackageAttestation } from "./create-attestation.js";
import { findPackagePath } from "./find-package-path.js";
import type {
	PackagePublishResult,
	PreValidationDetails,
	PreValidationTarget,
	TargetPublishResult,
} from "./generate-publish-summary.js";
import { getChangesetStatus } from "./get-changeset-status.js";
import { checkVersionExists, getLocalTarballIntegrity, publishToTarget } from "./publish-target.js";
import { setupRegistryAuth } from "./registry-auth.js";
import { getRegistryDisplayName, resolveTargets } from "./resolve-targets.js";

/**
 * Result of the publish packages operation
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
 * Status of a single target during pre-validation
 */
type PreValidationStatus =
	| "ready" // Can publish - version doesn't exist
	| "skip" // Version exists with identical content - safe to skip
	| "error"; // Auth error, network error, or content mismatch

/**
 * Result of pre-validating a single target
 */
interface TargetPreValidation {
	target: ResolvedTarget;
	packageName: string;
	version: string;
	status: PreValidationStatus;
	versionCheck?: VersionCheckResult;
	localIntegrity?: string;
	remoteIntegrity?: string;
	error?: string;
}

/**
 * Result of pre-validating all targets
 */
interface PreValidationResult {
	/** Whether all targets passed validation */
	success: boolean;
	/** All target validations */
	validations: TargetPreValidation[];
	/** Targets that are ready to publish */
	readyTargets: TargetPreValidation[];
	/** Targets that will be skipped (already published with identical content) */
	skipTargets: TargetPreValidation[];
	/** Targets with errors (auth, network, content mismatch) */
	errorTargets: TargetPreValidation[];
}

/**
 * Pre-validate all targets before publishing
 *
 * This function checks all targets across all packages to ensure:
 * 1. Authentication is valid (no E401 errors)
 * 2. Registry is reachable (no network errors)
 * 3. If version exists, content is identical (no content mismatch)
 *
 * If ANY target has an error, we fail early to prevent partial publishes.
 *
 * @param packageTargetsMap - Map of package name to targets
 * @param packageManager - Package manager to use
 * @returns Pre-validation result
 */
async function preValidateAllTargets(
	packageTargetsMap: Map<string, { path: string; version: string; targets: ResolvedTarget[] }>,
	packageManager: string,
): Promise<PreValidationResult> {
	core.startGroup("Pre-validating all publish targets");

	const validations: TargetPreValidation[] = [];
	const readyTargets: TargetPreValidation[] = [];
	const skipTargets: TargetPreValidation[] = [];
	const errorTargets: TargetPreValidation[] = [];

	for (const [packageName, packageInfo] of packageTargetsMap) {
		for (const target of packageInfo.targets) {
			const registryName = getRegistryDisplayName(target.registry);
			core.info(`Checking ${packageName}@${packageInfo.version} on ${registryName}...`);

			// Skip JSR targets for now - they have different validation
			if (target.protocol === "jsr") {
				core.info(`  ✓ JSR target - will validate during publish`);
				const validation: TargetPreValidation = {
					target,
					packageName,
					version: packageInfo.version,
					status: "ready",
				};
				validations.push(validation);
				readyTargets.push(validation);
				continue;
			}

			// Check if version exists on this registry
			const versionCheck = await checkVersionExists(packageName, packageInfo.version, target.registry, packageManager);

			if (!versionCheck.success) {
				// Registry check failed - auth error, network error, etc.
				const errorMsg = versionCheck.error || "Unknown error checking registry";
				core.error(`  ✗ ${registryName}: ${errorMsg}`);

				const validation: TargetPreValidation = {
					target,
					packageName,
					version: packageInfo.version,
					status: "error",
					versionCheck,
					error: errorMsg,
				};
				validations.push(validation);
				errorTargets.push(validation);
				continue;
			}

			if (versionCheck.versionExists) {
				// Version exists - check if content is identical
				const localIntegrity = await getLocalTarballIntegrity(target.directory, packageManager);
				const remoteIntegrity = versionCheck.versionInfo?.dist?.shasum;

				if (localIntegrity && remoteIntegrity) {
					if (localIntegrity === remoteIntegrity) {
						// Identical content - safe to skip
						core.info(`  ✓ Version exists with identical content - will skip`);
						const validation: TargetPreValidation = {
							target,
							packageName,
							version: packageInfo.version,
							status: "skip",
							versionCheck,
							localIntegrity,
							remoteIntegrity,
						};
						validations.push(validation);
						skipTargets.push(validation);
					} else {
						// Content mismatch - error
						core.error(`  ✗ Version exists with DIFFERENT content!`);
						core.error(`    Local shasum:  ${localIntegrity}`);
						core.error(`    Remote shasum: ${remoteIntegrity}`);

						const validation: TargetPreValidation = {
							target,
							packageName,
							version: packageInfo.version,
							status: "error",
							versionCheck,
							localIntegrity,
							remoteIntegrity,
							error: `Content mismatch: local=${localIntegrity}, remote=${remoteIntegrity}`,
						};
						validations.push(validation);
						errorTargets.push(validation);
					}
				} else {
					// Cannot compare integrity - treat as skip with warning
					core.warning(`  ⚠ Version exists but could not verify integrity - will skip`);
					const validation: TargetPreValidation = {
						target,
						packageName,
						version: packageInfo.version,
						status: "skip",
						versionCheck,
						localIntegrity,
						remoteIntegrity,
					};
					validations.push(validation);
					skipTargets.push(validation);
				}
			} else {
				// Version doesn't exist - ready to publish
				core.info(`  ✓ Version not found - ready to publish`);
				const validation: TargetPreValidation = {
					target,
					packageName,
					version: packageInfo.version,
					status: "ready",
					versionCheck,
				};
				validations.push(validation);
				readyTargets.push(validation);
			}
		}
	}

	const success = errorTargets.length === 0;

	if (success) {
		core.info("");
		core.info(`Pre-validation passed: ${readyTargets.length} to publish, ${skipTargets.length} to skip`);
	} else {
		core.error("");
		core.error(`Pre-validation FAILED: ${errorTargets.length} target(s) have errors`);
		core.error("Fix these issues before publishing:");
		for (const error of errorTargets) {
			const registryName = getRegistryDisplayName(error.target.registry);
			core.error(`  - ${error.packageName}@${error.version} → ${registryName}: ${error.error}`);
		}
	}

	core.endGroup();

	return {
		success,
		validations,
		readyTargets,
		skipTargets,
		errorTargets,
	};
}

/**
 * Convert internal validation results to summary-compatible format
 */
function toPreValidationDetails(result: PreValidationResult): PreValidationDetails {
	const convert = (v: TargetPreValidation): PreValidationTarget => ({
		registryName: getRegistryDisplayName(v.target.registry),
		protocol: v.target.protocol,
		packageName: v.packageName,
		version: v.version,
		status: v.status,
		error: v.error,
		localIntegrity: v.localIntegrity,
		remoteIntegrity: v.remoteIntegrity,
		registryUrl: v.target.registry,
	});

	return {
		targets: result.validations.map(convert),
		readyTargets: result.readyTargets.map(convert),
		skipTargets: result.skipTargets.map(convert),
		errorTargets: result.errorTargets.map(convert),
	};
}

/**
 * Publish all packages to their configured targets
 *
 * @remarks
 * This function:
 * 1. Gets changeset status to find packages with version changes (or uses pre-detected releases)
 * 2. Resolves publish targets for each package
 * 3. Sets up registry authentication
 * 4. Runs build if configured
 * 5. Publishes each package to each target
 *
 * @param packageManager - Package manager to use
 * @param targetBranch - Target branch for merge base comparison
 * @param dryRun - Whether to skip actual publishing
 * @param preDetectedReleases - Optional pre-detected releases (for Phase 3 when changesets are consumed)
 * @returns Promise resolving to publish result
 */
export async function publishPackages(
	packageManager: string,
	targetBranch: string,
	dryRun: boolean,
	preDetectedReleases?: PreDetectedRelease[],
): Promise<PublishPackagesResult> {
	core.startGroup("Publishing packages");

	// Use pre-detected releases if provided, otherwise get from changeset status
	let releases: Array<{ name: string; newVersion: string; type: string; path?: string }>;

	if (preDetectedReleases && preDetectedReleases.length > 0) {
		core.info(`Using ${preDetectedReleases.length} pre-detected release(s)`);
		releases = preDetectedReleases.map((r) => ({
			name: r.name,
			newVersion: r.version,
			type: "patch", // Default, actual type determined by detection
			path: r.path,
		}));
	} else {
		// Get changeset status to find packages with version changes
		core.info("Getting changeset status...");
		const changesetStatus = await getChangesetStatus(packageManager, targetBranch);
		core.info(`Found ${changesetStatus.releases.length} package(s) with version changes`);
		releases = changesetStatus.releases;
	}

	if (releases.length === 0) {
		core.info("No packages to publish");
		core.endGroup();

		return {
			success: true,
			packages: [],
			totalPackages: 0,
			successfulPackages: 0,
			totalTargets: 0,
			successfulTargets: 0,
		};
	}

	// Resolve targets for all packages
	const allTargets: ResolvedTarget[] = [];
	const packageTargetsMap = new Map<
		string,
		{
			path: string;
			version: string;
			targets: ResolvedTarget[];
		}
	>();

	for (const release of releases) {
		// Use pre-detected path if available, otherwise find it
		const workspacePath = release.path || findPackagePath(release.name);
		if (!workspacePath) {
			core.error(`Could not find workspace path for package ${release.name}`);
			continue;
		}

		const pkgJsonPath = path.join(workspacePath, "package.json");
		if (!fs.existsSync(pkgJsonPath)) {
			core.error(`package.json not found at ${pkgJsonPath}`);
			continue;
		}

		const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8")) as PackageJson;
		const targets = resolveTargets(workspacePath, pkgJson);

		if (targets.length === 0) {
			core.info(`Package ${release.name} has no publish targets (private or no publishConfig)`);
			continue;
		}

		packageTargetsMap.set(release.name, {
			path: workspacePath,
			version: release.newVersion,
			targets,
		});
		allTargets.push(...targets);

		core.info(`Package ${release.name}@${release.newVersion}: ${targets.length} target(s)`);
	}

	// Setup authentication for all registries
	core.info("Setting up registry authentication...");
	const authResult = await setupRegistryAuth(allTargets, packageManager);

	if (!authResult.success) {
		if (authResult.missingTokens.length > 0) {
			core.warning("Some registry tokens are missing:");
			for (const missing of authResult.missingTokens) {
				core.warning(`  - ${missing.registry}: ${missing.tokenEnv} not set`);
			}
		}
	}

	// Run build BEFORE pre-validation so we can compare tarball integrity
	// Run build before publishing
	core.info("Running build...");
	const buildCmd = packageManager === "npm" ? "npm" : packageManager;
	const buildArgs = packageManager === "npm" ? ["run", "ci:build"] : ["ci:build"];

	let buildExitCode = 0;
	let buildStdout = "";
	let buildStderr = "";
	try {
		buildExitCode = await exec.exec(buildCmd, buildArgs, {
			ignoreReturnCode: true,
			listeners: {
				stdout: (data: Buffer) => {
					buildStdout += data.toString();
				},
				stderr: (data: Buffer) => {
					buildStderr += data.toString();
				},
			},
		});
	} catch (error) {
		core.error(`Build failed: ${error instanceof Error ? error.message : String(error)}`);
		buildStderr = error instanceof Error ? error.message : String(error);
		buildExitCode = 1;
	}

	if (buildExitCode !== 0) {
		core.error("Build failed, aborting publish");
		core.endGroup();

		return {
			success: false,
			packages: [],
			totalPackages: packageTargetsMap.size,
			successfulPackages: 0,
			totalTargets: allTargets.length,
			successfulTargets: 0,
			buildError: buildStderr || `Build exited with code ${buildExitCode}`,
			buildOutput: buildStdout,
		};
	}

	core.info("Build completed successfully");

	// Pre-validate ALL targets before publishing ANY
	// This prevents partial publishes where some registries succeed and others fail
	const preValidation = await preValidateAllTargets(packageTargetsMap, packageManager);

	if (!preValidation.success) {
		core.error("");
		core.error("🔴 Pre-validation failed - aborting publish to prevent partial releases");
		core.endGroup();

		return {
			success: false,
			packages: [],
			totalPackages: packageTargetsMap.size,
			successfulPackages: 0,
			totalTargets: allTargets.length,
			successfulTargets: 0,
			buildError: `Pre-validation failed: ${preValidation.errorTargets.length} target(s) have errors`,
			preValidationDetails: toPreValidationDetails(preValidation),
		};
	}

	// Build a set of targets that should be skipped (already published with identical content)
	const skipTargetKeys = new Set(
		preValidation.skipTargets.map((v) => `${v.packageName}:${v.target.registry || "jsr"}`),
	);

	// Publish each package to each target
	const results: PackagePublishResult[] = [];
	let successfulPackages = 0;
	let successfulTargets = 0;
	const totalTargets = allTargets.length;

	for (const [name, packageInfo] of packageTargetsMap) {
		core.startGroup(`Publishing ${name}@${packageInfo.version}`);

		const targetResults: TargetPublishResult[] = [];
		let allTargetsSuccess = true;

		for (const target of packageInfo.targets) {
			const registryName = getRegistryDisplayName(target.registry);
			const targetKey = `${name}:${target.registry || "jsr"}`;

			// Skip targets that were pre-validated as "skip" (already published with identical content)
			if (skipTargetKeys.has(targetKey)) {
				core.info(`✓ Skipping ${registryName} - already published with identical content`);
				successfulTargets++;

				targetResults.push({
					target,
					success: true,
					alreadyPublished: true,
					alreadyPublishedReason: "identical",
				});
				continue;
			}

			core.info(`Publishing to ${registryName}...`);

			try {
				const publishResult = await publishToTarget(target, dryRun, packageManager);

				// Determine if this is a safe skip or an error
				// "different" means tarball content mismatch - this is an error
				const isDifferentContent = publishResult.alreadyPublishedReason === "different";
				const isSafeSkip = publishResult.alreadyPublished === true && !isDifferentContent;
				const effectiveSuccess = publishResult.success || isSafeSkip;

				const result: TargetPublishResult = {
					target,
					success: effectiveSuccess,
					registryUrl: publishResult.registryUrl,
					attestationUrl: publishResult.attestationUrl,
					error: effectiveSuccess ? undefined : publishResult.error,
					stdout: publishResult.output,
					stderr: publishResult.error,
					exitCode: publishResult.exitCode,
					alreadyPublished: publishResult.alreadyPublished,
					alreadyPublishedReason: publishResult.alreadyPublishedReason,
				};

				targetResults.push(result);

				if (publishResult.success) {
					successfulTargets++;
					core.info(`✓ Published to ${registryName}`);
					if (publishResult.registryUrl) {
						core.info(`  Package URL: ${publishResult.registryUrl}`);
					}
					if (publishResult.attestationUrl) {
						core.info(`  Provenance: ${publishResult.attestationUrl}`);
					}
				} else if (publishResult.alreadyPublished) {
					if (isDifferentContent) {
						// Content mismatch is an actual error
						allTargetsSuccess = false;
						core.error(`✗ Version already published to ${registryName} with DIFFERENT content!`);
						core.error(`  Local shasum:  ${publishResult.localIntegrity}`);
						core.error(`  Remote shasum: ${publishResult.remoteIntegrity}`);
						core.error(`  This indicates the same version was published with different files.`);
					} else if (publishResult.alreadyPublishedReason === "identical") {
						// Identical content - safe to skip
						successfulTargets++;
						core.info(`✓ Version already published to ${registryName} with identical content - skipping`);
					} else {
						// Unknown - couldn't compare, treat as warning
						successfulTargets++;
						core.warning(`⚠ Version already published to ${registryName} - skipping (could not verify content)`);
					}
				} else {
					allTargetsSuccess = false;
					core.error(`✗ Failed to publish to ${registryName}: ${publishResult.error}`);
				}
			} catch (error) {
				allTargetsSuccess = false;
				const errorMessage = error instanceof Error ? error.message : String(error);
				core.error(`✗ Failed to publish to ${registryName}: ${errorMessage}`);

				targetResults.push({
					target,
					success: false,
					error: errorMessage,
					exitCode: 1,
				});
			}
		}

		// Create GitHub attestation for successfully published packages ONLY if:
		// 1. All targets succeeded
		// 2. No target already has a provenance attestation URL (from npm --provenance)
		//
		// This avoids duplicate attestations when npm's built-in provenance is used.
		// The npm provenance attestation is preferred because it's integrated with the registry.
		let githubAttestationUrl: string | undefined;
		const hasProvenanceAttestation = targetResults.some((t) => t.success && t.attestationUrl);

		if (allTargetsSuccess && !hasProvenanceAttestation) {
			const firstSuccessfulTarget = targetResults.find((t) => t.success);
			if (firstSuccessfulTarget) {
				core.info("Creating GitHub attestation for package (no npm provenance available)...");
				const attestationDir = firstSuccessfulTarget.target.directory;
				const attestationResult = await createPackageAttestation(
					name,
					packageInfo.version,
					attestationDir,
					dryRun,
					packageManager,
				);
				if (attestationResult.success && attestationResult.attestationUrl) {
					githubAttestationUrl = attestationResult.attestationUrl;
					core.info(`  ✓ Created GitHub attestation: ${githubAttestationUrl}`);
				}
			}
		} else if (hasProvenanceAttestation) {
			core.info("✓ Package attestation already created via npm provenance");
		}

		results.push({
			name,
			version: packageInfo.version,
			targets: targetResults,
			githubAttestationUrl,
		});

		if (allTargetsSuccess) {
			successfulPackages++;
		}

		core.endGroup();
	}

	core.endGroup();

	const allSuccess = successfulPackages === packageTargetsMap.size;

	return {
		success: allSuccess,
		packages: results,
		totalPackages: packageTargetsMap.size,
		successfulPackages,
		totalTargets,
		successfulTargets,
	};
}
