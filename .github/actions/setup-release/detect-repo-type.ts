import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type * as core from "@actions/core";
import type { WorkspaceInfos } from "workspace-tools";

/**
 * Type alias for GitHub Actions core module to avoid circular references
 */
type CoreType = typeof core;

/**
 * Arguments passed to the main action function from github-script
 */
interface AsyncFunctionArguments {
	/** GitHub Actions core module for logging and setting outputs */
	core: CoreType;
	/** workspace-tools module for workspace detection */
	workspaceTools: typeof import("workspace-tools");
}

/**
 * Supported package managers for repository detection
 */
type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

/**
 * Relevant fields from package.json for repository type detection
 */
interface PackageJson {
	/** Whether the root package is marked as private */
	private?: boolean;
	/** Package manager specification (e.g., "pnpm@10.20.0") */
	packageManager?: string;
	/** Workspace configuration (array or object format) */
	workspaces?: string[] | { packages?: string[] };
}

/**
 * Relevant fields from .changeset/config.json
 */
interface ChangesetConfig {
	/** Private package handling configuration */
	privatePackages?: {
		/** Whether to create git tags for private packages */
		tag?: boolean;
		/** Whether to version private packages */
		version?: boolean;
	};
}

/**
 * Repository type detection result
 */
interface RepoTypeResult {
	/** Whether this is a single-package private repository */
	isSinglePrivatePackage: boolean;
	/** Detected package manager */
	packageManager: PackageManager;
	/** Whether the root package is private */
	isPrivate: boolean;
	/** Whether the repository has workspace packages */
	hasWorkspaces: boolean;
	/** Whether changesets privatePackages.tag is enabled */
	privatePackagesTag: boolean;
}

/**
 * Detects the package manager from package.json packageManager field
 *
 * @param packageJson - Parsed package.json contents
 * @returns Detected package manager, defaults to "pnpm" if not specified or invalid
 *
 * @remarks
 * Parses the packageManager field (e.g., "pnpm@10.20.0") and extracts the manager name.
 * Falls back to "pnpm" if the field is missing or contains an invalid manager.
 */
function detectPackageManager(packageJson: PackageJson): PackageManager {
	const packageManagerField = packageJson.packageManager || "";
	const pmName = packageManagerField.split("@")[0] as PackageManager;

	// Default to pnpm if not specified or invalid
	if (!pmName || !["npm", "pnpm", "yarn", "bun"].includes(pmName)) {
		return "pnpm";
	}

	return pmName;
}

export function isSinglePackage(workspaceTools: typeof import("workspace-tools")): boolean {
	const workspaces = workspaceTools.getWorkspaces(process.cwd()) as WorkspaceInfos;
	return Object.keys(workspaces).length === 1;
}

/**
 * Checks if the repository has workspace packages (is a monorepo)
 *
 * @param workspaceTools - workspace-tools module for workspace detection
 * @returns True if workspace packages are detected (more than 1 workspace), false otherwise
 *
 * @remarks
 * Uses `workspace-tools` library to detect workspaces across all package managers.
 * This provides a unified, package-manager-agnostic approach that works with:
 * - **pnpm**: Reads pnpm-workspace.yaml
 * - **npm**: Reads package.json workspaces field
 * - **yarn**: Reads package.json workspaces field
 * - **bun**: Reads package.json workspaces field
 *
 * A repository is considered to have workspaces if there are more than 1 workspace
 * entries (root package + workspace packages = monorepo).
 *
 * Returns false if workspace detection fails or only the root package exists.
 */
function hasWorkspacePackages(workspaceTools: typeof import("workspace-tools")): boolean {
	try {
		const workspaces = workspaceTools.getWorkspaces(process.cwd()) as WorkspaceInfos;
		return Object.keys(workspaces).length > 1;
	} catch {
		return false;
	}
}

/**
 * Checks if changesets config has privatePackages.tag enabled
 *
 * @returns True if .changeset/config.json exists and has privatePackages.tag set to true
 *
 * @remarks
 * The `privatePackages.tag` setting in changesets controls whether git tags
 * are created for private packages during release.
 *
 * Returns false if:
 * - .changeset/config.json doesn't exist
 * - Config file cannot be parsed
 * - privatePackages.tag is not set or set to false
 */
async function hasPrivatePackagesTag(): Promise<boolean> {
	try {
		if (!existsSync(".changeset/config.json")) {
			return false;
		}

		const configContent = await readFile(".changeset/config.json", "utf-8");
		const config = JSON.parse(configContent) as ChangesetConfig;

		return config.privatePackages?.tag === true;
	} catch {
		return false;
	}
}

/**
 * Detects the repository type and release configuration
 *
 * @param _core - GitHub Actions core module (unused, reserved for future logging)
 * @param workspaceTools - workspace-tools module for workspace detection
 * @returns Repository type detection result
 *
 * @remarks
 * Analyzes the repository to determine:
 * - Whether it's a single-package private repository
 * - The package manager being used
 * - Whether it's configured as a monorepo with workspaces
 * - Whether changesets is configured to tag private packages
 *
 * A repository is considered "single-package private" when ALL of these are true:
 * - Root package.json has `"private": true`
 * - No workspace packages exist (not a monorepo)
 * - Changesets config has `privatePackages.tag: true`
 *
 * This distinction is important for release workflows because single-package
 * private repos need manual tag creation, while changesets handles tags for
 * multi-package repos.
 */
async function detectRepoType(
	_core: CoreType,
	workspaceTools: typeof import("workspace-tools"),
): Promise<RepoTypeResult> {
	// Read package.json
	const packageJson = JSON.parse(await readFile("package.json", "utf-8")) as PackageJson;

	// Check if root package is private
	const isPrivate = packageJson.private === true;

	// Detect package manager
	const packageManager = detectPackageManager(packageJson);

	// Check for workspace packages
	const hasWorkspaces = hasWorkspacePackages(workspaceTools);

	// Check changesets config
	const privatePackagesTag = await hasPrivatePackagesTag();

	// Determine if this is a single-package private repo
	const isSinglePrivatePackage = isPrivate && !hasWorkspaces && privatePackagesTag;

	return {
		isSinglePrivatePackage,
		packageManager,
		isPrivate,
		hasWorkspaces,
		privatePackagesTag,
	};
}

/**
 * Main action entrypoint: Detects repository type and sets GitHub Actions outputs
 *
 * @param args - Function arguments from github-script
 * @param args.core - GitHub Actions core module
 * @param args.workspaceTools - workspace-tools module
 *
 * @remarks
 * This function is called from a GitHub Actions workflow using `actions/github-script@v8`.
 * It analyzes the repository structure and sets the following outputs:
 * - `isSinglePrivatePackage`: Whether this is a single-package private repo (true | false)
 * - `packageManager`: Detected package manager (npm | pnpm | yarn | bun)
 *
 * The `isSinglePrivatePackage` output is used by release workflows to determine
 * whether manual tag creation is needed. Single-package private repos require
 * manual tags because changesets skips tag creation for private packages.
 *
 * Debug information logged includes:
 * - Package manager
 * - Whether root package is private
 * - Whether repository has workspaces
 * - Whether private packages tagging is enabled in changesets
 *
 * @example
 * ```yaml
 * - uses: actions/github-script@v8
 *   with:
 *     script: |
 *       const workspaceTools = await import('workspace-tools');
 *       const { default: detectRepoType } = await import('${{ github.workspace }}/.github/actions/setup-release/detect-repo-type.ts');
 *       await detectRepoType({ core, workspaceTools });
 * ```
 */
export default async ({ core, workspaceTools }: AsyncFunctionArguments): Promise<void> => {
	try {
		const result = await detectRepoType(core, workspaceTools);

		// Set outputs
		const isSinglePrivatePackage = result.isSinglePrivatePackage.toString();
		const packageManager = result.packageManager;

		core.setOutput("isSinglePrivatePackage", isSinglePrivatePackage);
		core.setOutput("packageManager", packageManager);

		// Log results
		if (result.isSinglePrivatePackage) {
			core.notice("✓ Detected single-package private repo (manual tag creation required)");
		} else {
			core.notice("✓ Detected multi-package or public repo (changesets handles tags)");
		}

		// Debug output
		core.info(`  - Package manager: ${packageManager}`);
		core.info(`  - Root package private: ${result.isPrivate}`);
		core.info(`  - Has workspaces: ${result.hasWorkspaces}`);
		core.info(`  - Private packages tagging enabled: ${result.privatePackagesTag}`);

		// Confirm outputs set
		core.debug(`Set output 'isSinglePrivatePackage' to: ${isSinglePrivatePackage}`);
		core.debug(`Set output 'packageManager' to: ${packageManager}`);
	} catch (error) {
		core.setFailed(`Failed to detect repository type: ${error instanceof Error ? error.message : String(error)}`);
	}
};
