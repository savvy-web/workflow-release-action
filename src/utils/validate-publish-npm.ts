import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { context, getOctokit } from "@actions/github";
import type { PackageValidationResult } from "../types/shared-types.js";
import { summaryWriter } from "./summary-writer.js";

/**
 * NPM publish validation result
 */
interface NPMPublishValidationResult {
	/** Whether all validations passed */
	success: boolean;
	/** Package validation results */
	results: PackageValidationResult[];
	/** GitHub check run ID */
	checkId: number;
}

/**
 * Gets changeset status to determine publishable packages
 *

 * @param exec - GitHub Actions exec module
 * @param packageManager - Package manager to use
 * @returns Promise resolving to changeset status JSON
 */
async function getChangesetStatus(packageManager: string): Promise<{
	releases: Array<{ name: string; newVersion: string; type: string }>;
	changesets: Array<{ summary: string }>;
}> {
	let output = "";
	let stderrOutput = "";

	const statusCmd = packageManager === "pnpm" ? "pnpm" : packageManager === "yarn" ? "yarn" : "npm";
	const statusArgs =
		packageManager === "pnpm"
			? ["changeset", "status", "--output=json"]
			: packageManager === "yarn"
				? ["changeset", "status", "--output=json"]
				: ["run", "changeset", "status", "--output=json"];

	const exitCode = await exec.exec(statusCmd, statusArgs, {
		listeners: {
			stdout: (data: Buffer) => {
				output += data.toString();
			},
			stderr: (data: Buffer) => {
				stderrOutput += data.toString();
				core.debug(`changeset status stderr: ${data.toString()}`);
			},
		},
		ignoreReturnCode: true,
	});

	// Handle case where changesets have already been consumed (versioned)
	// This happens on the release branch after `changeset version` has run
	if (exitCode !== 0) {
		const noChangesetsError =
			stderrOutput.includes("no changesets were found") || stderrOutput.includes("No changesets present");

		if (noChangesetsError) {
			core.info("Changesets have been consumed (already versioned), skipping changeset-based validation");
			return { releases: [], changesets: [] };
		}

		// For other errors, throw to surface the issue
		throw new Error(`changeset status failed with exit code ${exitCode}: ${stderrOutput}`);
	}

	// If output is empty but command succeeded, return empty state
	if (!output.trim()) {
		return { releases: [], changesets: [] };
	}

	return JSON.parse(output.trim());
}

/**
 * Checks if package is publishable based on package.json configuration
 *

 * @param exec - GitHub Actions exec module
 * @param packagePath - Path to package directory
 * @param packageName - Package name
 * @returns Promise resolving to whether package is publishable
 */
async function isPackagePublishable(packagePath: string, packageName: string): Promise<boolean> {
	let output = "";

	await exec.exec("cat", [`${packagePath}/package.json`], {
		listeners: {
			stdout: (data: Buffer) => {
				output += data.toString();
			},
		},
	});

	const packageJson = JSON.parse(output);

	// Check if package is private
	if (packageJson.private === true) {
		core.debug(`Package ${packageName} is marked as private`);
		return false;
	}

	// Check publishConfig.access
	const publishAccess = packageJson.publishConfig?.access;

	if (!publishAccess) {
		core.debug(`Package ${packageName} has no publishConfig.access (safety default: not publishable)`);
		return false;
	}

	if (publishAccess === "public" || publishAccess === "restricted") {
		core.debug(`Package ${packageName} has publishConfig.access: ${publishAccess}`);
		return true;
	}

	core.debug(`Package ${packageName} has invalid publishConfig.access: ${publishAccess}`);
	return false;
}

/**
 * Validates NPM publish for a package
 *
 * @param packagePath - Path to package directory
 * @param packageName - Package name
 * @param packageVersion - Package version
 * @param packageManager - Package manager to use
 * @param dryRun - Whether this is a dry-run
 * @returns Promise resolving to validation result
 */
export async function validatePackageNPMPublish(
	packagePath: string,
	packageName: string,
	packageVersion: string,
	packageManager: string,
	dryRun: boolean,
): Promise<PackageValidationResult> {
	core.startGroup(`Validating NPM publish: ${packageName}@${packageVersion}`);

	// Check if package is publishable
	const isPublishable = await isPackagePublishable(packagePath, packageName);

	if (!isPublishable) {
		core.info(`Package ${packageName} is not publishable (private or no publishConfig.access)`);
		core.endGroup();
		return {
			name: packageName,
			version: packageVersion,
			path: packagePath,
			canPublish: false,
			message: "Not publishable (private or no publishConfig.access)",
			hasProvenance: false,
		};
	}

	// Run npm publish --dry-run --provenance
	let publishError = "";
	let publishOutput = "";
	let publishExitCode = 0;

	const publishCmd = packageManager === "npm" ? "npm" : "npm"; // Always use npm for publish
	const publishArgs = ["publish", "--dry-run", "--provenance", "--json"];

	if (!dryRun) {
		try {
			publishExitCode = await exec.exec(publishCmd, publishArgs, {
				cwd: packagePath,
				listeners: {
					stdout: (data: Buffer) => {
						publishOutput += data.toString();
					},
					stderr: (data: Buffer) => {
						publishError += data.toString();
					},
				},
				ignoreReturnCode: true,
			});
		} catch (error) {
			publishExitCode = 1;
			publishError = error instanceof Error ? error.message : String(error);
		}
	} else {
		core.info(`[DRY RUN] Would run: ${publishCmd} ${publishArgs.join(" ")} in ${packagePath}`);
		publishExitCode = 0; // Assume success in dry-run
	}

	const success = publishExitCode === 0;

	let message = "";
	let hasProvenance = false;

	if (success) {
		// Check for version conflicts in output
		const hasVersionConflict =
			publishOutput.includes("cannot publish over previously published version") ||
			publishError.includes("cannot publish over previously published version") ||
			publishError.includes("You cannot publish over the previously published versions");

		if (hasVersionConflict) {
			message = `Version conflict: ${packageVersion} already published to NPM`;
			core.warning(`${packageName}@${packageVersion}: ${message}`);
			core.endGroup();
			return {
				name: packageName,
				version: packageVersion,
				path: packagePath,
				canPublish: false,
				message,
				hasProvenance: false,
			};
		}

		// Check for provenance configuration
		hasProvenance = publishOutput.includes("provenance") || !publishError.includes("provenance");

		message = "Ready for NPM publish with provenance";
		core.info(`✓ ${packageName}@${packageVersion}: ${message}`);
	} else {
		// Parse error message
		if (publishError.includes("ENEEDAUTH")) {
			message = "NPM authentication required";
		} else if (publishError.includes("E404") || publishError.includes("Not found")) {
			message = "Package not found in registry";
		} else if (publishError.includes("provenance")) {
			message = "Provenance configuration issue";
		} else {
			message = `Publish validation failed: ${publishError.split("\n")[0]}`;
		}

		core.error(`${packageName}@${packageVersion}: ${message}`);
	}

	core.endGroup();

	return {
		name: packageName,
		version: packageVersion,
		path: packagePath,
		canPublish: success,
		message,
		hasProvenance,
	};
}

/**
 * Validates NPM publish for all publishable packages
 *

 * @param exec - GitHub Actions exec module


 * @param packageManager - Package manager to use
 * @param dryRun - Whether this is a dry-run
 * @returns Promise resolving to validation result
 */
export async function validateNPMPublish(packageManager: string, dryRun: boolean): Promise<NPMPublishValidationResult> {
	const token = core.getInput("token", { required: true });
	const github = getOctokit(token);
	core.startGroup("Validating NPM publish");

	// Get changeset status
	core.info("Getting changeset status");
	const changesetStatus = await getChangesetStatus(packageManager);

	core.info(`Found ${changesetStatus.releases.length} package(s) with version changes`);

	// Validate each package
	const results: PackageValidationResult[] = [];

	for (const release of changesetStatus.releases) {
		// Determine package path (assume packages are in workspace)
		// For now, assume standard monorepo structure: packages/package-name or node_modules/.pnpm/...
		// We'll use the package name to find the path
		const packagePath = await findPackagePath(release.name);

		if (!packagePath) {
			core.warning(`Could not find path for package ${release.name}, skipping`);
			continue;
		}

		const result = await validatePackageNPMPublish(
			packagePath,
			release.name,
			release.newVersion,
			packageManager,
			dryRun,
		);

		results.push(result);
	}

	// Determine success based on results
	// - No packages: success (nothing to validate)
	// - Has packages: all must be publishable
	const noPackagesToValidate = results.length === 0;
	const allPackagesReady = results.length > 0 && results.every((r) => r.canPublish);
	const success = noPackagesToValidate || allPackagesReady;

	if (noPackagesToValidate) {
		core.info("Validation result: ⚪ No packages to validate (changesets already versioned)");
	} else {
		core.info(`Validation result: ${allPackagesReady ? "✅ All packages ready" : "❌ Some packages not ready"}`);
	}
	core.endGroup();

	// Create GitHub check run
	const checkTitle = dryRun ? "🧪 NPM Publish Validation (Dry Run)" : "NPM Publish Validation";
	const checkSummary = noPackagesToValidate
		? "No packages to validate (changesets already versioned)"
		: allPackagesReady
			? `All ${results.length} package(s) ready for NPM publish`
			: `${results.filter((r) => !r.canPublish).length} package(s) not ready for NPM publish`;
	const checkConclusion = noPackagesToValidate ? "skipped" : allPackagesReady ? "success" : "failure";

	// Build check details using summaryWriter (markdown, not HTML)
	const packagesList =
		results.length > 0
			? summaryWriter.list(
					results.map((r) => {
						const status = r.canPublish ? "✅" : "❌";
						const provenance = r.hasProvenance ? "✅ Provenance" : "";
						return `${status} **${r.name}@${r.version}** ${provenance}\n  ${r.message}`;
					}),
				)
			: "_No packages to validate_";

	const checkDetails = summaryWriter.build([{ heading: "NPM Publish Validation Results", content: packagesList }]);

	const { data: checkRun } = await github.rest.checks.create({
		owner: context.repo.owner,
		repo: context.repo.repo,
		name: checkTitle,
		head_sha: context.sha,
		status: "completed",
		conclusion: checkConclusion,
		output: {
			title: checkSummary,
			summary: checkDetails,
		},
	});

	core.info(`Created check run: ${checkRun.html_url}`);

	// Write job summary using summaryWriter (markdown, not HTML)
	const resultsTable =
		results.length > 0
			? summaryWriter.table(
					["Package", "Version", "Status", "Provenance", "Message"],
					results.map((r) => [
						r.name,
						r.version,
						r.canPublish ? "✅ Ready" : "❌ Not Ready",
						r.hasProvenance ? "✅" : "❌",
						r.message,
					]),
				)
			: "_No packages to validate_";

	const jobSummary = summaryWriter.build([
		{ heading: checkTitle, content: checkSummary },
		{ heading: "NPM Publish Readiness", level: 3, content: resultsTable },
	]);

	await summaryWriter.write(jobSummary);

	return {
		success,
		results,
		checkId: checkRun.id,
	};
}

/**
 * Finds the file system path for a package
 *

 * @param exec - GitHub Actions exec module
 * @param packageName - Package name
 * @returns Promise resolving to package path or null if not found
 */
async function findPackagePath(packageName: string): Promise<string | null> {
	let output = "";

	try {
		// Try to use npm list to find package path
		await exec.exec("npm", ["list", packageName, "--json"], {
			listeners: {
				stdout: (data: Buffer) => {
					output += data.toString();
				},
			},
			ignoreReturnCode: true,
		});

		const listResult = JSON.parse(output);

		// Extract path from dependencies
		const findPath = (obj: Record<string, unknown>, pkgName: string): string | null => {
			if (obj.dependencies && typeof obj.dependencies === "object") {
				const deps = obj.dependencies as Record<string, { resolved?: string; path?: string }>;
				if (deps[pkgName]) {
					return deps[pkgName].path || deps[pkgName].resolved || null;
				}

				// Recursively search nested dependencies
				for (const dep of Object.values(deps)) {
					if (dep && typeof dep === "object") {
						const path = findPath(dep as Record<string, unknown>, pkgName);
						if (path) return path;
					}
				}
			}

			return null;
		};

		const path = findPath(listResult as Record<string, unknown>, packageName);

		if (path) {
			core.debug(`Found package ${packageName} at: ${path}`);
			return path;
		}
	} catch (error) {
		core.debug(`Could not find package path using npm list: ${error instanceof Error ? error.message : String(error)}`);
	}

	// Fallback: try common monorepo patterns
	const commonPaths = [
		`packages/${packageName.split("/").pop()}`,
		`pkgs/${packageName.split("/").pop()}`,
		`apps/${packageName.split("/").pop()}`,
		`./${packageName.split("/").pop()}`,
	];

	for (const path of commonPaths) {
		try {
			// Check if package.json exists at path
			const exitCode = await exec.exec("test", ["-f", `${path}/package.json`], {
				ignoreReturnCode: true,
			});

			if (exitCode === 0) {
				core.debug(`Found package ${packageName} at: ${path}`);
				return path;
			}
		} catch {
			// Continue to next path
		}
	}

	core.warning(`Could not find path for package: ${packageName}`);
	return null;
}
