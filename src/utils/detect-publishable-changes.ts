import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { context, getOctokit } from "@actions/github";

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

	// Determine changeset command based on package manager
	const changesetCommand = packageManager === "pnpm" ? "pnpm" : packageManager === "yarn" ? "yarn" : "npx";
	const changesetArgs =
		packageManager === "pnpm"
			? ["exec", "changeset", "status", "--output=json"]
			: packageManager === "yarn"
				? ["changeset", "status", "--output=json"]
				: ["changeset", "status", "--output=json"];

	// Run changeset status
	let statusOutput = "";
	let statusError = "";

	await exec.exec(changesetCommand, changesetArgs, {
		listeners: {
			stdout: (data: Buffer) => {
				statusOutput += data.toString();
			},
			stderr: (data: Buffer) => {
				statusError += data.toString();
			},
		},
		ignoreReturnCode: true,
		silent: true,
	});

	// Parse changeset status
	let changesetStatus: ChangesetStatus;
	try {
		changesetStatus = JSON.parse(statusOutput) as ChangesetStatus;
	} catch (error) {
		core.warning(`Failed to parse changeset status: ${error instanceof Error ? error.message : String(error)}`);
		core.debug(`Changeset output: ${statusOutput}`);
		core.debug(`Changeset error: ${statusError}`);
		changesetStatus = { releases: [], changesets: [] };
	}

	core.debug(`Changeset status: ${JSON.stringify(changesetStatus, null, 2)}`);

	// Filter for publishable packages
	const publishablePackages: ChangesetPackage[] = [];

	for (const release of changesetStatus.releases) {
		// Skip if no version bump
		if (release.type === "none") {
			core.debug(`Skipping ${release.name}: no version bump`);
			continue;
		}

		// Find package.json for this package
		// For monorepos, packages are typically in workspaces
		// For single-package repos, it's the root package.json
		const possiblePaths = [
			join(process.cwd(), "package.json"), // Root package
			join(process.cwd(), "packages", release.name.replace("@", "").replace("/", "-"), "package.json"), // Scoped packages
			join(process.cwd(), "packages", release.name, "package.json"), // Non-scoped packages
		];

		let packageJson: PackageJson | null = null;
		let packagePath: string | null = null;

		for (const path of possiblePaths) {
			if (existsSync(path)) {
				try {
					const content = await readFile(path, "utf-8");
					const parsed = JSON.parse(content) as PackageJson;
					if (parsed.name === release.name) {
						packageJson = parsed;
						packagePath = path;
						break;
					}
				} catch (error) {
					core.debug(`Failed to read ${path}: ${error instanceof Error ? error.message : String(error)}`);
				}
			}
		}

		if (!packageJson) {
			core.warning(`Could not find package.json for ${release.name}, skipping`);
			continue;
		}

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
			core.debug(`Skipping ${release.name}: no valid publishConfig.access (private or missing)`);
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
