import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { debug, error, info, warning } from "@actions/core";
import { exec } from "@actions/exec";
import type {
	AlreadyPublishedReason,
	NpmVersionInfo,
	PrePackedTarball,
	PublishResult,
	ResolvedTarget,
	VersionCheckResult,
} from "../types/publish-config.js";

/**
 * Get a display name for a registry URL
 */
function getRegistryDisplayName(registry: string | null): string {
	if (!registry) return "unknown";
	if (registry.includes("npmjs.org")) return "npm";
	if (registry.includes("pkg.github.com")) return "GitHub Packages";
	try {
		const url = new URL(registry);
		return url.hostname;
	} catch {
		return registry;
	}
}

/**
 * Generate a URL to the published package
 */
function generatePackageUrl(target: ResolvedTarget): string | undefined {
	const pkgJsonPath = join(target.directory, "package.json");
	if (!existsSync(pkgJsonPath)) return undefined;

	const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8")) as { name?: string };
	const name = pkg.name;

	if (!name || !target.registry) return undefined;

	if (target.registry.includes("npmjs.org")) {
		return `https://www.npmjs.com/package/${name}`;
	}

	if (target.registry.includes("pkg.github.com")) {
		const scope = name.startsWith("@") ? name.split("/")[0].slice(1) : undefined;
		return scope ? `https://github.com/${scope}/packages` : undefined;
	}

	// Custom registries - no standard URL format
	return undefined;
}

/**
 * Extract provenance URL from npm publish output
 */
function extractProvenanceUrl(output: string): string | undefined {
	const match = output.match(/Provenance statement published to (https:\/\/[^\s]+)/);
	return match?.[1];
}

/**
 * Check if error indicates version already published
 */
function isVersionAlreadyPublished(output: string, error: string): boolean {
	return (
		output.includes("cannot publish over previously published version") ||
		error.includes("cannot publish over previously published version") ||
		error.includes("You cannot publish over the previously published versions")
	);
}

/**
 * Get the command to run npm operations
 *
 * This is the primary wrapper for running npm commands across different package managers.
 * All package managers use their "execute" command to run npm.
 *
 * @remarks
 * - npm: `npx npm <args>`
 * - pnpm: `pnpm dlx npm <args>`
 * - yarn: `yarn npm <args>`
 * - bun: `bun x npm <args>`
 *
 * @param packageManager - The package manager being used
 * @returns Command and base args to prepend before npm arguments
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
 * Get the publish command for a package manager
 *
 * @remarks
 * We use `npm publish` via the package manager's dlx/npx command to avoid
 * package manager-specific git checks. For example, pnpm has strict branch
 * validation that fails on release branches like `changeset-release/main`.
 *
 * - npm: `npx npm publish`
 * - pnpm: `pnpm dlx npm publish`
 * - yarn: `yarn npm publish` (yarn has its own npm wrapper)
 * - bun: `bun x npm publish`
 */
function getPublishCommand(packageManager: string): { cmd: string; baseArgs: string[] } {
	switch (packageManager) {
		case "pnpm":
			return { cmd: "pnpm", baseArgs: ["dlx", "npm"] };
		case "yarn":
			// Yarn uses "yarn npm publish" for publishing to npm registries
			return { cmd: "yarn", baseArgs: ["npm"] };
		case "bun":
			return { cmd: "bun", baseArgs: ["x", "npm"] };
		default:
			return { cmd: "npx", baseArgs: ["npm"] };
	}
}

/**
 * Get the npx equivalent for a package manager (for running external tools)
 */
function getNpxCommand(packageManager: string): { cmd: string; args: string[] } {
	switch (packageManager) {
		case "pnpm":
			return { cmd: "pnpm", args: ["dlx"] };
		case "yarn":
			return { cmd: "yarn", args: ["dlx"] };
		case "bun":
			return { cmd: "bun", args: ["x"] };
		default:
			return { cmd: "npx", args: [] };
	}
}

/**
 * Get local tarball integrity by running npm pack --json --dry-run
 */
export async function getLocalTarballIntegrity(directory: string, packageManager: string): Promise<string | undefined> {
	let output = "";
	const npmCmd = getNpmCommand(packageManager);
	try {
		await exec(npmCmd.cmd, [...npmCmd.baseArgs, "pack", "--json", "--dry-run"], {
			cwd: directory,
			silent: true,
			listeners: {
				stdout: (data: Buffer) => {
					output += data.toString();
				},
			},
			ignoreReturnCode: true,
		});

		// pack --json returns an array of package info
		const parsed = JSON.parse(output) as Array<{ shasum?: string; integrity?: string }>;
		// Return shasum (SHA-1) for comparison - it's more universally available
		return parsed[0]?.shasum;
	} catch {
		debug(`Failed to get local tarball integrity: ${output}`);
		return undefined;
	}
}

/**
 * Pack a package into a tarball and compute its SHA-256 digest
 *
 * @remarks
 * This creates a tarball using `npm pack --json` and computes its SHA-256 digest.
 * The digest can be used for attestations and linking to GitHub Packages.
 *
 * When publishing to multiple targets, call this ONCE and pass the result to
 * each `publishToTarget` call to ensure all targets receive identical content.
 *
 * @param directory - Directory containing the package
 * @param packageManager - Package manager to use
 * @returns Pack result with tarball path and digest, or undefined if failed
 */
export async function packAndComputeDigest(
	directory: string,
	packageManager: string,
): Promise<PrePackedTarball | undefined> {
	let output = "";
	const npmCmd = getNpmCommand(packageManager);

	try {
		await exec(npmCmd.cmd, [...npmCmd.baseArgs, "pack", "--json"], {
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
		if (packInfo.length === 0 || !packInfo[0].filename) {
			debug("npm pack did not return filename");
			return undefined;
		}

		const filename = packInfo[0].filename;
		const tarballPath = join(directory, filename);

		if (!existsSync(tarballPath)) {
			debug(`Tarball not found at expected path: ${tarballPath}`);
			return undefined;
		}

		// Compute SHA-256 digest
		const content = readFileSync(tarballPath);
		const hash = createHash("sha256").update(content).digest("hex");
		const digest = `sha256:${hash}`;

		debug(`Packed tarball: ${filename}, digest: ${digest}`);

		return { path: tarballPath, digest, filename };
	} catch (err) {
		debug(`Failed to pack tarball: ${err instanceof Error ? err.message : String(err)}`);
		return undefined;
	}
}

/**
 * Get remote tarball integrity from registry using npm view
 */
async function getRemoteTarballIntegrity(
	packageName: string,
	version: string,
	registry: string | null,
	packageManager: string,
): Promise<string | undefined> {
	let output = "";
	const npmCmd = getNpmCommand(packageManager);
	const args = [...npmCmd.baseArgs, "view", `${packageName}@${version}`, "dist.shasum"];

	if (registry) {
		args.push("--registry", registry);
	}

	try {
		await exec(npmCmd.cmd, args, {
			silent: true,
			listeners: {
				stdout: (data: Buffer) => {
					output += data.toString();
				},
			},
			ignoreReturnCode: true,
		});

		const shasum = output.trim();
		return shasum || undefined;
	} catch {
		debug(`Failed to get remote tarball integrity for ${packageName}@${version}`);
		return undefined;
	}
}

/**
 * Raw response from npm view --json for a specific version
 */
interface NpmViewResponse {
	name?: string;
	version?: string;
	versions?: string[];
	"dist-tags"?: Record<string, string>;
	dist?: {
		integrity?: string;
		shasum?: string;
		tarball?: string;
	};
	time?: Record<string, string>;
	error?: {
		code?: string;
		summary?: string;
	};
}

/**
 * Check if a specific version exists on a registry
 *
 * Uses `npm view <package>@<version> --json --registry <url>` to check
 * if a version already exists before attempting to publish.
 *
 * @param packageName - Package name (e.g., "@savvy-web/my-package")
 * @param version - Version to check (e.g., "1.0.0")
 * @param registry - Registry URL (e.g., "https://registry.npmjs.org/")
 * @param packageManager - Package manager to use for the npm command
 * @returns Version check result with existence status and version info
 */
export async function checkVersionExists(
	packageName: string,
	version: string,
	registry: string | null,
	packageManager: string,
): Promise<VersionCheckResult> {
	let output = "";
	let errorOutput = "";
	const npmCmd = getNpmCommand(packageManager);
	const args = [...npmCmd.baseArgs, "view", `${packageName}@${version}`, "--json"];

	if (registry) {
		args.push("--registry", registry);
	}

	const registryName = getRegistryDisplayName(registry);
	debug(`Checking if ${packageName}@${version} exists on ${registryName}`);

	let exitCode = 0;
	try {
		exitCode = await exec(npmCmd.cmd, args, {
			silent: true,
			listeners: {
				stdout: (data: Buffer) => {
					output += data.toString();
				},
				stderr: (data: Buffer) => {
					errorOutput += data.toString();
				},
			},
			ignoreReturnCode: true,
		});
	} catch (e) {
		return {
			success: false,
			versionExists: false,
			error: e instanceof Error ? e.message : String(e),
			rawOutput: output || errorOutput,
		};
	}

	// Try to parse the JSON output
	const trimmedOutput = output.trim();

	// If no output or exit code indicates error, check for specific cases
	if (!trimmedOutput || exitCode !== 0) {
		// Check if this is a "not found" error (package or version doesn't exist)
		// npm view returns exit code 1 and E404 for missing packages
		if (errorOutput.includes("E404") || errorOutput.includes("is not in this registry")) {
			debug(`Package ${packageName}@${version} not found on ${registryName}`);
			return {
				success: true,
				versionExists: false,
				rawOutput: errorOutput,
			};
		}

		// Try to parse error JSON
		try {
			const errorJson = JSON.parse(trimmedOutput || errorOutput) as NpmViewResponse;
			if (errorJson.error?.code === "E404") {
				return {
					success: true,
					versionExists: false,
					rawOutput: trimmedOutput || errorOutput,
				};
			}
		} catch {
			// Not JSON, continue with error handling
		}

		// Other errors (network, auth, etc.)
		return {
			success: false,
			versionExists: false,
			error: errorOutput || `npm view failed with exit code ${exitCode}`,
			rawOutput: trimmedOutput || errorOutput,
		};
	}

	// Parse successful response
	try {
		const data = JSON.parse(trimmedOutput) as NpmViewResponse;

		// npm view returns the version info if it exists
		if (data.name && data.version) {
			const versionInfo: NpmVersionInfo = {
				name: data.name,
				version: data.version,
				versions: data.versions || [data.version],
				distTags: data["dist-tags"] || {},
				dist: data.dist,
				time: data.time,
			};

			return {
				success: true,
				versionExists: true,
				versionInfo,
				rawOutput: trimmedOutput,
			};
		}

		// Empty response means version doesn't exist
		return {
			success: true,
			versionExists: false,
			rawOutput: trimmedOutput,
		};
	} catch (e) {
		return {
			success: false,
			versionExists: false,
			error: `Failed to parse npm view output: ${e instanceof Error ? e.message : String(e)}`,
			rawOutput: trimmedOutput,
		};
	}
}

/**
 * Compare local and remote tarball integrity to determine if skip is safe
 */
async function compareTarballIntegrity(
	target: ResolvedTarget,
	packageManager: string,
): Promise<{ reason: AlreadyPublishedReason; localIntegrity?: string; remoteIntegrity?: string }> {
	const pkgJsonPath = join(target.directory, "package.json");
	if (!existsSync(pkgJsonPath)) {
		return { reason: "unknown" };
	}

	const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8")) as { name?: string; version?: string };
	if (!pkg.name || !pkg.version) {
		return { reason: "unknown" };
	}

	const [localIntegrity, remoteIntegrity] = await Promise.all([
		getLocalTarballIntegrity(target.directory, packageManager),
		getRemoteTarballIntegrity(pkg.name, pkg.version, target.registry, packageManager),
	]);

	if (!localIntegrity || !remoteIntegrity) {
		debug(`Could not compare integrity: local=${localIntegrity}, remote=${remoteIntegrity}`);
		return { reason: "unknown", localIntegrity, remoteIntegrity };
	}

	if (localIntegrity === remoteIntegrity) {
		info(`✓ Local tarball matches remote (shasum: ${localIntegrity.substring(0, 12)}...)`);
		return { reason: "identical", localIntegrity, remoteIntegrity };
	}

	warning(`✗ Local tarball differs from remote!`);
	warning(`  Local:  ${localIntegrity}`);
	warning(`  Remote: ${remoteIntegrity}`);
	return { reason: "different", localIntegrity, remoteIntegrity };
}

/**
 * Publish to any npm-compatible registry
 *
 * This function implements a pre-check strategy:
 * 1. Read package.json to get name and version
 * 2. Check if the version already exists on the registry
 * 3. If exists with identical content, skip publishing
 * 4. If exists with different content, fail with clear error
 * 5. If doesn't exist, proceed with publish
 *
 * @param target - Resolved target to publish to
 * @param packageManager - Package manager to use
 * @param prePackedTarball - Optional pre-packed tarball to use instead of packing fresh
 */
async function publishToNpmCompatible(
	target: ResolvedTarget,
	packageManager: string,
	prePackedTarball?: PrePackedTarball,
): Promise<PublishResult> {
	const registryName = getRegistryDisplayName(target.registry);

	// Read package.json to get name and version
	const pkgJsonPath = join(target.directory, "package.json");
	if (!existsSync(pkgJsonPath)) {
		return {
			success: false,
			output: "",
			error: `package.json not found at ${pkgJsonPath}`,
			exitCode: 1,
		};
	}

	const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8")) as { name?: string; version?: string };
	if (!pkg.name || !pkg.version) {
		return {
			success: false,
			output: "",
			error: "package.json missing name or version",
			exitCode: 1,
		};
	}

	const packageName = pkg.name;
	const version = pkg.version;

	// Pre-check: Does this version already exist on the registry?
	info(`Checking ${packageName}@${version} on ${registryName}...`);
	const versionCheck = await checkVersionExists(packageName, version, target.registry, packageManager);

	if (!versionCheck.success) {
		// Registry check failed - could be auth issue, network issue, etc.
		warning(`⚠ Could not verify version on ${registryName}: ${versionCheck.error}`);
		info("Proceeding with publish attempt...");
	} else if (versionCheck.versionExists) {
		// Version already exists - compare integrity
		info(`Version ${version} already exists on ${registryName}`);

		// Get local tarball integrity for comparison
		const localIntegrity = await getLocalTarballIntegrity(target.directory, packageManager);
		const remoteIntegrity = versionCheck.versionInfo?.dist?.shasum;

		if (localIntegrity && remoteIntegrity) {
			if (localIntegrity === remoteIntegrity) {
				info(`✓ Local tarball matches remote (shasum: ${localIntegrity.substring(0, 12)}...)`);
				info(`✓ Skipping publish - identical content already published`);

				// Show dist-tags info
				const distTags = versionCheck.versionInfo?.distTags;
				if (distTags && Object.keys(distTags).length > 0) {
					const tagsList = Object.entries(distTags)
						.map(([tag, ver]) => `${tag}=${ver}`)
						.join(", ");
					info(`  Current dist-tags: ${tagsList}`);
				}

				return {
					success: true,
					output: `Version ${version} already published with identical content`,
					error: "",
					exitCode: 0,
					registryUrl: generatePackageUrl(target),
					alreadyPublished: true,
					alreadyPublishedReason: "identical",
					localIntegrity,
					remoteIntegrity,
				};
			}

			// Content differs - this is an error condition
			error(`✗ Local tarball differs from published version!`);
			error(`  Local shasum:  ${localIntegrity}`);
			error(`  Remote shasum: ${remoteIntegrity}`);
			error(`  This indicates the package content changed without a version bump.`);

			return {
				success: false,
				output: "",
				error: `Version ${version} already published with different content (local: ${localIntegrity}, remote: ${remoteIntegrity})`,
				exitCode: 1,
				alreadyPublished: true,
				alreadyPublishedReason: "different",
				localIntegrity,
				remoteIntegrity,
			};
		}

		// Could not compare integrity - proceed with warning
		warning(
			`⚠ Could not compare tarball integrity (local: ${localIntegrity || "unavailable"}, remote: ${remoteIntegrity || "unavailable"})`,
		);
		info(`✓ Skipping publish - version already exists`);

		return {
			success: true,
			output: `Version ${version} already published (integrity comparison unavailable)`,
			error: "",
			exitCode: 0,
			registryUrl: generatePackageUrl(target),
			alreadyPublished: true,
			alreadyPublishedReason: "unknown",
			localIntegrity,
			remoteIntegrity,
		};
	} else {
		// Version doesn't exist - show available versions for context
		info(`✓ Version ${version} not found on ${registryName} - proceeding with publish`);
	}

	// Step 1: Use pre-packed tarball if provided, otherwise pack fresh
	// Using a pre-packed tarball ensures all targets receive identical content with the same digest
	let packResult: PrePackedTarball;

	if (prePackedTarball) {
		// Reuse the pre-packed tarball for consistent multi-target publishing
		debug(`Using pre-packed tarball: ${prePackedTarball.filename}`);
		packResult = prePackedTarball;
	} else {
		// Pack fresh (single-target or legacy mode)
		info(`Packing ${packageName}@${version}...`);
		const freshPackResult = await packAndComputeDigest(target.directory, packageManager);
		if (!freshPackResult) {
			return {
				success: false,
				output: "",
				error: "Failed to create tarball with npm pack",
				exitCode: 1,
			};
		}
		packResult = freshPackResult;
		info(`✓ Created tarball: ${packResult.filename}`);
	}

	debug(`  Digest: ${packResult.digest}`);

	// Step 2: Build publish command with the specific tarball
	let output = "";
	let errorOutput = "";
	let exitCode = 0;

	// Publish the specific tarball file to ensure digest consistency
	const args = ["publish", packResult.path];

	if (target.registry) {
		args.push("--registry", target.registry);
	}

	// Provenance creates SLSA attestation via Sigstore
	// Requires OIDC token permissions in GitHub Actions
	if (target.provenance) {
		args.push("--provenance");
	}

	if (target.access) {
		args.push("--access", target.access);
	}

	if (target.tag && target.tag !== "latest") {
		args.push("--tag", target.tag);
	}

	const publishCmd = getPublishCommand(packageManager);
	const fullArgs = [...publishCmd.baseArgs, ...args];
	info(`Running: ${publishCmd.cmd} ${fullArgs.join(" ")}`);

	try {
		exitCode = await exec(publishCmd.cmd, fullArgs, {
			cwd: target.directory,
			listeners: {
				stdout: (data: Buffer) => {
					output += data.toString();
				},
				stderr: (data: Buffer) => {
					errorOutput += data.toString();
				},
			},
			ignoreReturnCode: true,
		});
	} catch (e) {
		exitCode = 1;
		errorOutput = e instanceof Error ? e.message : String(e);
	}

	const registryUrl = generatePackageUrl(target);
	const attestationUrl = target.provenance ? extractProvenanceUrl(output) : undefined;

	if (exitCode === 0) {
		info(`✓ Successfully published ${packageName}@${version} to ${registryName}`);
		if (attestationUrl) {
			info(`  Provenance: ${attestationUrl}`);
		}
	} else {
		// Check if this is a "version already published" error (race condition)
		const alreadyPublished = isVersionAlreadyPublished(output, errorOutput);
		if (alreadyPublished) {
			info("Version was published by another process - verifying integrity...");
			const comparison = await compareTarballIntegrity(target, packageManager);

			return {
				success: comparison.reason !== "different",
				output,
				error: errorOutput,
				exitCode,
				registryUrl,
				alreadyPublished: true,
				alreadyPublishedReason: comparison.reason,
				localIntegrity: comparison.localIntegrity,
				remoteIntegrity: comparison.remoteIntegrity,
			};
		}

		error(`✗ Failed to publish ${packageName}@${version} to ${registryName}`);
	}

	return {
		success: exitCode === 0,
		output,
		error: errorOutput,
		exitCode,
		registryUrl,
		attestationUrl,
		tarballPath: packResult.path,
		tarballDigest: packResult.digest,
	};
}

/**
 * Check if JSR error indicates version already published
 */
function isJsrVersionAlreadyPublished(output: string, error: string): boolean {
	return (
		output.includes("already exists") ||
		error.includes("already exists") ||
		(error.includes("Version") && error.includes("already published"))
	);
}

/**
 * Publish to JSR
 */
async function publishToJsr(target: ResolvedTarget, packageManager: string): Promise<PublishResult> {
	let output = "";
	let errorOutput = "";
	let exitCode = 0;

	// JSR uses npx/pnpm dlx/bun x to run jsr publish
	// --allow-dirty is needed because we're in a git repo with changes
	const npx = getNpxCommand(packageManager);
	const args = [...npx.args, "jsr", "publish", "--allow-dirty"];

	info(`Publishing to JSR: ${npx.cmd} ${args.join(" ")}`);
	info(`  Directory: ${target.directory}`);

	try {
		exitCode = await exec(npx.cmd, args, {
			cwd: target.directory,
			listeners: {
				stdout: (data: Buffer) => {
					output += data.toString();
				},
				stderr: (data: Buffer) => {
					errorOutput += data.toString();
				},
			},
			ignoreReturnCode: true,
		});
	} catch (e) {
		exitCode = 1;
		errorOutput = e instanceof Error ? e.message : String(e);
	}

	// Extract JSR package URL from output
	const urlMatch = output.match(/https:\/\/jsr\.io\/@[^\s]+/);
	const registryUrl = urlMatch?.[0];
	const alreadyPublished = isJsrVersionAlreadyPublished(output, errorOutput);

	return {
		success: exitCode === 0,
		output,
		error: errorOutput,
		exitCode,
		registryUrl,
		alreadyPublished,
	};
}

/**
 * Publish a package to a target
 *
 * @param target - Resolved target to publish to
 * @param dryRun - Whether this is a dry-run (skip actual publish)
 * @param packageManager - Package manager to use (defaults to "npm")
 * @param prePackedTarball - Optional pre-packed tarball for consistent multi-target publishing
 * @returns Publish result
 */
export async function publishToTarget(
	target: ResolvedTarget,
	dryRun: boolean,
	packageManager: string = "npm",
	prePackedTarball?: PrePackedTarball,
): Promise<PublishResult> {
	if (dryRun) {
		const registryName = target.protocol === "jsr" ? "JSR" : getRegistryDisplayName(target.registry);
		info(`[DRY RUN] Would publish to ${registryName}: ${target.directory}`);
		return {
			success: true,
			output: "[DRY RUN] Skipped actual publish",
			error: "",
			exitCode: 0,
		};
	}

	switch (target.protocol) {
		case "npm":
			return publishToNpmCompatible(target, packageManager, prePackedTarball);
		case "jsr":
			return publishToJsr(target, packageManager);
		default:
			throw new Error(`Unknown protocol: ${(target as ResolvedTarget).protocol}`);
	}
}
