import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { getWorkspaces } from "workspace-tools";

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

export function isSinglePackage(): boolean {
	const workspaces = getWorkspaces(process.cwd());
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
function hasWorkspacePackages(): boolean {
	try {
		const workspaces = getWorkspaces(process.cwd());
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
export async function detectRepoType(): Promise<RepoTypeResult> {
	// Read package.json
	const packageJson = JSON.parse(await readFile("package.json", "utf-8")) as PackageJson;

	// Check if root package is private
	const isPrivate = packageJson.private === true;

	// Detect package manager
	const packageManager = detectPackageManager(packageJson);

	// Check for workspace packages
	const hasWorkspaces = hasWorkspacePackages();

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
