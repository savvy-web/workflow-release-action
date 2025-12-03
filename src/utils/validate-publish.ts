import * as fs from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";
import type {
	PackageJson,
	PackagePublishValidation,
	ResolvedTarget,
	TargetValidationResult,
} from "../types/publish-config.js";
import { dryRunPublish } from "./dry-run-publish.js";
import { findPackagePath } from "./find-package-path.js";
import { generatePublishSummary } from "./generate-publish-summary.js";
import { getChangesetStatus } from "./get-changeset-status.js";
import { preValidateTarget } from "./pre-validate-target.js";
import { setupRegistryAuth } from "./registry-auth.js";
import { countChangesetsPerPackage } from "./release-summary-helpers.js";
import { getRegistryDisplayName, resolveTargets } from "./resolve-targets.js";

/**
 * Unified publish validation result
 */
export interface PublishValidationResult {
	/** Whether all validations passed */
	success: boolean;
	/** Package validation results */
	validations: PackagePublishValidation[];
	/** Summary markdown for the validation */
	summary: string;
	/** Total number of publish targets */
	totalTargets: number;
	/** Number of ready targets */
	readyTargets: number;
	/** Whether NPM targets are ready (for backwards compatibility) */
	npmReady: boolean;
	/** Whether GitHub Packages targets are ready (for backwards compatibility) */
	githubPackagesReady: boolean;
}

/**
 * Validates publishing for all packages across all configured targets
 *
 * This unified validation replaces the separate NPM and GitHub Packages
 * validation, using the multi-registry publish configuration system.
 *
 * @param packageManager - Package manager to use
 * @param targetBranch - Target branch for merge base comparison
 * @param dryRun - Whether this is a dry-run
 * @returns Promise resolving to validation result
 */
export async function validatePublish(
	packageManager: string,
	targetBranch: string,
	dryRun: boolean,
): Promise<PublishValidationResult> {
	core.startGroup("Validating package publishing (multi-registry)");

	// Get changeset status to find packages with version changes
	core.info("Getting changeset status");
	const changesetStatus = await getChangesetStatus(packageManager, targetBranch);
	core.info(`Found ${changesetStatus.releases.length} package(s) with version changes`);

	if (changesetStatus.releases.length === 0) {
		core.info("No packages to validate");
		core.endGroup();

		return {
			success: true,
			validations: [],
			summary: "No changesets found or changesets already versioned",
			totalTargets: 0,
			readyTargets: 0,
			npmReady: true,
			githubPackagesReady: true,
		};
	}

	// Resolve targets for all packages
	const allTargets: ResolvedTarget[] = [];
	const packageTargetsMap = new Map<string, { path: string; targets: ResolvedTarget[] }>();
	const packageDiscoveryErrors = new Map<string, string>();

	for (const release of changesetStatus.releases) {
		// Find the workspace package path (not the publish directory)
		const workspacePath = findPackagePath(release.name);
		if (!workspacePath) {
			const errorMsg = `Could not find workspace path for package ${release.name} - ensure package is configured in workspace`;
			core.error(errorMsg);
			packageDiscoveryErrors.set(release.name, errorMsg);
			continue;
		}

		// Read the source package.json to get publishConfig
		const pkgJsonPath = path.join(workspacePath, "package.json");
		if (!fs.existsSync(pkgJsonPath)) {
			const errorMsg = `package.json not found at ${pkgJsonPath}`;
			core.error(errorMsg);
			packageDiscoveryErrors.set(release.name, errorMsg);
			continue;
		}

		const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8")) as PackageJson;
		const targets = resolveTargets(workspacePath, pkgJson);

		packageTargetsMap.set(release.name, { path: workspacePath, targets });
		allTargets.push(...targets);

		core.info(`Package ${release.name}: ${targets.length} publish target(s)`);
		for (const target of targets) {
			core.debug(`  - ${target.protocol} -> ${getRegistryDisplayName(target.registry)} (${target.directory})`);
		}
	}

	// Setup authentication for all registries
	core.info("Setting up registry authentication");
	const authResult = await setupRegistryAuth(allTargets, packageManager);

	// Track unreachable registries to skip them during validation
	const unreachableRegistrySet = new Set(authResult.unreachableRegistries.map((r) => r.registry));

	if (!authResult.success) {
		if (authResult.missingTokens.length > 0) {
			core.warning("Some registry tokens are missing:");
			for (const missing of authResult.missingTokens) {
				core.warning(`  - ${missing.registry}: ${missing.tokenEnv} not set`);
			}
		}
		if (authResult.unreachableRegistries.length > 0) {
			core.error("Some registries are unreachable (will skip validation):");
			for (const unreachable of authResult.unreachableRegistries) {
				core.error(`  - ${unreachable.registry}: ${unreachable.error}`);
			}
		}
	}

	// Validate each package and its targets
	const validations: PackagePublishValidation[] = [];

	for (const release of changesetStatus.releases) {
		// Check if package had discovery errors
		const discoveryError = packageDiscoveryErrors.get(release.name);
		if (discoveryError) {
			core.error(`Package ${release.name}: ${discoveryError}`);
			validations.push({
				name: release.name,
				version: release.newVersion,
				path: "",
				targets: [],
				allTargetsValid: false, // Mark as failed
				hasPublishableTargets: false,
				discoveryError, // Include the error message
			});
			continue;
		}

		const packageInfo = packageTargetsMap.get(release.name);
		if (!packageInfo || packageInfo.targets.length === 0) {
			core.info(`Package ${release.name} has no publish targets (private or no publishConfig)`);
			validations.push({
				name: release.name,
				version: release.newVersion,
				path: packageInfo?.path || "",
				targets: [],
				allTargetsValid: true,
				hasPublishableTargets: false,
			});
			continue;
		}

		core.info(`Validating ${release.name}@${release.newVersion}`);
		const targetResults: TargetValidationResult[] = [];

		for (const target of packageInfo.targets) {
			const registryName = getRegistryDisplayName(target.registry);
			core.startGroup(`Target: ${target.protocol} \u2192 ${registryName}`);

			// Skip targets with unreachable registries - no point in dry-run
			if (target.registry && unreachableRegistrySet.has(target.registry)) {
				const unreachableInfo = authResult.unreachableRegistries.find((r) => r.registry === target.registry);
				core.warning(`Skipping ${registryName} - registry unreachable: ${unreachableInfo?.error || "unknown error"}`);
				targetResults.push({
					target,
					canPublish: false,
					directoryExists: true,
					packageJsonValid: true,
					dryRunPassed: false,
					dryRunOutput: "",
					dryRunError: `Registry unreachable: ${unreachableInfo?.error || "unknown error"}`,
					versionConflict: false,
					provenanceReady: false,
					message: `Registry unreachable: ${unreachableInfo?.error || "unknown error"}`,
				});
				core.endGroup();
				continue;
			}

			// Pre-validate the target
			const preValidation = await preValidateTarget(target, release.name, release.newVersion);

			if (!preValidation.valid) {
				core.error(`Pre-validation failed: ${preValidation.errors.join(", ")}`);
				targetResults.push({
					target,
					canPublish: false,
					directoryExists: preValidation.directoryExists,
					packageJsonValid: preValidation.packageJsonValid,
					dryRunPassed: false,
					dryRunOutput: "",
					dryRunError: preValidation.errors.join("\n"),
					versionConflict: false,
					provenanceReady: false,
					message: preValidation.errors[0] || "Pre-validation failed",
				});
				core.endGroup();
				continue;
			}

			// Log any warnings
			for (const warning of preValidation.warnings) {
				core.warning(warning);
			}

			// Dry-run publish
			const dryRunResult = await dryRunPublish(target, packageManager);

			// Version conflicts are not errors - the package is already published
			const effectiveSuccess = dryRunResult.success || dryRunResult.versionConflict;

			const result: TargetValidationResult = {
				target,
				canPublish: effectiveSuccess,
				directoryExists: true,
				packageJsonValid: true,
				dryRunPassed: effectiveSuccess,
				dryRunOutput: dryRunResult.output,
				dryRunError: dryRunResult.error,
				versionConflict: dryRunResult.versionConflict,
				existingVersion: dryRunResult.existingVersion,
				provenanceReady: dryRunResult.provenanceReady,
				stats: dryRunResult.stats,
				message: dryRunResult.success
					? "Ready to publish"
					: dryRunResult.versionConflict
						? `Version ${dryRunResult.existingVersion || release.newVersion} already published`
						: dryRunResult.error.split("\n")[0] || "Dry-run failed",
			};

			targetResults.push(result);

			if (dryRunResult.success) {
				core.info(`\u2713 Ready to publish to ${registryName}`);
			} else if (dryRunResult.versionConflict) {
				// Version conflict is a warning, not an error - package already published
				core.warning(`\u26A0 ${result.message} - will skip`);
			} else {
				core.error(`\u2717 ${result.message}`);
			}

			core.endGroup();
		}

		const allTargetsValid = targetResults.every((t) => t.canPublish);
		const hasPublishableTargets = targetResults.some((t) => t.canPublish);

		validations.push({
			name: release.name,
			version: release.newVersion,
			path: packageInfo.path,
			targets: targetResults,
			allTargetsValid,
			hasPublishableTargets,
		});
	}

	core.endGroup();

	// Calculate overall success and backwards-compatible flags
	const allValid = validations.every((v) => v.allTargetsValid);
	const npmReady = validations.every((v) =>
		v.targets.filter((t) => t.target.registry?.includes("npmjs.org")).every((t) => t.canPublish),
	);
	const githubPackagesReady = validations.every((v) =>
		v.targets.filter((t) => t.target.registry?.includes("pkg.github.com")).every((t) => t.canPublish),
	);

	// Build maps for enhanced summary
	const bumpTypes = new Map<string, string>();
	const changesetCounts = countChangesetsPerPackage(changesetStatus.changesets);

	for (const release of changesetStatus.releases) {
		bumpTypes.set(release.name, release.type);
	}

	// Generate summary markdown with enhanced options
	const summary = generatePublishSummary(validations, dryRun, {
		bumpTypes,
		changesetCounts,
	});

	// Calculate totals
	const totalTargets = validations.reduce((sum, v) => sum + v.targets.length, 0);
	const readyTargets = validations.reduce((sum, v) => sum + v.targets.filter((t) => t.canPublish).length, 0);

	return {
		success: allValid,
		validations,
		summary,
		totalTargets,
		readyTargets,
		npmReady,
		githubPackagesReady,
	};
}
