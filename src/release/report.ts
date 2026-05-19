import {
	GithubMarkdown,
	ReportBuilder,
	getRegistryDisplayName,
	isGitHubPackagesRegistry,
	isNpmRegistry,
} from "@savvy-web/github-action-effects";
import type { ValidationOutput } from "../schema/release-output.js";
import type { ResolvedSBOMMetadata } from "../types/sbom-config.js";

/**
 * The `validation` payload of a {@link ValidationOutput} — the single
 * build-centric object the comment renderers consume.
 *
 * @public
 */
export type ValidationPayload = ValidationOutput["validation"];

/** The publish sub-struct: ready flags, target counts, and build-centric packages. */
type ValidationPublish = ValidationPayload["publish"];

/** A released package with its builds, as carried by {@link ValidationOutput}. */
type ValidationPublishPackage = ValidationPublish["packages"][number];

/** A single build directory of a released package. */
type ValidationBuild = ValidationPublishPackage["builds"][number];

/** A single registry target under a build. */
type ValidationBuildTarget = ValidationBuild["targets"][number];

/** One row of the validation checks table. */
type ValidationCheck = ValidationPayload["checks"][number];

/** One non-pass validation outcome. */
type ValidationFinding = ValidationPayload["findings"][number];

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
		// Remove scope from package name (e.g. @savvy-web/standalone-package -> standalone-package)
		const pkgNameWithoutScope = packageName.startsWith("@") ? packageName.split("/")[1] : packageName;
		return `https://github.com/orgs/${repoOwner}/packages/npm/package/${pkgNameWithoutScope}`;
	}

	// Custom registries — no standard web UI
	return undefined;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Get the protocol icon emoji for a registry target.
 */
function getRegistryIcon(registry: string): string {
	// JSR is the only non-npm protocol the release pipeline emits; every other
	// registry (npm public, GitHub Packages, custom) renders with the npm icon.
	if (!isNpmRegistry(registry) && !isGitHubPackagesRegistry(registry) && /jsr/i.test(registry)) {
		return "\u{1F995}"; // 🦕
	}
	return "\u{1F4E6}"; // 📦
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
		case "new":
			return "\u{1F195}"; // 🆕
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
function renderVersionTransition(pkg: ValidationPublishPackage): string {
	const base = pkg.baseVersion == null ? "—" : pkg.baseVersion;
	return `${base} → ${pkg.version}`;
}

/**
 * Render the `Bump` cell for a package from the precomputed `bumpType`.
 */
function renderBumpCell(pkg: ValidationPublishPackage): string {
	if (pkg.bumpType === "new") {
		return "\u{1F195} new"; // 🆕
	}
	return `${getBumpTypeIcon(pkg.bumpType)} ${pkg.bumpType}`;
}

/**
 * Classify the overall publish status for a package.
 */
type PackageStatus = "success" | "skipped" | "partial" | "failed";

function getPackageStatus(pkg: ValidationPublishPackage): PackageStatus {
	const targets = pkg.builds.flatMap((b) => b.targets);
	if (targets.length === 0) return "success";

	const allSkipped = targets.every((t) => t.status === "skipped");
	if (allSkipped) return "skipped";

	const hasFailures = targets.some((t) => t.status === "failed");
	if (hasFailures) return "failed";

	const anySkipped = targets.some((t) => t.status === "skipped");
	if (anySkipped) return "partial";

	return "success";
}

/**
 * Get the status icon for a package.
 */
function getPackageStatusIcon(status: PackageStatus): string {
	switch (status) {
		case "success":
			return "✅";
		case "skipped":
			return "⏭️";
		case "partial":
			return "⚠️";
		case "failed":
			return "❌";
	}
}

/**
 * Render the `Targets` summary cell for a package.
 */
function renderTargetsCell(pkg: ValidationPublishPackage, status: PackageStatus): string {
	const targets = pkg.builds.flatMap((b) => b.targets);
	if (targets.length === 0) {
		return "\u{1F3F7}️ Version only"; // 🏷️
	}
	const ready = targets.filter((t) => t.status !== "failed").length;
	const total = targets.length;
	if (status === "success") {
		return `✅ ${ready}/${total} ready`;
	}
	if (status === "failed") {
		return `❌ ${ready}/${total}`;
	}
	return `⚠️ ${ready}/${total}`;
}

/**
 * Get the per-target status cell for a build's registry table.
 */
function getTargetDetailStatus(target: ValidationBuildTarget): string {
	switch (target.status) {
		case "skipped":
			return "⏭️ Skipped";
		case "failed":
			return "❌ Failed";
		case "ready":
			return "✅ Ready";
	}
}

/**
 * Render the directory + sizes + SBOM line for one build.
 *
 * @remarks
 * The directory is rendered verbatim — it is the build-relative output
 * directory (e.g. `dist/npm`) the build-centric `ValidationOutput` carries.
 */
function renderBuildHeadline(build: ValidationBuild): string {
	const directory = GithubMarkdown.code(build.directory);
	const packed = build.packedBytes === null ? "—" : humanizeSize(build.packedBytes);
	const unpacked = build.unpackedBytes === null ? "—" : humanizeSize(build.unpackedBytes);
	const files = build.fileCount === null ? "—" : String(build.fileCount);

	const parts = [
		`**${directory}**`,
		`\u{1F4E6} ${packed}`, // 📦
		`\u{1F4C2} ${unpacked}`, // 📂
		`\u{1F4C4} ${files} files`, // 📄
	];

	if (build.sbom !== null) {
		const ntia = build.sbom.ntiaCompliant ? "✅" : "⚠️";
		parts.push(`SBOM: ${build.sbom.componentCount} components · NTIA ${ntia}`);
	}

	return parts.join(" · ");
}

/**
 * Render one build's registry table.
 */
function renderBuildTargetsTable(build: ValidationBuild): string {
	const rows: ReadonlyArray<ReadonlyArray<string>> = build.targets.map((t) => {
		const registry = getRegistryDisplayName(t.registry);
		const icon = getRegistryIcon(t.registry);
		const provenance = t.provenance ? "✅" : "\u{1F6AB}"; // 🚫
		return [getTargetDetailStatus(t), `${icon} ${registry}`, t.access, provenance];
	});
	return GithubMarkdown.table([" ", "Registry", "Access", "Provenance"], rows);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build the "What will be released" markdown section from a
 * {@link ValidationOutput}'s `publish` payload.
 *
 * @remarks
 * Pure function — no I/O. Called by the Phase-2 validation handler; frames the
 * result as a forecast of what merging the release PR will publish. Renders a
 * summary table (current → next, bump, changeset count, targets), a legend, a
 * totals line, and a per-package Details block — one section per build
 * directory, each carrying the directory's sizes, SBOM line, and registry
 * table.
 *
 * @param publish - The build-centric publish payload to summarise.
 * @param options - Optional display options.
 * @returns Markdown string.
 *
 * @public
 */
export function buildPublishSummary(publish: ValidationPublish, options?: PublishSummaryOptions): string {
	const dryRun = options?.dryRun ?? false;
	const dryRunLabel = dryRun ? " \u{1F9EA} (Dry Run)" : "";
	const title = `\u{1F680} What will be released${dryRunLabel}`;

	// Summary table rows
	const tableRows: ReadonlyArray<ReadonlyArray<string>> = publish.packages.map((pkg) => {
		const pkgStatus = getPackageStatus(pkg);
		const statusCell = getPackageStatusIcon(pkgStatus);
		const changesets = pkg.changesetCount === null ? "—" : String(pkg.changesetCount);

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

	// Totals — sum the per-build byte sizes and file counts across all packages.
	let totalPacked = 0;
	let totalUnpacked = 0;
	let totalFiles = 0;
	let totalTargets = 0;
	let readyTargets = 0;
	for (const pkg of publish.packages) {
		for (const build of pkg.builds) {
			if (build.packedBytes !== null) totalPacked += build.packedBytes;
			if (build.unpackedBytes !== null) totalUnpacked += build.unpackedBytes;
			if (build.fileCount !== null) totalFiles += build.fileCount;
			for (const t of build.targets) {
				totalTargets++;
				if (t.status !== "failed") readyTargets++;
			}
		}
	}
	const totals =
		`**Totals:** \u{1F4E6} ${humanizeSize(totalPacked)} packed · ` +
		`\u{1F4C2} ${humanizeSize(totalUnpacked)} unpacked · ` +
		`\u{1F4C4} ${totalFiles} files · ` +
		`\u{1F3AF} ${readyTargets}/${totalTargets} targets ready`;

	const intro = "On merge, these packages publish:";
	const summarySection = `${intro}\n\n${summaryTable}\n\n${legend}\n\n${totals}`;

	// Per-package detail sections. Version-only packages (no builds) are
	// excluded — a `<details>` block around a header-only, zero-row table is
	// malformed output. They still appear in the summary table above with the
	// `🏷️ Version only` cell.
	const detailSections = publish.packages
		.filter((pkg) => pkg.builds.length > 0)
		.map((pkg) => {
			const pkgStatus = getPackageStatus(pkg);
			const statusIcon = getPackageStatusIcon(pkgStatus);
			// `<summary>` does not render markdown — use a raw HTML <strong> tag.
			const summary = `<strong>${statusIcon} ${pkg.name}@${pkg.version}</strong>`;

			// One section per build directory: directory + sizes + SBOM line, then
			// that build's registry table.
			const buildSections = pkg.builds
				.map((build) => `${renderBuildHeadline(build)}\n\n${renderBuildTargetsTable(build)}`)
				.join("\n\n");

			return GithubMarkdown.details(summary, buildSections);
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
 * `Check` cell is a markdown link when the row carries a non-`null` `url`,
 * otherwise the plain check name.
 *
 * @param checks - The {@link ValidationOutput} checks to render.
 * @returns Markdown table string.
 *
 * @public
 */
export function buildChecksTable(checks: ReadonlyArray<ValidationCheck>): string {
	const statusIcon = (status: ValidationCheck["status"]): "✅" | "⚠️" | "❌" =>
		status === "error" ? "❌" : status === "warning" ? "⚠️" : "✅";
	const tableRows: ReadonlyArray<ReadonlyArray<string>> = checks.map((check) => {
		const checkCell = check.url !== null ? GithubMarkdown.link(check.name, check.url) : check.name;
		return [statusIcon(check.status), checkCell, check.outcome];
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
 * @param findings - The structured {@link ValidationOutput} findings to render.
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
		const scopeCell =
			f.scope === null || f.scope.package === null
				? "—"
				: f.scope.directory === null
					? f.scope.package
					: `${f.scope.package} · ${f.scope.directory}`;
		return [icon, f.check, scopeCell, f.message];
	});
	const table = GithubMarkdown.table([" ", "Check", "Package", "Detail"], tableRows);

	return `${heading}\n\n${table}`;
}

/**
 * Display options for {@link buildValidationComment}.
 *
 * @public
 */
export interface ValidationCommentOptions {
	/** Web URL of the unified validation check run, for the release-notes link. */
	readonly releaseNotesUrl?: string | undefined;
	/** Whether this is a dry-run. */
	readonly dryRun?: boolean | undefined;
	/** Timestamp for the footer; defaults to the current time. Inject a fixed
	 * value to keep the function deterministic (e.g. in tests). */
	readonly now?: Date | undefined;
}

/**
 * Assemble the Phase-2 release-validation sticky-comment body from the
 * canonical {@link ValidationOutput} validation payload.
 *
 * @remarks
 * Pure function — no I/O. The comment is provably a projection of the exact
 * emitted JSON — checks, findings, and the build-centric publish forecast all
 * come from the one `validation` payload. Frames the comment as a forecast of
 * what merging the release PR will publish. The header icon is the worst state
 * across all `findings` (`❌` if any error, `⚠️` if any warning, else `✅`). A
 * findings section is inserted directly after the checks table only when
 * `findings` is non-empty. The hidden sticky-comment marker is added by
 * `updateStickyComment`, not here. The footer timestamp comes from
 * `options.now` (defaulting to the current time), so the function is
 * deterministic when `now` is supplied.
 *
 * @param validation - The canonical build-centric validation payload.
 * @param options - Optional display options.
 * @returns The full markdown comment body.
 *
 * @public
 */
export function buildValidationComment(validation: ValidationPayload, options?: ValidationCommentOptions): string {
	const dryRun = options?.dryRun ?? false;
	const hasError = validation.findings.some((f) => f.severity === "error");
	const hasWarning = validation.findings.some((f) => f.severity === "warning");
	const headerIcon = hasError ? "❌" : hasWarning ? "⚠️" : "✅";

	const parts: string[] = [];
	parts.push(`## \u{1F4E6} Release Validation ${headerIcon}`);

	if (dryRun) {
		parts.push("> \u{1F9EA} **DRY RUN MODE** - No actual publishing will occur");
	}

	parts.push(buildChecksTable(validation.checks));

	const findingsTable = buildFindingsTable(validation.findings);
	if (findingsTable !== "") {
		parts.push(findingsTable);
	}

	// `buildPublishSummary` always emits a non-empty section (it always renders
	// the "What will be released" heading), so it is pushed unconditionally.
	parts.push(buildPublishSummary(validation.publish, { dryRun }));

	const releaseNotesUrl = options?.releaseNotesUrl;
	const releaseNotes =
		releaseNotesUrl !== undefined && releaseNotesUrl !== ""
			? `### \u{1F4CB} Release Notes Preview\n\n${GithubMarkdown.link("View detailed release notes →", releaseNotesUrl)}`
			: "### \u{1F4CB} Release Notes Preview\n\n_Release notes will be generated on merge._";
	parts.push(releaseNotes);

	const now = options?.now ?? new Date();
	parts.push(`---\n\n<sub>Updated at ${now.toISOString()}</sub>`);

	return parts.join("\n\n");
}

/**
 * Get bump type icon for display in release reports.
 *
 * @param type - Bump type string (`major`, `minor`, `patch`, `new`).
 * @returns Emoji icon string.
 *
 * @public
 */
export { getBumpTypeIcon };

// ─── Per-step check-run summaries ─────────────────────────────────────────────

/**
 * Build the Publish Validation check-run markdown summary from the canonical
 * {@link ValidationOutput} validation payload.
 *
 * @remarks
 * Pure function — no I/O. Mirrors the build-grouped registry tables the sticky
 * comment's Details block carries, but flattened (no `<details>` wrapper) so
 * the check-run page renders them expanded. One section per released package,
 * one sub-section per build directory, each with its sizes, SBOM line, and
 * registry table.
 *
 * @param validation - The canonical build-centric validation payload.
 * @returns Markdown string for the check-run summary.
 *
 * @public
 */
export function buildPublishValidationSummary(validation: ValidationPayload): string {
	const publish = validation.publish;

	const header = `## \u{1F4E6} Publish Validation`;
	const totals =
		`**Targets ready:** ${publish.readyTargets}/${publish.totalTargets} · ` +
		`**npm:** ${publish.npmReady ? "✅" : "❌"} · ` +
		`**GitHub Packages:** ${publish.githubPackagesReady ? "✅" : "❌"}`;

	if (publish.packages.length === 0) {
		return `${header}\n\n${totals}\n\n_No packages with publish targets._`;
	}

	const sections: string[] = [header, totals];

	for (const pkg of publish.packages) {
		const pkgStatus = getPackageStatus(pkg);
		const statusIcon = getPackageStatusIcon(pkgStatus);
		sections.push(`### ${statusIcon} ${pkg.name}@${pkg.version}`);

		if (pkg.builds.length === 0) {
			sections.push("_Version-only package — no publish targets._");
			continue;
		}

		for (const buildEntry of pkg.builds) {
			sections.push(renderBuildHeadline(buildEntry));
			if (buildEntry.targets.length > 0) {
				sections.push(renderBuildTargetsTable(buildEntry));
			}
		}
	}

	return sections.join("\n\n");
}

/**
 * Build the Release Notes Preview check-run markdown summary from the
 * canonical {@link ValidationOutput} validation payload.
 *
 * @remarks
 * Pure function — no I/O. Renders the released-packages summary table the
 * sticky comment's summary section also shows (current → next, bump,
 * changeset count). When the consumer ever grows a rich release-notes module
 * this is the natural surface for it.
 *
 * @param validation - The canonical build-centric validation payload.
 * @returns Markdown string for the check-run summary.
 *
 * @public
 */
export function buildReleaseNotesPreviewSummary(validation: ValidationPayload): string {
	const header = `## \u{1F4CB} Release Notes Preview`;
	const packages = validation.publish.packages;

	if (packages.length === 0) {
		return `${header}\n\n_No packages are being released._`;
	}

	const tableRows: ReadonlyArray<ReadonlyArray<string>> = packages.map((pkg) => {
		const changesets = pkg.changesetCount === null ? "—" : String(pkg.changesetCount);
		return [pkg.name, renderVersionTransition(pkg), renderBumpCell(pkg), changesets];
	});
	const table = GithubMarkdown.table(["Package", "Current → Next", "Bump", "Changesets"], tableRows);

	const intro = `**${packages.length} package(s) ready for release notes generation on merge.**`;

	return [header, intro, table].join("\n\n");
}

/**
 * Build the SBOM Preview check-run markdown summary from the canonical
 * {@link ValidationOutput} validation payload, plus the per-build resolved
 * `sbom-config` metadata threaded through `runValidation`.
 *
 * @remarks
 * Pure function — no I/O. Per build: component count, NTIA pass/fail, the
 * missing NTIA fields, and the resolved `sbom-config` metadata used (rendered
 * as a fenced JSON block). When `resolvedSbomConfig` is `null` or its lookup
 * is empty for every build, surfaces a hint so config-or-mapping bugs are
 * immediately visible.
 *
 * The map is keyed by `${pkg.name}:${build.directory}` (the same key
 * `runValidation` writes).
 *
 * @param validation - The canonical build-centric validation payload.
 * @param resolvedSbomConfig - Per-build resolved sbom-config metadata, or
 *   `null` when no map was produced.
 * @returns Markdown string for the check-run summary.
 *
 * @public
 */
export function buildSbomPreviewSummary(
	validation: ValidationPayload,
	resolvedSbomConfig: ReadonlyMap<string, ResolvedSBOMMetadata | null> | null,
): string {
	const header = `## \u{1F50F} SBOM Preview`;
	const packages = validation.publish.packages;

	const hint =
		"> _No `sbom-config` resolved — supply via the `sbom-config` action input or `vars.SILK_RELEASE_SBOM_TEMPLATE`._";

	if (packages.length === 0) {
		return `${header}\n\n_No packages require an SBOM._\n\n${hint}`;
	}

	// True when no build for any package has a resolved sbom-config entry.
	const hasAnyResolved =
		resolvedSbomConfig !== null && Array.from(resolvedSbomConfig.values()).some((v) => v !== null && v !== undefined);

	const sections: string[] = [header];

	if (!hasAnyResolved) {
		sections.push(hint);
	}

	for (const pkg of packages) {
		sections.push(`### ${pkg.name}@${pkg.version}`);

		if (pkg.builds.length === 0) {
			sections.push("_Version-only package — no SBOM generated._");
			continue;
		}

		for (const buildEntry of pkg.builds) {
			const buildHeader = `**${GithubMarkdown.code(buildEntry.directory)}**`;
			sections.push(buildHeader);

			if (buildEntry.sbom === null) {
				sections.push("_SBOM not generated for this build._");
			} else {
				const ntiaIcon = buildEntry.sbom.ntiaCompliant ? "✅" : "⚠️";
				const ntiaLine = `SBOM: ${buildEntry.sbom.componentCount} components · NTIA ${ntiaIcon}`;
				sections.push(ntiaLine);
				if (!buildEntry.sbom.ntiaCompliant && buildEntry.sbom.missingNtiaFields.length > 0) {
					const missing = buildEntry.sbom.missingNtiaFields.join(", ");
					sections.push(`**Missing NTIA fields:** ${missing}`);
				}
			}

			const key = `${pkg.name}:${buildEntry.directory}`;
			const resolved = resolvedSbomConfig !== null ? (resolvedSbomConfig.get(key) ?? null) : null;
			if (resolved !== null) {
				sections.push("_Resolved `sbom-config` metadata used:_");
				sections.push(GithubMarkdown.codeBlock(JSON.stringify(resolved, null, 2), "json"));
			} else if (resolvedSbomConfig !== null) {
				// Map exists but no entry for this build — keep the per-build
				// rendering honest.
				sections.push("_No resolved `sbom-config` metadata for this build._");
			}
		}
	}

	return sections.join("\n\n");
}
