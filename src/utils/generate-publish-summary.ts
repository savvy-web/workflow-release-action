import type { PackagePublishValidation, ResolvedTarget } from "../types/publish-config.js";

/**
 * Get a display name for a registry URL
 */
function getRegistryDisplayName(registry: string | null): string {
	if (!registry) return "jsr.io";
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
 * Get an icon for a protocol
 */
function getProtocolIcon(protocol: string): string {
	switch (protocol) {
		case "npm":
			return "\u{1F4E6}";
		case "jsr":
			return "\u{1F995}";
		default:
			return "\u{1F4E6}";
	}
}

/**
 * Generate a markdown summary of publish validation results
 *
 * @param validations - Array of package publish validations
 * @param dryRun - Whether this is a dry-run
 * @returns Markdown summary string
 */
export function generatePublishSummary(validations: PackagePublishValidation[], dryRun: boolean): string {
	const sections: string[] = [];

	// Header
	sections.push(`## \u{1F4E6} Publish Validation ${dryRun ? "\u{1F9EA} (Dry Run)" : ""}\n`);

	// Summary stats
	const totalPackages = validations.length;
	const readyPackages = validations.filter((v) => v.allTargetsValid).length;
	const totalTargets = validations.reduce((sum, v) => sum + v.targets.length, 0);
	const readyTargets = validations.reduce((sum, v) => sum + v.targets.filter((t) => t.canPublish).length, 0);

	sections.push("| Metric | Count |");
	sections.push("|--------|-------|");
	sections.push(`| Packages ready | ${readyPackages}/${totalPackages} |`);
	sections.push(`| Targets ready | ${readyTargets}/${totalTargets} |`);
	sections.push("");

	// Per-package details
	for (const pkg of validations) {
		const status = pkg.allTargetsValid ? "\u2705" : "\u274C";
		sections.push(`### ${status} ${pkg.name}@${pkg.version}\n`);

		// Handle discovery errors (package path or package.json not found)
		if (pkg.discoveryError) {
			sections.push(`**\u274C Error:** ${pkg.discoveryError}\n`);
			continue;
		}

		if (pkg.targets.length === 0) {
			sections.push("_No publish targets configured_\n");
			continue;
		}

		// Target table
		sections.push("| Protocol | Registry | Directory | Status | Provenance |");
		sections.push("|----------|----------|-----------|--------|------------|");

		for (const result of pkg.targets) {
			const { target } = result;
			const icon = getProtocolIcon(target.protocol);
			const registry = getRegistryDisplayName(target.registry);
			const dirName = target.directory.split("/").pop() || ".";
			const targetStatus = result.canPublish ? "\u2705 Ready" : `\u274C ${result.message}`;
			const provenance = target.provenance ? (result.provenanceReady ? "\u2705" : "\u26A0\uFE0F") : "\u2014";

			sections.push(`| ${icon} ${target.protocol} | ${registry} | \`${dirName}\` | ${targetStatus} | ${provenance} |`);
		}

		sections.push("");
	}

	// Legend
	sections.push("---");
	sections.push(
		"**Legend:** \u{1F4E6} npm-compatible | \u{1F995} JSR | \u2705 Ready | \u274C Failed | \u26A0\uFE0F Warning | \u2014 N/A",
	);

	return sections.join("\n");
}

/**
 * Result for a single target publish
 */
export interface TargetPublishResult {
	target: ResolvedTarget;
	success: boolean;
	registryUrl?: string;
	attestationUrl?: string;
	error?: string;
}

/**
 * Result for a package publish
 */
export interface PackagePublishResult {
	name: string;
	version: string;
	targets: TargetPublishResult[];
}

/**
 * Generate a markdown summary of actual publish results
 *
 * @param results - Array of package publish results
 * @param dryRun - Whether this is a dry-run
 * @returns Markdown summary string
 */
export function generatePublishResultsSummary(results: PackagePublishResult[], dryRun: boolean): string {
	const sections: string[] = [];

	// Header
	sections.push(`## \u{1F680} Publish Results ${dryRun ? "\u{1F9EA} (Dry Run)" : ""}\n`);

	for (const pkg of results) {
		const allSuccess = pkg.targets.every((t) => t.success);
		const status = allSuccess ? "\u2705" : "\u274C";
		sections.push(`### ${status} ${pkg.name}@${pkg.version}\n`);

		sections.push("| Registry | Status | Package URL | Provenance |");
		sections.push("|----------|--------|-------------|------------|");

		for (const result of pkg.targets) {
			const registry = getRegistryDisplayName(result.target.registry);
			const targetStatus = result.success ? "\u2705 Published" : `\u274C ${result.error}`;
			const packageUrl = result.registryUrl ? `[View](${result.registryUrl})` : "\u2014";
			const provenance = result.attestationUrl
				? `[View](${result.attestationUrl})`
				: result.target.provenance
					? "\u2705"
					: "\u2014";

			sections.push(`| ${registry} | ${targetStatus} | ${packageUrl} | ${provenance} |`);
		}

		sections.push("");
	}

	return sections.join("\n");
}
