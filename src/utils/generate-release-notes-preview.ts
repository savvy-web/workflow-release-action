import * as fs from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { context, getOctokit } from "@actions/github";
import { summaryWriter } from "./summary-writer.js";

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
 * Gets changeset status to determine packages being released
 *
 * @param packageManager - Package manager to use
 * @returns Promise resolving to changeset status JSON
 */
async function getChangesetStatus(packageManager: string): Promise<{
	releases: Array<{ name: string; newVersion: string; type: string }>;
	changesets: Array<{ summary: string }>;
}> {
	let output = "";

	const statusCmd = packageManager === "pnpm" ? "pnpm" : packageManager === "yarn" ? "yarn" : "npm";
	const statusArgs =
		packageManager === "pnpm"
			? ["changeset", "status", "--output=json"]
			: packageManager === "yarn"
				? ["changeset", "status", "--output=json"]
				: ["run", "changeset", "status", "--output=json"];

	await exec.exec(statusCmd, statusArgs, {
		listeners: {
			stdout: (data: Buffer) => {
				output += data.toString();
			},
			stderr: (data: Buffer) => {
				core.debug(`changeset status stderr: ${data.toString()}`);
			},
		},
	});

	return JSON.parse(output.trim());
}

/**
 * Finds package directory path
 *
 * @param packageName - Package name
 * @param workspaceRoot - Workspace root directory
 * @returns Package directory path or null if not found
 */
function findPackagePath(packageName: string, workspaceRoot: string): string | null {
	// Common monorepo package locations
	const possiblePaths = [
		path.join(workspaceRoot, "packages", packageName.split("/").pop() || ""),
		path.join(workspaceRoot, "pkgs", packageName.split("/").pop() || ""),
		path.join(workspaceRoot, "libs", packageName.split("/").pop() || ""),
		workspaceRoot, // Single package repo
	];

	for (const pkgPath of possiblePaths) {
		const packageJsonPath = path.join(pkgPath, "package.json");
		if (fs.existsSync(packageJsonPath)) {
			try {
				const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
				if (packageJson.name === packageName) {
					return pkgPath;
				}
			} catch {
				// Ignore parse errors, continue searching
			}
		}
	}

	return null;
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
 * @param packageManager - Package manager to use
 * @param workspaceRoot - Workspace root directory
 * @param dryRun - Whether this is a dry-run
 * @returns Release notes preview result
 */
export async function generateReleaseNotesPreview(): Promise<ReleaseNotesPreviewResult> {
	// Read all inputs
	const packageManager = core.getInput("package-manager") || "pnpm";
	const workspaceRoot = process.cwd();
	const dryRun = core.getBooleanInput("dry-run") || false;
	const token = core.getInput("token", { required: true });
	const github = getOctokit(token);
	core.startGroup("Generating release notes preview");

	// Get packages from changeset status
	const changesetStatus = await getChangesetStatus(packageManager);
	core.info(`Found ${changesetStatus.releases.length} package(s) to release`);

	const packageNotes: PackageReleaseNotes[] = [];

	for (const release of changesetStatus.releases) {
		core.info(`Processing ${release.name}@${release.newVersion}`);

		// Find package directory
		const packagePath = findPackagePath(release.name, workspaceRoot);

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
			const notes = extractVersionSection(changelogContent, release.newVersion);

			if (notes.startsWith("Could not find")) {
				core.warning(`Could not extract version ${release.newVersion} from ${release.name} CHANGELOG`);
				packageNotes.push({
					name: release.name,
					version: release.newVersion,
					path: packagePath,
					hasChangelog: true,
					notes: "",
					error: notes,
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
