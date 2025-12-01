import * as path from "node:path";
import type { PackageJson, PublishTarget, ResolvedTarget, Target } from "../types/publish-config.js";

/**
 * Known shorthands that expand to full targets
 */
const KNOWN_SHORTHANDS: Record<string, PublishTarget> = {
	npm: {
		protocol: "npm",
		registry: "https://registry.npmjs.org/",
		provenance: true,
		tokenEnv: "NPM_TOKEN",
	},
	github: {
		protocol: "npm",
		registry: "https://npm.pkg.github.com/",
		provenance: true,
		tokenEnv: "GITHUB_TOKEN",
	},
	jsr: {
		protocol: "jsr",
		provenance: false,
		tokenEnv: "JSR_TOKEN",
	},
};

/**
 * Registry-specific defaults for provenance and access
 */
const REGISTRY_DEFAULTS: Record<string, { provenance: boolean; access: "public" | "restricted"; tokenEnv: string }> = {
	"https://registry.npmjs.org/": {
		provenance: true,
		access: "restricted",
		tokenEnv: "NPM_TOKEN",
	},
	"https://npm.pkg.github.com/": {
		provenance: true,
		access: "restricted",
		tokenEnv: "GITHUB_TOKEN",
	},
};

/**
 * Get defaults for a registry URL
 */
function getRegistryDefaults(registry: string | null): {
	provenance: boolean;
	access: "public" | "restricted";
	tokenEnv: string | null;
} {
	if (!registry) {
		return { provenance: false, access: "restricted", tokenEnv: null };
	}
	const defaults = REGISTRY_DEFAULTS[registry];
	if (defaults) {
		return defaults;
	}
	// Custom registry - generate token env name from URL
	return {
		provenance: false,
		access: "restricted",
		tokenEnv: registryToEnvName(registry),
	};
}

/**
 * Convert a registry URL to a valid environment variable name
 * https://registry.savvyweb.dev/ -> REGISTRY_SAVVYWEB_DEV_TOKEN
 *
 * @param registry - Registry URL to convert
 * @returns Environment variable name
 */
export function registryToEnvName(registry: string): string {
	return `${registry
		.replace(/^https?:\/\//, "")
		.replace(/[^a-zA-Z0-9]/g, "_")
		.toUpperCase()
		.replace(/_+/g, "_")
		.replace(/^_|_$/g, "")}_TOKEN`;
}

/**
 * Expand a shorthand target to a full PublishTarget object
 */
function expandShorthand(target: Target): PublishTarget {
	// Already a full object
	if (typeof target === "object") {
		return target;
	}

	// Known shorthand (npm, github, jsr)
	if (target in KNOWN_SHORTHANDS) {
		return { ...KNOWN_SHORTHANDS[target] };
	}

	// URL shorthand - treat as custom npm-compatible registry
	if (target.startsWith("https://") || target.startsWith("http://")) {
		return {
			protocol: "npm",
			registry: target,
			provenance: false,
			tokenEnv: registryToEnvName(target),
		};
	}

	throw new Error(`Unknown target shorthand: ${target}`);
}

/**
 * Resolve all publish targets for a package
 *
 * Resolution rules:
 * 1. No publishConfig + private:true → not publishable (empty array)
 * 2. No publishConfig + private:false → publish from root to npm
 * 3. publishConfig without targets → legacy mode, single npm target
 * 4. publishConfig with targets → resolve each target
 *
 * @param packagePath - Absolute path to the package directory
 * @param packageJson - Parsed package.json contents
 * @returns Array of resolved targets
 */
export function resolveTargets(packagePath: string, packageJson: PackageJson): ResolvedTarget[] {
	const { publishConfig } = packageJson;
	const isPrivate = packageJson.private === true;

	// Case 1: No publishConfig
	if (!publishConfig) {
		if (isPrivate) {
			return []; // Not publishable
		}
		// Default: publish from root to npm
		return [
			{
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: packagePath,
				access: "restricted",
				provenance: true,
				tag: "latest",
				tokenEnv: "NPM_TOKEN",
			},
		];
	}

	// Case 2: publishConfig without targets (legacy mode)
	if (!publishConfig.targets || publishConfig.targets.length === 0) {
		const registry = publishConfig.registry || "https://registry.npmjs.org/";
		const defaults = getRegistryDefaults(registry);

		return [
			{
				protocol: "npm",
				registry,
				directory: publishConfig.directory ? path.resolve(packagePath, publishConfig.directory) : packagePath,
				access: publishConfig.access || defaults.access,
				provenance: defaults.provenance,
				tag: "latest",
				tokenEnv: defaults.tokenEnv,
			},
		];
	}

	// Case 3: publishConfig with targets
	return publishConfig.targets.map((target) => {
		const expanded = expandShorthand(target);

		// Determine registry (null for JSR)
		const registry = expanded.protocol === "npm" ? expanded.registry || "https://registry.npmjs.org/" : null;

		const registryDefaults = getRegistryDefaults(registry);

		// Resolve directory: target > publishConfig > package root
		const directory = expanded.directory
			? path.resolve(packagePath, expanded.directory)
			: publishConfig.directory
				? path.resolve(packagePath, publishConfig.directory)
				: packagePath;

		// Resolve tokenEnv: target > registry default
		const tokenEnv = expanded.tokenEnv ?? registryDefaults.tokenEnv;

		return {
			protocol: expanded.protocol,
			registry,
			directory,
			access: expanded.access ?? publishConfig.access ?? registryDefaults.access,
			provenance: expanded.provenance ?? registryDefaults.provenance,
			tag: expanded.tag ?? "latest",
			tokenEnv,
		};
	});
}

/**
 * Get a display name for a registry URL
 *
 * @param registry - Registry URL to convert to display name
 * @returns Human-readable registry name
 */
export function getRegistryDisplayName(registry: string | null): string {
	if (!registry) return "jsr.io";
	if (registry.includes("npmjs.org")) return "npm";
	if (registry.includes("pkg.github.com")) return "GitHub Packages";
	try {
		const url = new URL(registry);
		return url.hostname;
	} catch {
		return registry;
	}
}
