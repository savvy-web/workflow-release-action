import * as fs from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as github from "@actions/github";
import { context } from "@actions/github";
import type { TagInfo } from "./determine-tag-strategy.js";
import type { PackagePublishResult } from "./generate-publish-summary.js";

/**
 * Result of creating GitHub releases
 */
export interface CreateReleasesResult {
	/** Whether all releases were created successfully */
	success: boolean;
	/** Created releases */
	releases: ReleaseInfo[];
	/** Tags that were created */
	createdTags: string[];
	/** Errors encountered */
	errors: string[];
}

/**
 * Information about a created release
 */
export interface ReleaseInfo {
	/** Release tag name */
	tag: string;
	/** Release URL */
	url: string;
	/** Release ID */
	id: number;
	/** Uploaded assets */
	assets: AssetInfo[];
}

/**
 * Information about an uploaded asset
 */
export interface AssetInfo {
	/** Asset name */
	name: string;
	/** Download URL */
	downloadUrl: string;
	/** Asset size in bytes */
	size: number;
}

/**
 * Extract release notes from CHANGELOG.md for a specific version
 *
 * @param changelogPath - Path to CHANGELOG.md
 * @param version - Version to extract notes for
 * @returns Release notes markdown or undefined
 */
function extractReleaseNotes(changelogPath: string, version: string): string | undefined {
	if (!fs.existsSync(changelogPath)) {
		return undefined;
	}

	const content = fs.readFileSync(changelogPath, "utf-8");
	const lines = content.split("\n");

	// Find the section for this version
	// Changesets format: ## 1.0.0 or ## @scope/pkg@1.0.0
	const versionPattern = new RegExp(`^##\\s+(?:@[^@]+@)?${version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);
	const nextVersionPattern = /^##\s+/;

	let inSection = false;
	const sectionLines: string[] = [];

	for (const line of lines) {
		if (versionPattern.test(line)) {
			inSection = true;
			continue;
		}

		if (inSection) {
			if (nextVersionPattern.test(line)) {
				break;
			}
			sectionLines.push(line);
		}
	}

	if (sectionLines.length === 0) {
		return undefined;
	}

	// Trim leading/trailing empty lines
	while (sectionLines.length > 0 && sectionLines[0].trim() === "") {
		sectionLines.shift();
	}
	while (sectionLines.length > 0 && sectionLines[sectionLines.length - 1].trim() === "") {
		sectionLines.pop();
	}

	return sectionLines.join("\n");
}

/**
 * Find package artifacts to upload
 *
 * @param packagePath - Path to the package directory
 * @returns Array of artifact file paths
 */
async function findPackageArtifacts(packagePath: string): Promise<string[]> {
	const artifacts: string[] = [];

	// Check for .tgz files (from npm pack)
	const files = fs.readdirSync(packagePath);
	for (const file of files) {
		if (file.endsWith(".tgz")) {
			artifacts.push(path.join(packagePath, file));
		}
	}

	// If no tgz found, try to create one
	if (artifacts.length === 0) {
		try {
			let output = "";
			await exec.exec("npm", ["pack"], {
				cwd: packagePath,
				listeners: {
					stdout: (data: Buffer) => {
						output += data.toString();
					},
				},
			});
			const tgzName = output.trim().split("\n").pop();
			if (tgzName) {
				artifacts.push(path.join(packagePath, tgzName));
			}
		} catch (error) {
			core.debug(`Failed to create package tarball: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	return artifacts;
}

/**
 * Configure git identity for creating annotated tags
 *
 * @remarks
 * Annotated tags require a committer identity. This function configures
 * git user.name and user.email based on the GitHub App that created the token.
 */
async function configureGitIdentity(): Promise<void> {
	const appSlug = core.getState("appSlug");

	// Use app identity or fall back to github-actions bot
	const userName = appSlug ? `${appSlug}[bot]` : "github-actions[bot]";
	// Use a generic noreply email format - the exact ID doesn't matter for tag creation
	const userEmail = appSlug
		? `${appSlug}[bot]@users.noreply.github.com`
		: "41898282+github-actions[bot]@users.noreply.github.com";

	core.debug(`Configuring git identity: ${userName} <${userEmail}>`);

	await exec.exec("git", ["config", "user.name", userName]);
	await exec.exec("git", ["config", "user.email", userEmail]);
}

/**
 * Create a git tag
 *
 * @param tagName - Name of the tag to create
 * @param message - Tag message
 * @param dryRun - Whether to skip actual tag creation
 * @returns Whether the tag was created successfully
 */
async function createGitTag(tagName: string, message: string, dryRun: boolean): Promise<boolean> {
	if (dryRun) {
		core.info(`[DRY RUN] Would create tag: ${tagName}`);
		return true;
	}

	try {
		// Create annotated tag
		await exec.exec("git", ["tag", "-a", tagName, "-m", message]);

		// Push the tag
		await exec.exec("git", ["push", "origin", tagName]);

		core.info(`Created and pushed tag: ${tagName}`);
		return true;
	} catch (error) {
		core.error(`Failed to create tag ${tagName}: ${error instanceof Error ? error.message : String(error)}`);
		return false;
	}
}

/**
 * Create GitHub releases for published packages
 *
 * @remarks
 * This function:
 * 1. Creates git tags for each release
 * 2. Creates GitHub releases with release notes from CHANGELOG
 * 3. Uploads package artifacts to each release
 *
 * @param tags - Tags to create releases for
 * @param publishResults - Results from publishing packages
 * @param dryRun - Whether to skip actual creation
 * @returns Promise resolving to release creation result
 */
export async function createGitHubReleases(
	tags: TagInfo[],
	publishResults: PackagePublishResult[],
	dryRun: boolean,
): Promise<CreateReleasesResult> {
	const token = core.getState("token");
	if (!token) {
		throw new Error("No token available from state - ensure pre.ts ran successfully");
	}
	const octokit = github.getOctokit(token);

	const releases: ReleaseInfo[] = [];
	const createdTags: string[] = [];
	const errors: string[] = [];

	core.startGroup("Creating GitHub releases");

	// Configure git identity for creating annotated tags (required for non-dry-run)
	if (!dryRun) {
		await configureGitIdentity();
	}

	for (const tag of tags) {
		core.info(`Processing release for ${tag.name}...`);

		// Find packages associated with this tag
		const associatedPackages = publishResults.filter((pkg) => {
			if (tag.packageName.includes(", ")) {
				// Fixed versioning - multiple packages
				return tag.packageName.includes(pkg.name);
			}
			return pkg.name === tag.packageName;
		});

		if (associatedPackages.length === 0) {
			core.warning(`No packages found for tag ${tag.name}`);
			continue;
		}

		// Build release notes
		let releaseNotes = "";

		for (const pkg of associatedPackages) {
			// Try to find CHANGELOG in the package directory
			const pkgPath = path.join(process.cwd(), "packages", pkg.name.replace(/^@[^/]+\//, ""));
			const changelogPaths = [
				path.join(pkgPath, "CHANGELOG.md"),
				path.join(process.cwd(), "CHANGELOG.md"), // Root changelog for single-package repos
			];

			let notes: string | undefined;
			for (const changelogPath of changelogPaths) {
				notes = extractReleaseNotes(changelogPath, pkg.version);
				if (notes) break;
			}

			if (associatedPackages.length > 1) {
				releaseNotes += `## ${pkg.name}\n\n`;
			}
			releaseNotes += notes || `Released version ${pkg.version}`;
			releaseNotes += "\n\n";
		}

		// Add publish information
		releaseNotes += "---\n\n";
		releaseNotes += "### Published to:\n\n";

		for (const pkg of associatedPackages) {
			for (const target of pkg.targets.filter((t) => t.success)) {
				const registry = target.target.registry?.includes("npmjs.org")
					? "npm"
					: target.target.registry?.includes("pkg.github.com")
						? "GitHub Packages"
						: target.target.registry || "registry";

				if (target.registryUrl) {
					releaseNotes += `- **${registry}**: [${pkg.name}@${pkg.version}](${target.registryUrl})\n`;
				} else {
					releaseNotes += `- **${registry}**: ${pkg.name}@${pkg.version}\n`;
				}

				if (target.attestationUrl) {
					releaseNotes += `  - [Provenance attestation](${target.attestationUrl})\n`;
				}
			}
		}

		// Create git tag
		const tagMessage = `Release ${tag.name}`;
		const tagCreated = await createGitTag(tag.name, tagMessage, dryRun);

		if (!tagCreated && !dryRun) {
			errors.push(`Failed to create tag ${tag.name}`);
			continue;
		}

		createdTags.push(tag.name);

		// Create GitHub release
		if (dryRun) {
			core.info(`[DRY RUN] Would create GitHub release for ${tag.name}`);
			releases.push({
				tag: tag.name,
				url: `https://github.com/${context.repo.owner}/${context.repo.repo}/releases/tag/${tag.name}`,
				id: 0,
				assets: [],
			});
			continue;
		}

		try {
			const release = await octokit.rest.repos.createRelease({
				owner: context.repo.owner,
				repo: context.repo.repo,
				tag_name: tag.name,
				name: tag.name,
				body: releaseNotes.trim(),
				draft: false,
				prerelease: tag.version.includes("-"),
			});

			core.info(`Created release: ${release.data.html_url}`);

			const releaseInfo: ReleaseInfo = {
				tag: tag.name,
				url: release.data.html_url,
				id: release.data.id,
				assets: [],
			};

			// Upload artifacts for each package
			for (const pkg of associatedPackages) {
				const pkgPath = path.join(process.cwd(), "packages", pkg.name.replace(/^@[^/]+\//, ""));
				const artifacts = await findPackageArtifacts(fs.existsSync(pkgPath) ? pkgPath : process.cwd());

				for (const artifactPath of artifacts) {
					try {
						const fileName = path.basename(artifactPath);
						const fileContent = fs.readFileSync(artifactPath);

						core.info(`Uploading asset: ${fileName}`);

						const asset = await octokit.rest.repos.uploadReleaseAsset({
							owner: context.repo.owner,
							repo: context.repo.repo,
							release_id: release.data.id,
							name: fileName,
							data: fileContent as unknown as string,
						});

						releaseInfo.assets.push({
							name: fileName,
							downloadUrl: asset.data.browser_download_url,
							size: asset.data.size,
						});

						core.info(`Uploaded: ${asset.data.browser_download_url}`);
					} catch (error) {
						core.warning(
							`Failed to upload artifact ${artifactPath}: ${error instanceof Error ? error.message : String(error)}`,
						);
					}
				}
			}

			releases.push(releaseInfo);
		} catch (error) {
			const errorMessage = `Failed to create release for ${tag.name}: ${error instanceof Error ? error.message : String(error)}`;
			core.error(errorMessage);
			errors.push(errorMessage);
		}
	}

	core.endGroup();

	return {
		success: errors.length === 0,
		releases,
		createdTags,
		errors,
	};
}
