import * as fs from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import type { PublishResult, ResolvedTarget } from "../types/publish-config.js";

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
 * Publish to any npm-compatible registry
 */
async function publishToNpmCompatible(target: ResolvedTarget): Promise<PublishResult> {
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

	const registryName = getRegistryDisplayName(target.registry);
	core.info(`Publishing to ${registryName}: npm ${args.join(" ")}`);
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

	const registryUrl = generatePackageUrl(target);
	const attestationUrl = target.provenance ? extractProvenanceUrl(output) : undefined;

	return {
		success: exitCode === 0,
		output,
		error,
		exitCode,
		registryUrl,
		attestationUrl,
	};
}

/**
 * Publish to JSR
 */
async function publishToJsr(target: ResolvedTarget): Promise<PublishResult> {
	let output = "";
	let error = "";
	let exitCode = 0;

	// JSR uses npx jsr publish
	// --allow-dirty is needed because we're in a git repo with changes
	const args = ["jsr", "publish", "--allow-dirty"];

	core.info(`Publishing to JSR: npx ${args.join(" ")}`);
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

	// Extract JSR package URL from output
	const urlMatch = output.match(/https:\/\/jsr\.io\/@[^\s]+/);
	const registryUrl = urlMatch?.[0];

	return {
		success: exitCode === 0,
		output,
		error,
		exitCode,
		registryUrl,
	};
}

/**
 * Publish a package to a target
 *
 * @param target - Resolved target to publish to
 * @param dryRun - Whether this is a dry-run (skip actual publish)
 * @returns Publish result
 */
export async function publishToTarget(target: ResolvedTarget, dryRun: boolean): Promise<PublishResult> {
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
			return publishToNpmCompatible(target);
		case "jsr":
			return publishToJsr(target);
		default:
			throw new Error(`Unknown protocol: ${(target as ResolvedTarget).protocol}`);
	}
}
