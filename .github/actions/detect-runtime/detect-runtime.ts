import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { AsyncFunctionArguments } from "../shared/types.js";

/**
 * Supported JavaScript runtimes
 */
type Runtime = "node" | "bun" | "deno";

/**
 * Supported package managers
 */
type PackageManager = "npm" | "pnpm" | "yarn" | "bun" | "deno";

/**
 * Parsed package.json structure (subset of fields we need)
 */
interface PackageJson {
	/** The packageManager field from package.json (e.g., "pnpm@10.20.0") */
	packageManager?: string;
}

/**
 * Result of runtime and package manager detection
 */
interface DetectionResult {
	/** Detected JavaScript runtime */
	runtime: Runtime;
	/** Detected package manager */
	packageManager: PackageManager;
}

/**
 * Detects package manager from package.json packageManager field
 *
 * @returns The detected package manager, defaults to 'npm' if not specified or invalid
 *
 * @remarks
 * Reads the `packageManager` field from package.json and extracts the package manager name.
 * The packageManager field format is "name@version" (e.g., "pnpm@10.20.0").
 * Validates against known package managers (npm, pnpm, yarn) and falls back to npm if invalid.
 */
async function detectPackageManagerFromPackageJson(): Promise<PackageManager> {
	try {
		const content = await readFile("package.json", "utf-8");
		const packageJson = JSON.parse(content) as PackageJson;

		if (!packageJson.packageManager) {
			return "npm"; // Default to npm if no packageManager field
		}

		// packageManager format: "pnpm@8.0.0" or "yarn@3.0.0"
		const pmName = packageJson.packageManager.split("@")[0] as PackageManager;

		// Validate it's a known package manager
		if (["npm", "pnpm", "yarn"].includes(pmName)) {
			return pmName;
		}

		return "npm"; // Fallback to npm
	} catch {
		return "npm"; // Fallback if package.json doesn't exist or can't be read
	}
}

/**
 * Detects JavaScript runtime and package manager based on lockfiles and configuration
 *
 * @param coreModule - GitHub Actions core module for logging
 * @returns Detection result containing runtime and package manager
 *
 * @remarks
 * Detection strategy:
 * 1. Checks for Deno (deno.lock, deno.json, deno.jsonc) → runtime: deno, pm: deno
 * 2. Checks for Bun (bun.lockb) → runtime: bun, pm: bun
 * 3. Defaults to Node.js, reads package manager from package.json
 *
 * This function uses file-based detection to determine the runtime without executing any code.
 */
async function detectRuntime(coreModule: AsyncFunctionArguments["core"]): Promise<DetectionResult> {
	const core = coreModule;
	// Check for Deno
	if (existsSync("deno.lock") || existsSync("deno.json") || existsSync("deno.jsonc")) {
		core.info("Detected Deno runtime from lock/config file");
		return {
			runtime: "deno",
			packageManager: "deno",
		};
	}

	// Check for Bun
	if (existsSync("bun.lockb")) {
		core.info("Detected Bun runtime from bun.lockb");
		return {
			runtime: "bun",
			packageManager: "bun",
		};
	}

	// Default to Node.js - detect package manager from package.json
	const packageManager = await detectPackageManagerFromPackageJson();
	core.info(`Detected Node.js runtime with ${packageManager} package manager`);

	return {
		runtime: "node",
		packageManager,
	};
}

/**
 * Main action entrypoint: Detects JavaScript runtime and package manager, sets GitHub Actions outputs
 *
 * @param args - Function arguments from github-script
 * @param args.core - GitHub Actions core module
 *
 * @remarks
 * This function is called from a GitHub Actions workflow using `actions/github-script@v8`.
 * It detects the JavaScript runtime and package manager, then sets the following outputs:
 * - `runtime`: The detected runtime (node | bun | deno)
 * - `package-manager`: The detected package manager (npm | pnpm | yarn | bun | deno)
 *
 * @example
 * ```yaml
 * - uses: actions/github-script@v8
 *   with:
 *     script: |
 *       const { default: detectRuntime } = await import('${{ github.workspace }}/.github/actions/detect-runtime/detect-runtime.ts');
 *       await detectRuntime({ core });
 * ```
 */
export default async ({ core }: AsyncFunctionArguments): Promise<void> => {
	try {
		const result = await detectRuntime(core);

		// Set outputs
		core.setOutput("runtime", result.runtime);
		core.setOutput("package-manager", result.packageManager);

		// Log results
		core.notice(`✓ Detected runtime: ${result.runtime}`);
		core.notice(`✓ Detected package manager: ${result.packageManager}`);

		// Debug output
		core.debug(`Set output 'runtime' to: ${result.runtime}`);
		core.debug(`Set output 'package-manager' to: ${result.packageManager}`);
	} catch (error) {
		core.setFailed(`Failed to detect runtime: ${error instanceof Error ? error.message : String(error)}`);
	}
};
