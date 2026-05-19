import { basename } from "node:path";

import {
	GithubMarkdown,
	ReportBuilder,
	getRegistryDisplayName,
	isGitHubPackagesRegistry,
	isNpmRegistry,
} from "@savvy-web/github-action-effects";
import { inferBumpType } from "./publish.js";
import type { PackagePublishResult, PublishPackagesResult, TargetPublishResult, ValidationFinding } from "./types.js";

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
 * A single row of the validation checks table.
 *
 * @public
 */
export interface ChecksTableRow {
	/** Status icon: pass / warning / error. */
	readonly icon: "✅" | "⚠️" | "❌";
	/** The check's display name (e.g. `"Build Validation"`). */
	readonly name: string;
	/** Human-readable outcome line (e.g. `"1/1 target(s) ready"`). */
	readonly outcome: string;
	/** Check-run URL; when set, the name renders as a link. */
	readonly url?: string;
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
		// Remove scope from package name (e.g. @savvy-web/standalone-package -> standalone-package)
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
 * Humanise a raw byte count for display.
 *
 * @remarks
 * `0` renders as `0 B`; every positive value renders as kilobytes with one
 * decimal place (e.g. `716` → `0.7 kB`).
 *
 * @param bytes - Raw byte count.
 * @returns Human-readable size string.
 */
function humanizeSize(bytes: number): string {
	if (bytes === 0) {
		return "0 B";
	}
	return `${(bytes / 1000).toFixed(1)} kB`;
}

/**
 * Render the `Current → Next` cell for a package.
 */
function renderVersionTransition(pkg: PackagePublishResult): string {
	const base = pkg.baseVersion == null ? "—" : pkg.baseVersion;
	return `${base} → ${pkg.version}`;
}

/**
 * Render the `Bump` cell for a package — `🆕 new` for a brand-new package
 * (`null` base version), otherwise the inferred semver bump with its icon.
 */
function renderBumpCell(pkg: PackagePublishResult): string {
	if (pkg.baseVersion == null) {
		return "\u{1F195} new"; // 🆕
	}
	const bump = inferBumpType(pkg.baseVersion, pkg.version);
	return `${getBumpTypeIcon(bump)} ${bump}`;
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
 * Render the `Targets` summary cell for a package.
 */
function renderTargetsCell(pkg: PackagePublishResult, status: PackageStatus): string {
	if (pkg.targets.length === 0) {
		return "\u{1F3F7}️ Version only"; // 🏷️
	}
	const ready = pkg.targets.filter((t) => t.success || t.alreadyPublished).length;
	const total = pkg.targets.length;
	if (status === "success") {
		return `✅ ${ready}/${total} ready`;
	}
	if (status === "failed") {
		return `❌ ${ready}/${total}`;
	}
	return `⚠️ ${ready}/${total}`;
}

/**
 * Get the per-target status cell for the Details table.
 */
function getTargetDetailStatus(result: TargetPublishResult): string {
	if (result.alreadyPublished) {
		return "⏭️ Skipped";
	}
	if (result.success) {
		return "✅ Ready";
	}
	return "❌ Failed";
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build the "What will be released" markdown section from a
 * `PublishPackagesResult`.
 *
 * @remarks
 * Pure function — no I/O. Called by the Phase-2 validation handler; frames the
 * result as a forecast of what merging the release PR will publish. Renders a
 * summary table (current → next, bump, changeset count, targets), a legend, a
 * totals line, and a per-package Details block with packed/unpacked sizes.
 *
 * @param result - The publish packages result to summarise.
 * @param options - Optional display options.
 * @returns Markdown string.
 *
 * @public
 */
export function buildPublishSummary(result: PublishPackagesResult, options?: PublishSummaryOptions): string {
	const dryRun = options?.dryRun ?? false;
	const dryRunLabel = dryRun ? " \u{1F9EA} (Dry Run)" : "";
	const title = `\u{1F680} What will be released${dryRunLabel}`;

	// Summary table rows
	const tableRows: ReadonlyArray<ReadonlyArray<string>> = result.packages.map((pkg) => {
		const pkgStatus = getPackageStatus(pkg);
		const statusCell = getPackageStatusIcon(pkgStatus);
		const changesets = pkg.changesetCount === undefined ? "—" : String(pkg.changesetCount);

		return [
			statusCell,
			pkg.name,
			renderVersionTransition(pkg),
			renderBumpCell(pkg),
			changesets,
			renderTargetsCell(pkg, pkgStatus),
		];
	});

	const summaryTable = GithubMarkdown.table(
		[" ", "Package", "Current → Next", "Bump", "Changesets", "Targets"],
		tableRows,
	);

	const legend = "**Legend:** ✅ Ready · ⏭️ Skipped · ⚠️ Warning · ❌ Failed · 🔴 major · 🟡 minor · 🟢 patch";

	// Totals — sum the numeric byte sizes and file counts across all targets.
	let totalPacked = 0;
	let totalUnpacked = 0;
	let totalFiles = 0;
	let totalTargets = 0;
	let readyTargets = 0;
	for (const pkg of result.packages) {
		for (const t of pkg.targets) {
			totalTargets++;
			if (t.success || t.alreadyPublished) readyTargets++;
			if (t.packedSize !== undefined) totalPacked += t.packedSize;
			if (t.unpackedSize !== undefined) totalUnpacked += t.unpackedSize;
			if (t.fileCount !== undefined) totalFiles += t.fileCount;
		}
	}
	const totals =
		`**Totals:** \u{1F4E6} ${humanizeSize(totalPacked)} packed · ` +
		`\u{1F4C2} ${humanizeSize(totalUnpacked)} unpacked · ` +
		`\u{1F4C4} ${totalFiles} files · ` +
		`\u{1F3AF} ${readyTargets}/${totalTargets} targets ready`;

	const intro = "On merge, these packages publish:";
	const summarySection = `${intro}\n\n${summaryTable}\n\n${legend}\n\n${totals}`;

	// Per-package detail sections. Version-only packages (no publish targets)
	// are excluded — a `<details>` block around a header-only, zero-row table
	// is malformed output. They still appear in the summary table above with
	// the `🏷️ Version only` cell.
	const detailSections = result.packages
		.filter((pkg) => pkg.targets.length > 0)
		.map((pkg) => {
			const pkgStatus = getPackageStatus(pkg);
			const statusIcon = getPackageStatusIcon(pkgStatus);
			// `<summary>` does not render markdown — use a raw HTML <strong> tag.
			const summary = `<strong>${statusIcon} ${pkg.name}@${pkg.version}</strong>`;

			const targetRows: ReadonlyArray<ReadonlyArray<string>> = pkg.targets.map((t) => {
				const registry = getRegistryDisplayName(t.target.registry);
				const icon = getProtocolIcon(t.target.protocol);
				const targetStatus = getTargetDetailStatus(t);
				const directory = GithubMarkdown.code(basename(t.target.directory));
				const packed = t.packedSize === undefined ? "—" : humanizeSize(t.packedSize);
				const unpacked = t.unpackedSize === undefined ? "—" : humanizeSize(t.unpackedSize);
				const files = t.fileCount === undefined ? "—" : String(t.fileCount);
				const access = t.target.access;
				const provenance = t.target.provenance ? "✅" : "\u{1F6AB}"; // 🚫

				return [targetStatus, `${icon} ${registry}`, directory, packed, unpacked, files, access, provenance];
			});

			const targetTable = GithubMarkdown.table(
				[" ", "Registry", "Directory", "Packed", "Unpacked", "Files", "Access", "Provenance"],
				targetRows,
			);
			return GithubMarkdown.details(summary, targetTable);
		})
		.join("\n");

	let report = ReportBuilder.create(title).section("Summary", summarySection);

	if (detailSections.length > 0) {
		report = report.section("Details", detailSections);
	}

	return report.toMarkdown();
}

/**
 * Build the validation checks table.
 *
 * @remarks
 * Pure function — no I/O. Renders a `|   | Check | Outcome |` table; a row's
 * `Check` cell is a markdown link when the row carries a `url`, otherwise the
 * plain check name.
 *
 * @param rows - The checks to render.
 * @returns Markdown table string.
 *
 * @public
 */
export function buildChecksTable(rows: ReadonlyArray<ChecksTableRow>): string {
	const tableRows: ReadonlyArray<ReadonlyArray<string>> = rows.map((row) => {
		const checkCell = row.url ? GithubMarkdown.link(row.name, row.url) : row.name;
		return [row.icon, checkCell, row.outcome];
	});
	return GithubMarkdown.table([" ", "Check", "Outcome"], tableRows);
}

/**
 * Build the validation findings table.
 *
 * @remarks
 * Pure function — no I/O. Returns an empty string when `findings` is empty.
 * Otherwise renders a heading (`### <icons> N error(s) · M warning(s)`, with a
 * side omitted when its count is zero) and a table with all errors first
 * (discovery order), then all warnings.
 *
 * @param findings - The structured findings to render.
 * @returns Markdown string, or `""` when there are no findings.
 *
 * @public
 */
export function buildFindingsTable(findings: ReadonlyArray<ValidationFinding>): string {
	if (findings.length === 0) {
		return "";
	}

	const errors = findings.filter((f) => f.severity === "error");
	const warnings = findings.filter((f) => f.severity === "warning");

	const headingParts: string[] = [];
	if (errors.length > 0) {
		headingParts.push(`❌ ${errors.length} ${errors.length === 1 ? "error" : "errors"}`);
	}
	if (warnings.length > 0) {
		headingParts.push(`⚠️ ${warnings.length} ${warnings.length === 1 ? "warning" : "warnings"}`);
	}
	const heading = `### ${headingParts.join(" · ")}`;

	const ordered = [...errors, ...warnings];
	const tableRows: ReadonlyArray<ReadonlyArray<string>> = ordered.map((f) => {
		const icon = f.severity === "error" ? "❌" : "⚠️";
		return [icon, f.check, f.scope ?? "—", f.message];
	});
	const table = GithubMarkdown.table([" ", "Check", "Package", "Detail"], tableRows);

	return `${heading}\n\n${table}`;
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
