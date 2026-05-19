/**
 * Phase 1 stage: cut the release branch, run changeset version, commit the
 * version bump via the Git Data API, link the branch to closed issues from
 * the release, and open the release PR.
 *
 * @remarks
 * The commit is created through {@link GitCommit} so it is signed by the
 * GitHub App identity. Branch-linking and PR creation go through GraphQL
 * because that preserves the issue↔branch link the imperative version
 * established. PR creation is retried once on failure (network blip).
 */

import { FileSystem } from "@effect/platform";
import type {
	ActionEnvironmentError,
	ActionOutputError,
	ActionState,
	CheckRunError,
	CommandRunnerError,
	GitCommitError,
	GitHubClientError,
	GitHubIssue,
	GitHubIssueError,
	GitTag,
	PullRequestError,
} from "@savvy-web/github-action-effects";
import {
	ActionEnvironment,
	ActionOutputs,
	CheckRun,
	CommandRunner,
	GitCommit,
	GitHubClient,
	PullRequest,
} from "@savvy-web/github-action-effects";
import type { ConfigError } from "effect";
import { Config, Duration, Effect } from "effect";
import { resolveSignoff } from "./commit-signoff.js";
import { isSinglePackage } from "./detect-repo-type.js";
import { getLinkedIssuesFromCommits } from "./link-issues-from-commits.js";
import { summaryWriter } from "./summary-writer.js";

/** Public result returned to the orchestrator. */
export interface CreateReleaseBranchResult {
	created: boolean;
	prNumber: number | null;
	checkId: number;
	versionSummary: string;
}

/** Errors that bubble out of git/version exec calls or the changeset retry. */
const RETRYABLE_NETWORK_ERRORS = ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"];

/**
 * Run a command with exponential backoff on transient network errors. The
 * underlying {@link CommandRunner.exec} call already returns a non-zero
 * exit code as an error, so we only need to filter on the reason string
 * to decide whether to retry.
 *
 * @internal
 */
const execWithRetry = (
	command: string,
	args: ReadonlyArray<string>,
	maxRetries = 3,
): Effect.Effect<void, CommandRunnerError, CommandRunner> =>
	Effect.gen(function* () {
		const runner = yield* CommandRunner;
		const baseDelay = Duration.seconds(1);
		const maxDelay = Duration.seconds(10);

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			const result = yield* Effect.either(runner.exec(command, args).pipe(Effect.asVoid));
			if (result._tag === "Right") return;

			const isRetryable = RETRYABLE_NETWORK_ERRORS.some((code) => result.left.reason.includes(code));
			if (attempt === maxRetries || !isRetryable) {
				return yield* Effect.fail(result.left);
			}

			const exp = Math.min(2 ** attempt * Duration.toMillis(baseDelay), Duration.toMillis(maxDelay));
			const jitter = exp * (0.5 + Math.random() * 0.5);
			yield* Effect.logWarning(
				`Command failed on attempt ${attempt + 1}/${maxRetries + 1} (${result.left.reason}); retrying in ${Math.round(jitter)}ms`,
			);
			yield* Effect.sleep(Duration.millis(jitter));
		}
	});

/** Map package manager name to (command, version-args) defaults. */
const defaultVersionInvocation = (packageManager: string, versionCommand: string): { cmd: string; args: string[] } => {
	if (versionCommand !== "") {
		const parts = versionCommand.split(" ");
		return { cmd: parts[0], args: parts.slice(1) };
	}
	switch (packageManager) {
		case "pnpm":
			return { cmd: "pnpm", args: ["ci:version"] };
		case "yarn":
			return { cmd: "yarn", args: ["ci:version"] };
		case "bun":
			return { cmd: "bun", args: ["run", "ci:version"] };
		default:
			return { cmd: "npm", args: ["run", "ci:version"] };
	}
};

/** GraphQL response shape for the createLinkedBranch mutation. */
interface CreateLinkedBranchResponse {
	createLinkedBranch?: { linkedBranch: { id: string } };
}

/** GraphQL response shape for the createPullRequest mutation. */
interface CreatePullRequestResponse {
	createPullRequest: { pullRequest: { number: number; url: string; id: string } };
}

/** REST response shape for repos.get (we only need node_id). */
interface RepoNodeResponse {
	node_id: string;
}

const CREATE_LINKED_BRANCH_MUTATION = `
	mutation ($issueId: ID!, $name: String!, $oid: GitObjectID!, $repositoryId: ID!) {
		createLinkedBranch(input: { issueId: $issueId, name: $name, oid: $oid, repositoryId: $repositoryId }) {
			linkedBranch { id }
		}
	}
`;

export const CREATE_PULL_REQUEST_MUTATION = `
	mutation ($repositoryId: ID!, $baseRefName: String!, $headRefName: String!, $title: String!, $body: String!) {
		createPullRequest(input: {
			repositoryId: $repositoryId
			baseRefName: $baseRefName
			headRefName: $headRefName
			title: $title
			body: $body
		}) {
			pullRequest { number url id }
		}
	}
`;

/**
 * Run the `createReleaseBranch` stage.
 *
 * @public
 */
export const createReleaseBranch = (
	packageManager: string,
): Effect.Effect<
	CreateReleaseBranchResult,
	| ActionEnvironmentError
	| ActionOutputError
	| CheckRunError
	| CommandRunnerError
	| ConfigError.ConfigError
	| GitCommitError
	| GitHubClientError
	| GitHubIssueError
	| PullRequestError,
	| ActionEnvironment
	| ActionOutputs
	| ActionState
	| CheckRun
	| CommandRunner
	| FileSystem.FileSystem
	| GitCommit
	| GitHubClient
	| GitHubIssue
	| GitTag
	| PullRequest
> =>
	Effect.gen(function* () {
		const env = yield* ActionEnvironment;
		const outputs = yield* ActionOutputs;
		const checks = yield* CheckRun;
		const runner = yield* CommandRunner;
		const gitCommit = yield* GitCommit;
		const client = yield* GitHubClient;
		const pr = yield* PullRequest;
		const fs = yield* FileSystem.FileSystem;
		const signoff = yield* resolveSignoff();

		const releaseBranch = yield* Config.string("release-branch").pipe(Config.withDefault("changeset-release/main"));
		const targetBranch = yield* Config.string("target-branch").pipe(Config.withDefault("main"));
		const versionCommand = yield* Config.string("version-command").pipe(Config.withDefault(""));
		const prTitlePrefix = yield* Config.string("pr-title-prefix").pipe(Config.withDefault("chore: release"));
		const dryRun = yield* Config.boolean("dry-run").pipe(Config.withDefault(false));

		const { sha, repository } = yield* env.github;
		const [owner, repo] = repository.split("/");

		yield* Effect.logInfo(`Creating branch '${releaseBranch}' from '${targetBranch}' HEAD`);
		if (!dryRun) {
			yield* runner.exec("git", ["checkout", "-b", releaseBranch, `origin/${targetBranch}`]);
		} else {
			yield* Effect.logInfo(`[DRY RUN] Would create branch: ${releaseBranch} from origin/${targetBranch}`);
		}

		yield* Effect.logInfo("Running changeset version");
		const { cmd: versionCmd, args: versionArgs } = defaultVersionInvocation(packageManager, versionCommand);
		if (!dryRun) {
			yield* execWithRetry(versionCmd, versionArgs);
		} else {
			yield* Effect.logInfo(`[DRY RUN] Would run: ${versionCmd} ${versionArgs.join(" ")}`);
		}

		let changedFiles = "";
		let hasChanges = false;
		if (!dryRun) {
			const status = yield* runner.execCapture("git", ["status", "--porcelain"]);
			changedFiles = status.stdout;
			hasChanges = changedFiles.trim().length > 0;
		} else {
			hasChanges = true;
			yield* Effect.logInfo("[DRY RUN] Assuming changes exist for version bump");
		}

		if (!hasChanges) {
			yield* Effect.logInfo("No changes generated by changeset version. Cleaning up and exiting.");
			if (!dryRun) {
				yield* runner.exec("git", ["checkout", targetBranch]);
				yield* runner.exec("git", ["branch", "-D", releaseBranch]);
			}

			const checkTitle = dryRun ? "🧪 Create Release Branch (Dry Run)" : "Create Release Branch";
			const { id: noChangesId } = yield* checks.create(checkTitle, sha);
			yield* checks.complete(noChangesId, "neutral", {
				title: "No version changes generated",
				summary: "Changeset version command did not produce any changes. No release branch created.",
			});

			const noChangesSummary = summaryWriter.build([
				{ heading: checkTitle, content: "No version changes generated" },
				{ content: "Changeset version command did not produce any changes. No release branch created." },
			]);
			yield* outputs.summary(noChangesSummary);

			return { created: false, prNumber: null, checkId: noChangesId, versionSummary: "No changes" };
		}

		const versionSummary = changedFiles
			.split("\n")
			.filter((line) => line.includes("package.json") || line.includes("CHANGELOG.md"))
			.join("\n");
		yield* Effect.logInfo("Version changes:");
		yield* Effect.logInfo(versionSummary);

		let prTitle = prTitlePrefix;
		const singlePackage = isSinglePackage();
		if (singlePackage) {
			const readResult = yield* Effect.either(fs.readFileString("package.json"));
			if (readResult._tag === "Right") {
				try {
					const parsed = JSON.parse(readResult.right) as { version?: string };
					if (parsed.version) {
						prTitle = `release: ${parsed.version}`;
						yield* Effect.logInfo(`Single-package repo detected, using PR title: ${prTitle}`);
					}
				} catch (error) {
					yield* Effect.logWarning(
						`Failed to read version for PR title: ${error instanceof Error ? error.message : String(error)}`,
					);
				}
			} else {
				yield* Effect.logWarning(`Failed to read package.json: ${readResult.left.message}`);
			}
		}

		let parentSha = "";
		if (!dryRun) {
			const head = yield* runner.execCapture("git", ["rev-parse", "HEAD"]);
			parentSha = head.stdout.trim();
			yield* Effect.logInfo(`Current HEAD: ${parentSha}`);
		}

		const commitMessage = `${prTitlePrefix}\n\nVersion bump from changesets\n\n${signoff}`;
		let finalCommitSha = "";
		if (!dryRun) {
			yield* Effect.logInfo("Creating verified commit via GitHub API...");
			// `-z` uses NUL separators so the positional [0..2]=status, [3..]=path
			// parsing survives whitespace and trailing CRLF; trimming the line
			// itself would shift the column for unstaged changes (" M file" → "M file").
			const status = yield* runner.execCapture("git", ["status", "--porcelain", "-z"]);
			const files: Array<
				| { readonly path: string; readonly mode: "100644" | "100755"; readonly content: string }
				| { readonly path: string; readonly mode: "100644"; readonly sha: null }
			> = [];
			for (const entry of status.stdout.split("\0")) {
				if (entry.length === 0) continue;
				const statusCode = entry.substring(0, 2).trim();
				let filePath = entry.substring(3);
				if (filePath.includes(" -> ")) filePath = filePath.split(" -> ")[1];
				if (filePath === "") continue;
				if (statusCode === "D" || statusCode === "DD" || statusCode === "AD") {
					files.push({ path: filePath, mode: "100644", sha: null });
				} else {
					const content = yield* fs.readFileString(filePath).pipe(Effect.catchAll(() => Effect.succeed("")));
					const statResult = yield* Effect.either(fs.stat(filePath));
					const isExecutable = statResult._tag === "Right" && (Number(statResult.right.mode ?? 0n) & 0o111) !== 0;
					files.push({ path: filePath, mode: isExecutable ? "100755" : "100644", content });
				}
			}

			if (files.length === 0) {
				yield* Effect.logWarning("No changes to commit via API");
			} else {
				// The Git Data API's `base_tree` wants a tree SHA, not a commit
				// SHA — fetch the parent commit and read its tree.sha.
				const parentCommit = yield* client.rest<{ tree: { sha: string } }>("git.getCommit", (octokit) =>
					(
						octokit as {
							rest: {
								git: {
									getCommit: (params: { owner: string; repo: string; commit_sha: string }) => Promise<{
										data: { tree: { sha: string } };
									}>;
								};
							};
						}
					).rest.git.getCommit({ owner, repo, commit_sha: parentSha }),
				);
				const treeSha = yield* gitCommit.createTree(files, parentCommit.tree.sha);
				finalCommitSha = yield* gitCommit.createCommit(commitMessage, treeSha, [parentSha]);
				// updateRef fails 404/422 for a brand-new branch — fall back to createRef.
				// GitCommit.updateRef prefixes "heads/" itself — pass the bare branch name.
				const updateResult = yield* Effect.either(gitCommit.updateRef(releaseBranch, finalCommitSha, true));
				if (updateResult._tag === "Left") {
					yield* Effect.logInfo(`Ref heads/${releaseBranch} does not exist yet; creating it`);
					yield* client.rest<undefined>("git.createRef", (octokit) =>
						(
							octokit as {
								rest: {
									git: {
										createRef: (params: { owner: string; repo: string; ref: string; sha: string }) => Promise<{
											data: undefined;
										}>;
									};
								};
							}
						).rest.git.createRef({
							owner,
							repo,
							ref: `refs/heads/${releaseBranch}`,
							sha: finalCommitSha,
						}),
					);
				}
				yield* Effect.logInfo(`✓ Created verified commit: ${finalCommitSha}`);
			}
		} else {
			yield* Effect.logInfo(`[DRY RUN] Would commit with message: ${commitMessage}`);
		}

		let repoNodeId = "";
		if (!dryRun) {
			yield* Effect.logInfo("Fetching repository node ID...");
			const repoInfo = yield* client.rest<RepoNodeResponse>("repos.get", (octokit) =>
				(
					octokit as {
						rest: {
							repos: {
								get: (params: { owner: string; repo: string }) => Promise<{ data: RepoNodeResponse }>;
							};
						};
					}
				).rest.repos.get({ owner, repo }),
			);
			repoNodeId = repoInfo.node_id;
			yield* Effect.logInfo(`Repository node ID: ${repoNodeId}`);
		}

		if (!dryRun && finalCommitSha) {
			yield* Effect.logInfo(`Searching for linked issues from commits on branch: ${targetBranch}`);
			const { linkedIssues, commits } = yield* getLinkedIssuesFromCommits(targetBranch);
			yield* Effect.logInfo(`Found ${commits.length} commit(s) to analyze`);

			if (linkedIssues.length > 0) {
				yield* Effect.logInfo(`Found ${linkedIssues.length} issue(s) to link to branch:`);
				for (const issue of linkedIssues) {
					yield* Effect.logInfo(`  - Issue #${issue.number}: ${issue.title} (${issue.node_id})`);
				}
				yield* Effect.logInfo(`Linking branch '${releaseBranch}' at commit ${finalCommitSha} to issues...`);
				for (const issue of linkedIssues) {
					const linkResult = yield* Effect.either(
						client.graphql<CreateLinkedBranchResponse>(CREATE_LINKED_BRANCH_MUTATION, {
							issueId: issue.node_id,
							name: releaseBranch,
							oid: finalCommitSha,
							repositoryId: repoNodeId,
						}),
					);
					if (linkResult._tag === "Right") {
						yield* Effect.logInfo(`  ✓ Linked branch to issue #${issue.number}`);
					} else {
						yield* Effect.logWarning(`  Failed to link issue #${issue.number}: ${linkResult.left.reason}`);
					}
				}
				yield* Effect.logInfo(`✓ Successfully linked branch to ${linkedIssues.length} issue(s)`);
			} else {
				yield* Effect.logInfo("No issues found to link to branch");
			}
		} else if (!dryRun && !finalCommitSha) {
			yield* Effect.logInfo("No final commit SHA available, skipping branch linking");
		} else {
			yield* Effect.logInfo("[DRY RUN] Would link branch to issues from commits");
		}

		let prNumber: number | null = null;
		let prUrl = "";
		const prBody = "";

		if (!dryRun) {
			yield* Effect.logInfo("Creating PR via GraphQL API...");
			yield* Effect.logInfo(`  Repository: ${repoNodeId}`);
			yield* Effect.logInfo(`  Base: ${targetBranch}`);
			yield* Effect.logInfo(`  Head: ${releaseBranch}`);
			yield* Effect.logInfo(`  Title: ${prTitle}`);

			const createPr = client.graphql<CreatePullRequestResponse>(CREATE_PULL_REQUEST_MUTATION, {
				repositoryId: repoNodeId,
				baseRefName: targetBranch,
				headRefName: releaseBranch,
				title: prTitle,
				body: prBody,
			});

			const prResult = yield* createPr.pipe(
				Effect.tapError((error) => Effect.logWarning(`PR creation failed, retrying: ${error.reason}`)),
				Effect.retry({ times: 1, schedule: undefined }),
			);

			prNumber = prResult.createPullRequest.pullRequest.number;
			prUrl = prResult.createPullRequest.pullRequest.url;
			yield* Effect.logInfo(`✓ PR created: #${prNumber} (${prResult.createPullRequest.pullRequest.id})`);

			yield* Effect.logInfo(`Adding labels to PR #${prNumber}...`);
			yield* pr.addLabels(prNumber as number, ["automated", "release"]);
			yield* Effect.logInfo(`✓ Created PR #${prNumber}: ${prUrl}`);
		} else {
			yield* Effect.logInfo(`[DRY RUN] Would create PR with title: ${prTitle}`);
			yield* Effect.logInfo(`[DRY RUN] PR body:\n${prBody}`);
		}

		const checkStatusTable = summaryWriter.keyValueTable([
			{ key: "Branch", value: `\`${releaseBranch}\`` },
			{ key: "Target", value: `\`${targetBranch}\`` },
			{ key: "PR", value: prNumber ? `[#${prNumber}](${prUrl})` : "_N/A (dry run)_" },
		]);

		const checkSections: Array<{ heading?: string; level?: 2 | 3; content: string }> = [
			{ heading: "Release Branch Created", content: checkStatusTable },
		];
		if (versionSummary) {
			checkSections.push({
				heading: "Version Changes",
				level: 3,
				content: summaryWriter.codeBlock(versionSummary, "text"),
			});
		}
		const checkDetails = summaryWriter.build(checkSections);

		const checkTitle = dryRun ? "🧪 Create Release Branch (Dry Run)" : "Create Release Branch";
		const { id: finalCheckId } = yield* checks.create(checkTitle, sha);
		yield* checks.complete(finalCheckId, "success", {
			title: prNumber ? `Created release PR #${prNumber}` : "Release branch created (dry run)",
			summary: checkDetails,
		});

		const jobStatusTable = summaryWriter.keyValueTable([
			{ key: "Branch", value: `\`${releaseBranch}\`` },
			{ key: "Target", value: `\`${targetBranch}\`` },
			{ key: "PR", value: prNumber ? `#${prNumber}` : "_N/A (dry run)_" },
		]);
		const jobSections: Array<{ heading?: string; level?: 2 | 3; content: string }> = [
			{
				heading: checkTitle,
				content: prNumber ? `Created release PR #${prNumber}` : "Release branch created (dry run)",
			},
			{ heading: "Release Branch Created", level: 3, content: jobStatusTable },
		];
		if (versionSummary) {
			jobSections.push({
				heading: "Version Changes",
				level: 3,
				content: summaryWriter.codeBlock(versionSummary, "text"),
			});
		}
		yield* outputs.summary(summaryWriter.build(jobSections));

		return { created: true, prNumber, checkId: finalCheckId, versionSummary };
	});
