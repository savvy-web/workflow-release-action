import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Attestation } from "@actions/attest";
import { attest, attestProvenance, createStorageRecord } from "@actions/attest";
import { debug, getState, info, warning } from "@actions/core";
import { exec } from "@actions/exec";
import { context } from "@actions/github";

/**
 * Result of creating a GitHub attestation
 */
export interface AttestationResult {
	/** Whether the attestation was created successfully */
	success: boolean;
	/** URL to the attestation on GitHub */
	attestationUrl?: string;
	/** Attestation ID */
	attestationId?: string;
	/** Transparency log ID */
	tlogId?: string;
	/** Error message if failed */
	error?: string;
	/** Path to the SBOM JSON file (for SBOM attestations) */
	sbomPath?: string;
}

/**
 * Compute SHA256 digest of a file
 *
 * @param filePath - Path to the file
 * @returns SHA256 digest in format "sha256:hex"
 */
function computeFileDigest(filePath: string): string {
	const content = readFileSync(filePath);
	const hash = createHash("sha256").update(content).digest("hex");
	return `sha256:${hash}`;
}

/**
 * Find the tarball file for a package in a directory
 *
 * @param directory - Directory to search
 * @param packageName - Package name (for naming the tarball)
 * @param version - Package version
 * @returns Path to tarball if found
 */
function findTarball(directory: string, packageName: string, version: string): string | undefined {
	// npm pack creates tarballs with scoped names like "scope-name-1.0.0.tgz"
	const normalizedName = packageName.replace(/^@/, "").replace(/\//g, "-");
	const expectedName = `${normalizedName}-${version}.tgz`;

	const tarballPath = join(directory, expectedName);
	if (existsSync(tarballPath)) {
		return tarballPath;
	}

	// Also check for any .tgz file in the directory
	const files = readdirSync(directory);
	const tgzFile = files.find((f) => f.endsWith(".tgz"));
	if (tgzFile) {
		return join(directory, tgzFile);
	}

	return undefined;
}

/**
 * Get the command to run npm operations
 *
 * @remarks
 * - npm: `npx npm <args>`
 * - pnpm: `pnpm dlx npm <args>`
 * - yarn: `yarn npm <args>`
 * - bun: `bun x npm <args>`
 */
function getNpmCommand(packageManager: string): { cmd: string; baseArgs: string[] } {
	switch (packageManager) {
		case "pnpm":
			return { cmd: "pnpm", baseArgs: ["dlx", "npm"] };
		case "yarn":
			return { cmd: "yarn", baseArgs: ["npm"] };
		case "bun":
			return { cmd: "bun", baseArgs: ["x", "npm"] };
		default:
			return { cmd: "npx", baseArgs: ["npm"] };
	}
}

/**
 * Create artifact metadata storage record to link attestation with GitHub Packages
 *
 * @remarks
 * This creates a storage record in GitHub's artifact metadata API, which links
 * the attestation to the package artifact in GitHub Packages. Uses the official
 * createStorageRecord function from @actions/attest.
 *
 * @param packageName - Name of the package (e.g., "@org/pkg")
 * @param version - Package version
 * @param digest - SHA256 digest of the tarball (format: "sha256:hex")
 * @param token - GitHub token for authentication
 * @returns Array of storage record IDs if successful, undefined otherwise
 */
async function createArtifactMetadataRecord(
	packageName: string,
	version: string,
	digest: string,
	token: string,
): Promise<number[] | undefined> {
	// Use PURL format for the artifact name
	const purlName = `pkg:npm/${packageName}@${version}`;

	// Extract the unscoped package name for the repository field
	// e.g., "@savvy-web/fixed-2" -> "fixed-2"
	const unscopedName = packageName.replace(/^@[^/]+\//, "");

	// Build the artifact URL pointing to the package in GitHub Packages
	// Format: https://github.com/{owner}/{repo}/pkgs/npm/{package-name}
	const artifactUrl = `https://github.com/${context.repo.owner}/${context.repo.repo}/pkgs/npm/${unscopedName}`;

	try {
		// The @actions/attest library passes extra properties through to the API via ...rest
		// Fields we're setting:
		// - repository: The package name within the npm registry (for "Artifact repository")
		// - github_repository: The source GitHub repo (for "Source repository")
		const storageRecordIds = await createStorageRecord(
			{
				name: purlName,
				digest,
				version,
			},
			{
				registryUrl: "https://npm.pkg.github.com/",
				artifactUrl,
				// The repository within the registry (the npm package name)
				repository: unscopedName,
				// The GitHub source repository (only repo name, no owner prefix)
				github_repository: context.repo.repo,
			} as Parameters<typeof createStorageRecord>[1],
			token,
		);

		debug(`Created artifact metadata storage record for ${purlName}, IDs: ${storageRecordIds.join(",")}`);
		return storageRecordIds;
	} catch (error) {
		// Don't fail attestation if storage record creation fails
		// This requires artifact-metadata:write permission which may not be available
		warning(
			`Failed to create artifact metadata storage record: ${error instanceof Error ? error.message : String(error)}`,
		);
		return undefined;
	}
}

/**
 * Create a tarball for a package using npm pack via the configured package manager
 *
 * @param directory - Directory containing the package
 * @param packageManager - Package manager to use (npm, pnpm, yarn, bun)
 * @returns Path to created tarball, or undefined if failed
 */
async function createTarball(directory: string, packageManager: string): Promise<string | undefined> {
	try {
		let output = "";
		const npmCmd = getNpmCommand(packageManager);
		const packArgs = [...npmCmd.baseArgs, "pack", "--json"];

		await exec(npmCmd.cmd, packArgs, {
			cwd: directory,
			silent: true,
			listeners: {
				stdout: (data: Buffer) => {
					output += data.toString();
				},
			},
		});

		// Parse JSON output to get filename
		const packInfo = JSON.parse(output) as Array<{ filename: string }>;
		if (packInfo.length > 0 && packInfo[0].filename) {
			const tarballPath = join(directory, packInfo[0].filename);
			if (existsSync(tarballPath)) {
				return tarballPath;
			}
		}
	} catch (error) {
		debug(`Failed to create tarball: ${error instanceof Error ? error.message : String(error)}`);
	}

	return undefined;
}

/**
 * Create a GitHub attestation for a release asset (tarball)
 *
 * @remarks
 * This creates a SLSA provenance attestation for a specific artifact file.
 * Unlike createPackageAttestation, this uses the artifact's file path directly
 * and is designed for GitHub Release assets.
 *
 * The attestation links the artifact to the workflow and repository that created it,
 * making it verifiable via `gh attestation verify`.
 *
 * Requires:
 * - `id-token: write` permission for OIDC signing
 * - `attestations: write` permission for storing attestations
 *
 * @param artifactPath - Full path to the artifact file
 * @param packageName - Name of the package (for PURL format)
 * @param version - Version of the package
 * @param dryRun - Whether to skip actual attestation creation
 * @returns Promise resolving to attestation result
 */
export async function createReleaseAssetAttestation(
	artifactPath: string,
	packageName: string,
	version: string,
	dryRun: boolean,
): Promise<AttestationResult> {
	if (dryRun) {
		info(`[DRY RUN] Would create attestation for release asset ${basename(artifactPath)}`);
		return {
			success: true,
			attestationUrl: `https://github.com/${context.repo.owner}/${context.repo.repo}/attestations/dry-run`,
		};
	}

	// Get the GITHUB_TOKEN for attestation API
	const token = process.env.GITHUB_TOKEN || getState("githubToken");
	if (!token) {
		return {
			success: false,
			error: "No GITHUB_TOKEN available for attestation creation",
		};
	}

	if (!existsSync(artifactPath)) {
		return {
			success: false,
			error: `Artifact not found: ${artifactPath}`,
		};
	}

	const artifactName = basename(artifactPath);
	// Use PURL format for npm packages to link with GitHub Packages
	const purlName = `pkg:npm/${packageName}@${version}`;
	info(`Creating attestation for release asset ${artifactName}...`);

	try {
		// Compute digest of the actual artifact
		const digest = computeFileDigest(artifactPath);
		debug(`Artifact digest: ${digest}`);
		debug(`Subject name (PURL): ${purlName}`);

		// Create the attestation
		const attestation = await attestProvenance({
			subjectName: purlName,
			subjectDigest: { sha256: digest.replace("sha256:", "") },
			token,
		});

		const attestationUrl = attestation.attestationID
			? `https://github.com/${context.repo.owner}/${context.repo.repo}/attestations/${attestation.attestationID}`
			: undefined;

		info(`✓ Created attestation for ${artifactName}`);
		if (attestationUrl) {
			info(`  Attestation URL: ${attestationUrl}`);
		}
		if (attestation.tlogID) {
			info(`  Transparency log: https://search.sigstore.dev/?logIndex=${attestation.tlogID}`);
		}

		return {
			success: true,
			attestationUrl,
			attestationId: attestation.attestationID,
			tlogId: attestation.tlogID,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		warning(`Failed to create attestation for ${artifactName}: ${message}`);

		return {
			success: false,
			error: message,
		};
	}
}

/**
 * Options for creating a package attestation
 */
export interface CreatePackageAttestationOptions {
	/** Name of the package */
	packageName: string;
	/** Version of the package */
	version: string;
	/** Directory containing the package */
	directory: string;
	/** Whether to skip actual attestation creation */
	dryRun: boolean;
	/** Package manager to use for creating tarball if needed */
	packageManager?: string;
	/**
	 * Pre-computed SHA-256 digest from the published tarball (format: "sha256:hex").
	 * If provided, this digest is used directly instead of computing from a local tarball.
	 * This ensures the attestation matches the exact artifact published to the registry.
	 */
	tarballDigest?: string;
	/**
	 * Registry URL where the package was published.
	 * Used to determine if artifact metadata linking is applicable (GitHub Packages only).
	 */
	registry?: string;
}

/**
 * Create a GitHub attestation for a published package
 *
 * @remarks
 * This creates a SLSA provenance attestation using GitHub's attestation API.
 * The attestation is signed using Sigstore and stored on GitHub, making it
 * verifiable via `gh attestation verify`.
 *
 * When `tarballDigest` is provided, it uses that digest directly. This is the
 * preferred approach for published packages as it ensures the attestation
 * matches the exact artifact in the registry.
 *
 * When `tarballDigest` is not provided, it falls back to finding or creating
 * a local tarball and computing its digest.
 *
 * Requires:
 * - `id-token: write` permission for OIDC signing
 * - `attestations: write` permission for storing attestations
 *
 * @param options - Attestation creation options
 * @returns Promise resolving to attestation result
 */
export async function createPackageAttestation(options: CreatePackageAttestationOptions): Promise<AttestationResult> {
	const { packageName, version, directory, dryRun, packageManager = "npm", tarballDigest, registry } = options;

	if (dryRun) {
		info(`[DRY RUN] Would create attestation for ${packageName}@${version}`);
		return {
			success: true,
			attestationUrl: `https://github.com/${context.repo.owner}/${context.repo.repo}/attestations/dry-run`,
		};
	}

	// Get the GITHUB_TOKEN for attestation API
	// We need the workflow token, not the App token, for attestations
	const token = process.env.GITHUB_TOKEN || getState("githubToken");
	if (!token) {
		return {
			success: false,
			error: "No GITHUB_TOKEN available for attestation creation",
		};
	}

	// Use provided digest or compute from local tarball
	let digest: string;
	let tarballName: string;

	if (tarballDigest) {
		// Use the pre-computed digest from the published tarball
		digest = tarballDigest;
		tarballName = `${packageName}@${version}`;
		debug(`Using provided tarball digest: ${digest}`);
	} else {
		// Fall back to finding or creating a local tarball
		let tarballPath = findTarball(directory, packageName, version);
		if (!tarballPath) {
			debug(`No tarball found in ${directory} for ${packageName}@${version}, creating one...`);
			tarballPath = await createTarball(directory, packageManager);
			if (!tarballPath) {
				debug(`Failed to create tarball in ${directory}`);
				return {
					success: false,
					error: `No tarball found and could not create one for ${packageName}@${version}`,
				};
			}
			debug(`Created tarball: ${tarballPath}`);
		}
		tarballName = basename(tarballPath);
		digest = computeFileDigest(tarballPath);
		debug(`Computed tarball digest: ${digest}`);
	}

	// Use PURL format for npm packages to link with GitHub Packages
	// Format: pkg:npm/@scope/name@version or pkg:npm/name@version
	const purlName = `pkg:npm/${packageName}@${version}`;
	info(`Creating attestation for ${purlName}...`);

	try {
		debug(`Subject name (PURL): ${purlName}`);
		debug(`Subject digest: ${digest}`);

		// Create the attestation
		const attestation = await attestProvenance({
			subjectName: purlName,
			subjectDigest: { sha256: digest.replace("sha256:", "") },
			token,
		});

		const attestationUrl = attestation.attestationID
			? `https://github.com/${context.repo.owner}/${context.repo.repo}/attestations/${attestation.attestationID}`
			: undefined;

		info(`✓ Created attestation for ${tarballName}`);
		if (attestationUrl) {
			info(`  Attestation URL: ${attestationUrl}`);
		}
		if (attestation.tlogID) {
			info(`  Transparency log: https://search.sigstore.dev/?logIndex=${attestation.tlogID}`);
		}

		// Link attestation to GitHub Packages artifact via storage record API
		// Only applicable for GitHub Packages registry
		if (registry?.includes("pkg.github.com")) {
			const storageRecordIds = await createArtifactMetadataRecord(packageName, version, digest, token);
			if (storageRecordIds && storageRecordIds.length > 0) {
				info(`  ✓ Linked attestation to GitHub Packages artifact (storage record IDs: ${storageRecordIds.join(",")})`);
			}
		}

		return {
			success: true,
			attestationUrl,
			attestationId: attestation.attestationID,
			tlogId: attestation.tlogID,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		warning(`Failed to create attestation for ${packageName}@${version}: ${message}`);

		// Don't fail the publish for attestation errors
		return {
			success: false,
			error: message,
		};
	}
}

/**
 * CycloneDX predicate type URI for SBOM attestations
 * @see https://cyclonedx.org/specification/overview/
 * @see https://github.com/in-toto/attestation/issues/82
 */
const CYCLONEDX_PREDICATE_TYPE = "https://cyclonedx.org/bom";

/**
 * CycloneDX SBOM document structure (subset of fields we care about)
 *
 * @remarks
 * CycloneDX is recommended for JavaScript/npm projects because it has
 * better support for npm-specific metadata like package managers, registries,
 * and JavaScript-specific vulnerability information.
 *
 * @see https://sbomgenerator.com/guides/javascript
 */
interface CycloneDXDocument {
	bomFormat: "CycloneDX";
	specVersion: string;
	version: number;
	metadata?: {
		timestamp?: string;
		component?: {
			name: string;
			version?: string;
		};
	};
	components?: Array<{
		type: string;
		name: string;
		version?: string;
		purl?: string;
	}>;
	[key: string]: unknown;
}

/**
 * Options for creating an SBOM attestation
 */
export interface CreateSBOMAttestationOptions {
	/** Name of the package */
	packageName: string;
	/** Version of the package */
	version: string;
	/**
	 * Directory containing the package (e.g., dist/npm).
	 * Must have package.json with resolved dependency versions.
	 * If node_modules doesn't exist, dependencies will be installed first.
	 */
	directory: string;
	/** Whether to skip actual attestation creation */
	dryRun: boolean;
	/** Package manager to use for generating SBOM */
	packageManager?: string;
	/**
	 * Pre-computed SHA-256 digest of the package tarball (format: "sha256:hex").
	 * Used to link the SBOM to the specific artifact it describes.
	 */
	tarballDigest?: string;
	/**
	 * Target name for multi-directory builds (e.g., "npm", "github").
	 * Used in the SBOM filename to distinguish between targets.
	 */
	targetName?: string;
}

/**
 * Ensure .npmignore exists in directory to exclude SBOM artifacts from npm pack
 *
 * @remarks
 * When we install dependencies for SBOM generation, we create node_modules
 * in the dist directory. This must be excluded from any future npm pack
 * operations to prevent polluting the published package.
 *
 * Only creates the file if it doesn't already exist - does not modify
 * existing .npmignore files to respect user configuration.
 *
 * @param directory - Directory to create .npmignore in
 */
function ensureNpmIgnore(directory: string): void {
	const npmignorePath = join(directory, ".npmignore");

	// Don't overwrite existing .npmignore - respect user configuration
	if (existsSync(npmignorePath)) {
		return;
	}

	try {
		const content = `${["node_modules", "*.tgz", "*.sbom.json"].join("\n")}\n`;
		writeFileSync(npmignorePath, content);
		debug(`Created .npmignore in ${directory}`);
	} catch (error) {
		debug(`Failed to create .npmignore: ${error instanceof Error ? error.message : String(error)}`);
	}
}

/**
 * Install production dependencies in a directory
 *
 * @remarks
 * This is needed before running npm sbom in dist directories, which have
 * resolved package.json versions but no node_modules installed.
 *
 * @param directory - Directory containing package.json
 * @param packageManager - Package manager to use for installation
 * @returns Whether installation succeeded
 */
async function installDependencies(directory: string, packageManager: string): Promise<boolean> {
	try {
		// Ensure .npmignore excludes installed dependencies from future npm pack
		ensureNpmIgnore(directory);

		const npmCmd = getNpmCommand(packageManager);
		// Install production dependencies only (omit dev dependencies)
		const installArgs = [...npmCmd.baseArgs, "install", "--omit=dev", "--ignore-scripts"];

		await exec(npmCmd.cmd, installArgs, {
			cwd: directory,
			silent: true,
		});

		debug(`Installed dependencies in ${directory}`);
		return true;
	} catch (error) {
		debug(`Failed to install dependencies: ${error instanceof Error ? error.message : String(error)}`);
		return false;
	}
}

/**
 * Generate a CycloneDX SBOM for a package using npm sbom
 *
 * @remarks
 * CycloneDX is preferred over SPDX for JavaScript/npm projects because it has
 * better support for npm-specific metadata and vulnerability information.
 *
 * If no node_modules exists in the directory, this function will first install
 * production dependencies to ensure npm sbom has the dependency tree to analyze.
 *
 * @param directory - Directory containing the package
 * @param packageManager - Package manager to use (npm, pnpm, yarn, bun)
 * @returns Parsed CycloneDX document or undefined if generation failed
 */
async function generateSBOM(directory: string, packageManager: string): Promise<CycloneDXDocument | undefined> {
	try {
		// Check if node_modules exists, if not install dependencies first
		const nodeModulesPath = join(directory, "node_modules");
		if (!existsSync(nodeModulesPath)) {
			debug(`No node_modules in ${directory}, installing dependencies...`);
			const installed = await installDependencies(directory, packageManager);
			if (!installed) {
				warning(`Failed to install dependencies in ${directory} for SBOM generation`);
				return undefined;
			}
		}

		let output = "";
		let stderr = "";
		const npmCmd = getNpmCommand(packageManager);
		const sbomArgs = [...npmCmd.baseArgs, "sbom", "--sbom-format=cyclonedx"];

		await exec(npmCmd.cmd, sbomArgs, {
			cwd: directory,
			silent: true,
			listeners: {
				stdout: (data: Buffer) => {
					output += data.toString();
				},
				stderr: (data: Buffer) => {
					stderr += data.toString();
				},
			},
		});

		if (!output.trim()) {
			warning(`npm sbom produced no output for ${directory}${stderr ? `: ${stderr}` : ""}`);
			return undefined;
		}

		const sbom = JSON.parse(output) as CycloneDXDocument;
		debug(`Generated SBOM: ${sbom.bomFormat} v${sbom.specVersion}`);
		return sbom;
	} catch (error) {
		warning(`Failed to generate SBOM for ${directory}: ${error instanceof Error ? error.message : String(error)}`);
		return undefined;
	}
}

/**
 * Create a GitHub SBOM attestation for a published package
 *
 * @remarks
 * This creates a CycloneDX SBOM attestation using GitHub's attestation API.
 * The attestation binds the SBOM to the package artifact, allowing consumers
 * to verify what dependencies were included in the build.
 *
 * The SBOM is generated using `npm sbom --sbom-format=cyclonedx` and then attested
 * using the in-toto CycloneDX predicate type. CycloneDX is preferred over SPDX
 * for JavaScript/npm projects due to better npm-specific metadata support.
 *
 * Requires:
 * - `id-token: write` permission for OIDC signing
 * - `attestations: write` permission for storing attestations
 *
 * @param options - SBOM attestation creation options
 * @returns Promise resolving to attestation result
 *
 * @see https://cyclonedx.org/specification/overview/
 * @see https://github.com/actions/attest-sbom
 */
export async function createSBOMAttestation(options: CreateSBOMAttestationOptions): Promise<AttestationResult> {
	const { packageName, version, directory, dryRun, packageManager = "npm", tarballDigest } = options;

	if (dryRun) {
		info(`[DRY RUN] Would create SBOM attestation for ${packageName}@${version}`);
		return {
			success: true,
			attestationUrl: `https://github.com/${context.repo.owner}/${context.repo.repo}/attestations/dry-run-sbom`,
		};
	}

	// Get the GITHUB_TOKEN for attestation API
	const token = process.env.GITHUB_TOKEN || getState("githubToken");
	if (!token) {
		return {
			success: false,
			error: "No GITHUB_TOKEN available for SBOM attestation creation",
		};
	}

	// Generate the SBOM from the dist directory where package.json has resolved versions
	// (workspace:* dependencies are transformed to real versions during build)
	// generateSBOM will install dependencies if node_modules doesn't exist
	info(`Generating SBOM for ${packageName}@${version}...`);
	const sbom = await generateSBOM(directory, packageManager);
	if (!sbom) {
		return {
			success: false,
			error: `Failed to generate SBOM for ${packageName}@${version}`,
		};
	}

	// Save the SBOM to a file for later upload as a release asset
	// Naming convention: {package-name-without-scope}-{version}[-{target}].sbom.json
	const pkgNameWithoutScope = packageName.startsWith("@") ? packageName.split("/")[1] : packageName;
	const sbomFileName = options.targetName
		? `${pkgNameWithoutScope}-${version}-${options.targetName}.sbom.json`
		: `${pkgNameWithoutScope}-${version}.sbom.json`;
	const sbomPath = join(directory, sbomFileName);
	writeFileSync(sbomPath, JSON.stringify(sbom, null, 2));
	info(`  Saved SBOM to ${sbomPath}`);

	// Determine the digest to use for the subject
	let digest: string;
	if (tarballDigest) {
		digest = tarballDigest;
		debug(`Using provided tarball digest for SBOM subject: ${digest}`);
	} else {
		// Try to find or create a tarball to compute digest
		let tarballPath = findTarball(directory, packageName, version);
		if (!tarballPath) {
			tarballPath = await createTarball(directory, packageManager);
		}
		if (!tarballPath) {
			return {
				success: false,
				error: `No tarball found for SBOM attestation of ${packageName}@${version}`,
			};
		}
		digest = computeFileDigest(tarballPath);
		debug(`Computed tarball digest for SBOM subject: ${digest}`);
	}

	// Use PURL format for npm packages
	const purlName = `pkg:npm/${packageName}@${version}`;
	info(`Creating SBOM attestation for ${purlName}...`);

	try {
		debug(`Subject name (PURL): ${purlName}`);
		debug(`Subject digest: ${digest}`);
		debug(`Predicate type: ${CYCLONEDX_PREDICATE_TYPE}`);

		// Create the SBOM attestation using the generic attest function
		const attestation: Attestation = await attest({
			subjects: [
				{
					name: purlName,
					digest: { sha256: digest.replace("sha256:", "") },
				},
			],
			predicateType: CYCLONEDX_PREDICATE_TYPE,
			predicate: sbom,
			token,
		});

		const attestationUrl = attestation.attestationID
			? `https://github.com/${context.repo.owner}/${context.repo.repo}/attestations/${attestation.attestationID}`
			: undefined;

		info(`✓ Created SBOM attestation for ${packageName}@${version}`);
		if (attestationUrl) {
			info(`  Attestation URL: ${attestationUrl}`);
		}
		if (attestation.tlogID) {
			info(`  Transparency log: https://search.sigstore.dev/?logIndex=${attestation.tlogID}`);
		}

		return {
			success: true,
			attestationUrl,
			attestationId: attestation.attestationID,
			tlogId: attestation.tlogID,
			sbomPath,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		warning(`Failed to create SBOM attestation for ${packageName}@${version}: ${message}`);

		// Don't fail the publish for SBOM attestation errors
		return {
			success: false,
			error: message,
		};
	}
}
