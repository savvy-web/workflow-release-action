import type * as core from "@actions/core";
import type * as exec from "@actions/exec";
import type { Context } from "@actions/github/lib/context";
import type { GitHub } from "@actions/github/lib/utils";
import type { AsyncFunctionArguments, PackageValidationResult } from "../shared/types.js";

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
 * @param core - GitHub Actions core module
 * @param exec - GitHub Actions exec module
 * @param packageManager - Package manager to use
 * @returns Promise resolving to changeset status JSON
 */
async function getChangesetStatus(
	coreModule: typeof core,
	execModule: typeof exec,
	packageManager: string,
): Promise<{
	releases: Array<{ name: string; newVersion: string; type: string }>;
	changesets: Array<{ summary: string }>;
}> {
	const core = coreModule;
	const exec = execModule;

	let output = "";

	const statusCmd = packageManager === "pnpm" ? "pnpm" : packageManager === "yarn" ? "yarn" : "npm";
	const statusArgs =
		packageManager === "pnpm"
			? ["changeset", "status", "--output=json"]
			: packageManager === "yarn"
				? ["changeset", "status", "--output=json"]
				: ["run", "changeset", "status", "--output=json"];

	await exec.exec(statusCmd, statusArgs, {
		listeners: {
			stdout: (data: Buffer) => {
				output += data.toString();
			},
			stderr: (data: Buffer) => {
				core.debug(`changeset status stderr: ${data.toString()}`);
			},
		},
	});

	return JSON.parse(output.trim());
}

/**
 * Checks if package is publishable based on package.json configuration
 *
 * @param core - GitHub Actions core module
 * @param exec - GitHub Actions exec module
 * @param packagePath - Path to package directory
 * @param packageName - Package name
 * @returns Promise resolving to whether package is publishable
 */
async function isPackagePublishable(
	coreModule: typeof core,
	execModule: typeof exec,
	packagePath: string,
	packageName: string,
): Promise<boolean> {
	const core = coreModule;
	const exec = execModule;

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
 * @param core - GitHub Actions core module
 * @param exec - GitHub Actions exec module
 * @param packagePath - Path to package directory
 * @param packageName - Package name
 * @param packageVersion - Package version
 * @param packageManager - Package manager to use
 * @param dryRun - Whether this is a dry-run
 * @returns Promise resolving to validation result
 */
async function validatePackageNPMPublish(
	coreModule: typeof core,
	execModule: typeof exec,
	packagePath: string,
	packageName: string,
	packageVersion: string,
	packageManager: string,
	dryRun: boolean,
): Promise<PackageValidationResult> {
	const core = coreModule;
	const exec = execModule;

	core.startGroup(`Validating NPM publish: ${packageName}@${packageVersion}`);

	// Check if package is publishable
	const isPublishable = await isPackagePublishable(core, exec, packagePath, packageName);

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
 * @param core - GitHub Actions core module
 * @param exec - GitHub Actions exec module
 * @param github - GitHub API client
 * @param context - GitHub Actions context
 * @param packageManager - Package manager to use
 * @param dryRun - Whether this is a dry-run
 * @returns Promise resolving to validation result
 */
async function validateNPMPublish(
	coreModule: typeof core,
	execModule: typeof exec,
	github: InstanceType<typeof GitHub>,
	context: Context,
	packageManager: string,
	dryRun: boolean,
): Promise<NPMPublishValidationResult> {
	const core = coreModule;
	const exec = execModule;

	core.startGroup("Validating NPM publish");

	// Get changeset status
	core.info("Getting changeset status");
	const changesetStatus = await getChangesetStatus(core, exec, packageManager);

	core.info(`Found ${changesetStatus.releases.length} package(s) with version changes`);

	// Validate each package
	const results: PackageValidationResult[] = [];

	for (const release of changesetStatus.releases) {
		// Determine package path (assume packages are in workspace)
		// For now, assume standard monorepo structure: packages/package-name or node_modules/.pnpm/...
		// We'll use the package name to find the path
		const packagePath = await findPackagePath(core, exec, release.name);

		if (!packagePath) {
			core.warning(`Could not find path for package ${release.name}, skipping`);
			continue;
		}

		const result = await validatePackageNPMPublish(
			core,
			exec,
			packagePath,
			release.name,
			release.newVersion,
			packageManager,
			dryRun,
		);

		results.push(result);
	}

	const success = results.length > 0 && results.every((r) => r.canPublish);

	core.info(`Validation result: ${success ? "✅ All packages ready" : "❌ Some packages not ready"}`);
	core.endGroup();

	// Create GitHub check run
	const checkTitle = dryRun ? "🧪 NPM Publish Validation (Dry Run)" : "NPM Publish Validation";
	const checkSummary = success
		? `All ${results.length} package(s) ready for NPM publish`
		: `${results.filter((r) => !r.canPublish).length} package(s) not ready for NPM publish`;

	// Build check details using core.summary methods
	const checkSummaryBuilder = core.summary.addHeading("NPM Publish Validation Results", 2).addEOL();

	if (results.length > 0) {
		checkSummaryBuilder.addRaw(
			results
				.map((r) => {
					const status = r.canPublish ? "✅" : "❌";
					const provenance = r.hasProvenance ? "✅ Provenance" : "";
					return `- ${status} **${r.name}@${r.version}** ${provenance}\n  ${r.message}`;
				})
				.join("\n"),
		);
	} else {
		checkSummaryBuilder.addRaw("_No packages to validate_");
	}

	if (dryRun) {
		checkSummaryBuilder.addEOL().addEOL().addRaw("---").addEOL().addRaw("**Mode**: Dry Run (Preview Only)");
	}

	const checkDetails = checkSummaryBuilder.stringify();

	const { data: checkRun } = await github.rest.checks.create({
		owner: context.repo.owner,
		repo: context.repo.repo,
		name: checkTitle,
		head_sha: context.sha,
		status: "completed",
		conclusion: success ? "success" : "failure",
		output: {
			title: checkSummary,
			summary: checkDetails,
		},
	});

	core.info(`Created check run: ${checkRun.html_url}`);

	// Write job summary
	const summaryBuilder = core.summary.addHeading(checkTitle, 2).addRaw(checkSummary).addEOL();

	if (results.length > 0) {
		summaryBuilder
			.addHeading("NPM Publish Readiness", 3)
			.addTable([
				[
					{ data: "Package", header: true },
					{ data: "Version", header: true },
					{ data: "Status", header: true },
					{ data: "Provenance", header: true },
					{ data: "Message", header: true },
				],
				...results.map((r) => [
					r.name,
					r.version,
					r.canPublish ? "✅ Ready" : "❌ Not Ready",
					r.hasProvenance ? "✅" : "❌",
					r.message,
				]),
			])
			.addEOL();
	} else {
		summaryBuilder.addRaw("_No packages to validate_").addEOL();
	}

	await summaryBuilder.write();

	return {
		success,
		results,
		checkId: checkRun.id,
	};
}

/**
 * Finds the file system path for a package
 *
 * @param core - GitHub Actions core module
 * @param exec - GitHub Actions exec module
 * @param packageName - Package name
 * @returns Promise resolving to package path or null if not found
 */
async function findPackagePath(
	coreModule: typeof core,
	execModule: typeof exec,
	packageName: string,
): Promise<string | null> {
	const core = coreModule;
	const exec = execModule;

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

/**
 * Main action entrypoint: Validates NPM publish and sets GitHub Actions outputs
 *
 * @param args - Function arguments from github-script
 * @param args.core - GitHub Actions core module
 * @param args.exec - GitHub Actions exec module
 * @param args.github - GitHub API client
 * @param args.context - GitHub Actions context
 *
 * @remarks
 * This action validates that packages can be published to NPM registry with provenance.
 * It sets the following outputs:
 * - `success`: Whether all validations passed (true | false)
 * - `results`: JSON array of package validation results
 * - `check_id`: GitHub check run ID
 *
 * The action respects environment variables:
 * - `PACKAGE_MANAGER`: Package manager to use (default: pnpm)
 * - `DRY_RUN`: Whether this is a dry-run (true | false)
 *
 * @example
 * ```yaml
 * - uses: actions/github-script@v8
 *   env:
 *     PACKAGE_MANAGER: ${{ steps.detect-repo-type.outputs.package-manager }}
 *     DRY_RUN: ${{ inputs.dry_run }}
 *   with:
 *     script: |
 *       const { default: validateNPMPublish } = await import('${{ github.workspace }}/.github/actions/setup-release/validate-publish-npm.ts');
 *       await validateNPMPublish({ core, exec, github, context });
 * ```
 */
export default async ({ core, exec, github, context }: AsyncFunctionArguments): Promise<void> => {
	try {
		const packageManager = process.env.PACKAGE_MANAGER || "pnpm";
		const dryRun = process.env.DRY_RUN === "true";

		if (dryRun) {
			core.notice("🧪 Running in dry-run mode (preview only)");
		}

		const result = await validateNPMPublish(core, exec, github, context, packageManager, dryRun);

		// Set outputs
		core.setOutput("success", result.success.toString());
		core.setOutput("results", JSON.stringify(result.results));
		core.setOutput("check_id", result.checkId.toString());

		// Log summary
		if (result.success) {
			core.notice(`✓ All ${result.results.length} package(s) ready for NPM publish`);
		} else {
			core.error(`❌ ${result.results.filter((r) => !r.canPublish).length} package(s) not ready for NPM publish`);
		}

		// Debug outputs
		core.debug(`Set output 'success' to: ${result.success}`);
		core.debug(`Set output 'results' to: ${JSON.stringify(result.results)}`);
		core.debug(`Set output 'check_id' to: ${result.checkId}`);

		// Fail the action if validation failed (unless dry-run)
		if (!result.success && !dryRun) {
			core.setFailed("NPM publish validation failed. See check run for details.");
		}
	} catch (error) {
		/* v8 ignore next -- @preserve */
		core.setFailed(`Failed to validate NPM publish: ${error instanceof Error ? error.message : String(error)}`);
	}
};
