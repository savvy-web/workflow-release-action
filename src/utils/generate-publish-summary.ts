import { context } from "@actions/github";
import type { PackagePublishValidation, PackageStats, ResolvedTarget } from "../types/publish-config.js";
import type { PublishPackagesResult } from "./publish-packages.js";

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

	// Package summary table with enhanced columns (status column leftmost with empty header)
	sections.push("|   | Package | Version | Bump | Size | Changesets |");
	sections.push("|---|---------|---------|------|------|------------|");

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

		// Changeset count for notes column
		const changesetCount = changesetCounts?.get(pkg.name) || 0;
		const notesDisplay =
			changesetCount > 0 ? `${changesetCount} changeset${changesetCount > 1 ? "s" : ""}` : "\u{1F6AB}";

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
			`| ${status} | ${packageLink} | ${pkg.version} | ${bumpDisplay} | ${sizeDisplay} | ${notesDisplay} |`,
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

	// Per-package details in individual collapsible sections
	// Expanded by default if there are errors, collapsed if all targets are valid
	const packagesWithTargets = validations.filter((v) => v.targets.length > 0 || v.discoveryError);
	if (packagesWithTargets.length > 0) {
		for (const pkg of packagesWithTargets) {
			const status = pkg.allTargetsValid ? "\u2705" : "\u274C";
			// Open if there are errors (not all targets valid)
			const openAttr = pkg.allTargetsValid ? "" : " open";
			sections.push(`<details${openAttr}>`);
			sections.push(`<summary><strong>${status} ${pkg.name}@${pkg.version}</strong></summary>\n`);

			// Handle discovery errors (package path or package.json not found)
			if (pkg.discoveryError) {
				sections.push(`**\u274C Error:** ${pkg.discoveryError}\n`);
				sections.push("</details>\n");
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

			// Target table (status column leftmost with empty header)
			sections.push("|   | Protocol | Registry | Directory | \u{1F50F} Provenance |");
			sections.push("|---|----------|----------|-----------|---------------|");

			for (const result of pkg.targets) {
				const { target } = result;
				const icon = getProtocolIcon(target.protocol);
				const registry = getRegistryDisplayName(target.registry);
				// Show last 2 path segments for better context (e.g., "dist/npm" instead of just "npm")
				const pathParts = target.directory.split("/").filter(Boolean);
				const dirName = pathParts.length > 1 ? pathParts.slice(-2).join("/") : pathParts.pop() || ".";
				const targetStatus = result.canPublish ? "\u2705 Ready" : `\u274C ${result.message}`;
				const provenance = target.provenance ? (result.provenanceReady ? "\u2705" : "\u26A0\uFE0F") : "\u{1F6AB}";

				sections.push(
					`| ${targetStatus} | ${icon} ${target.protocol} | ${registry} | \`${dirName}\` | ${provenance} |`,
				);
			}

			sections.push("");
			sections.push("</details>\n");
		}
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
	/** Full stdout from publish command */
	stdout?: string;
	/** Full stderr from publish command */
	stderr?: string;
	/** Exit code from publish command */
	exitCode?: number;
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
 * Categorize common publish errors for better diagnostics
 */
function categorizeError(error: string, stderr: string, registry?: string | null): { category: string; hint: string } {
	const combined = `${error} ${stderr}`.toLowerCase();
	const isGitHubPackages = registry?.includes("pkg.github.com");

	// GitHub Packages specific errors
	if (isGitHubPackages) {
		if (combined.includes("organization") || combined.includes("org packages")) {
			return {
				category: "🏢 Organization Packages Permission",
				hint: "The GitHub App needs 'Organization packages: Write' permission. Configure this in your GitHub App settings on github.com, then request the permission in create-github-app-token with `permission-organization_packages: write`",
			};
		}

		if (combined.includes("403") || combined.includes("forbidden") || combined.includes("not allowed")) {
			return {
				category: "🔒 GitHub Packages Permission",
				hint: "The GitHub App token needs 'packages:write' permission. Add `permission-packages: write` to your create-github-app-token step",
			};
		}

		if (combined.includes("401") || combined.includes("unauthorized")) {
			return {
				category: "🔐 GitHub Packages Auth Error",
				hint: "Ensure the GitHub App token is being passed to the action. The token should be set to GITHUB_TOKEN for npm publish",
			};
		}
	}

	// npm OIDC errors
	if (combined.includes("trusted publishing") || combined.includes("oidc")) {
		return {
			category: "🔑 OIDC Trusted Publishing Error",
			hint: "For npm OIDC publishing: 1) Add `id-token: write` permission, 2) Configure trusted publishing on npmjs.com for your package",
		};
	}

	if (combined.includes("401") || combined.includes("unauthorized") || combined.includes("authentication")) {
		return {
			category: "🔐 Authentication Error",
			hint: "Check that the required token is provided. For npm, ensure trusted publishing is configured on npmjs.com",
		};
	}

	if (combined.includes("403") || combined.includes("forbidden") || combined.includes("not allowed")) {
		return {
			category: "🚫 Permission Error",
			hint: "The token may lack required permissions (e.g., packages:write for GitHub Packages, id-token:write for npm provenance)",
		};
	}

	if (combined.includes("404") || combined.includes("not found")) {
		return {
			category: "❓ Not Found Error",
			hint: "The package, scope, or registry may not exist or be accessible",
		};
	}

	if (combined.includes("conflict") || combined.includes("409") || combined.includes("already exists")) {
		return {
			category: "⚠️ Version Conflict",
			hint: "This version may already be published. Check if the version needs to be bumped",
		};
	}

	if (combined.includes("id-token") || combined.includes("sigstore")) {
		return {
			category: "🔑 Provenance Error",
			hint: "Add `id-token: write` permission to the workflow for npm provenance attestations via Sigstore",
		};
	}

	if (combined.includes("attestation") || combined.includes("intoto")) {
		return {
			category: "📜 Attestation Error",
			hint: "Add `attestations: write` permission to the workflow for GitHub Attestations API",
		};
	}

	if (combined.includes("npm err!") || combined.includes("enpm")) {
		return {
			category: "📦 NPM Error",
			hint: "Check npm configuration and registry settings",
		};
	}

	return {
		category: "❌ Publish Error",
		hint: "Review the error output below for details",
	};
}

/**
 * Truncate long output for display
 */
function truncateOutput(output: string, maxLines: number = 20): string {
	const lines = output.trim().split("\n");
	if (lines.length <= maxLines) return output.trim();
	return [...lines.slice(0, maxLines), `... (${lines.length - maxLines} more lines)`].join("\n");
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

	// Calculate overall stats
	const totalPackages = results.length;
	const successPackages = results.filter((p) => p.targets.every((t) => t.success)).length;
	const totalTargets = results.reduce((sum, p) => sum + p.targets.length, 0);
	const successTargets = results.reduce((sum, p) => sum + p.targets.filter((t) => t.success).length, 0);
	const allSuccess = successPackages === totalPackages;

	// Header with overall status
	const statusIcon = allSuccess ? "\u2705" : "\u274C";
	sections.push(`## \u{1F680} Publish Results ${statusIcon} ${dryRun ? "\u{1F9EA} (Dry Run)" : ""}\n`);

	// Overall summary
	if (!allSuccess) {
		sections.push(
			`> **\u26A0\uFE0F Publishing failed:** ${successPackages}/${totalPackages} packages, ${successTargets}/${totalTargets} targets succeeded\n`,
		);
	}

	// Summary table (status column leftmost with empty header)
	sections.push("|   | Package | Version | Targets |");
	sections.push("|---|---------|---------|---------|");

	for (const pkg of results) {
		const pkgSuccess = pkg.targets.every((t) => t.success);
		const status = pkgSuccess ? "\u2705" : "\u274C";
		const successCount = pkg.targets.filter((t) => t.success).length;
		const targetSummary = pkgSuccess
			? `\u2705 ${pkg.targets.length}/${pkg.targets.length}`
			: `\u274C ${successCount}/${pkg.targets.length}`;
		sections.push(`| ${status} | ${pkg.name} | ${pkg.version} | ${targetSummary} |`);
	}
	sections.push("");

	// Detailed results per package
	for (const pkg of results) {
		const allPkgSuccess = pkg.targets.every((t) => t.success);
		const status = allPkgSuccess ? "\u2705" : "\u274C";

		// Only show expanded details if there are failures
		const openAttr = allPkgSuccess ? "" : " open";
		sections.push(`<details${openAttr}>`);
		sections.push(`<summary><strong>${status} ${pkg.name}@${pkg.version}</strong></summary>\n`);

		sections.push("|   | Registry | Package URL | Provenance |");
		sections.push("|---|----------|-------------|------------|");

		for (const result of pkg.targets) {
			const registry = getRegistryDisplayName(result.target.registry);
			const targetStatus = result.success ? "\u2705 Published" : "\u274C Failed";
			const packageUrl = result.registryUrl ? `[View](${result.registryUrl})` : "\u{1F6AB}";
			const provenance = result.attestationUrl
				? `[View](${result.attestationUrl})`
				: result.target.provenance
					? "\u2705"
					: "\u{1F6AB}";

			sections.push(`| ${targetStatus} | ${registry} | ${packageUrl} | ${provenance} |`);
		}

		// Show error details for failed targets
		const failedTargets = pkg.targets.filter((t) => !t.success);
		if (failedTargets.length > 0) {
			sections.push("");
			sections.push("#### \u{1F6A8} Error Details\n");

			for (const result of failedTargets) {
				const registry = getRegistryDisplayName(result.target.registry);
				const { category, hint } = categorizeError(result.error || "", result.stderr || "", result.target.registry);

				sections.push(`**${registry}** - ${category}\n`);
				sections.push(`> \u{1F4A1} ${hint}\n`);

				// Show exit code if available
				if (result.exitCode !== undefined && result.exitCode !== 0) {
					sections.push(`**Exit Code:** ${result.exitCode}\n`);
				}

				// Show error message
				if (result.error) {
					sections.push(`**Error:** ${result.error}\n`);
				}

				// Show stderr output (most useful for debugging)
				if (result.stderr?.trim()) {
					sections.push("<details>");
					sections.push("<summary>stderr output</summary>\n");
					sections.push("```");
					sections.push(truncateOutput(result.stderr));
					sections.push("```");
					sections.push("</details>\n");
				}

				// Show stdout output
				if (result.stdout?.trim()) {
					sections.push("<details>");
					sections.push("<summary>stdout output</summary>\n");
					sections.push("```");
					sections.push(truncateOutput(result.stdout));
					sections.push("```");
					sections.push("</details>\n");
				}
			}
		}

		sections.push("</details>\n");
	}

	// Permission requirements reminder if any failures
	if (!allSuccess) {
		sections.push("---");
		sections.push("### \u{1F510} Required Permissions\n");
		sections.push("**Workflow permissions:**\n");
		sections.push("```yaml");
		sections.push("permissions:");
		sections.push("  contents: write    # For git tags and releases");
		sections.push("  packages: write    # For GitHub Packages");
		sections.push("  id-token: write    # For npm OIDC and provenance (Sigstore)");
		sections.push("  attestations: write # For GitHub Attestations API");
		sections.push("```\n");
		sections.push("**GitHub App token (create-github-app-token):**\n");
		sections.push("```yaml");
		sections.push("- uses: actions/create-github-app-token@v2");
		sections.push("  with:");
		// Use string concatenation to avoid template literal detection
		sections.push("    app-id: $" + "{{ secrets.APP_ID }}");
		sections.push("    private-key: $" + "{{ secrets.APP_PRIVATE_KEY }}");
		sections.push("    permission-packages: write           # For GitHub Packages");
		sections.push("    permission-organization_packages: write  # For org packages");
		sections.push("```\n");
		sections.push("> **Note:** npm uses OIDC trusted publishing - no NPM_TOKEN needed.\n");
		sections.push("> Configure trusted publishing at https://www.npmjs.com/settings/packages\n");
	}

	return sections.join("\n");
}

/**
 * Generate a markdown summary for build failures
 *
 * @param publishResult - The publish result containing build error info
 * @param dryRun - Whether this is a dry-run
 * @returns Markdown summary string
 */
export function generateBuildFailureSummary(publishResult: PublishPackagesResult, dryRun: boolean): string {
	const sections: string[] = [];

	sections.push(`## \u{1F6A8} Build Failed ${dryRun ? "\u{1F9EA} (Dry Run)" : ""}\n`);
	sections.push("> Publishing was aborted because the build step failed.\n");

	if (publishResult.buildError) {
		sections.push("### Error\n");
		sections.push("```");
		sections.push(truncateOutput(publishResult.buildError, 30));
		sections.push("```\n");
	}

	if (publishResult.buildOutput) {
		sections.push("<details>");
		sections.push("<summary>Build output</summary>\n");
		sections.push("```");
		sections.push(truncateOutput(publishResult.buildOutput, 50));
		sections.push("```");
		sections.push("</details>\n");
	}

	sections.push("### \u{1F4A1} Troubleshooting\n");
	sections.push("1. Check that the `ci:build` script exists in your package.json");
	sections.push("2. Run `pnpm ci:build` locally to reproduce the error");
	sections.push("3. Ensure all dependencies are installed correctly");
	sections.push("4. Check for TypeScript errors: `pnpm typecheck`\n");

	return sections.join("\n");
}
