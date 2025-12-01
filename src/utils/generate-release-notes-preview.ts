import * as fs from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { findPackagePath } from "./find-package-path.js";
import type { ChangesetStatusResult } from "./get-changeset-status.js";
import { getChangesetStatus } from "./get-changeset-status.js";
import { summaryWriter } from "./summary-writer.js";

/**
 * Changeset configuration
 */
interface ChangesetConfig {
	fixed?: string[][];
	linked?: string[][];
}

/**
 * Read the changeset configuration file
 *
 * @returns Changeset config or null if not found/readable
 */
function readChangesetConfig(): ChangesetConfig | null {
	const configPath = path.join(process.cwd(), ".changeset", "config.json");

	try {
		if (fs.existsSync(configPath)) {
			const content = fs.readFileSync(configPath, "utf8");
			return JSON.parse(content) as ChangesetConfig;
		}
	} catch (error) {
		core.debug(`Failed to read changeset config: ${error instanceof Error ? error.message : String(error)}`);
	}

	return null;
}

/**
 * Find which fixed group a package belongs to
 *
 * @param packageName - Package name to look up
 * @param config - Changeset configuration
 * @returns Array of sibling package names in the same fixed group, or null if not in a fixed group
 */
function findFixedGroupSiblings(packageName: string, config: ChangesetConfig | null): string[] | null {
	if (!config?.fixed) return null;

	for (const group of config.fixed) {
		if (group.includes(packageName)) {
			// Return other packages in the group (excluding the package itself)
			return group.filter((name) => name !== packageName);
		}
	}

	return null;
}

/**
 * Generate explanatory release notes for a fixed package with no direct changes
 *
 * @param packageName - Package name
 * @param siblings - Sibling packages in the fixed group
 * @param releases - All releases from changeset status
 * @returns Explanatory release notes markdown
 */
function generateFixedPackageNotes(
	packageName: string,
	siblings: string[],
	releases: ChangesetStatusResult["releases"],
): string {
	// Find which siblings are actually being released
	const releasedSiblings = siblings.filter((sibling) => releases.some((r) => r.name === sibling));

	if (releasedSiblings.length === 0) {
		return "_This package has no direct changes but is being released due to fixed versioning._";
	}

	const siblingList = releasedSiblings.map((s) => `\`${s}\``).join(", ");
	const plural = releasedSiblings.length > 1 ? "packages" : "package";

	return `_This package has no direct changes but is being released because it shares fixed versioning with ${siblingList} which ${releasedSiblings.length > 1 ? "have" : "has"} changes._

This release maintains version alignment across the following ${plural}: ${[`\`${packageName}\``, ...releasedSiblings.map((s) => `\`${s}\``)].join(", ")}.`;
}

/**
 * Package release notes
 */
interface PackageReleaseNotes {
	/** Package name */
	name: string;
	/** Package version */
	version: string;
	/** Package path */
	path: string;
	/** Whether CHANGELOG exists */
	hasChangelog: boolean;
	/** Extracted release notes (if available) */
	notes: string;
	/** Error message if extraction failed */
	error?: string;
}

/**
 * Release notes preview result
 */
interface ReleaseNotesPreviewResult {
	/** Package release notes */
	packages: PackageReleaseNotes[];
	/** GitHub check run ID */
	checkId: number;
}

/**
 * Escapes all regex metacharacters in a string
 *
 * @param str - String to escape
 * @returns Escaped string safe for use in RegExp
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extracts version section from CHANGELOG
 *
 * @param changelogContent - CHANGELOG.md content
 * @param version - Version to extract
 * @returns Extracted release notes or error message
 */
function extractVersionSection(changelogContent: string, version: string): string {
	// Match version headings in various formats:
	// ## [1.0.0] - 2024-01-01
	// ## 1.0.0
	// # [1.0.0]
	// ### 1.0.0 (2024-01-01)
	const versionPattern = new RegExp(`^#+\\s+\\[?${escapeRegex(version)}\\]?.*$`, "im");

	const match = changelogContent.match(versionPattern);

	if (!match || match.index === undefined) {
		return "Could not find version section in CHANGELOG";
	}

	const startIndex = match.index;
	const lines = changelogContent.slice(startIndex).split("\n");

	// Find the end of this version section (next heading of same or higher level)
	/* v8 ignore next -- @preserve - Defensive: regex match always succeeds since we already matched heading pattern */
	const headingLevel = (match[0].match(/^#+/) || ["##"])[0].length;
	const endPattern = new RegExp(`^#{1,${headingLevel}}\\s+`);

	let endIndex = lines.length;
	for (let i = 1; i < lines.length; i++) {
		if (endPattern.test(lines[i])) {
			endIndex = i;
			break;
		}
	}

	// Extract and clean up the section
	const section = lines.slice(0, endIndex).join("\n").trim();

	// Remove the heading itself to just return the content
	const contentLines = section.split("\n").slice(1);
	return contentLines.join("\n").trim();
}

/**
 * Generates release notes preview for all packages
 *
 * @returns Release notes preview result
 *
 * @remarks
 * Uses workspace-tools to discover package paths from workspace configuration.
 * This handles cases where directory names don't match package names.
 */
export async function generateReleaseNotesPreview(): Promise<ReleaseNotesPreviewResult> {
	// Read all inputs
	const packageManager = core.getInput("package-manager") || "pnpm";
	const targetBranch = core.getInput("target-branch") || "main";
	const dryRun = core.getBooleanInput("dry-run") || false;
	const token = core.getInput("token", { required: true });
	const github = getOctokit(token);
	core.startGroup("Generating release notes preview");

	// Read changeset config to detect fixed groups
	const changesetConfig = readChangesetConfig();
	if (changesetConfig?.fixed && changesetConfig.fixed.length > 0) {
		core.debug(`Found ${changesetConfig.fixed.length} fixed group(s) in changeset config`);
	}

	// Get packages from changeset status (handles consumed changesets)
	const changesetStatus = await getChangesetStatus(packageManager, targetBranch);
	core.info(`Found ${changesetStatus.releases.length} package(s) to release`);

	const packageNotes: PackageReleaseNotes[] = [];

	for (const release of changesetStatus.releases) {
		core.info(`Processing ${release.name}@${release.newVersion}`);

		// Find package directory using workspace-tools
		const packagePath = findPackagePath(release.name);

		if (!packagePath) {
			core.warning(`Could not find package directory for ${release.name}`);
			packageNotes.push({
				name: release.name,
				version: release.newVersion,
				path: "",
				hasChangelog: false,
				notes: "",
				error: "Package directory not found",
			});
			continue;
		}

		// Check for CHANGELOG.md
		const changelogPath = path.join(packagePath, "CHANGELOG.md");

		if (!fs.existsSync(changelogPath)) {
			core.warning(`No CHANGELOG.md found for ${release.name}`);
			packageNotes.push({
				name: release.name,
				version: release.newVersion,
				path: packagePath,
				hasChangelog: false,
				notes: "",
				error: "CHANGELOG.md not found",
			});
			continue;
		}

		// Read and extract version section
		try {
			const changelogContent = fs.readFileSync(changelogPath, "utf8");
			let notes = extractVersionSection(changelogContent, release.newVersion);
			let extractionError: string | undefined;

			if (notes.startsWith("Could not find")) {
				extractionError = notes;
				notes = "";
			}

			// Check if notes are empty and package might be in a fixed group
			const hasNoNotes = !notes.trim();
			const fixedSiblings = hasNoNotes ? findFixedGroupSiblings(release.name, changesetConfig) : null;

			if (hasNoNotes && fixedSiblings && fixedSiblings.length > 0) {
				// This is a fixed package with no direct changes
				const fixedNotes = generateFixedPackageNotes(release.name, fixedSiblings, changesetStatus.releases);
				core.info(`✓ Generated fixed-version notes for ${release.name}@${release.newVersion}`);
				packageNotes.push({
					name: release.name,
					version: release.newVersion,
					path: packagePath,
					hasChangelog: true,
					notes: fixedNotes,
				});
			} else if (extractionError) {
				core.warning(`Could not extract version ${release.newVersion} from ${release.name} CHANGELOG`);
				packageNotes.push({
					name: release.name,
					version: release.newVersion,
					path: packagePath,
					hasChangelog: true,
					notes: "",
					error: extractionError,
				});
			} else {
				core.info(`✓ Extracted release notes for ${release.name}@${release.newVersion}`);
				packageNotes.push({
					name: release.name,
					version: release.newVersion,
					path: packagePath,
					hasChangelog: true,
					notes,
				});
			}
		} catch (error) {
			/* v8 ignore next -- @preserve - Defensive: handles non-Error throws (extremely rare) */
			const errorMsg = error instanceof Error ? error.message : String(error);
			core.warning(`Failed to read CHANGELOG for ${release.name}: ${errorMsg}`);
			packageNotes.push({
				name: release.name,
				version: release.newVersion,
				path: packagePath,
				hasChangelog: false,
				notes: "",
				error: errorMsg,
			});
		}
	}

	core.endGroup();

	// Create GitHub check run
	const checkTitle = dryRun ? "🧪 Release Notes Preview (Dry Run)" : "Release Notes Preview";
	const checkSummary =
		packageNotes.length > 0
			? `Preview of release notes for ${packageNotes.length} package(s)`
			: "No packages to release";

	// Build check details using summaryWriter (markdown, not HTML)
	const checkSections: Array<{ heading?: string; level?: 2 | 3; content: string }> = [
		{ heading: "Release Notes Preview", content: "" },
	];

	if (packageNotes.length > 0) {
		for (const pkg of packageNotes) {
			let content: string;
			if (pkg.error) {
				content = `⚠️ **Error**: ${pkg.error}`;
			} else if (pkg.notes) {
				content = pkg.notes;
			} else {
				content = "_No release notes available_";
			}
			checkSections.push({ heading: `${pkg.name} v${pkg.version}`, level: 3, content });
		}
	} else {
		checkSections.push({ content: "_No packages to release_" });
	}

	const checkDetails = summaryWriter.build(checkSections);

	const { data: checkRun } = await github.rest.checks.create({
		owner: context.repo.owner,
		repo: context.repo.repo,
		name: checkTitle,
		head_sha: context.sha,
		status: "completed",
		conclusion: "success",
		output: {
			title: checkSummary,
			summary: checkDetails,
		},
	});

	core.info(`Created check run: ${checkRun.html_url}`);

	// Write job summary using summaryWriter (markdown, not HTML)
	const jobSections: Array<{ heading?: string; level?: 2 | 3 | 4; content: string }> = [
		{ heading: checkTitle, content: checkSummary },
	];

	if (packageNotes.length > 0) {
		// Add summary table
		const summaryTable = summaryWriter.table(
			["Package", "Version", "Status"],
			packageNotes.map((pkg) => [
				pkg.name,
				pkg.version,
				pkg.error ? `⚠️ ${pkg.error}` : pkg.notes ? "✓ Notes available" : "⚠️ No notes",
			]),
		);
		jobSections.push({ heading: "Summary", level: 3, content: summaryTable });

		// Add full release notes
		jobSections.push({ heading: "Release Notes", level: 3, content: "" });

		for (const pkg of packageNotes) {
			let content: string;
			if (pkg.error) {
				content = `⚠️ **Error**: ${pkg.error}`;
			} else if (pkg.notes) {
				content = pkg.notes;
			} else {
				content = "_No release notes available_";
			}
			jobSections.push({ heading: `${pkg.name} v${pkg.version}`, level: 4, content });
		}
	} else {
		jobSections.push({ content: "_No packages to release_" });
	}

	await summaryWriter.write(summaryWriter.build(jobSections));

	return {
		packages: packageNotes,
		checkId: checkRun.id,
	};
}
