import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { debug, error, info, warning } from "@actions/core";
import { context, getOctokit } from "@actions/github";
import type { PackageJson } from "../types/publish-config.js";

/**
 * Information about a released package detected from a merge commit
 */
export interface ReleasedPackageInfo {
	/** Package name */
	name: string;
	/** New version after release */
	version: string;
	/** Package path relative to repository root */
	path: string;
	/** Bump type inferred from version change */
	bumpType: "major" | "minor" | "patch" | "unknown";
}

/**
 * Result of detecting released packages
 */
export interface DetectReleasedPackagesResult {
	/** Whether detection was successful */
	success: boolean;
	/** Released packages found */
	packages: ReleasedPackageInfo[];
	/** Error message if detection failed */
	error?: string;
}

/**
 * Infer bump type from version change
 *
 * @param oldVersion - Previous version
 * @param newVersion - New version
 * @returns Bump type
 */
function inferBumpType(oldVersion: string, newVersion: string): "major" | "minor" | "patch" | "unknown" {
	const oldParts = oldVersion.split(".").map(Number);
	const newParts = newVersion.split(".").map(Number);

	if (oldParts.length < 3 || newParts.length < 3) {
		return "unknown";
	}

	// Handle prerelease versions by stripping the prerelease suffix
	const oldMajor = oldParts[0];
	const oldMinor = oldParts[1];
	const newMajor = newParts[0];
	const newMinor = newParts[1];

	if (newMajor > oldMajor) {
		return "major";
	}
	if (newMajor === oldMajor && newMinor > oldMinor) {
		return "minor";
	}
	return "patch";
}

/**
 * Detect packages that were released in a merge commit
 *
 * @remarks
 * This function is used in Phase 3 when changesets have already been consumed.
 * It works by:
 * 1. Getting the files changed in the merged PR
 * 2. Finding package.json files that were modified
 * 3. Comparing versions to detect which packages were bumped
 *
 * @param token - GitHub token
 * @param prNumber - The merged PR number
 * @returns Promise resolving to detected packages
 */
export async function detectReleasedPackagesFromPR(
	token: string,
	prNumber: number,
): Promise<DetectReleasedPackagesResult> {
	const octokit = getOctokit(token);
	const packages: ReleasedPackageInfo[] = [];

	try {
		info(`Detecting released packages from PR #${prNumber}...`);

		// Get files changed in the PR
		const { data: files } = await octokit.rest.pulls.listFiles({
			owner: context.repo.owner,
			repo: context.repo.repo,
			pull_number: prNumber,
			per_page: 100,
		});

		// Find package.json files that were modified
		const packageJsonFiles = files.filter(
			(file) =>
				file.filename.endsWith("package.json") &&
				(file.status === "modified" || file.status === "changed") &&
				// Exclude root package.json for monorepos (usually not published)
				file.filename !== "package.json",
		);

		info(`Found ${packageJsonFiles.length} modified package.json file(s)`);

		// Also check root package.json for single-package repos
		const rootPackageJson = files.find((file) => file.filename === "package.json" && file.status === "modified");

		if (rootPackageJson) {
			packageJsonFiles.unshift(rootPackageJson);
		}

		// For each modified package.json, get the old and new versions
		for (const file of packageJsonFiles) {
			try {
				// Get the file content at the merge commit (current HEAD)
				const currentContent = readFileSync(join(process.cwd(), file.filename), "utf-8");
				const currentPkg = JSON.parse(currentContent) as PackageJson;

				// Get the file content before the PR (from the base commit)
				const { data: prData } = await octokit.rest.pulls.get({
					owner: context.repo.owner,
					repo: context.repo.repo,
					pull_number: prNumber,
				});

				let oldVersion = "0.0.0";
				try {
					const { data: oldContent } = await octokit.rest.repos.getContent({
						owner: context.repo.owner,
						repo: context.repo.repo,
						path: file.filename,
						ref: prData.base.sha,
					});

					if ("content" in oldContent && oldContent.content) {
						const decodedContent = Buffer.from(oldContent.content, "base64").toString("utf-8");
						const oldPkg = JSON.parse(decodedContent) as PackageJson;
						oldVersion = oldPkg.version || "0.0.0";
					}
				} catch {
					// File might not exist in base (new package)
					debug(`Could not get old version for ${file.filename}, assuming new package`);
				}

				const newVersion = currentPkg.version || "0.0.0";

				// Only include if version actually changed
				if (oldVersion !== newVersion) {
					const bumpType = inferBumpType(oldVersion, newVersion);
					const packageDir = dirname(file.filename);

					packages.push({
						name: currentPkg.name || packageDir,
						version: newVersion,
						path: packageDir === "." ? process.cwd() : join(process.cwd(), packageDir),
						bumpType,
					});

					info(`  ${currentPkg.name}: ${oldVersion} → ${newVersion} (${bumpType})`);
				}
			} catch (err) {
				warning(`Failed to process ${file.filename}: ${err instanceof Error ? err.message : String(err)}`);
			}
		}

		info(`Detected ${packages.length} released package(s)`);

		return {
			success: true,
			packages,
		};
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		error(`Failed to detect released packages: ${errorMessage}`);
		return {
			success: false,
			packages: [],
			error: errorMessage,
		};
	}
}

/**
 * Detect packages that were released by comparing HEAD with its first parent
 *
 * @remarks
 * Alternative detection method that works without needing the PR number.
 * Uses git to compare package.json files between HEAD and HEAD^1.
 *
 * @param token - GitHub token
 * @returns Promise resolving to detected packages
 */
export async function detectReleasedPackagesFromCommit(token: string): Promise<DetectReleasedPackagesResult> {
	const octokit = getOctokit(token);
	const packages: ReleasedPackageInfo[] = [];

	try {
		info("Detecting released packages from merge commit...");

		// Get the commit to find parent SHAs
		const { data: commit } = await octokit.rest.repos.getCommit({
			owner: context.repo.owner,
			repo: context.repo.repo,
			ref: context.sha,
		});

		if (!commit.parents || commit.parents.length === 0) {
			return {
				success: false,
				packages: [],
				error: "No parent commits found",
			};
		}

		const baseSha = commit.parents[0].sha;
		info(`Comparing ${context.sha.substring(0, 8)} with parent ${baseSha.substring(0, 8)}`);

		// Compare the commits to get changed files
		const { data: comparison } = await octokit.rest.repos.compareCommits({
			owner: context.repo.owner,
			repo: context.repo.repo,
			base: baseSha,
			head: context.sha,
		});

		// Find package.json files that were modified
		const packageJsonFiles =
			comparison.files?.filter(
				(file) => file.filename.endsWith("package.json") && (file.status === "modified" || file.status === "changed"),
			) || [];

		info(`Found ${packageJsonFiles.length} modified package.json file(s)`);

		// For each modified package.json, get the old and new versions
		for (const file of packageJsonFiles) {
			try {
				// Get current content from the filesystem
				const fullPath = join(process.cwd(), file.filename);
				if (!existsSync(fullPath)) {
					debug(`File not found: ${fullPath}`);
					continue;
				}

				const currentContent = readFileSync(fullPath, "utf-8");
				const currentPkg = JSON.parse(currentContent) as PackageJson;

				// Get old version from base commit
				let oldVersion = "0.0.0";
				try {
					const { data: oldContent } = await octokit.rest.repos.getContent({
						owner: context.repo.owner,
						repo: context.repo.repo,
						path: file.filename,
						ref: baseSha,
					});

					if ("content" in oldContent && oldContent.content) {
						const decodedContent = Buffer.from(oldContent.content, "base64").toString("utf-8");
						const oldPkg = JSON.parse(decodedContent) as PackageJson;
						oldVersion = oldPkg.version || "0.0.0";
					}
				} catch {
					debug(`Could not get old version for ${file.filename}`);
				}

				const newVersion = currentPkg.version || "0.0.0";

				// Only include if version actually changed
				if (oldVersion !== newVersion) {
					const bumpType = inferBumpType(oldVersion, newVersion);
					const packageDir = dirname(file.filename);

					packages.push({
						name: currentPkg.name || packageDir,
						version: newVersion,
						path: packageDir === "." ? process.cwd() : join(process.cwd(), packageDir),
						bumpType,
					});

					info(`  ${currentPkg.name}: ${oldVersion} → ${newVersion} (${bumpType})`);
				}
			} catch (err) {
				warning(`Failed to process ${file.filename}: ${err instanceof Error ? err.message : String(err)}`);
			}
		}

		info(`Detected ${packages.length} released package(s)`);

		return {
			success: true,
			packages,
		};
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		error(`Failed to detect released packages: ${errorMessage}`);
		return {
			success: false,
			packages: [],
			error: errorMessage,
		};
	}
}
