import * as fs from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import type { PackageJson, ResolvedTarget } from "../types/publish-config.js";
import { findPackagePath } from "./find-package-path.js";
import type { PackagePublishResult, TargetPublishResult } from "./generate-publish-summary.js";
import { getChangesetStatus } from "./get-changeset-status.js";
import { publishToTarget } from "./publish-target.js";
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
	const authResult = await setupRegistryAuth(allTargets);

	if (!authResult.success) {
		if (authResult.missingTokens.length > 0) {
			core.warning("Some registry tokens are missing:");
			for (const missing of authResult.missingTokens) {
				core.warning(`  - ${missing.registry}: ${missing.tokenEnv} not set`);
			}
		}
		if (authResult.unreachableRegistries.length > 0) {
			core.error("Some registries are unreachable:");
			for (const unreachable of authResult.unreachableRegistries) {
				core.error(`  - ${unreachable.registry}: ${unreachable.error}`);
			}
		}
	}

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
			core.info(`Publishing to ${registryName}...`);

			try {
				const publishResult = await publishToTarget(target, dryRun);

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

		results.push({
			name,
			version: packageInfo.version,
			targets: targetResults,
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
