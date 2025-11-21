import { existsSync } from "node:fs";
import type { AsyncFunctionArguments } from "../shared/types.js";

/**
 * Result of Turborepo configuration detection
 */
interface DetectionResult {
	/** Whether Turbo is enabled (turbo.json exists) */
	enabled: boolean;
	/** Path to Turbo config file, or empty string if not found */
	configFile: string;
}

/**
 * Detects if Turborepo is configured in the repository
 *
 * @param coreModule - GitHub Actions core module for logging
 * @returns Detection result with enabled status and config file path
 *
 * @remarks
 * Checks for the existence of `turbo.json` in the repository root.
 * Currently only supports turbo.json (not package.json turbo config).
 */
function detectTurbo(coreModule: AsyncFunctionArguments["core"]): DetectionResult {
	const core = coreModule;
	if (existsSync("turbo.json")) {
		core.info("Detected Turbo configuration: turbo.json");
		return {
			enabled: true,
			configFile: "turbo.json",
		};
	}

	core.info("No Turbo configuration found");
	return {
		enabled: false,
		configFile: "",
	};
}

/**
 * Main action entrypoint: Detects Turborepo configuration and sets GitHub Actions outputs
 *
 * @param args - Function arguments from github-script
 * @param args.core - GitHub Actions core module
 *
 * @remarks
 * This function is called from a GitHub Actions workflow using `actions/github-script@v8`.
 * It detects Turborepo configuration and sets the following outputs:
 * - `enabled`: Whether Turbo is configured (true | false)
 * - `config-file`: Path to turbo.json, or empty if not found
 *
 * @example
 * ```yaml
 * - uses: actions/github-script@v8
 *   with:
 *     script: |
 *       const { default: detectTurbo } = await import('${{ github.workspace }}/.github/actions/detect-turbo/detect-turbo.ts');
 *       await detectTurbo({ core });
 * ```
 */
export default async ({ core }: AsyncFunctionArguments): Promise<void> => {
	try {
		const result = detectTurbo(core);

		// Set outputs
		core.setOutput("enabled", result.enabled.toString());
		core.setOutput("config-file", result.configFile);

		// Log results
		if (result.enabled) {
			core.notice("✓ Turbo configuration found, enabling Turbo cache");
		} else {
			core.notice("✓ No Turbo configuration found, skipping Turbo cache");
		}

		// Debug output
		core.debug(`Set output 'enabled' to: ${result.enabled}`);
		core.debug(`Set output 'config-file' to: ${result.configFile}`);
	} catch (error) {
		core.setFailed(`Failed to detect Turbo: ${error instanceof Error ? error.message : String(error)}`);
	}
};
