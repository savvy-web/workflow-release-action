import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { attestProvenance } from "@actions/attest";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
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
}

/**
 * Compute SHA256 digest of a file
 *
 * @param filePath - Path to the file
 * @returns SHA256 digest in format "sha256:hex"
 */
function computeFileDigest(filePath: string): string {
	const content = fs.readFileSync(filePath);
	const hash = crypto.createHash("sha256").update(content).digest("hex");
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

	const tarballPath = path.join(directory, expectedName);
	if (fs.existsSync(tarballPath)) {
		return tarballPath;
	}

	// Also check for any .tgz file in the directory
	const files = fs.readdirSync(directory);
	const tgzFile = files.find((f) => f.endsWith(".tgz"));
	if (tgzFile) {
		return path.join(directory, tgzFile);
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
 * - bun: `bunx npm <args>`
 */
function getNpmCommand(packageManager: string): { cmd: string; baseArgs: string[] } {
	switch (packageManager) {
		case "pnpm":
			return { cmd: "pnpm", baseArgs: ["dlx", "npm"] };
		case "yarn":
			return { cmd: "yarn", baseArgs: ["npm"] };
		case "bun":
			return { cmd: "bunx", baseArgs: ["npm"] };
		default:
			return { cmd: "npx", baseArgs: ["npm"] };
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

		await exec.exec(npmCmd.cmd, packArgs, {
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
			const tarballPath = path.join(directory, packInfo[0].filename);
			if (fs.existsSync(tarballPath)) {
				return tarballPath;
			}
		}
	} catch (error) {
		core.debug(`Failed to create tarball: ${error instanceof Error ? error.message : String(error)}`);
	}

	return undefined;
}

/**
 * Create a GitHub attestation for a published package
 *
 * @remarks
 * This creates a SLSA provenance attestation using GitHub's attestation API.
 * The attestation is signed using Sigstore and stored on GitHub, making it
 * verifiable via `gh attestation verify`.
 *
 * Requires:
 * - `id-token: write` permission for OIDC signing
 * - `attestations: write` permission for storing attestations
 *
 * @param packageName - Name of the package
 * @param version - Version of the package
 * @param directory - Directory containing the package (with tarball)
 * @param dryRun - Whether to skip actual attestation creation
 * @param packageManager - Package manager to use for creating tarball if needed (defaults to "npm")
 * @returns Promise resolving to attestation result
 */
export async function createPackageAttestation(
	packageName: string,
	version: string,
	directory: string,
	dryRun: boolean,
	packageManager: string = "npm",
): Promise<AttestationResult> {
	if (dryRun) {
		core.info(`[DRY RUN] Would create attestation for ${packageName}@${version}`);
		return {
			success: true,
			attestationUrl: `https://github.com/${context.repo.owner}/${context.repo.repo}/attestations/dry-run`,
		};
	}

	// Get the GITHUB_TOKEN for attestation API
	// We need the workflow token, not the App token, for attestations
	const token = process.env.GITHUB_TOKEN || core.getState("githubToken");
	if (!token) {
		return {
			success: false,
			error: "No GITHUB_TOKEN available for attestation creation",
		};
	}

	// Find the tarball, or create one if it doesn't exist
	let tarballPath = findTarball(directory, packageName, version);
	if (!tarballPath) {
		core.debug(`No tarball found in ${directory} for ${packageName}@${version}, creating one...`);
		tarballPath = await createTarball(directory, packageManager);
		if (!tarballPath) {
			core.debug(`Failed to create tarball in ${directory}`);
			return {
				success: false,
				error: `No tarball found and could not create one for ${packageName}@${version}`,
			};
		}
		core.debug(`Created tarball: ${tarballPath}`);
	}

	const tarballName = path.basename(tarballPath);
	// Use PURL format for npm packages to link with GitHub Packages
	// Format: pkg:npm/@scope/name@version or pkg:npm/name@version
	const purlName = `pkg:npm/${packageName}@${version}`;
	core.info(`Creating attestation for ${purlName}...`);

	try {
		// Compute digest
		const digest = computeFileDigest(tarballPath);
		core.debug(`Tarball digest: ${digest}`);
		core.debug(`Subject name (PURL): ${purlName}`);

		// Create the attestation
		const attestation = await attestProvenance({
			subjectName: purlName,
			subjectDigest: { sha256: digest.replace("sha256:", "") },
			token,
		});

		const attestationUrl = attestation.attestationID
			? `https://github.com/${context.repo.owner}/${context.repo.repo}/attestations/${attestation.attestationID}`
			: undefined;

		core.info(`✓ Created attestation for ${tarballName}`);
		if (attestationUrl) {
			core.info(`  Attestation URL: ${attestationUrl}`);
		}
		if (attestation.tlogID) {
			core.info(`  Transparency log: https://search.sigstore.dev/?logIndex=${attestation.tlogID}`);
		}

		return {
			success: true,
			attestationUrl,
			attestationId: attestation.attestationID,
			tlogId: attestation.tlogID,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		core.warning(`Failed to create attestation for ${packageName}@${version}: ${message}`);

		// Don't fail the publish for attestation errors
		return {
			success: false,
			error: message,
		};
	}
}
