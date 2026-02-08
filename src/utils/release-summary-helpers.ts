import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { debug } from "@actions/core";
import { findProjectRoot, getWorkspaceInfos } from "workspace-tools";

/**
 * Changeset configuration
 */
export interface ChangesetConfig {
	fixed?: string[][];
	linked?: string[][];
}

/**
 * Package group information
 */
export interface PackageGroup {
	/** Group type: fixed, linked, or none */
	type: "fixed" | "linked" | "none";
	/** Sibling packages in the same group */
	siblings: string[];
}

/**
 * Workspace package info
 */
export interface WorkspacePackageInfo {
	/** Package name */
	name: string;
	/** Package version */
	version: string;
	/** Package path */
	path: string;
	/** Whether package is private */
	private: boolean;
	/** Whether package has publishConfig.access */
	hasPublishConfig: boolean;
	/** Access level if configured */
	access?: "public" | "restricted";
	/** Number of publish targets */
	targetCount: number;
}

/**
 * Reason why a package is not being released
 */
export type SkipReason = "private" | "no-publish-config" | "no-changes" | "ignored";

/**
 * Read the changeset configuration file
 *
 * @returns Changeset config or null if not found/readable
 */
export function readChangesetConfig(): ChangesetConfig | null {
	const configPath = join(process.cwd(), ".changeset", "config.json");

	try {
		if (existsSync(configPath)) {
			const content = readFileSync(configPath, "utf8");
			return JSON.parse(content) as ChangesetConfig;
		}
	} catch (err) {
		debug(`Failed to read changeset config: ${err instanceof Error ? err.message : String(err)}`);
	}

	return null;
}

/**
 * Find which group a package belongs to (fixed or linked)
 *
 * @param packageName - Package name to look up
 * @param config - Changeset configuration
 * @returns Group information
 */
export function findPackageGroup(packageName: string, config: ChangesetConfig | null): PackageGroup {
	if (!config) {
		return { type: "none", siblings: [] };
	}

	// Check fixed groups
	if (config.fixed) {
		for (const group of config.fixed) {
			if (group.includes(packageName)) {
				return {
					type: "fixed",
					siblings: group.filter((name) => name !== packageName),
				};
			}
		}
	}

	// Check linked groups
	if (config.linked) {
		for (const group of config.linked) {
			if (group.includes(packageName)) {
				return {
					type: "linked",
					siblings: group.filter((name) => name !== packageName),
				};
			}
		}
	}

	return { type: "none", siblings: [] };
}

/**
 * Get all workspace packages including their publish configuration
 *
 * @returns Array of workspace package info
 */
export function getAllWorkspacePackages(): WorkspacePackageInfo[] {
	const cwd = process.cwd();
	const workspaceRoot = findProjectRoot(cwd);

	if (!workspaceRoot) {
		debug("No workspace root found");
		return [];
	}

	const workspaces = getWorkspaceInfos(workspaceRoot) ?? [];
	const packages: WorkspacePackageInfo[] = [];

	for (const workspace of workspaces) {
		const pkgJson = workspace.packageJson as {
			name?: string;
			version?: string;
			private?: boolean;
			publishConfig?: {
				access?: "public" | "restricted";
				targets?: unknown[];
			};
		};

		if (!pkgJson.name) continue;

		const hasPublishConfig = pkgJson.publishConfig?.access !== undefined;
		const targets = pkgJson.publishConfig?.targets;
		const targetCount = Array.isArray(targets) ? targets.length : hasPublishConfig ? 1 : 0;

		packages.push({
			name: pkgJson.name,
			version: pkgJson.version || "0.0.0",
			path: workspace.path,
			private: pkgJson.private === true,
			hasPublishConfig,
			access: pkgJson.publishConfig?.access,
			targetCount,
		});
	}

	return packages;
}

/**
 * Extended changeset status with per-package changeset counts
 */
export interface ExtendedChangesetStatus {
	/** Packages with version changes */
	releases: Array<{
		name: string;
		oldVersion: string;
		newVersion: string;
		type: "major" | "minor" | "patch" | "none";
	}>;
	/** Changeset information */
	changesets: Array<{
		id: string;
		summary: string;
		releases: Array<{ name: string; type: string }>;
	}>;
}

/**
 * Count changesets per package
 *
 * @param changesets - Array of changeset info
 * @returns Map of package name to changeset count
 */
export function countChangesetsPerPackage(
	changesets: Array<{ releases: Array<{ name: string }> }>,
): Map<string, number> {
	const counts = new Map<string, number>();

	for (const changeset of changesets) {
		for (const release of changeset.releases) {
			const current = counts.get(release.name) || 0;
			counts.set(release.name, current + 1);
		}
	}

	return counts;
}

/**
 * Get the reason why a package is not being released
 *
 * @param pkg - Workspace package info
 * @param isInReleases - Whether the package is in the release list
 * @returns Skip reason or null if package is being released
 */
export function getSkipReason(pkg: WorkspacePackageInfo, isInReleases: boolean): SkipReason | null {
	if (isInReleases) {
		return null;
	}

	if (pkg.private && !pkg.hasPublishConfig) {
		return "private";
	}

	if (!pkg.hasPublishConfig) {
		return "no-publish-config";
	}

	return "no-changes";
}

/**
 * Format skip reason for display
 *
 * @param reason - Skip reason
 * @returns Human-readable skip reason
 */
export function formatSkipReason(reason: SkipReason): string {
	switch (reason) {
		case "private":
			return "🔒 Private (no `publishConfig.access`)";
		case "no-publish-config":
			return "⚙️ No `publishConfig.access`";
		case "no-changes":
			return "📭 No changes";
		case "ignored":
			return "🚫 Ignored";
	}
}

/**
 * Get bump type icon
 *
 * @param type - Bump type
 * @returns Emoji icon for the bump type
 */
export function getBumpTypeIcon(type: string): string {
	switch (type) {
		case "major":
			return "🔴";
		case "minor":
			return "🟡";
		case "patch":
			return "🟢";
		default:
			return "⚪️";
	}
}

/**
 * Get group type icon
 *
 * @param type - Group type
 * @returns Emoji icon for the group type
 */
export function getGroupIcon(type: "fixed" | "linked" | "none"): string {
	switch (type) {
		case "fixed":
			return "🔒";
		case "linked":
			return "🔗";
		default:
			return "📦";
	}
}

/**
 * Check if this is a first release (version starting with 0.0.0)
 *
 * @param oldVersion - Old version string
 * @returns Whether this is a first release
 */
export function isFirstRelease(oldVersion: string): boolean {
	return oldVersion === "0.0.0";
}
