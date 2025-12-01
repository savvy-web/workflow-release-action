/**
 * Publishing protocol - determines how packages are published
 * - "npm": npm-compatible registries (npmjs, GitHub Packages, Verdaccio, etc.)
 * - "jsr": JavaScript Registry (jsr.io)
 */
export type PublishProtocol = "npm" | "jsr";

/**
 * A publish target configuration
 */
export interface PublishTarget {
	/**
	 * Publishing protocol
	 * - "npm": npm-compatible registries
	 * - "jsr": JavaScript Registry
	 */
	protocol: PublishProtocol;

	/**
	 * Registry URL for npm-compatible targets
	 * - Required for protocol "npm"
	 * - Ignored for protocol "jsr"
	 */
	registry?: string;

	/**
	 * Directory to publish from (relative to package root)
	 * Overrides publishConfig.directory for this target
	 */
	directory?: string;

	/**
	 * Access level for the package
	 * - "public": Anyone can install
	 * - "restricted": Scoped packages only (requires auth)
	 */
	access?: "public" | "restricted";

	/**
	 * Enable provenance attestation
	 * - npm: Uses npm provenance (Sigstore SLSA)
	 * - github: Uses npm provenance + GitHub artifact attestation
	 * - jsr: Ignored (JSR has built-in verification)
	 * - custom: May not be supported, disabled by default
	 */
	provenance?: boolean;

	/**
	 * Publish tag (e.g., "latest", "next", "beta")
	 * Default: "latest"
	 */
	tag?: string;

	/**
	 * Environment variable name containing the auth token
	 *
	 * Defaults:
	 * - npm (registry.npmjs.org): NPM_TOKEN
	 * - github (npm.pkg.github.com): GITHUB_TOKEN
	 * - jsr: JSR_TOKEN (optional, OIDC preferred)
	 * - custom registries: auto-generated from URL or must be specified
	 */
	tokenEnv?: string;
}

/**
 * Shorthand forms for common targets
 * - "npm" → npmjs.org with provenance
 * - "github" → npm.pkg.github.com with provenance
 * - "jsr" → jsr.io
 * - "https://..." → custom npm-compatible registry
 */
export type TargetShorthand = "npm" | "github" | "jsr" | `https://${string}` | `http://${string}`;

/**
 * A target can be a full object or a shorthand string
 */
export type Target = PublishTarget | TargetShorthand;

/**
 * The publishConfig section of package.json
 */
export interface PublishConfig {
	/** Directory to publish from (used for pnpm workspace linking and as default for targets) */
	directory?: string;

	/** Whether to symlink the directory during local development (pnpm) */
	linkDirectory?: boolean;

	/** Default access level */
	access?: "public" | "restricted";

	/** Legacy: single registry URL (used if no targets specified) */
	registry?: string;

	/** Publish targets - if specified, replaces legacy single-registry behavior */
	targets?: Target[];
}

/**
 * Fully resolved target with all values filled in
 */
export interface ResolvedTarget {
	protocol: PublishProtocol;
	registry: string | null; // null for JSR
	directory: string; // Absolute path to publish from
	access: "public" | "restricted";
	provenance: boolean;
	tag: string;
	tokenEnv: string | null; // Resolved token env var name
}

/**
 * Result of pre-validating a target directory
 */
export interface PreValidationResult {
	valid: boolean;
	directoryExists: boolean;
	packageJsonExists: boolean;
	packageJsonValid: boolean;
	errors: string[];
	warnings: string[];
	builtPackageJson?: PackageJson;
}

/**
 * Result of dry-run publishing a target
 */
export interface DryRunResult {
	success: boolean;
	output: string;
	error: string;
	versionConflict: boolean;
	existingVersion?: string;
	provenanceReady: boolean;
}

/**
 * Result of validating a single target
 */
export interface TargetValidationResult {
	target: ResolvedTarget;
	canPublish: boolean;

	// Pre-checks
	directoryExists: boolean;
	packageJsonValid: boolean;

	// Dry-run results
	dryRunPassed: boolean;
	dryRunOutput: string;
	dryRunError: string;

	// Version conflict detection
	versionConflict: boolean;
	existingVersion?: string;

	// Provenance readiness
	provenanceReady: boolean;

	message: string;
}

/**
 * Result of validating all targets for a package
 */
export interface PackagePublishValidation {
	name: string;
	version: string;
	path: string; // Workspace package path

	targets: TargetValidationResult[];

	/** All targets validated successfully */
	allTargetsValid: boolean;

	/** At least one target can be published */
	hasPublishableTargets: boolean;
}

/**
 * Result of actually publishing a target
 */
export interface PublishResult {
	success: boolean;
	output: string;
	error: string;
	registryUrl?: string; // URL to the published package
	attestationUrl?: string; // URL to provenance/attestation
}

/**
 * Minimal package.json interface for type safety
 */
export interface PackageJson {
	name?: string;
	version?: string;
	private?: boolean;
	publishConfig?: PublishConfig;
	exports?: Record<string, unknown>;
}

/**
 * Result of setting up registry authentication
 */
export interface AuthSetupResult {
	success: boolean;
	configuredRegistries: string[];
	missingTokens: Array<{ registry: string; tokenEnv: string }>;
}
