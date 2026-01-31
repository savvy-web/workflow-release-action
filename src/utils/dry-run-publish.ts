import { info } from "@actions/core";
import { exec } from "@actions/exec";
import type { DryRunResult, PackageStats, ResolvedTarget } from "../types/publish-config.js";
import { getRegistryDisplayName } from "./registry-utils.js";

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
 * Get the npx equivalent for a package manager
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
async function dryRunNpmCompatible(target: ResolvedTarget, packageManager: string): Promise<DryRunResult> {
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

	const publishCmd = getPublishCommand(packageManager);
	const fullArgs = [...publishCmd.baseArgs, ...args];
	const registryName = getRegistryDisplayName(target.registry);
	info(`[Dry Run] Publishing to ${registryName}: ${publishCmd.cmd} ${fullArgs.join(" ")}`);
	info(`  Directory: ${target.directory}`);

	try {
		exitCode = await exec(publishCmd.cmd, fullArgs, {
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
async function dryRunJsr(target: ResolvedTarget, packageManager: string): Promise<DryRunResult> {
	let output = "";
	let error = "";
	let exitCode = 0;

	// JSR uses npx/pnpm dlx/bun x to run jsr publish
	const npx = getNpxCommand(packageManager);
	const args = [...npx.args, "jsr", "publish", "--dry-run"];

	info(`[Dry Run] Publishing to JSR: ${npx.cmd} ${args.join(" ")}`);
	info(`  Directory: ${target.directory}`);

	try {
		exitCode = await exec(npx.cmd, args, {
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
 * @param packageManager - Package manager to use
 * @returns Dry-run result
 */
export async function dryRunPublish(target: ResolvedTarget, packageManager: string): Promise<DryRunResult> {
	switch (target.protocol) {
		case "npm":
			return dryRunNpmCompatible(target, packageManager);
		case "jsr":
			return dryRunJsr(target, packageManager);
		default:
			throw new Error(`Unknown protocol: ${(target as ResolvedTarget).protocol}`);
	}
}
