import { existsSync } from "node:fs";
import type { AsyncFunctionArguments } from "../shared/types.js";

/**
 * Supported package managers for Node.js projects
 */
type PackageManager = "npm" | "pnpm" | "yarn";

/**
 * Node.js version configuration result
 */
interface NodeVersionConfig {
	/** Node.js version string (e.g., "20.11.0") or empty if using version file */
	nodeVersion: string;
	/** Path to version file (.nvmrc or .node-version) or empty if using input */
	nodeVersionFile: string;
	/** Source of the version configuration */
	source: "nvmrc" | "node-version" | "input";
}

/**
 * Package manager configuration for dependency installation
 */
interface PackageManagerConfig {
	/** The package manager to use */
	packageManager: PackageManager;
	/** Whether the package manager requires explicit setup (pnpm/yarn need corepack) */
	setupRequired: boolean;
	/** Cache type for actions/setup-node */
	cacheType: string;
	/** File paths to include in dependency cache key */
	cacheDependencyPaths: string[];
	/** Command to install dependencies with frozen lockfile */
	installCommand: string;
}

/**
 * Complete Node.js setup configuration
 */
interface SetupConfig {
	/** Node.js version configuration */
	nodeVersion: NodeVersionConfig;
	/** Package manager configuration (null if not specified) */
	packageManager: PackageManagerConfig | null;
}

/**
 * Validates that the package manager is supported
 *
 * @param packageManager - Package manager string to validate
 * @throws Error if package manager is not supported
 *
 * @remarks
 * This is a TypeScript assertion function that narrows the type to PackageManager.
 * Supported package managers: npm, pnpm, yarn
 */
function validatePackageManager(packageManager: string): asserts packageManager is PackageManager {
	const validManagers: PackageManager[] = ["npm", "pnpm", "yarn"];
	if (!validManagers.includes(packageManager as PackageManager)) {
		throw new Error(`Invalid package_manager '${packageManager}'. Must be one of: ${validManagers.join(" | ")}`);
	}
}

/**
 * Detects Node.js version file or uses provided input
 *
 * @param coreModule - GitHub Actions core module for logging
 * @param nodeVersionInput - Node.js version from action input (fallback)
 * @returns Node.js version configuration with source
 *
 * @remarks
 * Checks for version files in this priority order:
 * 1. `.nvmrc` (preferred, widely supported)
 * 2. `.node-version` (alternative format)
 * 3. Input parameter (if no file found)
 *
 * When a version file is found, `nodeVersion` will be empty and
 * `actions/setup-node` will read the version from the file.
 */
async function detectNodeVersion(
	coreModule: AsyncFunctionArguments["core"],
	nodeVersionInput: string,
): Promise<NodeVersionConfig> {
	const core = coreModule;
	// Check for .nvmrc first (preferred)
	if (existsSync(".nvmrc")) {
		core.info("Detected Node.js version file: .nvmrc");
		return {
			nodeVersion: "",
			nodeVersionFile: ".nvmrc",
			source: "nvmrc",
		};
	}

	// Check for .node-version
	if (existsSync(".node-version")) {
		core.info("Detected Node.js version file: .node-version");
		return {
			nodeVersion: "",
			nodeVersionFile: ".node-version",
			source: "node-version",
		};
	}

	// No version file found, use input
	core.info(`No version file found, using node-version input: ${nodeVersionInput}`);
	return {
		nodeVersion: nodeVersionInput,
		nodeVersionFile: "",
		source: "input",
	};
}

/**
 * Gets package manager configuration for dependency installation
 *
 * @param packageManager - The package manager to configure
 * @returns Package manager configuration with cache settings and install command
 *
 * @remarks
 * Returns configuration including:
 * - Whether explicit setup is required (pnpm/yarn need corepack)
 * - Cache type for actions/setup-node
 * - Dependency file paths for cache key generation
 * - Install command with frozen lockfile
 *
 * Configuration by package manager:
 * - **pnpm**: Requires setup, uses pnpm cache, includes pnpm-lock.yaml, pnpm-workspace.yaml
 * - **yarn**: Requires setup, uses yarn cache, includes yarn.lock
 * - **npm**: No setup needed, uses npm cache, includes package-lock.json
 */
function getPackageManagerConfig(packageManager: PackageManager): PackageManagerConfig {
	switch (packageManager) {
		case "pnpm":
			return {
				packageManager: "pnpm",
				setupRequired: true,
				cacheType: "pnpm",
				cacheDependencyPaths: ["pnpm-lock.yaml", "pnpm-workspace.yaml", ".pnpmfile.cjs"],
				installCommand: "pnpm install --frozen-lockfile",
			};
		case "yarn":
			return {
				packageManager: "yarn",
				setupRequired: true,
				cacheType: "yarn",
				cacheDependencyPaths: ["yarn.lock"],
				installCommand: "yarn install --frozen-lockfile --immutable",
			};
		case "npm":
			return {
				packageManager: "npm",
				setupRequired: false,
				cacheType: "npm",
				cacheDependencyPaths: ["package-lock.json"],
				installCommand: "npm ci",
			};
	}
}

/**
 * Detects and validates Node.js setup configuration
 *
 * @param coreModule - GitHub Actions core module for logging
 * @returns Complete setup configuration for Node.js and package manager
 * @throws Error if package manager is invalid
 *
 * @remarks
 * This is the main detection logic that orchestrates:
 * 1. Reading inputs from INPUT_* environment variables
 * 2. Package manager validation (if provided)
 * 3. Node.js version file detection
 * 4. Package manager configuration
 *
 * Composite action inputs must be passed as INPUT_* environment variables
 * to the github-script action (e.g., package-manager → INPUT_PACKAGE_MANAGER).
 *
 * The returned configuration is used to set GitHub Actions outputs
 * and configure subsequent workflow steps.
 */
async function detectNodeConfig(coreModule: AsyncFunctionArguments["core"]): Promise<SetupConfig> {
	const core = coreModule;

	// Read inputs from environment variables
	// Composite action inputs must be passed as INPUT_* env vars to github-script
	const packageManagerInput = process.env.INPUT_PACKAGE_MANAGER || "";
	const nodeVersionInput = process.env.INPUT_NODE_VERSION || "lts/*";

	// Detect Node.js version
	const nodeVersion = await detectNodeVersion(core, nodeVersionInput);

	// Get package manager config (only if provided)
	let packageManager: PackageManagerConfig | null = null;
	if (packageManagerInput) {
		validatePackageManager(packageManagerInput);
		core.info(`✓ Package manager validated: ${packageManagerInput}`);
		packageManager = getPackageManagerConfig(packageManagerInput);
	} else {
		core.info("No package manager specified, skipping validation");
	}

	return {
		nodeVersion,
		packageManager,
	};
}

/**
 * Main action entrypoint: Detects Node.js setup configuration and sets GitHub Actions outputs
 *
 * @param args - Function arguments from github-script
 * @param args.core - GitHub Actions core module
 *
 * @remarks
 * This function is called from a GitHub Actions workflow using `actions/github-script@v8`.
 * It reads inputs from INPUT_* environment variables, validates the package manager (if provided),
 * detects Node.js version files, and sets the following outputs:
 * - `node-version`: Node.js version string (empty if using version file)
 * - `node-version-file`: Path to version file (.nvmrc | .node-version | empty)
 * - `node-version-source`: Source of version (nvmrc | node-version | input)
 * - `package-manager`: Validated package manager (empty if not provided)
 * - `setup-required`: Whether package manager needs explicit setup (true for pnpm/yarn)
 * - `cache-type`: Cache type for actions/setup-node
 * - `install-command`: Command to install dependencies with frozen lockfile
 * - `cache-dependency-paths`: JSON array of dependency file paths for cache key
 *
 * @throws Error if package manager is invalid or configuration detection fails
 *
 * @example
 * ```yaml
 * - uses: actions/github-script@v8
 *   with:
 *     script: |
 *       const { default: detectNodeConfig } = await import('${{ github.workspace }}/.github/actions/node/detect-node-config.ts');
 *       await detectNodeConfig({ core });
 * ```
 */
export default async ({ core }: AsyncFunctionArguments): Promise<void> => {
	try {
		// Detect setup configuration
		const config = await detectNodeConfig(core);

		// Set node version outputs
		core.setOutput("node-version", config.nodeVersion.nodeVersion);
		core.setOutput("node-version-file", config.nodeVersion.nodeVersionFile);
		core.setOutput("node-version-source", config.nodeVersion.source);

		// Set package manager outputs (empty if not specified)
		if (config.packageManager) {
			core.setOutput("package-manager", config.packageManager.packageManager);
			core.setOutput("setup-required", config.packageManager.setupRequired.toString());
			core.setOutput("cache-type", config.packageManager.cacheType);
			core.setOutput("install-command", config.packageManager.installCommand);
			core.setOutput("cache-dependency-paths", JSON.stringify(config.packageManager.cacheDependencyPaths));
		} else {
			core.setOutput("package-manager", "");
			core.setOutput("setup-required", "");
			core.setOutput("cache-type", "");
			core.setOutput("install-command", "");
			core.setOutput("cache-dependency-paths", "[]");
		}

		// Debug output
		core.debug(`Node version: ${config.nodeVersion.nodeVersion || "from file"}`);
		core.debug(`Node version file: ${config.nodeVersion.nodeVersionFile || "none"}`);
		core.debug(`Package manager: ${config.packageManager?.packageManager || "not specified"}`);
		core.debug(`Setup required: ${config.packageManager?.setupRequired || "n/a"}`);
	} catch (error) {
		core.setFailed(`Failed to setup Node.js: ${error instanceof Error ? error.message : String(error)}`);
	}
};
