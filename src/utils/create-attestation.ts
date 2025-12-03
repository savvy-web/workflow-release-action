import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";
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
 * @returns Promise resolving to attestation result
 */
export async function createPackageAttestation(
	packageName: string,
	version: string,
	directory: string,
	dryRun: boolean,
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

	// Find the tarball
	const tarballPath = findTarball(directory, packageName, version);
	if (!tarballPath) {
		core.debug(`No tarball found in ${directory} for ${packageName}@${version}`);
		return {
			success: false,
			error: `No tarball found for ${packageName}@${version}`,
		};
	}

	const tarballName = path.basename(tarballPath);
	core.info(`Creating attestation for ${tarballName}...`);

	try {
		// Compute digest
		const digest = computeFileDigest(tarballPath);
		core.debug(`Tarball digest: ${digest}`);

		// Import attestProvenance dynamically to handle potential import issues
		const { attestProvenance } = await import("@actions/attest");

		// Create the attestation
		const attestation = await attestProvenance({
			subjectName: tarballName,
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
