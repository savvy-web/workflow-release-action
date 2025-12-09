import { readdir } from "node:fs/promises";
import { debug, endGroup, getBooleanInput, getInput, getState, info, startGroup, warning } from "@actions/core";
import type { ExecOptions } from "@actions/exec";
import { exec } from "@actions/exec";
import { context, getOctokit } from "@actions/github";
import { createApiCommit, updateBranchToRef } from "./create-api-commit.js";
import { summaryWriter } from "./summary-writer.js";

/**
 * Linked issue information
 */
interface LinkedIssue {
	/** Issue number */
	number: number;
	/** Issue title */
	title: string;
	/** Issue state */
	state: string;
	/** Issue URL */
	url: string;
	/** Commits that reference this issue */
	commits: string[];
	/** GitHub node ID for GraphQL operations */
	nodeId?: string;
}

/**
 * Extracts issue references from commit messages
 *
 * Supports patterns:
 * - closes #123
 * - fixes #123
 * - resolves #123
 * - close #123, fix #123, resolve #123
 * - (case insensitive)
 *
 * @param message - Commit message to parse
 * @returns Array of issue numbers referenced
 */
function extractIssueReferences(message: string): number[] {
	const pattern = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi;
	const matches = message.matchAll(pattern);
	const issues = new Set<number>();

	for (const match of matches) {
		const issueNumber = Number.parseInt(match[1], 10);
		/* v8 ignore next -- @preserve - Defensive: regex \d+ always captures valid digits */
		if (!Number.isNaN(issueNumber)) {
			issues.add(issueNumber);
		}
	}

	return Array.from(issues);
}

/**
 * Extracts PR number from commit message
 *
 * GitHub merge commits have format: "Title (#123)"
 *
 * @param message - Commit message to parse
 * @returns PR number if found, null otherwise
 */
function extractPRNumber(message: string): number | null {
	const match = message.match(/\(#(\d+)\)$/m);
	if (match) {
		return Number.parseInt(match[1], 10);
	}
	return null;
}

/**
 * Gets linked issues from a PR using GraphQL
 *
 * @param github - Octokit instance
 * @param prNumber - PR number
 * @returns Array of linked issue numbers
 */
async function getLinkedIssuesFromPR(github: ReturnType<typeof getOctokit>, prNumber: number): Promise<number[]> {
	try {
		const query = `
			query ($owner: String!, $repo: String!, $prNumber: Int!) {
				repository(owner: $owner, name: $repo) {
					pullRequest(number: $prNumber) {
						closingIssuesReferences(first: 50) {
							nodes {
								number
							}
						}
					}
				}
			}
		`;

		const result: {
			repository: {
				pullRequest: {
					closingIssuesReferences: {
						nodes: Array<{ number: number }>;
					};
				};
			};
		} = await github.graphql(query, {
			owner: context.repo.owner,
			repo: context.repo.repo,
			prNumber,
		});

		return result.repository.pullRequest.closingIssuesReferences.nodes.map((node) => node.number);
	} catch (error) {
		debug(`Failed to get linked issues for PR #${prNumber}: ${error instanceof Error ? error.message : String(error)}`);
		return [];
	}
}

/**
 * Gets changeset files from the .changeset directory
 *
 * @returns Array of changeset file paths (excluding README.md and config.json)
 */
async function getChangesetFiles(): Promise<string[]> {
	try {
		const files = await readdir(".changeset");
		return files.filter((f) => f.endsWith(".md") && f !== "README.md");
	} catch {
		return [];
	}
}

/**
 * Gets commit information for a file using git log
 *
 * Looks at the remote branch history since changesets are added there by developers.
 * Uses --follow and --reverse to find the original commit that first introduced the file,
 * not merge commits that might also show the file as "added".
 *
 * @param filePath - Path to the file
 * @param remoteBranch - Remote branch ref to search history on (e.g., "origin/main")
 * @returns Commit SHA and message that introduced the file, or null if not found
 */
async function getCommitForFile(
	filePath: string,
	remoteBranch: string,
): Promise<{ sha: string; message: string } | null> {
	let output = "";

	try {
		// Use --follow to track file history and --reverse to get oldest first
		// This ensures we find the original commit that introduced the file,
		// not a merge commit or later commit that also shows it as "added"
		const args = [
			"log",
			remoteBranch,
			"--diff-filter=A",
			"--follow",
			"--reverse",
			"--format=%H%n%B%n---END---",
			"--",
			filePath,
		];
		debug(`Running: git ${args.join(" ")}`);

		await exec("git", args, {
			listeners: {
				stdout: (data: Buffer) => {
					output += data.toString();
				},
			},
			silent: true,
		});

		if (!output.trim()) {
			debug(`No git log output for ${filePath}`);
			return null;
		}

		// Parse the output: first entry (with --reverse) is the original commit
		// first line is SHA, rest until ---END--- is message
		const endMarker = output.indexOf("---END---");
		if (endMarker === -1) {
			debug(`No ---END--- marker found in output for ${filePath}`);
			return null;
		}

		const content = output.substring(0, endMarker).trim();
		const firstNewline = content.indexOf("\n");
		if (firstNewline === -1) {
			return { sha: content, message: "" };
		}

		return {
			sha: content.substring(0, firstNewline),
			message: content.substring(firstNewline + 1).trim(),
		};
	} catch (error) {
		debug(`Error getting commit for ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
		return null;
	}
}

/**
 * Collects linked issues from changeset commits
 *
 * @param github - GitHub API client
 * @param targetBranch - The target branch name (e.g., "main")
 * @returns Array of linked issues with details
 */
async function collectLinkedIssuesFromChangesets(
	github: ReturnType<typeof getOctokit>,
	targetBranch: string,
): Promise<{ linkedIssues: LinkedIssue[]; commits: Array<{ sha: string; message: string }> }> {
	const changesetFiles = await getChangesetFiles();
	info(`Found ${changesetFiles.length} changeset file(s): ${changesetFiles.join(", ")}`);

	if (changesetFiles.length === 0) {
		return { linkedIssues: [], commits: [] };
	}

	// Fetch the target branch to ensure we have full history
	// This is needed because the checkout might be shallow or we might be on a different branch
	info(`Fetching origin/${targetBranch} to get full history...`);
	try {
		await exec("git", ["fetch", "origin", targetBranch, "--unshallow"], {
			ignoreReturnCode: true, // May fail if already unshallow
			silent: true,
		});
	} catch {
		// Ignore errors - might already be unshallow
	}

	// Also fetch with full depth in case unshallow didn't work
	try {
		await exec("git", ["fetch", "origin", `${targetBranch}:refs/remotes/origin/${targetBranch}`], {
			ignoreReturnCode: true,
			silent: true,
		});
	} catch {
		// Ignore errors
	}

	// Use origin/targetBranch to search the remote's history
	const remoteBranch = `origin/${targetBranch}`;
	info(`Searching ${remoteBranch} for changeset commits...`);

	// Map of issue number to commit SHAs that reference it
	const issueMap = new Map<number, string[]>();
	const commits: Array<{ sha: string; message: string }> = [];

	for (const file of changesetFiles) {
		const commit = await getCommitForFile(`.changeset/${file}`, remoteBranch);
		if (commit) {
			commits.push(commit);
			info(`Changeset ${file}:`);
			info(`  Commit: ${commit.sha.slice(0, 7)}`);
			info(`  Message: ${commit.message.split("\n")[0]}`);

			// Extract issue references from commit message
			const issues = extractIssueReferences(commit.message);
			info(`  Issue refs: ${issues.length > 0 ? issues.map((i) => `#${i}`).join(", ") : "(none found)"}`);

			for (const issueNumber of issues) {
				if (!issueMap.has(issueNumber)) {
					issueMap.set(issueNumber, []);
				}
				issueMap.get(issueNumber)?.push(commit.sha);
			}

			// Check if this commit message references a PR (merge commit format)
			const prNumber = extractPRNumber(commit.message);
			if (prNumber) {
				info(`  PR reference: #${prNumber}`);
				const prIssues = await getLinkedIssuesFromPR(github, prNumber);
				if (prIssues.length > 0) {
					info(`  PR #${prNumber} has ${prIssues.length} linked issue(s):`);
					for (const issueNumber of prIssues) {
						info(`    - Issue #${issueNumber}`);
						if (!issueMap.has(issueNumber)) {
							issueMap.set(issueNumber, []);
						}
						issueMap.get(issueNumber)?.push(commit.sha);
					}
				} else {
					info(`  PR #${prNumber} has no linked issues`);
				}
			}
		} else {
			info(`Changeset ${file}: no commit found in ${remoteBranch} history`);
		}
	}

	info(`Found ${issueMap.size} unique issue reference(s) from ${commits.length} changeset commit(s)`);

	// Fetch issue details
	const linkedIssues: LinkedIssue[] = [];

	for (const [issueNumber, commitShas] of issueMap.entries()) {
		try {
			const { data: issue } = await github.rest.issues.get({
				owner: context.repo.owner,
				repo: context.repo.repo,
				issue_number: issueNumber,
			});

			linkedIssues.push({
				number: issueNumber,
				title: issue.title,
				state: issue.state,
				url: issue.html_url,
				commits: commitShas,
				nodeId: issue.node_id,
			});

			info(`✓ Issue #${issueNumber}: ${issue.title} (${issue.state})`);
		} catch (error) {
			warning(`Failed to fetch issue #${issueNumber}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	return { linkedIssues, commits };
}

/**
 * Builds a linked issues section for PR body
 *
 * Uses "Closes #123" format which GitHub automatically detects and populates
 * in closingIssuesReferences. This allows the issues to be closed when the PR merges.
 *
 * @param linkedIssues - Array of linked issues
 * @returns Markdown section for linked issues
 */
function buildLinkedIssuesSection(linkedIssues: LinkedIssue[]): string {
	if (linkedIssues.length === 0) {
		return "";
	}

	const issueItems = linkedIssues.map((issue) => {
		if (issue.state === "closed") {
			// Already closed issues - just show as strikethrough (don't use Closes keyword)
			return `~~#${issue.number}: ${issue.title}~~ (already closed)`;
		}
		// Open issues - use "Closes" keyword so GitHub detects them for closingIssuesReferences
		return `Closes #${issue.number}: ${issue.title}`;
	});

	return summaryWriter.build([{ heading: "Linked Issues", content: summaryWriter.list(issueItems) }]);
}

/**
 * Update release branch result
 */
interface UpdateReleaseBranchResult {
	/** Whether the update was successful */
	success: boolean;
	/** Whether there were merge conflicts (always false with recreate strategy) */
	hadConflicts: boolean;
	/** PR number if it exists */
	prNumber: number | null;
	/** GitHub check run ID */
	checkId: number;
	/** Version summary */
	versionSummary: string;
	/** Linked issues found from changeset commits */
	linkedIssues: LinkedIssue[];
}

/**
 * Executes a command with retry logic and exponential backoff
 *

 * @param exec - GitHub Actions exec module
 * @param command - Command to execute
 * @param args - Command arguments
 * @param options - Exec options
 * @param maxRetries - Maximum number of retries (default: 3)
 * @returns Promise that resolves when command succeeds
 */
async function execWithRetry(
	command: string,
	args: string[],
	options: ExecOptions = {},
	maxRetries: number = 3,
): Promise<void> {
	const retryableErrors = ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"];
	const baseDelay = 1000;
	const maxDelay = 10000;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			await exec(command, args, options);
			return;
		} catch (err) {
			const isLastAttempt = attempt === maxRetries;
			const errorMessage = err instanceof Error ? err.message : String(err);
			const isRetryable = retryableErrors.some((errType) => errorMessage.includes(errType));

			if (isLastAttempt || !isRetryable) {
				throw err;
			}

			// Exponential backoff with jitter
			const delay = Math.min(baseDelay * 2 ** attempt + Math.random() * 1000, maxDelay);
			warning(`Attempt ${attempt + 1} failed: ${errorMessage}. Retrying in ${Math.round(delay)}ms...`);

			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}
}

/**
 * Updates the release branch with changes from target branch
 *
 * @param releaseBranch - Release branch name
 * @param targetBranch - Target branch to merge from
 * @param prNumber - PR number if it exists
 * @param packageManager - Package manager to use
 * @param versionCommand - Custom version command
 * @param dryRun - Whether this is a dry-run
 * @returns Update release branch result
 */
export async function updateReleaseBranch(): Promise<UpdateReleaseBranchResult> {
	// Read all inputs
	const token = getState("token");
	if (!token) {
		throw new Error("No token available from state - ensure pre.ts ran successfully");
	}
	const releaseBranch = getInput("release-branch") || "changeset-release/main";
	const targetBranch = getInput("target-branch") || "main";
	const packageManager = getState("packageManager") || "pnpm";
	const versionCommand = getInput("version-command") || "";
	const dryRun = getBooleanInput("dry-run") || false;

	const github = getOctokit(token);
	// Find the PR for this release branch (open or closed)
	let prNumber: number | null = null;
	let prWasClosed = false;
	try {
		// First check for open PRs
		const { data: openPrs } = await github.rest.pulls.list({
			owner: context.repo.owner,
			repo: context.repo.repo,
			state: "open",
			head: `${context.repo.owner}:${releaseBranch}`,
			base: targetBranch,
		});
		if (openPrs.length > 0) {
			prNumber = openPrs[0].number;
		} else {
			// Check for closed PRs (force push can close them)
			const { data: closedPrs } = await github.rest.pulls.list({
				owner: context.repo.owner,
				repo: context.repo.repo,
				state: "closed",
				head: `${context.repo.owner}:${releaseBranch}`,
				base: targetBranch,
			});
			// Find a closed PR that wasn't merged (merged PRs have merged_at set)
			const unmergedClosedPr = closedPrs.find((pr) => !pr.merged_at);
			if (unmergedClosedPr) {
				prNumber = unmergedClosedPr.number;
				prWasClosed = true;
				info(`Found closed (unmerged) PR #${prNumber} - will reopen after branch update`);
			}
		}
	} catch (err) {
		warning(`Could not find PR: ${err instanceof Error ? err.message : String(err)}`);
	}

	const prTitlePrefix = getInput("pr-title-prefix") || "chore: release";

	// Collect linked issues from changeset commits BEFORE running version command
	// (version command deletes changeset files)
	startGroup("Collecting linked issues from changeset commits");
	let linkedIssues: LinkedIssue[] = [];
	if (!dryRun) {
		const issueResult = await collectLinkedIssuesFromChangesets(github, targetBranch);
		linkedIssues = issueResult.linkedIssues;
	} else {
		info("[DRY RUN] Would collect linked issues from changeset commits");
	}
	endGroup();

	startGroup("Updating release branch");

	// Strategy: Recreate the release branch from main to ensure it's always up-to-date
	// This avoids merge conflicts and ensures a clean history
	info(`Recreating release branch '${releaseBranch}' from '${targetBranch}'`);

	// We're already on main from the workflow checkout
	// Create the release branch locally from main HEAD
	if (!dryRun) {
		// Delete local release branch if it exists (ignore errors)
		await exec("git", ["branch", "-D", releaseBranch], { ignoreReturnCode: true });

		// Create new release branch from current HEAD (main)
		await exec("git", ["checkout", "-b", releaseBranch]);
	} else {
		info(`[DRY RUN] Would recreate branch: ${releaseBranch} from ${targetBranch}`);
	}

	// Run changeset version to update versions
	info("Running changeset version");
	const versionCmd =
		versionCommand || (packageManager === "pnpm" ? "pnpm" : packageManager === "yarn" ? "yarn" : "npm");
	const versionArgs =
		versionCommand === ""
			? packageManager === "pnpm"
				? ["ci:version"]
				: packageManager === "yarn"
					? ["ci:version"]
					: ["run", "ci:version"]
			: versionCommand.split(" ");

	if (!dryRun) {
		await execWithRetry(versionCmd, versionArgs);
	} else {
		info(`[DRY RUN] Would run: ${versionCmd} ${versionArgs.join(" ")}`);
	}

	// Check for new changes
	let hasChanges = false;
	let changedFiles = "";

	if (!dryRun) {
		await exec("git", ["status", "--porcelain"], {
			listeners: {
				stdout: (data: Buffer) => {
					changedFiles += data.toString();
				},
			},
		});
		hasChanges = changedFiles.trim().length > 0;
	} else {
		// In dry-run mode, assume changes exist
		hasChanges = true;
		info("[DRY RUN] Assuming changes exist for version bump");
	}

	let versionSummary = "";

	if (hasChanges) {
		// Generate version summary from changed files
		versionSummary = changedFiles
			.split("\n")
			.filter((line) => line.includes("package.json") || line.includes("CHANGELOG.md"))
			.join("\n");

		info("New version changes:");
		info(versionSummary);

		// Stage all changes for the API commit
		if (!dryRun) {
			await exec("git", ["add", "."]);
		}

		// Create commit via GitHub API on top of main, then update release branch ref
		// This is a single atomic operation - no separate force push needed
		const commitMessage = `${prTitlePrefix}\n\nVersion bump from changesets (rebased on ${targetBranch})`;
		if (!dryRun) {
			info("Creating verified commit via GitHub API (rebasing onto main)...");
			const commitResult = await createApiCommit(token, releaseBranch, commitMessage, {
				parentBranch: targetBranch,
			});
			if (!commitResult.created) {
				warning("No changes to commit via API");
			} else {
				info(`✓ Created verified commit: ${commitResult.sha}`);
			}
		} else {
			info(`[DRY RUN] Would create API commit with message: ${commitMessage}`);
		}
	} else {
		info("No version changes from changesets");

		// Update release branch to point to main via API (no git push needed)
		// Note: This only happens in non-dry-run mode since dry-run always assumes changes exist
		const sha = await updateBranchToRef(token, releaseBranch, targetBranch);
		info(`✓ Updated '${releaseBranch}' to match '${targetBranch}' (${sha})`);
	}

	endGroup();

	// Reopen PR if it was closed by force push
	if (prWasClosed && prNumber && !dryRun) {
		startGroup("Reopening closed PR");
		try {
			await github.rest.pulls.update({
				owner: context.repo.owner,
				repo: context.repo.repo,
				pull_number: prNumber,
				state: "open",
			});
			info(`✓ Reopened PR #${prNumber}`);
		} catch (err) {
			warning(`Could not reopen PR #${prNumber}: ${err instanceof Error ? err.message : String(err)}`);
		}
		endGroup();
	} else if (prWasClosed && prNumber && dryRun) {
		info(`[DRY RUN] Would reopen PR #${prNumber}`);
	}

	// Create new PR if none exists (branch exists but PR was merged and deleted)
	if (!prNumber && !dryRun) {
		startGroup("Creating new release PR");
		const prTitle = prTitlePrefix;

		// Build PR body using summaryWriter (markdown, not HTML)
		const prBodySections: Array<{ heading?: string; level?: 2 | 3; content: string }> = [
			{ heading: "Release PR", content: "This PR was automatically generated by the release workflow." },
		];

		if (versionSummary) {
			prBodySections.push({
				heading: "Version Changes",
				level: 3,
				content: summaryWriter.codeBlock(versionSummary, "text"),
			});
		}

		// Add linked issues section if any
		if (linkedIssues.length > 0) {
			const linkedIssuesSection = buildLinkedIssuesSection(linkedIssues);
			prBodySections.unshift({ content: linkedIssuesSection });
		}

		prBodySections.push({
			content: `---\n🤖 Generated with [GitHub Actions](https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId})`,
		});

		const prBody = summaryWriter.build(prBodySections);

		try {
			const { data: pr } = await github.rest.pulls.create({
				owner: context.repo.owner,
				repo: context.repo.repo,
				title: prTitle,
				head: releaseBranch,
				base: targetBranch,
				body: prBody,
			});

			prNumber = pr.number;

			// Add labels
			await github.rest.issues.addLabels({
				owner: context.repo.owner,
				repo: context.repo.repo,
				issue_number: prNumber,
				labels: ["automated", "release"],
			});

			info(`✓ Created new release PR #${prNumber}: ${pr.html_url}`);
		} catch (err) {
			// Retry PR creation once after brief delay
			warning(`PR creation failed, retrying: ${err instanceof Error ? err.message : String(err)}`);
			await new Promise((resolve) => setTimeout(resolve, 2000));

			const { data: pr } = await github.rest.pulls.create({
				owner: context.repo.owner,
				repo: context.repo.repo,
				title: prTitle,
				head: releaseBranch,
				base: targetBranch,
				body: prBody,
			});

			prNumber = pr.number;

			await github.rest.issues.addLabels({
				owner: context.repo.owner,
				repo: context.repo.repo,
				issue_number: prNumber,
				labels: ["automated", "release"],
			});

			info(`✓ Created new release PR #${prNumber}: ${pr.html_url}`);
		}
		endGroup();
	} else if (!prNumber && dryRun) {
		info("[DRY RUN] Would create new release PR (no existing PR found)");
	}

	// Update PR body with linked issues
	if (prNumber && linkedIssues.length > 0 && !dryRun) {
		startGroup("Updating PR with linked issues");
		try {
			// Get current PR body
			const { data: pr } = await github.rest.pulls.get({
				owner: context.repo.owner,
				repo: context.repo.repo,
				pull_number: prNumber,
			});

			// Build linked issues section
			const linkedIssuesSection = buildLinkedIssuesSection(linkedIssues);

			// Update PR body - prepend linked issues section
			// Remove any existing linked issues section first
			let currentBody = pr.body || "";
			const existingLinkedIssuesIndex = currentBody.indexOf("## Linked Issues");
			if (existingLinkedIssuesIndex !== -1) {
				// Find the end of the section (next ## heading or end of string)
				const nextHeadingIndex = currentBody.indexOf("\n## ", existingLinkedIssuesIndex + 1);
				if (nextHeadingIndex !== -1) {
					currentBody =
						currentBody.substring(0, existingLinkedIssuesIndex) + currentBody.substring(nextHeadingIndex + 1);
				} else {
					currentBody = currentBody.substring(0, existingLinkedIssuesIndex);
				}
			}

			const newBody = `${linkedIssuesSection}\n${currentBody.trim()}`;

			await github.rest.pulls.update({
				owner: context.repo.owner,
				repo: context.repo.repo,
				pull_number: prNumber,
				body: newBody,
			});

			info(`✓ Updated PR #${prNumber} with ${linkedIssues.length} linked issue(s)`);
		} catch (err) {
			warning(`Could not update PR body: ${err instanceof Error ? err.message : String(err)}`);
		}
		endGroup();
	}
	// Note: No dry-run branch needed here because linkedIssues is always empty in dry-run mode
	// (see line 474-479 where collection is skipped in dry-run mode)

	// Build check details using summaryWriter (markdown, not HTML)
	const checkStatusTable = summaryWriter.keyValueTable([
		{ key: "Branch", value: `\`${releaseBranch}\`` },
		{ key: "Base", value: `\`${targetBranch}\`` },
		{ key: "Strategy", value: "Recreate from main" },
		{ key: "Version Changes", value: hasChanges ? "✅ Yes" : "❌ No" },
		{ key: "Linked Issues", value: linkedIssues.length > 0 ? `${linkedIssues.length} issue(s)` : "_None_" },
		{
			key: "PR",
			value: prNumber
				? `[#${prNumber}](https://github.com/${context.repo.owner}/${context.repo.repo}/pull/${prNumber})`
				: "_N/A_",
		},
	]);

	const checkSections: Array<{ heading?: string; level?: 2 | 3; content: string }> = [
		{ heading: "Release Branch Updated", content: checkStatusTable },
	];

	if (linkedIssues.length > 0) {
		const issuesList = summaryWriter.list(
			linkedIssues.map((issue) => `[#${issue.number}](${issue.url}) - ${issue.title} (${issue.state})`),
		);
		checkSections.push({
			heading: "Linked Issues",
			level: 3,
			content: issuesList,
		});
	}

	if (hasChanges) {
		checkSections.push({
			heading: "Version Changes",
			level: 3,
			content: summaryWriter.codeBlock(versionSummary, "text"),
		});
	}

	const checkDetails = summaryWriter.build(checkSections);

	const { data: checkRun } = await github.rest.checks.create({
		owner: context.repo.owner,
		repo: context.repo.repo,
		name: dryRun ? "🧪 Update Release Branch (Dry Run)" : "Update Release Branch",
		head_sha: context.sha,
		status: "completed",
		conclusion: "success",
		output: {
			title: hasChanges ? "Release branch recreated from main with version changes" : "Release branch synced with main",
			summary: checkDetails,
		},
	});

	// Write job summary using summaryWriter (markdown, not HTML)
	const jobTitle = dryRun ? "🧪 Update Release Branch (Dry Run)" : "Update Release Branch";
	const jobStatusTable = summaryWriter.keyValueTable([
		{ key: "Branch", value: `\`${releaseBranch}\`` },
		{ key: "Base", value: `\`${targetBranch}\`` },
		{ key: "Strategy", value: "Recreate from main" },
		{ key: "Version Changes", value: hasChanges ? "✅ Yes" : "❌ No" },
		{ key: "Linked Issues", value: linkedIssues.length > 0 ? `${linkedIssues.length} issue(s)` : "_None_" },
		{ key: "PR", value: prNumber ? `#${prNumber}` : "_N/A_" },
	]);

	const jobSections: Array<{ heading?: string; level?: 2 | 3; content: string }> = [
		{
			heading: jobTitle,
			content: hasChanges
				? "✅ Release branch recreated from main with version changes"
				: "✅ Release branch synced with main (no version changes)",
		},
		{ heading: "Update Summary", level: 3, content: jobStatusTable },
	];

	if (linkedIssues.length > 0) {
		const jobIssuesList = summaryWriter.list(
			linkedIssues.map((issue) => `#${issue.number} - ${issue.title} (${issue.state})`),
		);
		jobSections.push({
			heading: "Linked Issues",
			level: 3,
			content: jobIssuesList,
		});
	}

	if (hasChanges) {
		jobSections.push({
			heading: "Version Changes",
			level: 3,
			content: summaryWriter.codeBlock(versionSummary, "text"),
		});
	}

	await summaryWriter.write(summaryWriter.build(jobSections));

	return {
		success: true,
		hadConflicts: false,
		prNumber,
		checkId: checkRun.id,
		versionSummary,
		linkedIssues,
	};
}
