import {
	GithubMarkdown,
	ReportBuilder,
	getRegistryDisplayName,
	isGitHubPackagesRegistry,
	isNpmRegistry,
} from "@savvy-web/github-action-effects";
import type { PackagePublishResult, PublishPackagesResult, TargetPublishResult } from "./types.js";

/**
 * Options for the publish summary report.
 *
 * @public
 */
export interface PublishSummaryOptions {
	/** Whether this is a dry-run. */
	dryRun?: boolean | undefined;
}

/**
 * Get the web URL for a package page on a registry.
 *
 * @param registry - Registry URL (e.g., `https://registry.npmjs.org`), or `null` for JSR.
 * @param packageName - Package name (e.g., `@savvy-web/standalone-package`).
 * @param version - Package version (e.g., `1.0.0`).
 * @param owner - Repository owner, required for GitHub Packages URL construction.
 * @returns URL to the package page, or `undefined` if the registry has no web UI.
 *
 * @public
 */
export function getPackagePageUrl(
	registry: string | null,
	packageName: string,
	version: string,
	owner?: string | undefined,
): string | undefined {
	if (!registry) {
		// JSR
		return `https://jsr.io/${packageName}@${version}`;
	}

	if (isNpmRegistry(registry)) {
		// npm public registry
		return `https://www.npmjs.com/package/${packageName}/v/${version}`;
	}

	if (isGitHubPackagesRegistry(registry)) {
		// GitHub Packages — URL format:
		// https://github.com/orgs/{owner}/packages/npm/package/{package-name-without-scope}
		const repoOwner = owner ?? "unknown";
		// Remove scope from package name (e.g., @savvy-web/standalone-package -> standalone-package)
		const pkgNameWithoutScope = packageName.startsWith("@") ? packageName.split("/")[1] : packageName;
		return `https://github.com/orgs/${repoOwner}/packages/npm/package/${pkgNameWithoutScope}`;
	}

	// Custom registries — no standard web UI
	return undefined;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Get the protocol icon emoji for a target.
 */
function getProtocolIcon(protocol: string): string {
	switch (protocol) {
		case "npm":
			return "\u{1F4E6}"; // 📦
		case "jsr":
			return "\u{1F995}"; // 🦕
		default:
			return "\u{1F4E6}";
	}
}

/**
 * Get the bump type icon emoji.
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
			return "⚪"; // ⚪
	}
}

/**
 * Classify the overall publish status for a package.
 */
type PackageStatus = "success" | "skipped" | "partial" | "failed";

function getPackageStatus(pkg: PackagePublishResult): PackageStatus {
	if (pkg.targets.length === 0) return "success";

	const allSkipped = pkg.targets.every((t) => t.alreadyPublished);
	if (allSkipped) return "skipped";

	const hasFailures = pkg.targets.some((t) => !t.success && !t.alreadyPublished);
	if (hasFailures) return "failed";

	const anySkipped = pkg.targets.some((t) => t.alreadyPublished);
	if (anySkipped) return "partial";

	return "success";
}

/**
 * Get the status icon for a package.
 */
function getPackageStatusIcon(status: PackageStatus): string {
	switch (status) {
		case "success":
			return "✅"; // ✅
		case "skipped":
			return "⏭️"; // ⏭️
		case "partial":
			return "⚠️"; // ⚠️
		case "failed":
			return "❌"; // ❌
	}
}

/**
 * Get the display status for a single target result.
 */
function getTargetStatusCell(result: TargetPublishResult): string {
	if (result.alreadyPublished) {
		switch (result.alreadyPublishedReason) {
			case "identical":
				return "⏭️ Skipped (identical)";
			case "different":
				return "❌ Content mismatch";
			default:
				return "⚠️ Skipped (unverified)";
		}
	}
	if (result.success) return "✅ Published";
	return "❌ Failed";
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a markdown publish-results summary from a `PublishPackagesResult`.
 *
 * @remarks
 * Pure function — no I/O, no `_actions-compat`. The caller is responsible for
 * writing the returned string to a comment, step summary, or check run.
 *
 * @param result - The publish packages result to summarise.
 * @param options - Optional display options.
 * @returns Markdown string.
 *
 * @public
 */
export function buildPublishSummary(result: PublishPackagesResult, options?: PublishSummaryOptions): string {
	const dryRun = options?.dryRun ?? false;

	const allSuccess = result.packages.every((p) => p.targets.every((t) => t.success || t.alreadyPublished));
	const statusIcon = allSuccess ? "✅" : "❌";
	const dryRunLabel = dryRun ? " \u{1F9EA} (Dry Run)" : "";

	const title = `\u{1F680} Publish Results ${statusIcon}${dryRunLabel}`;

	// Summary table rows
	const tableRows: ReadonlyArray<ReadonlyArray<string>> = result.packages.map((pkg) => {
		const pkgStatus = getPackageStatus(pkg);
		const statusCell = getPackageStatusIcon(pkgStatus);
		const successCount = pkg.targets.filter((t) => t.success || t.alreadyPublished).length;
		const targetSummary =
			pkg.targets.length === 0
				? "\u{1F3F7}️ Version only"
				: pkgStatus === "success"
					? `✅ ${pkg.targets.length}/${pkg.targets.length}`
					: pkgStatus === "failed"
						? `❌ ${successCount}/${pkg.targets.length}`
						: `⚠️ ${successCount}/${pkg.targets.length}`;

		return [statusCell, pkg.name, pkg.version, targetSummary];
	});

	const summaryTable = GithubMarkdown.table([" ", "Package", "Version", "Targets"], tableRows);

	// Per-package detail sections
	const detailSections = result.packages
		.map((pkg) => {
			const pkgStatus = getPackageStatus(pkg);
			const statusIcon2 = getPackageStatusIcon(pkgStatus);
			// `<summary>` does not render markdown — use a raw HTML <strong> tag
			// so the heading is bold inside the collapsed <details> block.
			const summary = `<strong>${statusIcon2} ${pkg.name}@${pkg.version}</strong>`;

			// Target table rows
			const targetRows: ReadonlyArray<ReadonlyArray<string>> = pkg.targets.map((result2) => {
				const registry = getRegistryDisplayName(result2.target.registry);
				const icon = getProtocolIcon(result2.target.protocol);
				const targetStatus = getTargetStatusCell(result2);
				const packageUrl = result2.registryUrl ? GithubMarkdown.link("View", result2.registryUrl) : "\u{1F6AB}";
				const provenance = result2.attestationUrl
					? GithubMarkdown.link("View", result2.attestationUrl)
					: result2.target.provenance
						? "✅"
						: "\u{1F6AB}";

				return [targetStatus, `${icon} ${registry}`, packageUrl, provenance];
			});

			const targetTable = GithubMarkdown.table([" ", "Registry", "Package URL", "Provenance"], targetRows);
			return GithubMarkdown.details(summary, targetTable);
		})
		.join("\n");

	// Build the report using ReportBuilder
	let report = ReportBuilder.create(title).section("Summary", summaryTable);

	if (detailSections.length > 0) {
		report = report.section("Details", detailSections);
	}

	return report.toMarkdown();
}

/**
 * Get bump type icon for display in release reports.
 *
 * @param type - Bump type string (`major`, `minor`, `patch`).
 * @returns Emoji icon string.
 *
 * @public
 */
export { getBumpTypeIcon };
