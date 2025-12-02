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
}

/**
 * Publish all packages to their configured targets
 *
 * @remarks
 * This function:
 * 1. Gets changeset status to find packages with version changes
 * 2. Resolves publish targets for each package
 * 3. Sets up registry authentication
 * 4. Runs build if configured
 * 5. Publishes each package to each target
 *
 * @param packageManager - Package manager to use
 * @param targetBranch - Target branch for merge base comparison
 * @param dryRun - Whether to skip actual publishing
 * @returns Promise resolving to publish result
 */
export async function publishPackages(
	packageManager: string,
	targetBranch: string,
	dryRun: boolean,
): Promise<PublishPackagesResult> {
	core.startGroup("Publishing packages");

	// Get changeset status to find packages with version changes
	core.info("Getting changeset status...");
	const changesetStatus = await getChangesetStatus(packageManager, targetBranch);
	core.info(`Found ${changesetStatus.releases.length} package(s) with version changes`);

	if (changesetStatus.releases.length === 0) {
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

	for (const release of changesetStatus.releases) {
		const workspacePath = findPackagePath(release.name);
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
	const authResult = setupRegistryAuth(allTargets);

	if (!authResult.success) {
		core.warning("Some registry tokens are missing:");
		for (const missing of authResult.missingTokens) {
			core.warning(`  - ${missing.registry}: ${missing.tokenEnv} not set`);
		}
	}

	// Run build before publishing
	core.info("Running build...");
	const buildCmd = packageManager === "npm" ? "npm" : packageManager;
	const buildArgs = packageManager === "npm" ? ["run", "ci:build"] : ["ci:build"];

	let buildExitCode = 0;
	try {
		buildExitCode = await exec.exec(buildCmd, buildArgs, {
			ignoreReturnCode: true,
		});
	} catch (error) {
		core.error(`Build failed: ${error instanceof Error ? error.message : String(error)}`);
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

				const result: TargetPublishResult = {
					target,
					success: publishResult.success,
					registryUrl: publishResult.registryUrl,
					attestationUrl: publishResult.attestationUrl,
					error: publishResult.success ? undefined : publishResult.error,
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
