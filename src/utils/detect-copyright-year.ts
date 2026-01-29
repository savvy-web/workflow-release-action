import { debug } from "@actions/core";
import { exec } from "@actions/exec";

/**
 * Result of copyright year detection
 */
export interface CopyrightYearResult {
	/** The detected or default start year */
	startYear: number;
	/** Source of the year value */
	source: "npm-registry" | "config" | "default";
	/** First published date from npm registry (if found) */
	firstPublished?: string;
}

/**
 * Fetch package creation date from npm registry
 *
 * @remarks
 * Queries the npm registry for the package metadata and extracts the
 * `time.created` timestamp which indicates when the package was first published.
 *
 * @param packageName - Package name to query
 * @param registry - Registry URL (defaults to https://registry.npmjs.org)
 * @returns ISO timestamp of first publication or undefined
 */
export async function fetchNpmPackageCreationDate(
	packageName: string,
	registry: string = "https://registry.npmjs.org",
): Promise<string | undefined> {
	try {
		// Use npm view to get the time metadata
		// This is more reliable than direct fetch as it handles authentication
		let output = "";
		let stderr = "";

		const exitCode = await exec("npm", ["view", packageName, "time", "--json", "--registry", registry], {
			silent: true,
			ignoreReturnCode: true,
			listeners: {
				stdout: (data: Buffer) => {
					output += data.toString();
				},
				stderr: (data: Buffer) => {
					stderr += data.toString();
				},
			},
		});

		if (exitCode !== 0) {
			// Package might not exist yet (new package)
			if (stderr.includes("E404") || stderr.includes("not found") || output.includes("E404")) {
				debug(`Package ${packageName} not found on registry - likely a new package`);
				return undefined;
			}
			debug(`npm view failed for ${packageName}: ${stderr}`);
			return undefined;
		}

		// Parse the time object
		// Format: { "created": "2024-01-15T...", "modified": "...", "1.0.0": "..." }
		const timeData = JSON.parse(output) as Record<string, string>;

		if (timeData.created) {
			debug(`Found creation date for ${packageName}: ${timeData.created}`);
			return timeData.created;
		}

		return undefined;
	} catch (error) {
		debug(`Failed to fetch npm package creation date: ${error instanceof Error ? error.message : String(error)}`);
		return undefined;
	}
}

/**
 * Extract year from ISO date string
 *
 * @param isoDate - ISO 8601 date string
 * @returns Year as number
 */
export function extractYearFromDate(isoDate: string): number {
	const date = new Date(isoDate);
	const year = date.getFullYear();
	// Check for Invalid Date (NaN year)
	if (Number.isNaN(year)) {
		return new Date().getFullYear();
	}
	return year;
}

/**
 * Detect copyright start year for a package
 *
 * @remarks
 * Determines the copyright start year using the following precedence:
 * 1. Explicit startYear override from configuration (if provided)
 * 2. First publication date from npm registry (auto-detected)
 * 3. Current year (for new/unpublished packages)
 *
 * Most packages will use auto-detection (option 2 or 3). The config override
 * is only needed for edge cases like packages published elsewhere before npm.
 *
 * @param packageName - Package name
 * @param configStartYear - Optional override from configuration (most users should not set this)
 * @param registry - Registry URL for npm lookup
 * @returns Copyright year detection result
 */
export async function detectCopyrightYear(
	packageName: string,
	configStartYear?: number,
	registry?: string,
): Promise<CopyrightYearResult> {
	// If config specifies a start year, use it
	if (configStartYear !== undefined) {
		return {
			startYear: configStartYear,
			source: "config",
		};
	}

	// Try to get creation date from npm registry
	const createdDate = await fetchNpmPackageCreationDate(packageName, registry);

	if (createdDate) {
		const year = extractYearFromDate(createdDate);
		return {
			startYear: year,
			source: "npm-registry",
			firstPublished: createdDate,
		};
	}

	// Fall back to current year for new packages
	const currentYear = new Date().getFullYear();
	debug(`Using current year ${currentYear} as copyright start year for ${packageName}`);

	return {
		startYear: currentYear,
		source: "default",
	};
}
