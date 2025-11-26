import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { context, getOctokit } from "@actions/github";
import { getWorkspaceRoot, getWorkspaces } from "workspace-tools";

/**
 * Package information from changeset status
 */
interface ChangesetPackage {
	/** Package name */
	name: string;
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
	const token = core.getInput("token", { required: true });
	const github = getOctokit(token);

	// Create temp file for changeset status output
	// The --output flag writes JSON to a file, not stdout
	const statusFile = join(tmpdir(), `changeset-status-${Date.now()}.json`);

	// Determine changeset command based on package manager
	const changesetCommand = packageManager === "pnpm" ? "pnpm" : packageManager === "yarn" ? "yarn" : "npx";
	const changesetArgs =
		packageManager === "pnpm"
			? ["exec", "changeset", "status", "--output", statusFile]
			: packageManager === "yarn"
				? ["changeset", "status", "--output", statusFile]
				: ["changeset", "status", "--output", statusFile];

	// Run changeset status
	let statusError = "";

	const exitCode = await exec.exec(changesetCommand, changesetArgs, {
		listeners: {
			stderr: (data: Buffer) => {
				statusError += data.toString();
			},
		},
		ignoreReturnCode: true,
		silent: true,
	});

	// Parse changeset status from temp file
	let changesetStatus: ChangesetStatus;

	try {
		const statusContent = await readFile(statusFile, "utf-8");
		const trimmedOutput = statusContent.trim();

		if (!trimmedOutput || trimmedOutput === "") {
			core.debug("Changeset status file is empty (no changesets present)");
			changesetStatus = { releases: [], changesets: [] };
		} else {
			changesetStatus = JSON.parse(trimmedOutput) as ChangesetStatus;
			core.debug(`Parsed changeset status from ${statusFile}`);
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			// File not created means no changesets or command failed
			core.debug(`Changeset status file not created (exit code: ${exitCode})`);
			if (statusError) {
				core.debug(`Changeset stderr: ${statusError}`);
			}
			changesetStatus = { releases: [], changesets: [] };
		} else {
			core.warning(`Failed to read/parse changeset status: ${error instanceof Error ? error.message : String(error)}`);
			core.debug(`Changeset stderr: ${statusError}`);
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

	core.debug(`Changeset status: ${JSON.stringify(changesetStatus, null, 2)}`);

	// Log what changesets found
	if (changesetStatus.changesets.length > 0) {
		core.info(`Found ${changesetStatus.changesets.length} changeset(s)`);
	}
	if (changesetStatus.releases.length > 0) {
		core.info(`Found ${changesetStatus.releases.length} package(s) with pending releases`);
	} else {
		core.info("No packages with pending releases found");
	}

	// Build a map of package name -> package info using workspace-tools
	const cwd = process.cwd();
	const workspaceRoot = getWorkspaceRoot(cwd);
	const workspaces = workspaceRoot ? getWorkspaces(workspaceRoot) : [];

	// Create lookup map: package name -> { path, packageJson }
	const packageMap = new Map<string, { path: string; packageJson: PackageJson }>();

	for (const workspace of workspaces) {
		packageMap.set(workspace.name, {
			path: workspace.path,
			packageJson: workspace.packageJson as PackageJson,
		});
	}

	// Also check root package.json for single-package repos
	try {
		const rootPkgPath = `${cwd}/package.json`;
		const rootContent = await readFile(rootPkgPath, "utf-8");
		const rootPkg = JSON.parse(rootContent) as PackageJson;
		if (rootPkg.name && !packageMap.has(rootPkg.name)) {
			packageMap.set(rootPkg.name, { path: dirname(rootPkgPath), packageJson: rootPkg });
		}
	} catch {
		// Root package.json may not exist or be readable
	}

	// Log discovered packages and their publish configurations
	if (packageMap.size > 0) {
		core.info(`📦 Discovered ${packageMap.size} package(s) in workspace:`);
		for (const [name, info] of packageMap) {
			const access = info.packageJson.publishConfig?.access;
			const isPrivate = info.packageJson.private;
			const strategy = access
				? `publishConfig.access: ${access}`
				: isPrivate
					? "private (no publish)"
					: "no publishConfig";
			core.info(`   • ${name} (${strategy})`);
		}
	} else {
		core.info("📦 No packages found in workspace");
	}

	// Filter for publishable packages
	const publishablePackages: ChangesetPackage[] = [];

	for (const release of changesetStatus.releases) {
		// Skip if no version bump
		if (release.type === "none") {
			core.debug(`Skipping ${release.name}: no version bump`);
			continue;
		}

		// Find package info from workspace map
		const pkgInfo = packageMap.get(release.name);

		if (!pkgInfo) {
			core.warning(`Could not find package.json for ${release.name}, skipping`);
			continue;
		}

		const { path: packagePath, packageJson } = pkgInfo;

		core.debug(`Found package.json for ${release.name} at ${packagePath}`);
		core.debug(`Package config: ${JSON.stringify(packageJson, null, 2)}`);

		// Check if package is publishable
		const hasPublishConfig = packageJson.publishConfig?.access !== undefined;
		const isPublicOrRestricted =
			packageJson.publishConfig?.access === "public" || packageJson.publishConfig?.access === "restricted";

		if (hasPublishConfig && isPublicOrRestricted) {
			core.info(`✓ ${release.name} is publishable (access: ${packageJson.publishConfig?.access})`);
			publishablePackages.push(release);
		} else {
			// Log at info level so users can see why packages are skipped
			const reason =
				packageJson.private && !hasPublishConfig
					? "package is private without publishConfig.access"
					: "missing publishConfig.access (public or restricted)";
			core.info(`⚪ Skipping ${release.name}: ${reason}`);
		}
	}

	// Create GitHub check run
	const checkTitle = dryRun ? "🧪 Detect Publishable Changes (Dry Run)" : "Detect Publishable Changes";
	const checkSummary =
		publishablePackages.length > 0
			? `Found ${publishablePackages.length} publishable package(s) with changes`
			: "No publishable packages with changes";

	// Build check details using core.summary methods
	const checkSummaryBuilder = core.summary.addHeading("Publishable Packages", 2).addEOL();

	if (publishablePackages.length > 0) {
		checkSummaryBuilder.addRaw(
			publishablePackages.map((pkg) => `- **${pkg.name}** → \`${pkg.newVersion}\` (${pkg.type})`).join("\n"),
		);
	} else {
		checkSummaryBuilder.addRaw("_No publishable packages found_");
	}

	if (dryRun) {
		checkSummaryBuilder
			.addEOL()
			.addEOL()
			.addRaw("> **Dry Run Mode**: This is a preview run. No actual publishing will occur.");
	}

	checkSummaryBuilder
		.addEOL()
		.addEOL()
		.addHeading("Changeset Summary", 2)
		.addEOL()
		.addRaw(
			changesetStatus.changesets.length > 0
				? `Found ${changesetStatus.changesets.length} changeset(s)`
				: "No changesets found",
		);

	if (dryRun) {
		checkSummaryBuilder.addEOL().addEOL().addRaw("---").addEOL().addRaw("**Mode**: Dry Run (Preview Only)");
	}

	const checkDetails = checkSummaryBuilder.stringify();

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

	// Write job summary
	await core.summary
		.addHeading(checkTitle, 2)
		.addRaw(checkSummary)
		.addEOL()
		.addHeading("Publishable Packages", 3)
		.addTable(
			publishablePackages.length > 0
				? [
						[
							{ data: "Package", header: true },
							{ data: "Version", header: true },
							{ data: "Type", header: true },
						],
						...publishablePackages.map((pkg) => [pkg.name, pkg.newVersion, pkg.type]),
					]
				: [[{ data: "No publishable packages found", header: false }]],
		)
		.addHeading("Changeset Summary", 3)
		.addRaw(
			changesetStatus.changesets.length > 0
				? `Found ${changesetStatus.changesets.length} changeset(s)`
				: "No changesets found",
		)
		.addEOL()
		.write();

	return {
		hasChanges: publishablePackages.length > 0,
		packages: publishablePackages,
		checkId: checkRun.id,
	};
}
