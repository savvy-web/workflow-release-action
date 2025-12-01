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

	for (const release of changesetStatus.releases) {
		// Find the workspace package path (not the publish directory)
		const workspacePath = findPackagePath(release.name);
		if (!workspacePath) {
			core.warning(`Could not find workspace path for package ${release.name}, skipping`);
			continue;
		}

		// Read the source package.json to get publishConfig
		const pkgJsonPath = path.join(workspacePath, "package.json");
		if (!fs.existsSync(pkgJsonPath)) {
			core.warning(`package.json not found at ${pkgJsonPath}, skipping`);
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
	const authResult = setupRegistryAuth(allTargets);

	if (!authResult.success) {
		core.warning("Some registry tokens are missing:");
		for (const missing of authResult.missingTokens) {
			core.warning(`  - ${missing.registry}: ${missing.tokenEnv} not set`);
		}
	}

	// Validate each package and its targets
	const validations: PackagePublishValidation[] = [];

	for (const release of changesetStatus.releases) {
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

			const result: TargetValidationResult = {
				target,
				canPublish: dryRunResult.success,
				directoryExists: true,
				packageJsonValid: true,
				dryRunPassed: dryRunResult.success,
				dryRunOutput: dryRunResult.output,
				dryRunError: dryRunResult.error,
				versionConflict: dryRunResult.versionConflict,
				existingVersion: dryRunResult.existingVersion,
				provenanceReady: dryRunResult.provenanceReady,
				message: dryRunResult.success
					? "Ready to publish"
					: dryRunResult.versionConflict
						? `Version ${dryRunResult.existingVersion || release.newVersion} already published`
						: dryRunResult.error.split("\n")[0] || "Dry-run failed",
			};

			targetResults.push(result);

			if (dryRunResult.success) {
				core.info(`\u2713 Ready to publish to ${registryName}`);
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

	// Generate summary markdown
	const summary = generatePublishSummary(validations, dryRun);

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
