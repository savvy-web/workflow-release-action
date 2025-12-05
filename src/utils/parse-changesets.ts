import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Bump type for a package in a changeset
 */
export type BumpType = "major" | "minor" | "patch";

/**
 * A single package release from a changeset
 */
export interface ChangesetRelease {
	/** Package name */
	name: string;
	/** Bump type (major, minor, patch) */
	type: BumpType;
}

/**
 * Parsed changeset file
 */
export interface ParsedChangeset {
	/** Changeset ID (filename without .md) */
	id: string;
	/** Changeset summary (content after frontmatter) */
	summary: string;
	/** Packages affected by this changeset */
	releases: ChangesetRelease[];
}

/**
 * Result of parsing all changesets in a directory
 */
export interface ParseChangesetsResult {
	/** Whether any changesets were found */
	hasChangesets: boolean;
	/** Number of changeset files found */
	changesetCount: number;
	/** Parsed changeset files */
	changesets: ParsedChangeset[];
	/** Highest bump type across all changesets */
	releaseType: BumpType | null;
	/** All affected packages (deduplicated) */
	affectedPackages: string[];
	/** Map of package name to highest bump type */
	packageBumps: Map<string, BumpType>;
}

/**
 * Options for parsing changesets
 */
export interface ParseChangesetsOptions {
	/** Path to the .changeset directory (default: .changeset) */
	changesetPath?: string;
}

/**
 * Parses all changeset files in a directory
 *
 * @remarks
 * Changeset files are markdown files with YAML frontmatter in the format:
 * ```
 * ---
 * "package-name": major
 * "@scope/package": minor
 * ---
 *
 * Summary of changes
 * ```
 *
 * @param options - Parsing options
 * @returns Parsed changesets with metadata
 */
export function parseChangesets(options: ParseChangesetsOptions = {}): ParseChangesetsResult {
	const changesetPath = options.changesetPath || ".changeset";
	const absolutePath = path.isAbsolute(changesetPath) ? changesetPath : path.join(process.cwd(), changesetPath);

	const result: ParseChangesetsResult = {
		hasChangesets: false,
		changesetCount: 0,
		changesets: [],
		releaseType: null,
		affectedPackages: [],
		packageBumps: new Map(),
	};

	// Check if directory exists
	if (!fs.existsSync(absolutePath)) {
		return result;
	}

	// Find all .md files (excluding README.md)
	const files = fs.readdirSync(absolutePath).filter((file) => {
		return file.endsWith(".md") && file.toLowerCase() !== "readme.md";
	});

	if (files.length === 0) {
		return result;
	}

	result.hasChangesets = true;
	result.changesetCount = files.length;

	// Parse each changeset file
	for (const file of files) {
		const filePath = path.join(absolutePath, file);
		const content = fs.readFileSync(filePath, "utf8");
		const parsed = parseChangesetFile(content, file.replace(/\.md$/, ""));

		if (parsed) {
			result.changesets.push(parsed);

			// Track package bumps
			for (const release of parsed.releases) {
				const existingBump = result.packageBumps.get(release.name);
				if (!existingBump || compareBumpTypes(release.type, existingBump) > 0) {
					result.packageBumps.set(release.name, release.type);
				}
			}
		}
	}

	// Calculate affected packages (deduplicated)
	result.affectedPackages = Array.from(result.packageBumps.keys()).sort();

	// Calculate highest release type
	result.releaseType = getHighestBumpType(result.packageBumps);

	return result;
}

/**
 * Parses a single changeset file
 *
 * @param content - File content
 * @param id - Changeset ID (filename without extension)
 * @returns Parsed changeset or null if invalid
 */
export function parseChangesetFile(content: string, id: string): ParsedChangeset | null {
	// Split frontmatter from content
	const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

	if (!frontmatterMatch) {
		return null;
	}

	const [, frontmatter, summary] = frontmatterMatch;
	const releases: ChangesetRelease[] = [];

	// Parse YAML frontmatter (simple key: value format)
	// Format: "package-name": bump-type
	const lines = frontmatter.split("\n");

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		// Match patterns like:
		// "package-name": major
		// "@scope/package": minor
		// 'package-name': patch
		const match = trimmed.match(/^["']?([^"']+)["']?\s*:\s*(major|minor|patch)\s*$/);

		if (match) {
			const [, packageName, bumpType] = match;
			releases.push({
				name: packageName.trim(),
				type: bumpType as BumpType,
			});
		}
	}

	return {
		id,
		summary: summary.trim(),
		releases,
	};
}

/**
 * Compares two bump types
 *
 * @param a - First bump type
 * @param b - Second bump type
 * @returns Positive if a > b, negative if a < b, 0 if equal
 */
export function compareBumpTypes(a: BumpType, b: BumpType): number {
	const order: Record<BumpType, number> = { major: 3, minor: 2, patch: 1 };
	return order[a] - order[b];
}

/**
 * Gets the highest bump type from a map of package bumps
 *
 * @param packageBumps - Map of package name to bump type
 * @returns Highest bump type or null if empty
 */
export function getHighestBumpType(packageBumps: Map<string, BumpType>): BumpType | null {
	if (packageBumps.size === 0) {
		return null;
	}

	let highest: BumpType = "patch";

	for (const bumpType of packageBumps.values()) {
		if (compareBumpTypes(bumpType, highest) > 0) {
			highest = bumpType;
		}
	}

	return highest;
}

/**
 * Checks if any changesets exist (quick check without full parsing)
 *
 * @param changesetPath - Path to .changeset directory
 * @returns Whether any changeset files exist
 */
export function hasChangesets(changesetPath: string = ".changeset"): boolean {
	const absolutePath = path.isAbsolute(changesetPath) ? changesetPath : path.join(process.cwd(), changesetPath);

	if (!fs.existsSync(absolutePath)) {
		return false;
	}

	const files = fs.readdirSync(absolutePath);
	return files.some((file) => file.endsWith(".md") && file.toLowerCase() !== "readme.md");
}

/**
 * Counts changeset files (quick check without full parsing)
 *
 * @param changesetPath - Path to .changeset directory
 * @returns Number of changeset files
 */
export function countChangesets(changesetPath: string = ".changeset"): number {
	const absolutePath = path.isAbsolute(changesetPath) ? changesetPath : path.join(process.cwd(), changesetPath);

	if (!fs.existsSync(absolutePath)) {
		return 0;
	}

	const files = fs.readdirSync(absolutePath);
	return files.filter((file) => file.endsWith(".md") && file.toLowerCase() !== "readme.md").length;
}
