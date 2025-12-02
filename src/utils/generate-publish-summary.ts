import { context } from "@actions/github";
import type { PackagePublishValidation, PackageStats, ResolvedTarget } from "../types/publish-config.js";

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
 * Get bump type icon
 */
function getBumpTypeIcon(type: string): string {
	switch (type) {
		case "major":
			return "\u{1F534}"; // 🔴
		case "minor":
			return "\u{1F7E1}"; // 🟡
		case "patch":
			return "\u{1F7E2}"; // 🟢
		default:
			return "\u26AA"; // ⚪
	}
}

/**
 * Options for enhanced publish summary
 */
export interface PublishSummaryOptions {
	/** Map of package name to bump type (major, minor, patch) */
	bumpTypes?: Map<string, string>;
	/** Map of package name to changeset count */
	changesetCounts?: Map<string, number>;
}

/**
 * Get a GitHub link for a package path
 */
function getPackageGitHubLink(packagePath: string, packageName: string): string {
	if (!packagePath) return packageName;

	const cwd = process.cwd();
	const relativePath = packagePath.startsWith(cwd) ? packagePath.slice(cwd.length + 1) : packagePath;

	// Extract branch name from ref (e.g., refs/heads/main -> main)
	const ref = context.ref.replace("refs/heads/", "").replace("refs/pull/", "pull/").replace("/merge", "");

	const url = `https://github.com/${context.repo.owner}/${context.repo.repo}/tree/${ref}/${relativePath}`;
	return `[${packageName}](${url})`;
}

/**
 * Parse size string to bytes for aggregation
 */
function parseSizeToBytes(size: string): number {
	const match = size.match(/^([\d.]+)\s*(B|kB|MB|GB)$/i);
	if (!match) return 0;

	const value = Number.parseFloat(match[1]);
	const unit = match[2].toLowerCase();

	switch (unit) {
		case "b":
			return value;
		case "kb":
			return value * 1024;
		case "mb":
			return value * 1024 * 1024;
		case "gb":
			return value * 1024 * 1024 * 1024;
		default:
			return 0;
	}
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Get the best stats from a package's targets (first available)
 */
function getPackageStats(validation: PackagePublishValidation): PackageStats | undefined {
	for (const target of validation.targets) {
		if (target.stats?.packageSize) {
			return target.stats;
		}
	}
	return undefined;
}

/**
 * Generate a markdown summary of publish validation results
 *
 * @param validations - Array of package publish validations
 * @param dryRun - Whether this is a dry-run
 * @param options - Optional enhancement options
 * @returns Markdown summary string
 */
export function generatePublishSummary(
	validations: PackagePublishValidation[],
	dryRun: boolean,
	options?: PublishSummaryOptions,
): string {
	const sections: string[] = [];
	const { bumpTypes, changesetCounts } = options || {};

	// Header
	sections.push(`## \u{1F4E6} Publish Validation ${dryRun ? "\u{1F9EA} (Dry Run)" : ""}\n`);

	// Enhanced summary table with all packages
	const totalPackages = validations.length;
	const readyPackages = validations.filter((v) => v.allTargetsValid).length;
	const totalTargets = validations.reduce((sum, v) => sum + v.targets.length, 0);
	const readyTargets = validations.reduce((sum, v) => sum + v.targets.filter((t) => t.canPublish).length, 0);

	// Package summary table with enhanced columns
	sections.push("| Package | Version | Bump | Size | Status |");
	sections.push("|---------|---------|------|------|--------|");

	// Aggregate stats
	let totalPackedBytes = 0;
	let totalUnpackedBytes = 0;
	let totalFileCount = 0;

	for (const pkg of validations) {
		const status = pkg.allTargetsValid ? "\u2705" : "\u274C";

		// Package name with link
		const packageLink = getPackageGitHubLink(pkg.path, pkg.name);

		// Bump type with icon
		const bumpType = bumpTypes?.get(pkg.name) || "";
		const bumpIcon = bumpType ? getBumpTypeIcon(bumpType) : "";
		const bumpDisplay = bumpType ? `${bumpIcon} ${bumpType}` : "\u{1F6AB}";

		// Changeset count
		const changesetCount = changesetCounts?.get(pkg.name) || 0;
		const changesetDisplay = changesetCount > 0 ? ` (${changesetCount})` : "";

		// Package size from stats
		const stats = getPackageStats(pkg);
		let sizeDisplay = "\u{1F6AB}";
		if (stats?.packageSize) {
			sizeDisplay = stats.packageSize;
			totalPackedBytes += parseSizeToBytes(stats.packageSize);
		}
		if (stats?.unpackedSize) {
			totalUnpackedBytes += parseSizeToBytes(stats.unpackedSize);
		}
		if (stats?.totalFiles) {
			totalFileCount += stats.totalFiles;
		}

		sections.push(
			`| ${packageLink} | ${pkg.version}${changesetDisplay} | ${bumpDisplay} | ${sizeDisplay} | ${status} |`,
		);
	}

	sections.push("");

	// Aggregate metrics
	if (totalPackedBytes > 0 || totalFileCount > 0) {
		sections.push("**Totals:**");
		const totals: string[] = [];
		if (totalPackedBytes > 0) {
			totals.push(`\u{1F4E6} ${formatBytes(totalPackedBytes)} packed`);
		}
		if (totalUnpackedBytes > 0) {
			totals.push(`\u{1F4C2} ${formatBytes(totalUnpackedBytes)} unpacked`);
		}
		if (totalFileCount > 0) {
			totals.push(`\u{1F4C4} ${totalFileCount} files`);
		}
		totals.push(`\u{1F3AF} ${readyTargets}/${totalTargets} targets ready`);
		sections.push(totals.join(" \u2022 "));
		sections.push("");
	} else {
		// Fallback simple stats
		sections.push(
			`**Summary:** ${readyPackages}/${totalPackages} packages ready, ${readyTargets}/${totalTargets} targets ready\n`,
		);
	}

	// Per-package details in collapsible sections
	const packagesWithTargets = validations.filter((v) => v.targets.length > 0 || v.discoveryError);
	if (packagesWithTargets.length > 0) {
		sections.push("<details>");
		sections.push("<summary><strong>\u{1F4CB} Target Details</strong></summary>\n");

		for (const pkg of packagesWithTargets) {
			const status = pkg.allTargetsValid ? "\u2705" : "\u274C";
			sections.push(`#### ${status} ${pkg.name}@${pkg.version}\n`);

			// Handle discovery errors (package path or package.json not found)
			if (pkg.discoveryError) {
				sections.push(`**\u274C Error:** ${pkg.discoveryError}\n`);
				continue;
			}

			// At this point, targets.length > 0 is guaranteed by the filter above

			// Show stats if available
			const stats = getPackageStats(pkg);
			if (stats) {
				const statParts: string[] = [];
				if (stats.packageSize) statParts.push(`Packed: ${stats.packageSize}`);
				if (stats.unpackedSize) statParts.push(`Unpacked: ${stats.unpackedSize}`);
				if (stats.totalFiles) statParts.push(`Files: ${stats.totalFiles}`);
				if (statParts.length > 0) {
					sections.push(`> ${statParts.join(" \u2022 ")}\n`);
				}
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
				const provenance = target.provenance ? (result.provenanceReady ? "\u2705" : "\u26A0\uFE0F") : "\u{1F6AB}";

				sections.push(
					`| ${icon} ${target.protocol} | ${registry} | \`${dirName}\` | ${targetStatus} | ${provenance} |`,
				);
			}

			sections.push("");
		}

		sections.push("</details>\n");
	}

	// Legend
	sections.push("---");
	sections.push(
		"**Legend:** \u{1F534} major | \u{1F7E1} minor | \u{1F7E2} patch | \u{1F4E6} npm | \u{1F995} JSR | \u2705 Ready | \u274C Failed | \u{1F6AB} N/A",
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
			const packageUrl = result.registryUrl ? `[View](${result.registryUrl})` : "\u{1F6AB}";
			const provenance = result.attestationUrl
				? `[View](${result.attestationUrl})`
				: result.target.provenance
					? "\u2705"
					: "\u{1F6AB}";

			sections.push(`| ${registry} | ${targetStatus} | ${packageUrl} | ${provenance} |`);
		}

		sections.push("");
	}

	return sections.join("\n");
}
