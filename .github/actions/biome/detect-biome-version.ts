import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { parse as parseJsonc } from "jsonc-parser";
import type { AsyncFunctionArguments as BaseAsyncFunctionArguments } from "../shared/types.js";

/**
 * Type alias for jsonc-parser parse function
 */
type ParseFunction = typeof parseJsonc;

/**
 * Arguments passed to the main action function from github-script
 *
 * @remarks
 * Extends the base AsyncFunctionArguments to include the jsonc-parser dependency
 * which must be passed as an external module.
 */
interface AsyncFunctionArguments extends Pick<BaseAsyncFunctionArguments, "core"> {
	/** JSONC parser function for parsing Biome config files */
	parse: ParseFunction;
}

/**
 * Biome configuration file structure
 *
 * @remarks
 * Only includes the $schema field which is used for version detection.
 * The full Biome config has many more fields but they are not needed here.
 */
interface BiomeConfig {
	/** Schema URL that includes the Biome version (e.g., "https://biomejs.dev/schemas/2.3.6/schema.json") */
	$schema?: string;
}

/**
 * Result of Biome version detection
 */
interface DetectionResult {
	/** Detected Biome version (e.g., "2.3.6") or "latest" if not detected */
	version: string;
	/** Path to detected config file (e.g., "biome.jsonc") or empty string if not found */
	configFile: string;
}

/**
 * Detects which Biome config file exists in the repository
 *
 * @returns Path to detected config file, or empty string if none found
 *
 * @remarks
 * Checks for config files in this order:
 * 1. biome.jsonc (preferred, supports comments)
 * 2. biome.json (fallback)
 *
 * Returns empty string if no config file is found.
 */
function detectConfigFile(): string {
	if (existsSync("biome.jsonc")) {
		return "biome.jsonc";
	}

	if (existsSync("biome.json")) {
		return "biome.json";
	}

	return "";
}

/**
 * Parses a Biome config file and extracts the $schema URL
 *
 * @param configFile - Path to the config file to parse
 * @param parseFn - JSONC parser function (handles JSON with comments)
 * @returns The $schema URL if found, undefined otherwise
 *
 * @remarks
 * Uses jsonc-parser to handle both .json and .jsonc files.
 * The $schema field is optional in Biome configs.
 */
async function parseConfigFile(configFile: string, parseFn: ParseFunction): Promise<string | undefined> {
	const content = await readFile(configFile, "utf-8");
	const config = parseFn(content) as BiomeConfig;
	return config.$schema;
}

/**
 * Extracts Biome version from a schema URL
 *
 * @param schemaUrl - The $schema URL from the config file
 * @returns Extracted version string, or undefined if pattern doesn't match
 *
 * @remarks
 * Expects schema URLs in the format:
 * `https://biomejs.dev/schemas/{version}/schema.json`
 *
 * @example
 * ```typescript
 * extractVersionFromSchema("https://biomejs.dev/schemas/2.3.6/schema.json")
 * // Returns: "2.3.6"
 * ```
 */
function extractVersionFromSchema(schemaUrl: string): string | undefined {
	const versionMatch = schemaUrl.match(/\/schemas\/(\d+\.\d+\.\d+)\//);
	return versionMatch?.[1];
}

/**
 * Detects Biome version from config file $schema or provided input
 *
 * @param coreModule - GitHub Actions core module for logging
 * @param parseFn - JSONC parser function
 * @param providedVersion - Optional explicit version override
 * @returns Detection result with version and config file path
 *
 * @remarks
 * Version detection priority:
 * 1. Provided version (if specified)
 * 2. Version from config file $schema URL
 * 3. "latest" as fallback
 *
 * Falls back to "latest" if:
 * - No config file exists
 * - Config file has no $schema field
 * - $schema URL doesn't match expected pattern
 * - Config file cannot be parsed
 */
async function detectBiomeVersion(
	coreModule: AsyncFunctionArguments["core"],
	parseFn: ParseFunction,
	providedVersion?: string,
): Promise<DetectionResult> {
	const core = coreModule;
	// If version was explicitly provided, use it
	if (providedVersion) {
		core.info(`Using provided Biome version: ${providedVersion}`);
		return {
			version: providedVersion,
			configFile: "",
		};
	}

	// Detect config file
	const configFile = detectConfigFile();

	if (!configFile) {
		core.warning("No Biome config file found, using 'latest' version");
		return {
			version: "latest",
			configFile: "",
		};
	}

	core.info(`Detected Biome config: ${configFile}`);

	try {
		// Parse config file
		const schemaUrl = await parseConfigFile(configFile, parseFn);

		if (!schemaUrl) {
			core.warning(`No $schema field found in ${configFile}, using 'latest' version`);
			return {
				version: "latest",
				configFile,
			};
		}

		// Extract version from schema URL
		const version = extractVersionFromSchema(schemaUrl);

		if (!version) {
			core.warning(`Could not parse version from $schema in ${configFile} (URL: ${schemaUrl}), using 'latest' version`);
			return {
				version: "latest",
				configFile,
			};
		}

		core.info(`Detected Biome version: ${version} from ${configFile}`);
		return {
			version,
			configFile,
		};
	} catch (error) {
		core.warning(
			`Failed to parse ${configFile}: ${error instanceof Error ? error.message : String(error)}, using 'latest' version`,
		);
		return {
			version: "latest",
			configFile,
		};
	}
}

/**
 * Main action entrypoint: Detects Biome version and sets GitHub Actions outputs
 *
 * @param args - Function arguments from github-script
 * @param args.core - GitHub Actions core module
 * @param args.parse - JSONC parser function from jsonc-parser
 * @param providedVersion - Optional explicit Biome version to use
 *
 * @remarks
 * This function is called from a GitHub Actions workflow using `actions/github-script@v8`.
 * It detects the Biome version from the repository's config file and sets the following outputs:
 * - `version`: Detected Biome version (e.g., "2.3.6") or "latest"
 * - `config-file`: Path to detected config file or empty string
 *
 * The version is extracted from the $schema field in biome.json or biome.jsonc.
 * If no config file exists or version cannot be determined, defaults to "latest".
 *
 * @example
 * ```yaml
 * - uses: actions/github-script@v8
 *   with:
 *     script: |
 *       const { parse } = await import('jsonc-parser');
 *       const { default: detectBiomeVersion } = await import('${{ github.workspace }}/.github/actions/biome/detect-biome-version.ts');
 *       await detectBiomeVersion({ core, parse });
 * ```
 *
 * @example
 * ```yaml
 * # With explicit version
 * - uses: actions/github-script@v8
 *   with:
 *     script: |
 *       const { parse } = await import('jsonc-parser');
 *       const { default: detectBiomeVersion } = await import('${{ github.workspace }}/.github/actions/biome/detect-biome-version.ts');
 *       await detectBiomeVersion({ core, parse }, '2.3.6');
 * ```
 */
export default async ({ core, parse }: AsyncFunctionArguments, providedVersion?: string): Promise<void> => {
	try {
		// Detect version
		const result = await detectBiomeVersion(core, parse, providedVersion);

		// Set outputs
		core.setOutput("version", result.version);
		core.setOutput("config-file", result.configFile);

		// Debug output
		core.debug(`Set output 'version' to: ${result.version}`);
		core.debug(`Set output 'config-file' to: ${result.configFile}`);
	} catch (error) {
		/* v8 ignore next -- @preserve */
		const errorMessage = error instanceof Error ? error.message : String(error);
		core.setFailed(`Failed to detect Biome version: ${errorMessage}`);
	}
};
