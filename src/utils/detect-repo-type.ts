import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { WorkspaceInfos } from "workspace-tools";
import { getWorkspaceInfos } from "workspace-tools";

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
	/** Package names/patterns to ignore from releases */
	ignore?: string[];
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

/**
 * Checks if a package name matches an ignore pattern from changeset config
 *
 * @param packageName - The package name to check
 * @param pattern - The ignore pattern (supports exact match and `@scope/*` wildcards)
 * @returns True if the package name matches the pattern
 *
 * @remarks
 * Supports two pattern formats:
 * - Exact match: `"my-package"` matches only `"my-package"`
 * - Scope wildcard: `"@scope/*"` matches any package starting with `"@scope/"`
 */
function matchesIgnorePattern(packageName: string, pattern: string): boolean {
	if (pattern.endsWith("/*")) {
		// Scope wildcard pattern: "@scope/*" matches "@scope/anything"
		const prefix = pattern.slice(0, -1); // Remove trailing "*", keep "/"
		return packageName.startsWith(prefix);
	}
	// Exact match
	return packageName === pattern;
}

/**
 * Reads the changeset ignore patterns from config
 *
 * @returns Array of ignore patterns, empty array if config doesn't exist or has no ignore
 */
function getChangesetIgnorePatterns(): string[] {
	try {
		if (!existsSync(".changeset/config.json")) {
			return [];
		}

		const configContent = readFileSync(".changeset/config.json", "utf-8");
		const config = JSON.parse(configContent) as ChangesetConfig;

		return config.ignore ?? [];
	} catch {
		return [];
	}
}

/**
 * Checks if a package should be ignored based on changeset config
 *
 * @param packageName - The package name to check
 * @param ignorePatterns - Array of ignore patterns from changeset config
 * @returns True if the package matches any ignore pattern
 */
function isIgnoredPackage(packageName: string, ignorePatterns: string[]): boolean {
	return ignorePatterns.some((pattern) => matchesIgnorePattern(packageName, pattern));
}

/**
 * Detects if this is effectively a single-package repository
 *
 * @returns True if there's only one publishable package (after excluding ignored packages)
 *
 * @remarks
 * A repository is considered "single-package" when:
 * - There are 0 or 1 workspace entries, OR
 * - All workspace packages except the root are in the changeset `ignore` list
 *
 * This handles cases like test fixtures in workspaces that are excluded from releases.
 */
export function isSinglePackage(): boolean {
	try {
		const workspaces = getWorkspaceInfos(process.cwd()) ?? [];

		// 0 or 1 workspace = definitely single package
		if (workspaces.length <= 1) {
			return true;
		}

		// Check if all non-root packages are ignored by changesets
		const ignorePatterns = getChangesetIgnorePatterns();
		if (ignorePatterns.length === 0) {
			// No ignore patterns, so multiple packages means not single
			return false;
		}

		// Get root package name to exclude from ignore check
		let rootPackageName = "";
		try {
			const packageJsonContent = readFileSync("package.json", "utf-8");
			const packageJson = JSON.parse(packageJsonContent) as { name?: string };
			rootPackageName = packageJson.name ?? "";
		} catch {
			// If we can't read root package.json, we can't determine single-package
			return false;
		}

		// Count non-ignored, non-root packages
		const publishablePackages = workspaces.filter((ws: WorkspaceInfos[number]) => {
			const name = ws.name;
			// Root package is always publishable (if versioned)
			if (name === rootPackageName) {
				return true;
			}
			// Check if this package is ignored
			return !isIgnoredPackage(name, ignorePatterns);
		});

		// Single package if only the root package is publishable
		return publishablePackages.length <= 1;
	} catch {
		// If workspace detection fails, assume single-package
		return true;
	}
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
		const workspaces = getWorkspaceInfos(process.cwd()) ?? [];
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
