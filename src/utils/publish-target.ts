import * as fs from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import type { AlreadyPublishedReason, PublishResult, ResolvedTarget } from "../types/publish-config.js";

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
	const pkgJsonPath = path.join(target.directory, "package.json");
	if (!fs.existsSync(pkgJsonPath)) return undefined;

	const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8")) as { name?: string };
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
 * - bun: `bunx npm <args>`
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
			return { cmd: "bunx", baseArgs: ["npm"] };
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
 * - bun: `bunx npm publish`
 */
function getPublishCommand(packageManager: string): { cmd: string; baseArgs: string[] } {
	switch (packageManager) {
		case "pnpm":
			return { cmd: "pnpm", baseArgs: ["dlx", "npm"] };
		case "yarn":
			// Yarn uses "yarn npm publish" for publishing to npm registries
			return { cmd: "yarn", baseArgs: ["npm"] };
		case "bun":
			return { cmd: "bunx", baseArgs: ["npm"] };
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
			return { cmd: "bunx", args: [] };
		default:
			return { cmd: "npx", args: [] };
	}
}

/**
 * Get local tarball integrity by running npm pack --json --dry-run
 */
async function getLocalTarballIntegrity(directory: string, packageManager: string): Promise<string | undefined> {
	let output = "";
	const npmCmd = getNpmCommand(packageManager);
	try {
		await exec.exec(npmCmd.cmd, [...npmCmd.baseArgs, "pack", "--json", "--dry-run"], {
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
		core.debug(`Failed to get local tarball integrity: ${output}`);
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
		await exec.exec(npmCmd.cmd, args, {
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
		core.debug(`Failed to get remote tarball integrity for ${packageName}@${version}`);
		return undefined;
	}
}

/**
 * Compare local and remote tarball integrity to determine if skip is safe
 */
async function compareTarballIntegrity(
	target: ResolvedTarget,
	packageManager: string,
): Promise<{ reason: AlreadyPublishedReason; localIntegrity?: string; remoteIntegrity?: string }> {
	const pkgJsonPath = path.join(target.directory, "package.json");
	if (!fs.existsSync(pkgJsonPath)) {
		return { reason: "unknown" };
	}

	const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8")) as { name?: string; version?: string };
	if (!pkg.name || !pkg.version) {
		return { reason: "unknown" };
	}

	const [localIntegrity, remoteIntegrity] = await Promise.all([
		getLocalTarballIntegrity(target.directory, packageManager),
		getRemoteTarballIntegrity(pkg.name, pkg.version, target.registry, packageManager),
	]);

	if (!localIntegrity || !remoteIntegrity) {
		core.debug(`Could not compare integrity: local=${localIntegrity}, remote=${remoteIntegrity}`);
		return { reason: "unknown", localIntegrity, remoteIntegrity };
	}

	if (localIntegrity === remoteIntegrity) {
		core.info(`✓ Local tarball matches remote (shasum: ${localIntegrity.substring(0, 12)}...)`);
		return { reason: "identical", localIntegrity, remoteIntegrity };
	}

	core.warning(`✗ Local tarball differs from remote!`);
	core.warning(`  Local:  ${localIntegrity}`);
	core.warning(`  Remote: ${remoteIntegrity}`);
	return { reason: "different", localIntegrity, remoteIntegrity };
}

/**
 * Publish to any npm-compatible registry
 */
async function publishToNpmCompatible(target: ResolvedTarget, packageManager: string): Promise<PublishResult> {
	let output = "";
	let error = "";
	let exitCode = 0;

	const args = ["publish"];

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
	const registryName = getRegistryDisplayName(target.registry);
	core.info(`Publishing to ${registryName}: ${publishCmd.cmd} ${fullArgs.join(" ")}`);
	core.info(`  Directory: ${target.directory}`);

	try {
		exitCode = await exec.exec(publishCmd.cmd, fullArgs, {
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

	const registryUrl = generatePackageUrl(target);
	const attestationUrl = target.provenance ? extractProvenanceUrl(output) : undefined;
	const alreadyPublished = isVersionAlreadyPublished(output, error);

	// If version already published, compare tarballs to determine if safe to skip
	let alreadyPublishedReason: AlreadyPublishedReason | undefined;
	let localIntegrity: string | undefined;
	let remoteIntegrity: string | undefined;

	if (alreadyPublished) {
		core.info("Version already published - comparing tarball integrity...");
		const comparison = await compareTarballIntegrity(target, packageManager);
		alreadyPublishedReason = comparison.reason;
		localIntegrity = comparison.localIntegrity;
		remoteIntegrity = comparison.remoteIntegrity;
	}

	return {
		success: exitCode === 0,
		output,
		error,
		exitCode,
		registryUrl,
		attestationUrl,
		alreadyPublished,
		alreadyPublishedReason,
		localIntegrity,
		remoteIntegrity,
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
	let error = "";
	let exitCode = 0;

	// JSR uses npx/pnpm dlx/bunx to run jsr publish
	// --allow-dirty is needed because we're in a git repo with changes
	const npx = getNpxCommand(packageManager);
	const args = [...npx.args, "jsr", "publish", "--allow-dirty"];

	core.info(`Publishing to JSR: ${npx.cmd} ${args.join(" ")}`);
	core.info(`  Directory: ${target.directory}`);

	try {
		exitCode = await exec.exec(npx.cmd, args, {
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

	// Extract JSR package URL from output
	const urlMatch = output.match(/https:\/\/jsr\.io\/@[^\s]+/);
	const registryUrl = urlMatch?.[0];
	const alreadyPublished = isJsrVersionAlreadyPublished(output, error);

	return {
		success: exitCode === 0,
		output,
		error,
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
 * @returns Publish result
 */
export async function publishToTarget(
	target: ResolvedTarget,
	dryRun: boolean,
	packageManager: string = "npm",
): Promise<PublishResult> {
	if (dryRun) {
		const registryName = target.protocol === "jsr" ? "JSR" : getRegistryDisplayName(target.registry);
		core.info(`[DRY RUN] Would publish to ${registryName}: ${target.directory}`);
		return {
			success: true,
			output: "[DRY RUN] Skipped actual publish",
			error: "",
			exitCode: 0,
		};
	}

	switch (target.protocol) {
		case "npm":
			return publishToNpmCompatible(target, packageManager);
		case "jsr":
			return publishToJsr(target, packageManager);
		default:
			throw new Error(`Unknown protocol: ${(target as ResolvedTarget).protocol}`);
	}
}
