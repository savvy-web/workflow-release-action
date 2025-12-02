import * as core from "@actions/core";
import * as exec from "@actions/exec";
import type { DryRunResult, PackageStats, ResolvedTarget } from "../types/publish-config.js";

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
 * Parse package statistics from npm dry-run output
 *
 * Extracts package size, unpacked size, and total files from output like:
 * ```
 * npm notice package size: 1.2 kB
 * npm notice unpacked size: 1.9 kB
 * npm notice total files: 5
 * ```
 */
function parseNpmDryRunStats(output: string): PackageStats {
	const packageSizeMatch = output.match(/package size:\s*([^\n]+)/);
	const unpackedSizeMatch = output.match(/unpacked size:\s*([^\n]+)/);
	const totalFilesMatch = output.match(/total files:\s*(\d+)/);

	return {
		packageSize: packageSizeMatch?.[1]?.trim(),
		unpackedSize: unpackedSizeMatch?.[1]?.trim(),
		totalFiles: totalFilesMatch ? parseInt(totalFilesMatch[1], 10) : undefined,
	};
}

/**
 * Dry-run publish to any npm-compatible registry
 */
async function dryRunNpmCompatible(target: ResolvedTarget): Promise<DryRunResult> {
	let output = "";
	let error = "";
	let exitCode = 0;

	const args = ["publish", "--dry-run"];

	// Set registry explicitly
	if (target.registry) {
		args.push("--registry", target.registry);
	}

	// Only add provenance for registries that support it
	if (target.provenance) {
		args.push("--provenance");
	}

	if (target.access) {
		args.push("--access", target.access);
	}

	if (target.tag && target.tag !== "latest") {
		args.push("--tag", target.tag);
	}

	const registryName = getRegistryDisplayName(target.registry);
	core.info(`[Dry Run] Publishing to ${registryName}: npm ${args.join(" ")}`);
	core.info(`  Directory: ${target.directory}`);

	try {
		exitCode = await exec.exec("npm", args, {
			cwd: target.directory,
			listeners: {
				stdout: (data: Buffer) => {
					output += data.toString();
				},
				stderr: (data: Buffer) => {
					error += data.toString();
				},
			},
			ignoreReturnCode: true,
		});
	} catch (e) {
		exitCode = 1;
		error = e instanceof Error ? e.message : String(e);
	}

	// Detect version conflicts
	const versionConflict =
		output.includes("cannot publish over previously published version") ||
		error.includes("cannot publish over previously published version") ||
		error.includes("You cannot publish over the previously published versions");

	// Extract existing version if conflict
	let existingVersion: string | undefined;
	if (versionConflict) {
		const match = error.match(/version (\d+\.\d+\.\d+)/);
		existingVersion = match?.[1];
	}

	// Check provenance readiness
	const provenanceReady = target.provenance ? !error.includes("provenance") || output.includes("provenance") : true;

	// Parse package stats from combined output (npm notice goes to stderr)
	const stats = parseNpmDryRunStats(output + error);

	return {
		success: exitCode === 0 && !versionConflict,
		output,
		error,
		versionConflict,
		existingVersion,
		provenanceReady,
		stats,
	};
}

/**
 * Dry-run publish to JSR
 */
async function dryRunJsr(target: ResolvedTarget): Promise<DryRunResult> {
	let output = "";
	let error = "";
	let exitCode = 0;

	const args = ["jsr", "publish", "--dry-run"];

	core.info(`[Dry Run] Publishing to JSR: npx ${args.join(" ")}`);
	core.info(`  Directory: ${target.directory}`);

	try {
		exitCode = await exec.exec("npx", args, {
			cwd: target.directory,
			listeners: {
				stdout: (data: Buffer) => {
					output += data.toString();
				},
				stderr: (data: Buffer) => {
					error += data.toString();
				},
			},
			ignoreReturnCode: true,
		});
	} catch (e) {
		exitCode = 1;
		error = e instanceof Error ? e.message : String(e);
	}

	// JSR version conflict detection
	const versionConflict =
		output.includes("already exists") ||
		error.includes("already exists") ||
		(error.includes("Version") && error.includes("already published"));

	return {
		success: exitCode === 0 && !versionConflict,
		output,
		error,
		versionConflict,
		provenanceReady: true, // JSR handles verification internally
	};
}

/**
 * Run a dry-run publish for a target
 *
 * @param target - Resolved target to publish
 * @param _packageManager - Package manager to use (currently unused, always uses npm for publish)
 * @returns Dry-run result
 */
export async function dryRunPublish(target: ResolvedTarget, _packageManager: string): Promise<DryRunResult> {
	switch (target.protocol) {
		case "npm":
			return dryRunNpmCompatible(target);
		case "jsr":
			return dryRunJsr(target);
		default:
			throw new Error(`Unknown protocol: ${(target as ResolvedTarget).protocol}`);
	}
}
