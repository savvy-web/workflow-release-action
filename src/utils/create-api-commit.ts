import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { debug, endGroup, getState, info, startGroup } from "@actions/core";
import { exec } from "@actions/exec";
import { context, getOctokit } from "@actions/github";

type Octokit = ReturnType<typeof getOctokit>;

/**
 * File change mode for git tree objects
 */
type GitFileMode = "100644" | "100755" | "040000" | "160000" | "120000";

/**
 * Tree object for creating git tree via API
 */
interface TreeObject {
	path: string;
	mode: GitFileMode;
	type: "blob" | "tree" | "commit";
	sha: string | null;
}

/**
 * Result of creating a commit via API
 */
interface CreateApiCommitResult {
	/** Commit SHA */
	sha: string;
	/** Whether the commit was created */
	created: boolean;
}

/**
 * Gets the list of changed files from git status
 *
 * @returns Array of file paths and their status
 */
async function getChangedFiles(): Promise<Array<{ path: string; status: string }>> {
	let output = "";
	await exec("git", ["status", "--porcelain", "-z"], {
		listeners: {
			stdout: (data: Buffer) => {
				output += data.toString();
			},
		},
	});

	// Parse null-separated output
	const entries = output.split("\0").filter((entry) => entry.length > 0);
	const files: Array<{ path: string; status: string }> = [];

	for (const entry of entries) {
		// Format: XY path or XY orig -> path (for renames)
		const status = entry.substring(0, 2).trim();
		let filePath = entry.substring(3);

		// Handle renames: "R  old -> new"
		if (filePath.includes(" -> ")) {
			filePath = filePath.split(" -> ")[1];
		}

		if (filePath) {
			files.push({ path: filePath, status });
		}
	}

	return files;
}

/**
 * Creates a blob for a file via GitHub API
 *
 * @param octokit - GitHub API client
 * @param filePath - Path to the file
 * @returns Blob SHA
 */
async function createBlob(octokit: Octokit, filePath: string): Promise<string> {
	const absolutePath = resolve(process.cwd(), filePath);
	const content = await readFile(absolutePath);
	const base64Content = content.toString("base64");

	const { data: blob } = await octokit.rest.git.createBlob({
		owner: context.repo.owner,
		repo: context.repo.repo,
		content: base64Content,
		encoding: "base64",
	});

	return blob.sha;
}

/**
 * Gets the file mode from git
 *
 * @param filePath - Path to the file
 * @returns Git file mode
 */
async function getFileMode(filePath: string): Promise<GitFileMode> {
	// Check if file is executable
	try {
		const absolutePath = resolve(process.cwd(), filePath);
		const stats = await stat(absolutePath);
		// Check if any execute bit is set
		if (stats.mode & 0o111) {
			return "100755";
		}
	} catch {
		// File might be deleted
	}
	return "100644";
}

/**
 * Options for creating an API commit
 */
interface CreateApiCommitOptions {
	/** Branch to use as parent for the commit (defaults to targetBranch) */
	parentBranch?: string;
	/** Parent commit SHA to use (avoids API call to get ref) */
	parentCommitSha?: string;
	/** Whether to force update the ref (for rebasing onto different parent) */
	force?: boolean;
}

/**
 * Creates a commit via GitHub API (automatically signed and attributed to the GitHub App)
 *
 * This function:
 * 1. Gets the list of changed files from git status
 * 2. Creates blobs for each changed file
 * 3. Creates a new tree with the blobs
 * 4. Creates a commit pointing to the new tree
 * 5. Updates the branch ref to point to the new commit
 *
 * Commits created via the API are automatically signed when using a GitHub App token.
 *
 * @param token - GitHub token (should be from GitHub App for verified commits)
 * @param branch - Branch name to update with the new commit
 * @param message - Commit message
 * @param options - Optional settings for parent branch and force update
 * @returns Commit result with SHA
 */
export async function createApiCommit(
	token: string,
	branch: string,
	message: string,
	options: CreateApiCommitOptions = {},
): Promise<CreateApiCommitResult> {
	const octokit = getOctokit(token);
	const { owner, repo } = context.repo;
	const parentBranch = options.parentBranch || branch;
	const force = options.force ?? parentBranch !== branch;

	startGroup("Creating API commit");

	// Get changed files
	const changedFiles = await getChangedFiles();

	if (changedFiles.length === 0) {
		info("No changes to commit");
		endGroup();
		return { sha: "", created: false };
	}

	info(`Found ${changedFiles.length} changed file(s)`);
	debug(`Changed files: ${JSON.stringify(changedFiles, null, 2)}`);

	// Get the parent commit SHA - either from options or from the specified parent branch
	let parentCommitSha: string;
	if (options.parentCommitSha) {
		parentCommitSha = options.parentCommitSha;
		info(`Using provided parent commit SHA: ${parentCommitSha}`);
	} else {
		const { data: refData } = await octokit.rest.git.getRef({
			owner,
			repo,
			ref: `heads/${parentBranch}`,
		});
		parentCommitSha = refData.object.sha;
	}

	// Get the parent commit's tree
	const { data: parentCommit } = await octokit.rest.git.getCommit({
		owner,
		repo,
		commit_sha: parentCommitSha,
	});
	const baseTreeSha = parentCommit.tree.sha;

	info(`Parent branch: ${parentBranch}`);
	info(`Parent commit: ${parentCommitSha}`);
	info(`Base tree: ${baseTreeSha}`);

	// Create tree objects for all changed files
	const treeObjects: TreeObject[] = [];

	for (const file of changedFiles) {
		if (file.status === "D" || file.status.includes("D")) {
			// Deleted file - set sha to null to remove
			treeObjects.push({
				path: file.path,
				mode: "100644",
				type: "blob",
				sha: null,
			});
			debug(`Delete: ${file.path}`);
		} else {
			// Added or modified file - create blob
			const blobSha = await createBlob(octokit, file.path);
			const mode = await getFileMode(file.path);
			treeObjects.push({
				path: file.path,
				mode,
				type: "blob",
				sha: blobSha,
			});
			debug(`${file.status === "A" || file.status === "?" ? "Add" : "Modify"}: ${file.path} (${blobSha})`);
		}
	}

	// Create the new tree
	info("Creating tree...");
	const { data: newTree } = await octokit.rest.git.createTree({
		owner,
		repo,
		base_tree: baseTreeSha,
		tree: treeObjects,
	});
	info(`Created tree: ${newTree.sha}`);

	// Create the commit with DCO sign-off
	info("Creating commit...");
	const appSlug = getState("appSlug");
	const botName = appSlug ? `${appSlug}[bot]` : "github-actions[bot]";
	const botEmail = appSlug
		? `${appSlug}[bot]@users.noreply.github.com`
		: "41898282+github-actions[bot]@users.noreply.github.com";
	const signedMessage = `${message}\n\nSigned-off-by: ${botName} <${botEmail}>`;

	const { data: newCommit } = await octokit.rest.git.createCommit({
		owner,
		repo,
		message: signedMessage,
		tree: newTree.sha,
		parents: [parentCommitSha],
	});
	info(`Created commit: ${newCommit.sha}`);

	// Update or create the branch ref
	try {
		info(`Updating ref heads/${branch}${force ? " (force)" : ""}...`);
		await octokit.rest.git.updateRef({
			owner,
			repo,
			ref: `heads/${branch}`,
			sha: newCommit.sha,
			force,
		});
		info(`✓ Updated branch ${branch} to ${newCommit.sha}`);
	} catch (error) {
		// If ref doesn't exist, create it
		if ((error as { status?: number }).status === 422 || (error as { status?: number }).status === 404) {
			info(`Ref heads/${branch} doesn't exist, creating it...`);
			await octokit.rest.git.createRef({
				owner,
				repo,
				ref: `refs/heads/${branch}`,
				sha: newCommit.sha,
			});
			info(`✓ Created branch ${branch} at ${newCommit.sha}`);
		} else {
			throw error;
		}
	}

	endGroup();

	return {
		sha: newCommit.sha,
		created: true,
	};
}

/**
 * Updates a branch ref to point to another branch's HEAD (fast-forward or force)
 *
 * Useful for syncing a branch to match another branch without creating a commit.
 *
 * @param token - GitHub token
 * @param targetBranch - Branch to update
 * @param sourceBranch - Branch to get the SHA from
 * @param force - Whether to force update (default: true)
 * @returns The SHA that the branch was updated to
 */
export async function updateBranchToRef(
	token: string,
	targetBranch: string,
	sourceBranch: string,
	force: boolean = true,
): Promise<string> {
	const octokit = getOctokit(token);
	const { owner, repo } = context.repo;

	// Get the source branch SHA
	const { data: sourceRef } = await octokit.rest.git.getRef({
		owner,
		repo,
		ref: `heads/${sourceBranch}`,
	});
	const sourceSha = sourceRef.object.sha;

	info(`Updating ${targetBranch} to ${sourceBranch} (${sourceSha})${force ? " (force)" : ""}`);

	// Update the target branch ref
	await octokit.rest.git.updateRef({
		owner,
		repo,
		ref: `heads/${targetBranch}`,
		sha: sourceSha,
		force,
	});

	info(`✓ Updated ${targetBranch} to ${sourceSha}`);
	return sourceSha;
}
