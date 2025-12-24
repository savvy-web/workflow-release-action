import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { debug, endGroup, error, getState, info, startGroup, warning } from "@actions/core";
import { exec } from "@actions/exec";
import { context, getOctokit } from "@actions/github";
import { createReleaseAssetAttestation } from "./create-attestation.js";
import type { TagInfo } from "./determine-tag-strategy.js";
import { findPackagePath } from "./find-package-path.js";
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
	/** Attestation URL if attestation was created */
	attestationUrl?: string;
}

/**
 * Extract release notes from CHANGELOG.md for a specific version
 *
 * @param changelogPath - Path to CHANGELOG.md
 * @param version - Version to extract notes for
 * @returns Release notes markdown or undefined
 */
function extractReleaseNotes(changelogPath: string, version: string): string | undefined {
	if (!existsSync(changelogPath)) {
		return undefined;
	}

	const content = readFileSync(changelogPath, "utf-8");
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
 * Get the pack command for the current package manager
 *
 * @param packageManager - Package manager to use (npm, pnpm, yarn, bun)
 * @returns Command and args for creating a package tarball
 */
function getPackCommand(packageManager: string): { cmd: string; args: string[] } {
	// Use each package manager's dlx/npx to run npm pack for consistent behavior
	// This ensures we use a compatible npm version, not whatever the user has installed
	// --json flag provides structured output for reliable parsing
	switch (packageManager) {
		case "pnpm":
			return { cmd: "pnpm", args: ["dlx", "npm", "pack", "--json"] };
		case "yarn":
			// yarn dlx is for yarn 2+, yarn 1.x uses npx
			return { cmd: "yarn", args: ["dlx", "npm", "pack", "--json"] };
		case "bun":
			return { cmd: "bun", args: ["x", "npm", "pack", "--json"] };
		default:
			// npm uses npx
			return { cmd: "npx", args: ["npm", "pack", "--json"] };
	}
}

/**
 * npm pack --json output structure
 */
interface NpmPackResult {
	filename: string;
	name: string;
	version: string;
}

/**
 * Find package artifacts to upload
 *
 * @param packagePath - Path to the package directory
 * @param packageManager - Package manager to use (npm, pnpm, yarn, bun)
 * @returns Array of artifact file paths
 */
async function findPackageArtifacts(packagePath: string, packageManager: string): Promise<string[]> {
	const artifacts: string[] = [];

	// Check for .tgz files (from npm pack)
	const files = readdirSync(packagePath);
	for (const file of files) {
		if (file.endsWith(".tgz")) {
			artifacts.push(join(packagePath, file));
		}
	}

	// If no tgz found, try to create one
	if (artifacts.length === 0) {
		try {
			const { cmd, args } = getPackCommand(packageManager);
			let output = "";
			await exec(cmd, args, {
				cwd: packagePath,
				listeners: {
					stdout: (data: Buffer) => {
						output += data.toString();
					},
				},
			});

			// Parse JSON output from npm pack --json
			const packResults = JSON.parse(output.trim()) as NpmPackResult[];
			for (const result of packResults) {
				if (result.filename) {
					artifacts.push(join(packagePath, result.filename));
					debug(`npm pack created: ${result.filename} (${result.name}@${result.version})`);
				}
			}
		} catch (err) {
			debug(`Failed to create package tarball: ${err instanceof Error ? err.message : String(err)}`);
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
	const appSlug = getState("appSlug");

	// Use app identity or fall back to github-actions bot
	const userName = appSlug ? `${appSlug}[bot]` : "github-actions[bot]";
	// Use a generic noreply email format - the exact ID doesn't matter for tag creation
	const userEmail = appSlug
		? `${appSlug}[bot]@users.noreply.github.com`
		: "41898282+github-actions[bot]@users.noreply.github.com";

	debug(`Configuring git identity: ${userName} <${userEmail}>`);

	await exec("git", ["config", "user.name", userName]);
	await exec("git", ["config", "user.email", userEmail]);
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
		info(`[DRY RUN] Would create tag: ${tagName}`);
		return true;
	}

	try {
		// Create annotated tag
		await exec("git", ["tag", "-a", tagName, "-m", message]);

		// Push the tag
		await exec("git", ["push", "origin", tagName]);

		info(`Created and pushed tag: ${tagName}`);
		return true;
	} catch (err) {
		error(`Failed to create tag ${tagName}: ${err instanceof Error ? err.message : String(err)}`);
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
 * @param packageManager - Package manager to use (npm, pnpm, yarn, bun)
 * @param dryRun - Whether to skip actual creation
 * @returns Promise resolving to release creation result
 */
export async function createGitHubReleases(
	tags: TagInfo[],
	publishResults: PackagePublishResult[],
	packageManager: string,
	dryRun: boolean,
): Promise<CreateReleasesResult> {
	const token = getState("token");
	if (!token) {
		throw new Error("No token available from state - ensure pre.ts ran successfully");
	}
	const octokit = getOctokit(token);

	const releases: ReleaseInfo[] = [];
	const createdTags: string[] = [];
	const errors: string[] = [];

	startGroup("Creating GitHub releases");

	// Configure git identity for creating annotated tags (required for non-dry-run)
	if (!dryRun) {
		await configureGitIdentity();
	}

	for (const tag of tags) {
		info(`Processing release for ${tag.name}...`);

		// Find packages associated with this tag
		const associatedPackages = publishResults.filter((pkg) => {
			if (tag.packageName.includes(", ")) {
				// Fixed versioning - multiple packages
				return tag.packageName.includes(pkg.name);
			}
			return pkg.name === tag.packageName;
		});

		if (associatedPackages.length === 0) {
			warning(`No packages found for tag ${tag.name}`);
			continue;
		}

		// Build release notes
		let releaseNotes = "";

		for (const pkg of associatedPackages) {
			// Try to find CHANGELOG in the package directory using workspace-tools
			const pkgPath = findPackagePath(pkg.name);
			const changelogPaths: string[] = [];

			if (pkgPath) {
				changelogPaths.push(join(pkgPath, "CHANGELOG.md"));
			}
			// Fall back to root changelog for single-package repos
			changelogPaths.push(join(process.cwd(), "CHANGELOG.md"));

			let notes: string | undefined;
			for (const changelogPath of changelogPaths) {
				debug(`Looking for CHANGELOG at: ${changelogPath}`);
				notes = extractReleaseNotes(changelogPath, pkg.version);
				if (notes) {
					debug(`Found release notes for ${pkg.name}@${pkg.version} in ${changelogPath}`);
					break;
				}
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
					releaseNotes += `  - [Sigstore provenance](${target.attestationUrl})\n`;
				}
			}

			// Add GitHub attestation if available (per-package, not per-target)
			if (pkg.githubAttestationUrl) {
				releaseNotes += `  - [GitHub attestation](${pkg.githubAttestationUrl})\n`;
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
			info(`[DRY RUN] Would create GitHub release for ${tag.name}`);
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

			info(`Created release: ${release.data.html_url}`);

			const releaseInfo: ReleaseInfo = {
				tag: tag.name,
				url: release.data.html_url,
				id: release.data.id,
				assets: [],
			};

			// Upload artifacts for each package
			for (const pkg of associatedPackages) {
				const pkgPath = findPackagePath(pkg.name);
				if (!pkgPath) {
					warning(`Could not find path for package ${pkg.name}, skipping artifact upload`);
					continue;
				}
				const artifacts = await findPackageArtifacts(pkgPath, packageManager);

				for (const artifactPath of artifacts) {
					try {
						const fileName = basename(artifactPath);
						const fileContent = readFileSync(artifactPath);

						info(`Uploading asset: ${fileName}`);

						const asset = await octokit.rest.repos.uploadReleaseAsset({
							owner: context.repo.owner,
							repo: context.repo.repo,
							release_id: release.data.id,
							name: fileName,
							data: fileContent as unknown as string,
						});

						info(`Uploaded: ${asset.data.browser_download_url}`);

						// Create attestation for the uploaded release asset
						const attestationResult = await createReleaseAssetAttestation(artifactPath, pkg.name, pkg.version, dryRun);

						const assetInfo: AssetInfo = {
							name: fileName,
							downloadUrl: asset.data.browser_download_url,
							size: asset.data.size,
							attestationUrl: attestationResult.success ? attestationResult.attestationUrl : undefined,
						};

						releaseInfo.assets.push(assetInfo);

						if (attestationResult.success && attestationResult.attestationUrl) {
							info(`  ✓ Created attestation: ${attestationResult.attestationUrl}`);
						}
					} catch (err) {
						warning(`Failed to upload artifact ${artifactPath}: ${err instanceof Error ? err.message : String(err)}`);
					}
				}
			}

			// Update release notes to include asset attestations
			if (releaseInfo.assets.length > 0) {
				const assetAttestations = releaseInfo.assets.filter((a) => a.attestationUrl);
				if (assetAttestations.length > 0) {
					releaseNotes += "\n\n### Release Asset Attestations:\n\n";
					for (const asset of assetAttestations) {
						releaseNotes += `- **${asset.name}**: [Attestation](${asset.attestationUrl})\n`;
					}

					// Update the release body with asset attestations
					try {
						await octokit.rest.repos.updateRelease({
							owner: context.repo.owner,
							repo: context.repo.repo,
							release_id: release.data.id,
							body: releaseNotes.trim(),
						});
						info(`Updated release notes with asset attestations`);
					} catch (err) {
						warning(`Failed to update release notes: ${err instanceof Error ? err.message : String(err)}`);
					}
				}
			}

			releases.push(releaseInfo);
		} catch (err) {
			const errorMessage = `Failed to create release for ${tag.name}: ${err instanceof Error ? err.message : String(err)}`;
			error(errorMessage);
			errors.push(errorMessage);
		}
	}

	endGroup();

	return {
		success: errors.length === 0,
		releases,
		createdTags,
		errors,
	};
}
