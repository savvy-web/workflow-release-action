import type * as core from "@actions/core";
import type * as exec from "@actions/exec";
import type { Context } from "@actions/github/lib/context";
import type { GitHub } from "@actions/github/lib/utils";
import type { AsyncFunctionArguments, PackageValidationResult } from "../shared/types.js";

/**
 * GitHub Packages validation result
 */
interface GitHubPackagesValidationResult {
	/** Whether all packages are valid */
	success: boolean;
	/** Validation results for each package */
	packages: PackageValidationResult[];
	/** GitHub check run ID */
	checkId: number;
}

/**
 * Changeset status output
 */
interface ChangesetStatus {
	/** Releases to be published */
	releases: Array<{
		/** Package name */
		name: string;
		/** Package type (major, minor, patch) */
		type: string;
		/** Old version */
		oldVersion: string;
		/** New version */
		newVersion: string;
		/** Changelog entry */
		changesets: string[];
	}>;
}

/**
 * Checks if a package is publishable to GitHub Packages
 *
 * @param core - GitHub Actions core module
 * @param exec - GitHub Actions exec module
 * @param packagePath - Path to package
 * @param packageName - Package name
 * @returns Whether package is publishable
 *
 * @remarks
 * A package is publishable to GitHub Packages if:
 * - It is scoped (e.g., @owner/package-name)
 * - It has publishConfig.registry set to GitHub Packages
 * - It is not private, or publishConfig.access is set
 */
async function isPackagePublishable(
	coreModule: typeof core,
	execModule: typeof exec,
	packagePath: string,
	packageName: string,
): Promise<boolean> {
	const core = coreModule;
	const exec = execModule;

	// GitHub Packages requires scoped packages
	if (!packageName.startsWith("@")) {
		core.debug(`Package ${packageName} is not scoped - GitHub Packages requires scoped packages`);
		return false;
	}

	let packageJson = "";
	const execOptions = {
		cwd: packagePath,
		listeners: {
			stdout: (data: Buffer): void => {
				packageJson += data.toString();
			},
		},
		silent: true,
		ignoreReturnCode: true,
	};

	try {
		const exitCode = await exec.exec("cat", ["package.json"], execOptions);

		if (exitCode !== 0) {
			core.warning(`Failed to read package.json for ${packageName}`);
			return false;
		}

		const pkg = JSON.parse(packageJson);

		// Check if package is private without publishConfig
		if (pkg.private === true && !pkg.publishConfig?.registry) {
			core.debug(`Package ${packageName} is private without publishConfig.registry`);
			return false;
		}

		// Check if publishConfig.registry is set to GitHub Packages
		const registry = pkg.publishConfig?.registry;
		if (registry) {
			try {
				const url = new URL(registry);
				if (url.hostname !== "npm.pkg.github.com") {
					core.debug(`Package ${packageName} registry is not GitHub Packages: ${registry}`);
					return false;
				}
			} catch {
				core.debug(`Package ${packageName} has invalid registry URL: ${registry}`);
				return false;
			}
		}

		return true;
	} catch (error) {
		/* v8 ignore next -- @preserve */
		core.warning(
			`Error checking publishability for ${packageName}: ${error instanceof Error ? error.message : String(error)}`,
		);
		/* v8 ignore next -- @preserve */
		return false;
	}
}

/**
 * Finds the file system path for a package
 *
 * @param core - GitHub Actions core module
 * @param exec - GitHub Actions exec module
 * @param packageName - Package name to find
 * @returns Package path or null if not found
 *
 * @remarks
 * This function tries multiple strategies:
 * 1. Use npm list to find the package
 * 2. Try common monorepo directory patterns
 */
async function findPackagePath(
	coreModule: typeof core,
	execModule: typeof exec,
	packageName: string,
): Promise<string | null> {
	const core = coreModule;
	const exec = execModule;

	// Try npm list first
	let listResult = "";
	const listOptions = {
		listeners: {
			stdout: (data: Buffer): void => {
				listResult += data.toString();
			},
		},
		silent: true,
		ignoreReturnCode: true,
	};

	try {
		await exec.exec("npm", ["list", packageName, "--json"], listOptions);

		if (listResult) {
			const parsed = JSON.parse(listResult);
			const path = findPath(parsed, packageName);

			if (path) {
				core.debug(`Found package ${packageName} at: ${path}`);
				return path;
			}
		}
	} catch (error) {
		core.debug(`Could not find package path using npm list: ${error instanceof Error ? error.message : String(error)}`);
	}

	// Fallback: try common monorepo patterns
	const baseName = packageName.split("/").pop();
	const commonPaths = [`packages/${baseName}`, `pkgs/${baseName}`, `apps/${baseName}`, `./${baseName}`];

	for (const path of commonPaths) {
		const exitCode = await exec.exec("test", ["-f", `${path}/package.json`], {
			ignoreReturnCode: true,
			silent: true,
		});

		if (exitCode === 0) {
			core.debug(`Found package ${packageName} at: ${path}`);
			return path;
		}
	}

	core.warning(`Could not find path for package: ${packageName}`);
	return null;
}

/**
 * Recursively finds package path in npm list output
 *
 * @param obj - npm list JSON output
 * @param packageName - Package to find
 * @param currentPath - Current path being explored
 * @returns Package path or null
 */
function findPath(
	obj: { dependencies?: Record<string, unknown> },
	packageName: string,
	currentPath: string = ".",
): string | null {
	if (!obj.dependencies) {
		return null;
	}

	if (packageName in obj.dependencies) {
		return currentPath;
	}

	for (const [_name, dep] of Object.entries(obj.dependencies)) {
		const depObj = dep as { dependencies?: Record<string, unknown> };
		if (depObj.dependencies) {
			const result = findPath(depObj, packageName, currentPath);
			if (result) {
				return result;
			}
		}
	}

	return null;
}

/**
 * Validates a package can be published to GitHub Packages
 *
 * @param core - GitHub Actions core module
 * @param exec - GitHub Actions exec module
 * @param packagePath - Path to package
 * @param packageName - Package name
 * @param packageVersion - Package version
 * @param packageManager - Package manager (npm, yarn, pnpm)
 * @param dryRun - Whether this is a dry-run
 * @returns Package validation result
 *
 * @remarks
 * Runs `npm publish --dry-run --provenance --registry=https://npm.pkg.github.com`
 * to validate the package without actually publishing.
 */
async function validatePackageGitHubPublish(
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

	core.startGroup(`Validating ${packageName}@${packageVersion} for GitHub Packages`);

	// Check if package is publishable
	const isPublishable = await isPackagePublishable(core, exec, packagePath, packageName);

	if (!isPublishable) {
		core.endGroup();
		return {
			name: packageName,
			version: packageVersion,
			path: packagePath,
			canPublish: false,
			message: "Not publishable (not scoped, private, or wrong registry)",
			hasProvenance: false,
		};
	}

	// Determine publish command based on package manager
	const publishCmd = packageManager === "yarn" ? "yarn" : "npm";
	const publishArgs =
		packageManager === "yarn"
			? ["publish", "--dry-run", "--registry", "https://npm.pkg.github.com"]
			: ["publish", "--dry-run", "--provenance", "--registry", "https://npm.pkg.github.com", "--json"];

	let publishOutput = "";
	let publishError = "";
	let publishExitCode = 0;

	const publishOptions = {
		cwd: packagePath,
		listeners: {
			stdout: (data: Buffer): void => {
				publishOutput += data.toString();
			},
			stderr: (data: Buffer): void => {
				publishError += data.toString();
			},
		},
		ignoreReturnCode: true,
	};

	if (!dryRun) {
		core.info(`Running: ${publishCmd} ${publishArgs.join(" ")}`);

		try {
			publishExitCode = await exec.exec(publishCmd, publishArgs, publishOptions);
		} catch (error) {
			/* v8 ignore next -- @preserve */
			publishExitCode = 1;
			/* v8 ignore next -- @preserve */
			publishError = error instanceof Error ? error.message : String(error);
		}

		core.debug(`Publish exit code: ${publishExitCode}`);
		core.debug(`Publish output: ${publishOutput}`);
		core.debug(`Publish error: ${publishError}`);
	} else {
		core.info(`[DRY RUN] Would run: ${publishCmd} ${publishArgs.join(" ")}`);
		publishExitCode = 0;
	}

	// Check for version conflicts
	const hasVersionConflict =
		publishOutput.includes("cannot publish over previously published version") ||
		publishError.includes("cannot publish over previously published version") ||
		publishOutput.includes("You cannot publish over the previously published versions") ||
		publishError.includes("You cannot publish over the previously published versions");

	// Detect provenance support
	const hasProvenance = publishOutput.includes("provenance") || publishArgs.includes("--provenance");

	// Determine success and message
	let success = publishExitCode === 0 || hasVersionConflict;
	let message = "";

	if (hasVersionConflict) {
		message = `Version ${packageVersion} already exists in GitHub Packages`;
		success = false;
	} else if (publishExitCode === 0) {
		message = `Ready to publish to GitHub Packages${hasProvenance ? " with provenance" : ""}`;
	} else {
		// Parse error message
		if (publishError.includes("ENEEDAUTH") || publishError.includes("authentication")) {
			message = "GitHub Packages authentication required";
		} else if (publishError.includes("E404") || publishError.includes("Not found")) {
			message = "Package not found in registry (first publish)";
			success = true; // First publish is OK
		} else if (publishError.includes("E403") || publishError.includes("Forbidden")) {
			message = "GitHub Packages permission denied";
		} else if (publishError.includes("provenance")) {
			message = "Provenance configuration issue";
		} else {
			// Extract first line of error
			const errorLines = publishError.split("\n").filter((line) => line.trim().length > 0);
			message = errorLines[0] || "GitHub Packages publish validation failed";
		}
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
 * Validates all publishable packages for GitHub Packages
 *
 * @param core - GitHub Actions core module
 * @param exec - GitHub Actions exec module
 * @param github - GitHub API client
 * @param context - GitHub Actions context
 * @param packageManager - Package manager to use
 * @param dryRun - Whether this is a dry-run
 * @returns GitHub Packages validation result
 *
 * @remarks
 * This function:
 * 1. Gets changeset status to find publishable packages
 * 2. Finds the file system path for each package
 * 3. Validates each package with npm publish --dry-run
 * 4. Creates a GitHub check run with results
 * 5. Returns success status and package results
 */
async function validatePublishGitHubPackages(
	coreModule: typeof core,
	execModule: typeof exec,
	github: InstanceType<typeof GitHub>,
	context: Context,
	packageManager: string,
	dryRun: boolean,
): Promise<GitHubPackagesValidationResult> {
	const core = coreModule;
	const exec = execModule;

	core.startGroup("Validating GitHub Packages publish");

	// Get changeset status
	let changesetOutput = "";
	const changesetOptions = {
		listeners: {
			stdout: (data: Buffer): void => {
				changesetOutput += data.toString();
			},
		},
		silent: true,
	};

	await exec.exec("npx", ["changeset", "status", "--output", "/dev/stdout"], changesetOptions);

	const changesetStatus: ChangesetStatus = JSON.parse(changesetOutput);
	const publishablePackages = changesetStatus.releases;

	core.info(`Found ${publishablePackages.length} publishable package(s)`);

	// Validate each package
	const validationResults: PackageValidationResult[] = [];

	for (const pkg of publishablePackages) {
		const packagePath = await findPackagePath(core, exec, pkg.name);

		if (!packagePath) {
			core.warning(`Could not find path for package: ${pkg.name}`);
			validationResults.push({
				name: pkg.name,
				version: pkg.newVersion,
				path: "",
				canPublish: false,
				message: "Package path not found",
				hasProvenance: false,
			});
			continue;
		}

		const result = await validatePackageGitHubPublish(
			core,
			exec,
			packagePath,
			pkg.name,
			pkg.newVersion,
			packageManager,
			dryRun,
		);

		validationResults.push(result);
	}

	core.endGroup();

	// Determine overall success
	const success = validationResults.every((r) => r.canPublish);
	const failedPackages = validationResults.filter((r) => !r.canPublish);

	// Create GitHub check run
	const checkTitle = dryRun ? "🧪 GitHub Packages Validation (Dry Run)" : "GitHub Packages Validation";
	const checkSummary = success
		? `All ${validationResults.length} package(s) ready for GitHub Packages`
		: `${failedPackages.length} of ${validationResults.length} package(s) failed validation`;

	// Build check details using core.summary methods
	const checkSummaryBuilder = core.summary
		.addHeading("Validation Results", 2)
		.addEOL()
		.addTable([
			[
				{ data: "Package", header: true },
				{ data: "Version", header: true },
				{ data: "Status", header: true },
				{ data: "Message", header: true },
			],
			...validationResults.map((pkg) => [
				pkg.name,
				pkg.version,
				pkg.canPublish ? "✅ Ready" : "❌ Failed",
				`${pkg.message}${pkg.hasProvenance ? " 🔐" : ""}`,
			]),
		]);

	if (failedPackages.length > 0) {
		checkSummaryBuilder
			.addEOL()
			.addHeading("Failed Packages", 3)
			.addEOL()
			.addRaw(failedPackages.map((pkg) => `- **${pkg.name}@${pkg.version}**: ${pkg.message}`).join("\n"));
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
	const summaryBuilder = core.summary
		.addHeading(checkTitle, 2)
		.addRaw(checkSummary)
		.addEOL()
		.addHeading("Validation Results", 3)
		.addTable([
			[
				{ data: "Package", header: true },
				{ data: "Version", header: true },
				{ data: "Status", header: true },
				{ data: "Message", header: true },
			],
			...validationResults.map((pkg) => [
				pkg.name,
				pkg.version,
				pkg.canPublish ? "✅ Ready" : "❌ Failed",
				`${pkg.message}${pkg.hasProvenance ? " 🔐" : ""}`,
			]),
		]);

	if (failedPackages.length > 0) {
		summaryBuilder.addHeading("Failed Packages", 3);

		for (const pkg of failedPackages) {
			summaryBuilder.addRaw(`- **${pkg.name}@${pkg.version}**: ${pkg.message}`).addEOL();
		}
	}

	await summaryBuilder.write();

	return {
		success,
		packages: validationResults,
		checkId: checkRun.id,
	};
}

/**
 * Main action entrypoint: Validates GitHub Packages publish and sets GitHub Actions outputs
 *
 * @param args - Function arguments from github-script
 * @param args.core - GitHub Actions core module
 * @param args.exec - GitHub Actions exec module
 * @param args.github - GitHub API client
 * @param args.context - GitHub Actions context
 *
 * @remarks
 * This action validates that all publishable packages can be published to GitHub Packages.
 * It sets the following outputs:
 * - `success`: Whether all packages are valid (true | false)
 * - `packages`: JSON array of validation results
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
 *     NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
 *   with:
 *     script: |
 *       const { default: validatePublishGitHubPackages } = await import('${{ github.workspace }}/.github/actions/setup-release/validate-publish-github-packages.ts');
 *       await validatePublishGitHubPackages({ core, exec, github, context });
 * ```
 */
export default async ({ core, exec, github, context }: AsyncFunctionArguments): Promise<void> => {
	try {
		const packageManager = process.env.PACKAGE_MANAGER || "pnpm";
		const dryRun = process.env.DRY_RUN === "true";

		if (dryRun) {
			core.notice("🧪 Running in dry-run mode (preview only)");
		}

		const result = await validatePublishGitHubPackages(core, exec, github, context, packageManager, dryRun);

		// Set outputs
		core.setOutput("success", result.success.toString());
		core.setOutput("packages", JSON.stringify(result.packages));
		core.setOutput("check_id", result.checkId.toString());

		// Log summary
		if (result.success) {
			core.notice(`✓ All ${result.packages.length} package(s) ready for GitHub Packages`);
		} else {
			const failedCount = result.packages.filter((p) => !p.canPublish).length;
			core.error(`❌ ${failedCount} of ${result.packages.length} package(s) failed validation`);
		}

		// Debug outputs
		core.debug(`Set output 'success' to: ${result.success}`);
		core.debug(`Set output 'packages' to: ${JSON.stringify(result.packages)}`);
		core.debug(`Set output 'check_id' to: ${result.checkId}`);

		// Fail the action if validation failed (unless dry-run)
		if (!result.success && !dryRun) {
			core.setFailed("GitHub Packages validation failed. See check run for details.");
		}
	} catch (error) {
		/* v8 ignore next -- @preserve */
		core.setFailed(
			`Failed to validate GitHub Packages publish: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
};
