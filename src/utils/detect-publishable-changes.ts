import { readFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { debug, error, getState, info, warning } from "@actions/core";
import { exec } from "@actions/exec";
import { context, getOctokit } from "@actions/github";
import { findProjectRoot, getWorkspaces } from "workspace-tools";
import { summaryWriter } from "./summary-writer.js";

/**
 * Package information from changeset status
 */
interface ChangesetPackage {
	/** Package name */
	name: string;
	/** Current version before changeset application */
	oldVersion: string;
	/** New version after changeset application */
	newVersion: string;
	/** Type of version bump */
	type: "major" | "minor" | "patch" | "none";
}

/**
 * Changeset status output from `changeset status --output=json`
 */
interface ChangesetStatus {
	/** Packages that will be released */
	releases: ChangesetPackage[];
	/** Changeset information */
	changesets: Array<{
		/** Changeset ID */
		id: string;
		/** Changeset summary */
		summary: string;
		/** Packages affected by this changeset */
		releases: Array<{ name: string; type: string }>;
	}>;
}

/**
 * Package.json structure
 */
interface PackageJson {
	/** Package name */
	name?: string;
	/** Package version */
	version?: string;
	/** Whether package is private */
	private?: boolean;
	/** Publish configuration */
	publishConfig?: {
		/** Access level for publishing (public or restricted) */
		access?: "public" | "restricted";
		/** Custom registry URL */
		registry?: string;
	};
}

/**
 * Detects publishable changes by checking changeset status and package configurations
 *

 * @param exec - GitHub Actions exec module


 * @param packageManager - Package manager to use (npm, pnpm, yarn, bun)
 * @param dryRun - Whether this is a dry-run (no actual operations)
 * @returns Detection result with publishable packages
 *
 * @remarks
 * This function:
 * 1. Runs `changeset status --output=json` to get pending changes
 * 2. Filters for packages with valid `publishConfig.access`
 * 3. Creates a GitHub check run to report findings
 * 4. Returns publishable packages and check details
 *
 * A package is considered publishable if:
 * - It has a changeset with version bump
 * - It has `publishConfig.access` set to "public" or "restricted"
 * - It's not marked as private: true in package.json (or has publishConfig.access override)
 */
export async function detectPublishableChanges(
	packageManager: string,
	dryRun: boolean,
): Promise<{
	hasChanges: boolean;
	packages: ChangesetPackage[];
	checkId: number;
}> {
	const token = getState("token");
	if (!token) {
		throw new Error("No token available from state - ensure pre.ts ran successfully");
	}
	const github = getOctokit(token);

	// Create temp file for changeset status output
	// The --output flag writes JSON to a file, not stdout
	// Use relative path because changeset CLI treats absolute paths as relative
	const statusFile = `.changeset-status-${Date.now()}.json`;

	// Determine changeset command based on package manager
	const changesetCommand =
		packageManager === "pnpm" ? "pnpm" : packageManager === "yarn" ? "yarn" : packageManager === "bun" ? "bun" : "npx";
	const changesetArgs =
		packageManager === "pnpm"
			? ["exec", "changeset", "status", "--output", statusFile]
			: packageManager === "yarn"
				? ["changeset", "status", "--output", statusFile]
				: packageManager === "bun"
					? ["x", "changeset", "status", "--output", statusFile]
					: ["changeset", "status", "--output", statusFile];

	// Run changeset status
	let statusError = "";
	let statusStdout = "";

	info(`Running: ${changesetCommand} ${changesetArgs.join(" ")}`);

	const exitCode = await exec(changesetCommand, changesetArgs, {
		listeners: {
			stdout: (data: Buffer) => {
				statusStdout += data.toString();
			},
			stderr: (data: Buffer) => {
				statusError += data.toString();
			},
		},
		ignoreReturnCode: true,
		silent: true,
	});

	info(`Changeset status exit code: ${exitCode}`);
	if (statusStdout) {
		info(`Changeset stdout: ${statusStdout.trim()}`);
	}
	if (statusError) {
		info(`Changeset stderr: ${statusError.trim()}`);
	}

	// Check for changeset validation errors (exit code 1 with specific error patterns)
	if (exitCode !== 0 && statusError) {
		const isValidationError =
			statusError.includes("ValidationError") ||
			statusError.includes("depends on the ignored package") ||
			statusError.includes("is not being ignored");

		if (isValidationError) {
			// Extract the specific error messages for clearer reporting
			const errorLines = statusError
				.split("\n")
				.filter((line) => line.includes("error") && !line.includes("at "))
				.map((line) => line.replace(/^\s*🦋\s*error\s*/, "").trim())
				.filter((line) => line.length > 0 && !line.startsWith("{"));

			const errorSummary = errorLines.length > 0 ? errorLines.join("\n") : "Changeset configuration validation failed";

			error(`Changeset validation error:\n${errorSummary}`);
			throw new Error(`Changeset configuration is invalid:\n${errorSummary}`);
		}
	}

	// Parse changeset status from temp file
	let changesetStatus: ChangesetStatus;

	try {
		const statusContent = await readFile(statusFile, "utf-8");
		const trimmedOutput = statusContent.trim();
		info(`Changeset status file contents (${statusContent.length} bytes): ${trimmedOutput.slice(0, 500)}`);

		if (!trimmedOutput || trimmedOutput === "") {
			info("Changeset status file is empty (no changesets present)");
			changesetStatus = { releases: [], changesets: [] };
		} else {
			changesetStatus = JSON.parse(trimmedOutput) as ChangesetStatus;

			// If top-level releases is empty but changesets have releases, aggregate them
			// This handles private packages where changesets doesn't populate top-level releases
			if (
				(!changesetStatus.releases || changesetStatus.releases.length === 0) &&
				changesetStatus.changesets.length > 0
			) {
				const aggregatedReleases = new Map<string, ChangesetPackage>();
				for (const cs of changesetStatus.changesets) {
					if (cs.releases) {
						for (const rel of cs.releases) {
							// Use the first occurrence of each package (type from first changeset)
							if (!aggregatedReleases.has(rel.name)) {
								aggregatedReleases.set(rel.name, {
									name: rel.name,
									type: rel.type as ChangesetPackage["type"],
									oldVersion: "", // Will be populated later from package.json
									newVersion: "", // Will be populated later from package.json
								});
							}
						}
					}
				}
				if (aggregatedReleases.size > 0) {
					changesetStatus.releases = Array.from(aggregatedReleases.values());
					info(`Aggregated ${changesetStatus.releases.length} release(s) from changesets`);
				}
			}

			info(`Parsed ${changesetStatus.changesets.length} changesets, ${changesetStatus.releases.length} releases`);
		}
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") {
			// File not created means no changesets or command failed
			info(`Changeset status file not created at ${statusFile}`);
			changesetStatus = { releases: [], changesets: [] };
		} else {
			warning(`Failed to read/parse changeset status: ${err instanceof Error ? err.message : String(err)}`);
			changesetStatus = { releases: [], changesets: [] };
		}
	} finally {
		// Clean up temp file
		try {
			await unlink(statusFile);
		} catch {
			// Ignore cleanup errors
		}
	}

	debug(`Changeset status: ${JSON.stringify(changesetStatus, null, 2)}`);

	// Log what changesets found
	if (changesetStatus.changesets.length > 0) {
		info(`Found ${changesetStatus.changesets.length} changeset(s)`);
	}
	if (changesetStatus.releases.length > 0) {
		info(`Found ${changesetStatus.releases.length} package(s) with pending releases`);
	} else {
		info("No packages with pending releases found");
	}

	// Build a map of package name -> package info using workspace-tools
	const cwd = process.cwd();

	// Create lookup map: package name -> { path, packageJson }
	const packageMap = new Map<string, { path: string; packageJson: PackageJson }>();

	// Try to detect workspaces using workspace-tools
	// Note: workspace-tools may not recognize all lock files (e.g., bun.lock)
	try {
		const workspaceRoot = findProjectRoot(cwd);
		debug(`workspace-tools findProjectRoot: ${workspaceRoot || "null"}`);

		if (workspaceRoot) {
			const workspaces = getWorkspaces(workspaceRoot);
			debug(`workspace-tools getWorkspaces returned ${workspaces.length} workspace(s)`);

			for (const workspace of workspaces) {
				packageMap.set(workspace.name, {
					path: workspace.path,
					packageJson: workspace.packageJson as PackageJson,
				});
			}
		}
	} catch (err) {
		debug(`workspace-tools failed: ${err instanceof Error ? err.message : String(err)}`);
	}

	// Always check root package.json for single-package repos
	// This is the primary detection method when no workspaces are defined
	// NOTE: Using join() instead of string concatenation to prevent ncc bundler
	// from incorrectly treating "package.json" as a static asset reference
	const pkgJsonFilename = "package.json";
	const rootPkgPath = join(cwd, pkgJsonFilename);

	info(`Reading root package.json from: ${rootPkgPath}`);
	debug(`Current working directory: ${cwd}`);

	try {
		const rootContent = await readFile(rootPkgPath, "utf-8");
		debug(`Root package.json content length: ${rootContent.length} bytes`);

		// Log first 200 chars of content for debugging (helps identify wrong file issues)
		const contentPreview = rootContent.slice(0, 200).replace(/\n/g, " ");
		debug(`Root package.json preview: ${contentPreview}...`);

		const rootPkg = JSON.parse(rootContent) as PackageJson;

		// Info-level logging for key fields (always visible)
		info(`Root package.json parsed: name="${rootPkg.name || "(none)"}", private=${rootPkg.private ?? false}`);
		if (rootPkg.publishConfig) {
			info(`  publishConfig.access: ${rootPkg.publishConfig.access || "(not set)"}`);
		}

		// Debug-level for full details
		debug(
			`Root package.json full details: name=${rootPkg.name}, private=${rootPkg.private}, publishConfig=${JSON.stringify(rootPkg.publishConfig)}`,
		);

		if (rootPkg.name && !packageMap.has(rootPkg.name)) {
			packageMap.set(rootPkg.name, { path: dirname(rootPkgPath), packageJson: rootPkg });
			info(`✓ Added root package "${rootPkg.name}" to package map`);
		} else if (rootPkg.name) {
			debug(`Root package "${rootPkg.name}" already in package map from workspaces`);
		} else {
			warning("Root package.json has no 'name' field - cannot detect package for release");
			warning("Ensure your package.json has a 'name' field");
		}
	} catch (err) {
		warning(`Failed to read root package.json at ${rootPkgPath}: ${err instanceof Error ? err.message : String(err)}`);
		debug(`Read error details: ${err instanceof Error ? err.stack : "no stack"}`);
	}

	// Log discovered packages and their publish configurations
	if (packageMap.size > 0) {
		info(`📦 Discovered ${packageMap.size} package(s) in workspace:`);
		for (const [name, pkgInfo] of packageMap) {
			const access = pkgInfo.packageJson.publishConfig?.access;
			const isPrivate = pkgInfo.packageJson.private;
			const strategy = access
				? `publishConfig.access: ${access}`
				: isPrivate
					? "private (no publish)"
					: "no publishConfig";
			info(`   • ${name} (${strategy})`);
		}
	} else {
		info("📦 No packages found in workspace");
	}

	// Filter for publishable packages
	const publishablePackages: ChangesetPackage[] = [];

	for (const release of changesetStatus.releases) {
		// Skip if no version bump
		if (release.type === "none") {
			debug(`Skipping ${release.name}: no version bump`);
			continue;
		}

		// Find package info from workspace map
		const pkgInfo = packageMap.get(release.name);

		if (!pkgInfo) {
			warning(`Could not find package.json for ${release.name}, skipping`);
			continue;
		}

		const { path: packagePath, packageJson } = pkgInfo;

		debug(`Found package.json for ${release.name} at ${packagePath}`);
		debug(`Package config: ${JSON.stringify(packageJson, null, 2)}`);

		// Check if package is publishable
		const hasPublishConfig = packageJson.publishConfig?.access !== undefined;
		const isPublicOrRestricted =
			packageJson.publishConfig?.access === "public" || packageJson.publishConfig?.access === "restricted";

		if (hasPublishConfig && isPublicOrRestricted) {
			info(`✓ ${release.name} is publishable (access: ${packageJson.publishConfig?.access})`);
			publishablePackages.push(release);
		} else {
			// Log at info level so users can see why packages are skipped
			const reason =
				packageJson.private && !hasPublishConfig
					? "package is private without publishConfig.access"
					: "missing publishConfig.access (public or restricted)";
			info(`⚪ Skipping ${release.name}: ${reason}`);
		}
	}

	// Create GitHub check run
	const checkTitle = dryRun ? "🧪 Detect Publishable Changes (Dry Run)" : "Detect Publishable Changes";
	const checkSummary =
		publishablePackages.length > 0
			? `Found ${publishablePackages.length} publishable package(s) with changes`
			: "No publishable packages with changes";

	// Build check details using summaryWriter
	// The checks API output field expects markdown, not HTML
	const checkDetailSections: Array<{ heading?: string; level?: 2 | 3 | 4; content: string }> = [];

	const packagesContent =
		publishablePackages.length > 0
			? summaryWriter.list(
					publishablePackages.map(
						(pkg) => `**${pkg.name}**: \`${pkg.oldVersion}\` → \`${pkg.newVersion}\` (${pkg.type})`,
					),
				)
			: "_No publishable packages found_";

	checkDetailSections.push({ heading: "Publishable Packages", content: packagesContent });

	if (dryRun) {
		checkDetailSections.push({
			content: "> **Dry Run Mode**: This is a preview run. No actual publishing will occur.",
		});
	}

	const changesetContent =
		changesetStatus.changesets.length > 0
			? `Found ${changesetStatus.changesets.length} changeset(s)`
			: "No changesets found";

	checkDetailSections.push({ heading: "Changeset Summary", content: changesetContent });

	const checkDetails = summaryWriter.build(checkDetailSections);

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

	info(`Created check run: ${checkRun.html_url}`);

	// Write job summary using summaryWriter
	const jobSummarySections: Array<{ heading?: string; level?: 2 | 3 | 4; content: string }> = [
		{ heading: checkTitle, content: checkSummary },
	];

	const jobPackagesContent =
		publishablePackages.length > 0
			? summaryWriter.table(
					["Package", "Current", "Next", "Type"],
					publishablePackages.map((pkg) => [pkg.name, pkg.oldVersion, pkg.newVersion, pkg.type]),
				)
			: "_No publishable packages found_";

	jobSummarySections.push({ heading: "Publishable Packages", level: 3, content: jobPackagesContent });
	jobSummarySections.push({ heading: "Changeset Summary", level: 3, content: changesetContent });

	await summaryWriter.write(summaryWriter.build(jobSummarySections));

	return {
		hasChanges: publishablePackages.length > 0,
		packages: publishablePackages,
		checkId: checkRun.id,
	};
}
