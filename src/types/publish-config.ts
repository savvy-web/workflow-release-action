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
	 * OIDC-first strategy:
	 * - npm (registry.npmjs.org): null (uses OIDC trusted publishing)
	 * - github (npm.pkg.github.com): GITHUB_TOKEN (GitHub App token)
	 * - jsr: null (uses OIDC natively)
	 * - custom registries: auto-generated from URL or must be specified
	 *
	 * OIDC registries don't need tokens - they use temporary credentials
	 * from the GitHub Actions OIDC provider.
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
 * Package statistics extracted from npm dry-run output
 */
export interface PackageStats {
	/** Packed tarball size (e.g., "1.2 kB") */
	packageSize?: string;
	/** Unpacked size (e.g., "1.9 kB") */
	unpackedSize?: string;
	/** Total number of files in the package */
	totalFiles?: number;
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
	/** Package statistics from dry-run output */
	stats?: PackageStats;
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

	// Package statistics from dry-run
	stats?: PackageStats;

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

	/** Error message if package discovery failed (workspace path or package.json not found) */
	discoveryError?: string;
}

/**
 * Skip reason when a version is already published
 * - "identical": Local tarball matches remote (safe to skip)
 * - "different": Local tarball differs from remote (error - content mismatch)
 * - "unknown": Could not compare (treat as warning)
 */
export type AlreadyPublishedReason = "identical" | "different" | "unknown";

/**
 * Result of actually publishing a target
 */
export interface PublishResult {
	success: boolean;
	output: string;
	error: string;
	exitCode?: number; // Exit code from publish command
	registryUrl?: string; // URL to the published package
	attestationUrl?: string; // URL to provenance/attestation
	/** True if publish failed because version already exists */
	alreadyPublished?: boolean;
	/** Reason for already published state - helps determine if it's safe to skip */
	alreadyPublishedReason?: AlreadyPublishedReason;
	/** Local tarball integrity (shasum) */
	localIntegrity?: string;
	/** Remote tarball integrity (shasum) from registry */
	remoteIntegrity?: string;
	/** Path to the tarball that was published */
	tarballPath?: string;
	/** SHA-256 digest of the published tarball (format: "sha256:hex") */
	tarballDigest?: string;
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
	unreachableRegistries: Array<{ registry: string; error: string }>;
}

/**
 * Version info from npm view command
 */
export interface NpmVersionInfo {
	/** Package name */
	name: string;
	/** Specific version that was queried */
	version: string;
	/** All available versions */
	versions: string[];
	/** Dist-tags (latest, next, etc.) */
	distTags: Record<string, string>;
	/** Distribution info for the specific version */
	dist?: {
		integrity?: string;
		shasum?: string;
		tarball?: string;
	};
	/** Timestamps for when each version was published */
	time?: Record<string, string>;
}

/**
 * Result of checking if a version exists on a registry
 */
export interface VersionCheckResult {
	/** Whether the check succeeded (registry was reachable) */
	success: boolean;
	/** Whether this specific version exists */
	versionExists: boolean;
	/** Version info if it exists */
	versionInfo?: NpmVersionInfo;
	/** Error message if check failed */
	error?: string;
	/** Raw output from npm view */
	rawOutput?: string;
}
