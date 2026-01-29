import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { debug, info, warning } from "@actions/core";
import type { ReleaseConfig, SBOMMetadataConfig } from "../types/sbom-config.js";

/**
 * Config file names to search for (in order of preference)
 */
const CONFIG_FILE_NAMES = ["silk-release.json", "silk-release.jsonc"] as const;

/**
 * Environment variable name for variable-based configuration
 */
const CONFIG_ENV_VAR = "SILK_RELEASE_SBOM_TEMPLATE";

/**
 * Strip JSON comments (single-line // and multi-line /* *\/)
 *
 * @param content - JSON content that may contain comments
 * @returns JSON content with comments removed
 */
function stripJsonComments(content: string): string {
	// Remove single-line comments (// ...)
	// Be careful not to remove URLs with // in them
	let result = content.replace(/(?<![:"'])\/\/[^\n]*/g, "");

	// Remove multi-line comments (/* ... */)
	result = result.replace(/\/\*[\s\S]*?\*\//g, "");

	return result;
}

/**
 * Validate SBOM metadata configuration
 *
 * @remarks
 * Performs basic validation of the SBOM metadata configuration structure.
 * Does not enforce required fields since the config is merged with inferred values.
 *
 * @param config - Configuration to validate
 * @returns Array of validation error messages (empty if valid)
 */
function validateSBOMConfig(config: unknown): string[] {
	const errors: string[] = [];

	if (config === null || config === undefined) {
		return errors; // Empty config is valid
	}

	if (typeof config !== "object") {
		errors.push(`sbom config must be an object, got ${typeof config}`);
		return errors;
	}

	const sbomConfig = config as Record<string, unknown>;

	// Validate supplier
	if (sbomConfig.supplier !== undefined) {
		if (typeof sbomConfig.supplier !== "object" || sbomConfig.supplier === null) {
			errors.push("sbom.supplier must be an object");
		} else {
			const supplier = sbomConfig.supplier as Record<string, unknown>;
			if (supplier.name !== undefined && typeof supplier.name !== "string") {
				errors.push("sbom.supplier.name must be a string");
			}
			if (supplier.url !== undefined) {
				if (typeof supplier.url !== "string" && !Array.isArray(supplier.url)) {
					errors.push("sbom.supplier.url must be a string or array of strings");
				}
			}
		}
	}

	// Validate copyright
	if (sbomConfig.copyright !== undefined) {
		if (typeof sbomConfig.copyright !== "object" || sbomConfig.copyright === null) {
			errors.push("sbom.copyright must be an object");
		} else {
			const copyright = sbomConfig.copyright as Record<string, unknown>;
			if (copyright.holder !== undefined && typeof copyright.holder !== "string") {
				errors.push("sbom.copyright.holder must be a string");
			}
			if (copyright.startYear !== undefined && typeof copyright.startYear !== "number") {
				errors.push("sbom.copyright.startYear must be a number");
			}
		}
	}

	// Validate publisher
	if (sbomConfig.publisher !== undefined && typeof sbomConfig.publisher !== "string") {
		errors.push("sbom.publisher must be a string");
	}

	// Validate documentationUrl
	if (sbomConfig.documentationUrl !== undefined && typeof sbomConfig.documentationUrl !== "string") {
		errors.push("sbom.documentationUrl must be a string");
	}

	return errors;
}

/**
 * Parse and validate configuration content
 *
 * @param content - Raw JSON/JSONC content
 * @param source - Source description for error messages
 * @returns Parsed configuration or undefined if invalid
 */
function parseConfigContent(content: string, source: string): ReleaseConfig | undefined {
	try {
		const strippedContent = stripJsonComments(content);
		const parsed = JSON.parse(strippedContent) as ReleaseConfig;

		// Validate the sbom section if present
		if (parsed.sbom !== undefined) {
			const validationErrors = validateSBOMConfig(parsed.sbom);
			if (validationErrors.length > 0) {
				warning(`Invalid SBOM config from ${source}:\n${validationErrors.map((e) => `  - ${e}`).join("\n")}`);
				return undefined;
			}
		}

		return parsed;
	} catch (error) {
		warning(`Failed to parse config from ${source}: ${error instanceof Error ? error.message : String(error)}`);
		return undefined;
	}
}

/**
 * Load release configuration from a local file
 *
 * @param configPath - Path to the configuration file
 * @returns Parsed configuration or undefined if file doesn't exist or is invalid
 */
function loadConfigFromFile(configPath: string): ReleaseConfig | undefined {
	if (!existsSync(configPath)) {
		return undefined;
	}

	const content = readFileSync(configPath, "utf-8");
	return parseConfigContent(content, configPath);
}

/**
 * Load configuration from local repository
 *
 * @param rootDir - Repository root directory
 * @returns Configuration or undefined if not found
 */
function loadConfigFromLocalRepo(rootDir: string): ReleaseConfig | undefined {
	for (const fileName of CONFIG_FILE_NAMES) {
		const configPath = join(rootDir, ".github", fileName);
		const config = loadConfigFromFile(configPath);

		if (config !== undefined) {
			info(`Loaded Silk release config from .github/${fileName}`);
			debug(`Release config: ${JSON.stringify(config)}`);
			return config;
		}
	}

	return undefined;
}

/**
 * Load configuration from SILK_RELEASE_SBOM_TEMPLATE environment variable
 *
 * @remarks
 * This allows organizations to store the configuration as a GitHub variable
 * and pass it to the workflow as an environment variable. The variable can
 * be defined at the repository or organization level.
 *
 * @returns Configuration or undefined if not set
 */
function loadConfigFromEnvVar(): ReleaseConfig | undefined {
	const envValue = process.env[CONFIG_ENV_VAR];

	if (!envValue) {
		return undefined;
	}

	debug(`Found ${CONFIG_ENV_VAR} environment variable`);

	const config = parseConfigContent(envValue, `${CONFIG_ENV_VAR} variable`);

	if (config !== undefined) {
		info(`Loaded Silk release config from ${CONFIG_ENV_VAR} variable`);
		debug(`Release config: ${JSON.stringify(config)}`);
		return config;
	}

	return undefined;
}

/**
 * Configuration source information
 */
export interface ConfigSource {
	/** Where the configuration was loaded from */
	source: "local" | "variable" | "none";
	/** Path or identifier of the config location */
	location?: string;
}

/**
 * Result of loading release configuration
 */
export interface LoadReleaseConfigResult {
	/** The loaded configuration (undefined if not found) */
	config: ReleaseConfig | undefined;
	/** Source information */
	source: ConfigSource;
}

/**
 * Load release configuration with fallback lookup
 *
 * @remarks
 * Searches for Silk release configuration in the following order:
 *
 * 1. **Local repository**: `.github/silk-release.json` or `.github/silk-release.jsonc`
 *    in the repository being released
 *
 * 2. **Variable**: `SILK_RELEASE_SBOM_TEMPLATE` environment variable, which should be
 *    populated from a repository or organization variable
 *
 * The first configuration found is used. This allows:
 * - Repository-specific config in the repo itself
 * - Organization-wide defaults via org-level variables
 *
 * @param rootDir - Repository root directory (defaults to process.cwd())
 * @returns Release configuration with source information
 *
 * @example
 * ```typescript
 * const result = loadReleaseConfig();
 * if (result.config) {
 *   console.log(`Config loaded from: ${result.source.source}`);
 * }
 * ```
 */
export function loadReleaseConfig(rootDir?: string): LoadReleaseConfigResult {
	const root = rootDir || process.cwd();

	// 1. Check local repository
	const localConfig = loadConfigFromLocalRepo(root);
	if (localConfig !== undefined) {
		return {
			config: localConfig,
			source: { source: "local", location: ".github/silk-release.json" },
		};
	}

	// 2. Check environment variable
	const envConfig = loadConfigFromEnvVar();
	if (envConfig !== undefined) {
		return {
			config: envConfig,
			source: { source: "variable", location: CONFIG_ENV_VAR },
		};
	}

	debug("No Silk release configuration found");
	return {
		config: undefined,
		source: { source: "none" },
	};
}

/**
 * Load SBOM metadata configuration
 *
 * @remarks
 * Convenience function to load just the SBOM section of the release configuration.
 * Uses fallback lookup: local repo → environment variable.
 *
 * @param rootDir - Repository root directory (defaults to process.cwd())
 * @returns SBOM metadata configuration or undefined if not found
 */
export function loadSBOMConfig(rootDir?: string): SBOMMetadataConfig | undefined {
	const result = loadReleaseConfig(rootDir);
	return result.config?.sbom;
}
