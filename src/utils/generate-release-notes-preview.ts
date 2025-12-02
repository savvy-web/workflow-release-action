import * as fs from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";
import { context } from "@actions/github";
import type { PackagePublishValidation } from "../types/publish-config.js";
import { findPackagePath } from "./find-package-path.js";
import type { ChangesetStatusResult } from "./get-changeset-status.js";
import { getChangesetStatus } from "./get-changeset-status.js";
import {
	countChangesetsPerPackage,
	findPackageGroup,
	formatSkipReason,
	getAllWorkspacePackages,
	getBumpTypeIcon,
	getGroupIcon,
	getSkipReason,
	isFirstRelease,
	readChangesetConfig,
} from "./release-summary-helpers.js";
import { getRegistryDisplayName } from "./resolve-targets.js";
import { summaryWriter } from "./summary-writer.js";

/**
 * Generate a GitHub link for a package path
 *
 * @param packagePath - Absolute path to the package
 * @returns Markdown link to the package in GitHub
 */
function getPackageGitHubLink(packagePath: string, packageName: string): string {
	if (!packagePath) return packageName;

	const cwd = process.cwd();
	const relativePath = packagePath.startsWith(cwd) ? packagePath.slice(cwd.length + 1) : packagePath;

	// Use context.ref which could be refs/heads/branch-name or refs/pull/123/merge
	const ref = context.ref.replace("refs/heads/", "").replace("refs/pull/", "pull/").replace("/merge", "");
	const url = `https://github.com/${context.repo.owner}/${context.repo.repo}/tree/${ref}/${relativePath}`;

	return `[${packageName}](${url})`;
}

/**
 * Package release notes
 */
interface PackageReleaseNotes {
	/** Package name */
	name: string;
	/** Old version */
	oldVersion: string;
	/** New version */
	version: string;
	/** Bump type */
	type: string;
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
export interface ReleaseNotesPreviewResult {
	/** Package release notes */
	packages: PackageReleaseNotes[];
	/** Summary markdown content for check run output */
	summaryContent: string;
	/** Check title for the output */
	checkTitle: string;
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
 * Generate explanatory release notes for a group package with no direct changes
 *
 * @param packageName - Package name
 * @param groupType - Type of group (fixed or linked)
 * @param siblings - Sibling packages in the group
 * @param releases - All releases from changeset status
 * @returns Explanatory release notes markdown
 */
function generateGroupPackageNotes(
	packageName: string,
	groupType: "fixed" | "linked",
	siblings: string[],
	releases: ChangesetStatusResult["releases"],
): string {
	// Find which siblings are actually being released
	const releasedSiblings = siblings.filter((sibling) => releases.some((r) => r.name === sibling));

	if (releasedSiblings.length === 0) {
		return `_This package has no direct changes but is being released due to ${groupType} versioning._`;
	}

	const siblingList = releasedSiblings.map((s) => `\`${s}\``).join(", ");
	const groupDescription = groupType === "fixed" ? "fixed versioning" : "linked versioning";
	const allPackages = [`\`${packageName}\``, ...releasedSiblings.map((s) => `\`${s}\``)].join(", ");

	return `_This package has no direct changes but is being released because it shares ${groupDescription} with ${siblingList} which ${releasedSiblings.length > 1 ? "have" : "has"} changes._

This release maintains version alignment across the following packages: ${allPackages}.`;
}

/**
 * Generate registry table for a package
 *
 * @param validation - Package publish validation result
 * @returns Markdown table string
 */
function generateRegistryTable(validation: PackagePublishValidation): string {
	if (validation.targets.length === 0) {
		return "_No publish targets configured_";
	}

	const rows = validation.targets.map((target) => {
		const registry = getRegistryDisplayName(target.target.registry);
		const dirName = target.target.directory.split("/").pop() || ".";
		const packed = target.stats?.packageSize || "—";
		const unpacked = target.stats?.unpackedSize || "—";
		const files = target.stats?.totalFiles?.toString() || "—";
		const access = target.target.access || "—";
		const provenance = target.target.provenance ? (target.provenanceReady ? "✅" : "⚠️") : "🚫";

		return [registry, `\`${dirName}\``, packed, unpacked, files, access, provenance];
	});

	return summaryWriter.table(["Registry", "Directory", "Packed", "Unpacked", "Files", "Access", "Provenance"], rows);
}

/**
 * Generates release notes preview for all packages
 *
 * @param publishValidations - Optional publish validation results from dry-run
 * @returns Release notes preview result
 *
 * @remarks
 * Uses workspace-tools to discover package paths from workspace configuration.
 * This handles cases where directory names don't match package names.
 */
export async function generateReleaseNotesPreview(
	publishValidations?: PackagePublishValidation[],
): Promise<ReleaseNotesPreviewResult> {
	// Read all inputs
	const packageManager = core.getInput("package-manager") || "pnpm";
	const targetBranch = core.getInput("target-branch") || "main";
	const dryRun = core.getBooleanInput("dry-run") || false;
	core.startGroup("Generating release notes preview");

	// Read changeset config to detect fixed/linked groups
	const changesetConfig = readChangesetConfig();
	if (changesetConfig?.fixed && changesetConfig.fixed.length > 0) {
		core.debug(`Found ${changesetConfig.fixed.length} fixed group(s) in changeset config`);
	}
	if (changesetConfig?.linked && changesetConfig.linked.length > 0) {
		core.debug(`Found ${changesetConfig.linked.length} linked group(s) in changeset config`);
	}

	// Get packages from changeset status (handles consumed changesets)
	const changesetStatus = await getChangesetStatus(packageManager, targetBranch);
	core.info(`Found ${changesetStatus.releases.length} package(s) to release`);

	// Get all workspace packages (including non-releasing)
	const allWorkspacePackages = getAllWorkspacePackages();
	core.info(`Found ${allWorkspacePackages.length} total package(s) in workspace`);

	// Count changesets per package
	const changesetCounts = countChangesetsPerPackage(changesetStatus.changesets);

	// Build a map of package name -> validation result
	const validationMap = new Map<string, PackagePublishValidation>();
	if (publishValidations) {
		for (const validation of publishValidations) {
			validationMap.set(validation.name, validation);
		}
	}

	// Build release info map
	const releaseMap = new Map<string, (typeof changesetStatus.releases)[0]>();
	for (const release of changesetStatus.releases) {
		releaseMap.set(release.name, release);
	}

	const packageNotes: PackageReleaseNotes[] = [];

	// Process each releasing package
	for (const release of changesetStatus.releases) {
		core.info(`Processing ${release.name}@${release.newVersion}`);

		// Find package directory using workspace-tools
		const packagePath = findPackagePath(release.name);

		if (!packagePath) {
			core.warning(`Could not find package directory for ${release.name}`);
			packageNotes.push({
				name: release.name,
				oldVersion: release.oldVersion || "0.0.0",
				version: release.newVersion,
				type: release.type,
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
				oldVersion: release.oldVersion || "0.0.0",
				version: release.newVersion,
				type: release.type,
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

			// Check if notes are empty and package might be in a group
			const hasNoNotes = !notes.trim();
			const group = findPackageGroup(release.name, changesetConfig);

			if (hasNoNotes && group.type !== "none" && group.siblings.length > 0) {
				// This is a group package with no direct changes
				const groupNotes = generateGroupPackageNotes(
					release.name,
					group.type,
					group.siblings,
					changesetStatus.releases,
				);
				core.info(`✓ Generated ${group.type}-version notes for ${release.name}@${release.newVersion}`);
				packageNotes.push({
					name: release.name,
					oldVersion: release.oldVersion || "0.0.0",
					version: release.newVersion,
					type: release.type,
					path: packagePath,
					hasChangelog: true,
					notes: groupNotes,
				});
			} else if (extractionError) {
				core.warning(`Could not extract version ${release.newVersion} from ${release.name} CHANGELOG`);
				packageNotes.push({
					name: release.name,
					oldVersion: release.oldVersion || "0.0.0",
					version: release.newVersion,
					type: release.type,
					path: packagePath,
					hasChangelog: true,
					notes: "",
					error: extractionError,
				});
			} else {
				core.info(`✓ Extracted release notes for ${release.name}@${release.newVersion}`);
				packageNotes.push({
					name: release.name,
					oldVersion: release.oldVersion || "0.0.0",
					version: release.newVersion,
					type: release.type,
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
				oldVersion: release.oldVersion || "0.0.0",
				version: release.newVersion,
				type: release.type,
				path: packagePath,
				hasChangelog: false,
				notes: "",
				error: errorMsg,
			});
		}
	}

	core.endGroup();

	// Build the enhanced summary
	const checkTitle = dryRun ? "📋 Release Notes Preview (Dry Run)" : "📋 Release Notes Preview";

	// Build job summary sections
	const jobSections: Array<{ heading?: string; level?: 2 | 3 | 4; content: string }> = [
		{ heading: checkTitle, content: "" },
	];

	// Generate "Packages Releasing" summary table
	if (packageNotes.length > 0) {
		const summaryRows = packageNotes.map((pkg) => {
			const group = findPackageGroup(pkg.name, changesetConfig);
			const validation = validationMap.get(pkg.name);
			const changesetCount = changesetCounts.get(pkg.name) || 0;
			const targetCount = validation?.targets.length || 0;
			const notesStatus = pkg.error ? "⚠️" : pkg.notes ? "✅" : "⚠️";

			return [
				getPackageGitHubLink(pkg.path, pkg.name),
				pkg.oldVersion,
				pkg.version,
				`${getBumpTypeIcon(pkg.type)} ${pkg.type}`,
				getGroupIcon(group.type),
				targetCount.toString(),
				changesetCount.toString(),
				notesStatus,
			];
		});

		const summaryTable = summaryWriter.table(
			["Package", "Current", "Next", "Type", "Group", "Targets", "Changesets", "Notes"],
			summaryRows,
		);
		jobSections.push({ heading: "Packages Releasing", level: 3, content: summaryTable });
	}

	// Generate "Packages Not Releasing" section
	const releasingNames = new Set(packageNotes.map((p) => p.name));
	const notReleasingPackages = allWorkspacePackages.filter((pkg) => !releasingNames.has(pkg.name));

	if (notReleasingPackages.length > 0) {
		const notReleasingRows = notReleasingPackages.map((pkg) => {
			const skipReason = getSkipReason(pkg, false);
			return [getPackageGitHubLink(pkg.path, pkg.name), pkg.version, skipReason ? formatSkipReason(skipReason) : "🚫"];
		});

		const notReleasingTable = summaryWriter.table(["Package", "Version", "Reason"], notReleasingRows);
		jobSections.push({ heading: "Packages Not Releasing", level: 3, content: notReleasingTable });
	}

	// Generate per-package sections with registry tables and release notes
	if (packageNotes.length > 0) {
		jobSections.push({ content: "---" });

		for (const pkg of packageNotes) {
			const validation = validationMap.get(pkg.name);
			const firstRelease = isFirstRelease(pkg.oldVersion);

			// Package header with version info
			let versionInfo = `**${pkg.oldVersion} → ${pkg.version}** (${pkg.type})`;
			if (firstRelease) {
				versionInfo += " — 🆕 First Release";
			}

			jobSections.push({ heading: pkg.name, level: 3, content: versionInfo });

			// Registry table (if validation data available)
			if (validation && validation.targets.length > 0) {
				const registryTable = generateRegistryTable(validation);
				jobSections.push({ content: registryTable });
			}

			// Release notes
			if (pkg.error) {
				jobSections.push({ heading: "Release Notes", level: 4, content: `⚠️ **Error**: ${pkg.error}` });
			} else if (pkg.notes) {
				jobSections.push({ heading: "Release Notes", level: 4, content: pkg.notes });
			} else {
				jobSections.push({ heading: "Release Notes", level: 4, content: "_No release notes available_" });
			}

			jobSections.push({ content: "---" });
		}
	}

	// Add legend
	jobSections.push({
		content:
			"**Legend:** 🔴 major | 🟡 minor | 🟢 patch | 🔒 fixed | 🔗 linked | 📦 standalone | 🆕 first release | ✅ ready | ⚠️ warning | 🚫 N/A",
	});

	const summaryContent = summaryWriter.build(jobSections);

	// Write job summary
	await summaryWriter.write(summaryContent);

	return {
		packages: packageNotes,
		summaryContent,
		checkTitle,
	};
}
