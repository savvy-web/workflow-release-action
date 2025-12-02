import * as core from "@actions/core";
import type { PackagePublishResult } from "./generate-publish-summary.js";

/**
 * Tag strategy result
 */
export interface TagStrategyResult {
	/** Strategy type: 'single' for one tag, 'multiple' for per-package tags */
	strategy: "single" | "multiple";
	/** Tags to create */
	tags: TagInfo[];
	/** Whether all packages have the same version (fixed versioning) */
	isFixedVersioning: boolean;
}

/**
 * Information about a single tag
 */
export interface TagInfo {
	/** Git tag name (e.g., 'v1.0.0' or '@scope/pkg@1.0.0') */
	name: string;
	/** Package name associated with this tag */
	packageName: string;
	/** Version for this tag */
	version: string;
}

/**
 * Determine the tagging strategy for releases
 *
 * @remarks
 * Tagging strategy rules:
 * - Single package → single tag: `v1.0.0`
 * - Fixed versioning (all same version) → single tag: `v1.0.0`
 * - Independent versioning → multiple tags: `@scope/pkg@1.0.0`, `@scope/pkg-b@2.0.0`
 *
 * @param publishResults - Results from publishing packages
 * @returns Tag strategy with tags to create
 */
export function determineTagStrategy(publishResults: PackagePublishResult[]): TagStrategyResult {
	// Filter to only successfully published packages
	const successfulPackages = publishResults.filter((pkg) => pkg.targets.some((t) => t.success));

	if (successfulPackages.length === 0) {
		core.info("No packages were published successfully, no tags to create");
		return {
			strategy: "single",
			tags: [],
			isFixedVersioning: true,
		};
	}

	// Check if single package
	if (successfulPackages.length === 1) {
		const pkg = successfulPackages[0];
		const tag = `v${pkg.version}`;
		core.info(`Single package strategy: creating tag ${tag}`);

		return {
			strategy: "single",
			tags: [
				{
					name: tag,
					packageName: pkg.name,
					version: pkg.version,
				},
			],
			isFixedVersioning: true,
		};
	}

	// Check if all packages have the same version (fixed versioning)
	const versions = new Set(successfulPackages.map((pkg) => pkg.version));
	const isFixedVersioning = versions.size === 1;

	if (isFixedVersioning) {
		const version = successfulPackages[0].version;
		const tag = `v${version}`;
		core.info(`Fixed versioning strategy: all packages at ${version}, creating single tag ${tag}`);

		return {
			strategy: "single",
			tags: [
				{
					name: tag,
					packageName: successfulPackages.map((p) => p.name).join(", "),
					version,
				},
			],
			isFixedVersioning: true,
		};
	}

	// Independent versioning - create tag per package
	core.info(`Independent versioning strategy: creating ${successfulPackages.length} tags`);

	const tags = successfulPackages.map((pkg) => {
		// Use npm-style tags for scoped packages: @scope/pkg@1.0.0
		// Use v-prefix for non-scoped: pkg@v1.0.0
		const tag = pkg.name.startsWith("@") ? `${pkg.name}@${pkg.version}` : `${pkg.name}@v${pkg.version}`;

		core.info(`  - ${tag}`);

		return {
			name: tag,
			packageName: pkg.name,
			version: pkg.version,
		};
	});

	return {
		strategy: "multiple",
		tags,
		isFixedVersioning: false,
	};
}

/**
 * Determine the release type based on version changes
 *
 * @remarks
 * Analyzes the version changes to determine if this is a major, minor, or patch release.
 * For multiple packages with different bump types, returns the highest (major > minor > patch).
 *
 * @param publishResults - Results from publishing packages
 * @param bumpTypes - Map of package name to bump type
 * @returns Release type: 'major', 'minor', or 'patch'
 */
export function determineReleaseType(
	publishResults: PackagePublishResult[],
	bumpTypes: Map<string, string>,
): "major" | "minor" | "patch" {
	const successfulPackages = publishResults.filter((pkg) => pkg.targets.some((t) => t.success));

	// Get bump types for successful packages
	const bumps = successfulPackages
		.map((pkg) => bumpTypes.get(pkg.name))
		.filter((bump): bump is string => bump !== undefined);

	// Return highest bump type
	if (bumps.includes("major")) return "major";
	if (bumps.includes("minor")) return "minor";
	return "patch";
}
