import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as github from "@actions/github";
import { context } from "@actions/github";

import { checkReleaseBranch } from "./utils/check-release-branch.js";
import { cleanupValidationChecks } from "./utils/cleanup-validation-checks.js";
import { createGitHubReleases } from "./utils/create-github-releases.js";
import { createReleaseBranch } from "./utils/create-release-branch.js";
import { createValidationCheck } from "./utils/create-validation-check.js";
import { detectPublishableChanges } from "./utils/detect-publishable-changes.js";
import { detectReleasedPackagesFromCommit, detectReleasedPackagesFromPR } from "./utils/detect-released-packages.js";
import { detectRepoType } from "./utils/detect-repo-type.js";
import { determineReleaseType, determineTagStrategy } from "./utils/determine-tag-strategy.js";
import { generatePRDescriptionDirect } from "./utils/generate-pr-description.js";
import { generateBuildFailureSummary, generatePublishResultsSummary } from "./utils/generate-publish-summary.js";
import { generateReleaseNotesPreview } from "./utils/generate-release-notes-preview.js";
import { getChangesetStatus } from "./utils/get-changeset-status.js";
import { linkIssuesFromCommits } from "./utils/link-issues-from-commits.js";
import { PHASE, logger } from "./utils/logger.js";
import type { PreDetectedRelease } from "./utils/publish-packages.js";
import { publishPackages } from "./utils/publish-packages.js";
import { runCloseLinkedIssues } from "./utils/run-close-linked-issues.js";
import { summaryWriter } from "./utils/summary-writer.js";
import { updateReleaseBranch } from "./utils/update-release-branch.js";
import { updateStickyComment } from "./utils/update-sticky-comment.js";
import { validateBuilds } from "./utils/validate-builds.js";
import { validatePublish } from "./utils/validate-publish.js";

interface Inputs {
	token: string;
	releaseBranch: string;
	targetBranch: string;
	packageManager: string;
	dryRun: boolean;
	anthropicApiKey?: string;
	claudeReviewPat?: string;
}

/**
 * Main action entrypoint for release workflow
 *
 * @remarks
 * This action implements a comprehensive release management workflow:
 *
 * **Phase 1: Release Branch Management**
 * - Detect publishable changes from changesets
 * - Check if release branch exists
 * - Create new release branch or update existing one
 *
 * **Phase 2: Release Validation** (on release branch)
 * - Link issues from commits
 * - Generate PR description with Claude
 * - Validate builds
 * - Validate publishing (multi-registry: NPM, GitHub Packages, JSR, custom)
 * - Generate release notes preview
 * - Create unified validation check
 * - Update sticky comment on PR
 *
 * **Phase 3: Release Publishing** (on merge to main)
 * - Detect release merge
 * - Publish packages to NPM and GitHub Packages
 * - Create git tags
 * - Create GitHub releases
 */
async function run(): Promise<void> {
	try {
		logger.start();

		// Get token from state (set by pre.ts)
		const token = core.getState("token");

		if (!token) {
			throw new Error("No token available. The pre-action should have generated a token from app-id/private-key.");
		}

		// Auto-detect package manager from package.json (repo is checked out by now)
		core.info("Detecting package manager...");
		const repoType = await detectRepoType();
		core.saveState("packageManager", repoType.packageManager);
		core.info(`Detected package manager: ${repoType.packageManager}`);

		// Read inputs
		const inputs = {
			// GitHub App token (from pre.ts state)
			token,

			// Repository configuration
			releaseBranch: core.getInput("release-branch") || "changeset-release/main",
			targetBranch: core.getInput("target-branch") || "main",

			// Package manager (auto-detected above)
			packageManager: repoType.packageManager,

			// Workflow mode
			dryRun: core.getBooleanInput("dry-run") || false,

			// Anthropic API key for Claude (optional, for PR description generation)
			anthropicApiKey: core.getInput("anthropic-api-key"),

			// GitHub PAT for operations requiring user context (optional)
			claudeReviewPat: core.getInput("claude-review-pat"),
		};

		core.debug(`Inputs: ${JSON.stringify({ ...inputs, token: "[REDACTED]" }, null, 2)}`);

		// Token permissions were already validated in pre.ts
		// Log token info from state for debugging
		const tokenType = core.getState("tokenType");
		const tokenLogin = core.getState("tokenLogin");
		const appName = core.getState("appName");
		if (tokenType || tokenLogin || appName) {
			core.info(
				`Using ${tokenType || "unknown"} token${appName ? ` (${appName})` : ""}${tokenLogin ? ` as ${tokenLogin}` : ""}`,
			);
		}

		const octokit = github.getOctokit(inputs.token);

		// Determine which phase to run based on context
		const isReleaseBranch = context.ref === `refs/heads/${inputs.releaseBranch}`;
		const isMainBranch = context.ref === `refs/heads/${inputs.targetBranch}`;
		const commitMessage = context.payload.head_commit?.message || "";

		// Detect PR merge event (for pull_request trigger)
		const isPullRequestEvent = context.eventName === "pull_request";
		const pullRequest = context.payload.pull_request;
		const isPRMerged = isPullRequestEvent && pullRequest?.merged === true;
		const isReleasePRMerged =
			isPRMerged && pullRequest?.head?.ref === inputs.releaseBranch && pullRequest?.base?.ref === inputs.targetBranch;

		// Detect if this push is from a merged release PR (for push trigger)
		// Query the API to find PRs associated with this commit
		let isReleaseCommit = false;
		let mergedReleasePR: { number: number; head: { ref: string }; base: { ref: string } } | undefined;

		if (isMainBranch && context.eventName === "push") {
			try {
				const { data: associatedPRs } = await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
					owner: context.repo.owner,
					repo: context.repo.repo,
					commit_sha: context.sha,
				});

				// Find a merged PR from the release branch to main
				mergedReleasePR = associatedPRs.find(
					(pr) => pr.merged_at !== null && pr.head.ref === inputs.releaseBranch && pr.base.ref === inputs.targetBranch,
				);

				isReleaseCommit = mergedReleasePR !== undefined;

				if (isReleaseCommit) {
					core.info(`Detected merged release PR #${mergedReleasePR?.number} from ${inputs.releaseBranch}`);
				}
			} catch (error) {
				core.warning(`Failed to check for associated PRs: ${error instanceof Error ? error.message : String(error)}`);
				// Fall back to commit message detection
				const isMergeFromReleaseBranch =
					commitMessage.includes(`from ${context.repo.owner}/${inputs.releaseBranch}`) ||
					commitMessage.includes(`Merge branch '${inputs.releaseBranch}'`);
				const isVersionCommit =
					commitMessage.includes("chore: version packages") || commitMessage.toLowerCase().includes("version packages");
				isReleaseCommit = isMergeFromReleaseBranch || isVersionCommit;
			}
		}

		// Log context info
		logger.context({
			branch: context.ref,
			commitMessage: commitMessage.substring(0, 100) + (commitMessage.length > 100 ? "..." : ""),
			isReleaseBranch,
			isMainBranch,
			isReleaseCommit,
			mergedReleasePR: mergedReleasePR ? `#${mergedReleasePR.number}` : undefined,
			isPullRequestEvent,
			isPRMerged,
			isReleasePRMerged,
			dryRun: inputs.dryRun,
		});

		// Phase 3a: Close linked issues (on release PR merge)
		if (isReleasePRMerged) {
			logger.phase(3, PHASE.publish, "Close Linked Issues");
			await runCloseLinkedIssues(inputs, pullRequest.number);
			return;
		}

		// Phase 3: Release Publishing (on merge to main with version commit)
		if (isMainBranch && isReleaseCommit) {
			logger.phase(3, PHASE.publish, "Release Publishing");
			await runPhase3Publishing(inputs, mergedReleasePR?.number);
			return;
		}

		// Phase 2: Release Validation (on release branch)
		if (isReleaseBranch) {
			logger.phase(2, PHASE.validation, "Release Validation");
			await runPhase2Validation(inputs);
			return;
		}

		// Phase 1: Release Branch Management (on main branch, non-release commit)
		if (isMainBranch && !isReleaseCommit) {
			logger.phase(1, PHASE.branch, "Release Branch Management");
			await runPhase1BranchManagement(inputs);
			return;
		}

		// No action needed for other branches/scenarios
		logger.noAction("not on main or release branch");
	} catch (error) {
		core.setFailed(`Release workflow failed: ${error instanceof Error ? error.message : String(error)}`);
	}
}

/**
 * Phase 1: Release Branch Management
 *
 * @remarks
 * Runs on push to main (non-release commits):
 * 1. Detect publishable changes
 * 2. Check if release branch exists
 * 3. Create new branch or update existing one
 */
async function runPhase1BranchManagement(inputs: {
	token: string;
	releaseBranch: string;
	targetBranch: string;
	packageManager: string;
	dryRun: boolean;
	anthropicApiKey?: string;
	claudeReviewPat?: string;
}): Promise<void> {
	try {
		logger.step(1, "Detect Publishable Changes");

		const detectionResult = await detectPublishableChanges(inputs.packageManager, inputs.dryRun);

		core.setOutput("has_changes", detectionResult.hasChanges);
		core.setOutput("publishable_packages", JSON.stringify(detectionResult.packages));
		core.setOutput("detection_check_id", detectionResult.checkId);

		logger.endStep();

		// If no publishable changes, skip remaining steps
		if (!detectionResult.hasChanges) {
			logger.skip("No publishable changes detected, skipping release branch management");
			return;
		}

		logger.step(2, "Check Release Branch");

		const branchCheckResult = await checkReleaseBranch(inputs.releaseBranch, inputs.targetBranch, inputs.dryRun);

		core.setOutput("release_branch_exists", branchCheckResult.exists);
		core.setOutput("release_branch_has_open_pr", branchCheckResult.hasOpenPr);
		core.setOutput("release_pr_number", branchCheckResult.prNumber || "");
		core.setOutput("branch_check_id", branchCheckResult.checkId);

		logger.endStep();

		// Step 3: Create or update release branch
		if (!branchCheckResult.exists) {
			logger.step(3, "Create Release Branch");

			const createResult = await createReleaseBranch();

			core.setOutput("release_branch_created", createResult.created);
			core.setOutput("release_pr_number", createResult.prNumber || "");
			core.setOutput("create_check_id", createResult.checkId);

			logger.endStep();
		} else {
			logger.step(3, "Update Release Branch");

			const updateResult = await updateReleaseBranch();

			core.setOutput("release_branch_updated", updateResult.success);
			core.setOutput("has_conflicts", updateResult.hadConflicts);
			core.setOutput("update_check_id", updateResult.checkId);

			logger.endStep();
		}

		logger.phaseComplete(1);
	} catch (error) {
		core.setFailed(`Phase 1 failed: ${error instanceof Error ? error.message : String(error)}`);
		throw error;
	}
}

/**
 * Phase 2: Release Validation
 *
 * @remarks
 * Runs on push to release branch:
 * 1. Link issues from commits
 * 2. Generate PR description
 * 3. Validate builds
 * 4. Validate NPM publish
 * 5. Validate GitHub Packages publish
 * 6. Create validation check
 * 7. Update sticky comment
 * 8. Generate release notes preview
 */
async function runPhase2Validation(inputs: Inputs): Promise<void> {
	const octokit = github.getOctokit(inputs.token);

	// Fetch full history for changeset comparisons
	// Changesets needs to find the merge base between the release branch and target branch,
	// which requires having enough commit history to find where they diverged.
	// A shallow clone with depth=1 won't have the common ancestor.
	core.startGroup("Fetching git history for changeset comparison");
	try {
		// First, unshallow the current branch if it's a shallow clone
		let isShallow = false;
		try {
			let shallowCheck = "";
			await exec.exec("git", ["rev-parse", "--is-shallow-repository"], {
				listeners: {
					stdout: (data: Buffer) => {
						shallowCheck += data.toString();
					},
				},
			});
			isShallow = shallowCheck.trim() === "true";
		} catch {
			// If the check fails, assume it's not shallow
		}

		if (isShallow) {
			core.info("Repository is shallow, fetching full history...");
			await exec.exec("git", ["fetch", "--unshallow", "origin"]);
			core.info("✓ Unshallowed repository");
		}

		// Fetch the target branch and create a local ref
		// Changesets needs a local branch ref, not just origin/main
		await exec.exec("git", ["fetch", "origin", `${inputs.targetBranch}:${inputs.targetBranch}`]);
		core.info(`✓ Fetched ${inputs.targetBranch} branch`);
	} catch (error) {
		core.warning(
			`Failed to fetch git history: ${error instanceof Error ? error.message : String(error)}. Changeset status may fail.`,
		);
	}
	core.endGroup();

	const checkIds: number[] = [];
	const checkNames = [
		"Link Issues from Commits",
		"Generate PR Description",
		"Build Validation",
		"Publish Validation",
		"Release Notes Preview",
	];

	try {
		// Create all validation checks upfront for immediate visibility
		logger.step(0, "Creating Validation Checks");

		const checkRuns = await Promise.all(
			checkNames.map((name) =>
				octokit.rest.checks.create({
					owner: context.repo.owner,
					repo: context.repo.repo,
					name: inputs.dryRun ? `🧪 ${name} (Dry Run)` : name,
					head_sha: context.sha,
					status: "queued",
				}),
			),
		);

		checkIds.push(...checkRuns.map((r) => r.data.id));
		logger.success(`Created ${checkIds.length} validation checks`);

		logger.endStep();

		// Step 1: Link issues from commits
		logger.step(1, "Link Issues from Commits");

		await octokit.rest.checks.update({
			owner: context.repo.owner,
			repo: context.repo.repo,
			check_run_id: checkIds[0],
			status: "in_progress",
		});

		const issuesResult = await linkIssuesFromCommits();

		core.setOutput("linked_issues", JSON.stringify(issuesResult.linkedIssues));
		core.setOutput("issue_commits", JSON.stringify(issuesResult.commits));

		logger.endStep();

		// Step 2: Generate PR description
		logger.step(2, "Generate PR Description");

		await octokit.rest.checks.update({
			owner: context.repo.owner,
			repo: context.repo.repo,
			check_run_id: checkIds[1],
			status: "in_progress",
		});

		// Find the PR for the release branch to get PR number
		const { data: prs } = await octokit.rest.pulls.list({
			owner: context.repo.owner,
			repo: context.repo.repo,
			state: "open",
			head: `${context.repo.owner}:${inputs.releaseBranch}`,
			base: inputs.targetBranch,
		});

		if (prs.length > 0 && inputs.anthropicApiKey) {
			const pr = prs[0];
			logger.info(`Found release PR #${pr.number}, generating description with Claude`);

			try {
				const descResult = await generatePRDescriptionDirect(
					inputs.token,
					issuesResult.linkedIssues,
					issuesResult.commits,
					pr.number,
					inputs.anthropicApiKey,
					inputs.dryRun,
				);

				core.setOutput("pr_description", descResult.description);
				logger.success(`Generated PR description (${descResult.description.length} characters)`);

				await octokit.rest.checks.update({
					owner: context.repo.owner,
					repo: context.repo.repo,
					check_run_id: checkIds[1],
					status: "completed",
					conclusion: "success",
					output: {
						title: "PR Description Generated",
						summary: `Generated ${descResult.description.length} character description with Claude`,
					},
				});
			} catch (descError) {
				logger.warn(
					`Failed to generate PR description: ${descError instanceof Error ? descError.message : String(descError)}`,
				);
				await octokit.rest.checks.update({
					owner: context.repo.owner,
					repo: context.repo.repo,
					check_run_id: checkIds[1],
					status: "completed",
					conclusion: "neutral",
					output: {
						title: "PR Description Generation Failed",
						summary: descError instanceof Error ? descError.message : String(descError),
					},
				});
			}
		} else if (!inputs.anthropicApiKey) {
			logger.info("Anthropic API key not provided, skipping PR description generation");
			await octokit.rest.checks.update({
				owner: context.repo.owner,
				repo: context.repo.repo,
				check_run_id: checkIds[1],
				status: "completed",
				conclusion: "skipped",
				output: {
					title: "Skipped",
					summary: "Anthropic API key not provided",
				},
			});
		} else {
			logger.warn("No open PR found for release branch, skipping PR description generation");
			await octokit.rest.checks.update({
				owner: context.repo.owner,
				repo: context.repo.repo,
				check_run_id: checkIds[1],
				status: "completed",
				conclusion: "skipped",
				output: {
					title: "Skipped",
					summary: "No open PR found for release branch",
				},
			});
		}
		logger.endStep();

		// Step 3: Validate builds
		logger.step(3, "Validate Builds");

		await octokit.rest.checks.update({
			owner: context.repo.owner,
			repo: context.repo.repo,
			check_run_id: checkIds[2],
			status: "in_progress",
		});

		const buildResult = await validateBuilds();

		core.setOutput("builds_passed", buildResult.success);
		core.setOutput("build_results", JSON.stringify([]));

		// Complete the placeholder check
		await octokit.rest.checks.update({
			owner: context.repo.owner,
			repo: context.repo.repo,
			check_run_id: checkIds[2],
			status: "completed",
			conclusion: buildResult.success ? "success" : "failure",
			output: {
				title: buildResult.success ? "Build Validation Passed" : "Build Validation Failed",
				summary: buildResult.success ? "All builds completed successfully" : buildResult.errors,
			},
		});

		logger.endStep();

		// Initialize publish validation result
		let publishResult: {
			success: boolean;
			npmReady: boolean;
			githubPackagesReady: boolean;
			totalTargets: number;
			readyTargets: number;
			summary: string;
			validations: import("./types/publish-config.js").PackagePublishValidation[];
		} = {
			success: false,
			npmReady: false,
			githubPackagesReady: false,
			totalTargets: 0,
			readyTargets: 0,
			summary: "",
			validations: [],
		};

		// Only continue with publish validation if builds passed
		if (buildResult.success) {
			// Step 4: Validate publishing (multi-registry)
			logger.step(4, "Validate Publishing");

			await octokit.rest.checks.update({
				owner: context.repo.owner,
				repo: context.repo.repo,
				check_run_id: checkIds[3],
				status: "in_progress",
			});

			publishResult = await validatePublish(inputs.packageManager, inputs.targetBranch, inputs.dryRun);

			// Set outputs for backwards compatibility
			core.setOutput("npm_publish_ready", publishResult.npmReady);
			core.setOutput("github_packages_ready", publishResult.githubPackagesReady);
			core.setOutput("publish_results", JSON.stringify(publishResult.validations));

			// Determine check conclusion
			const conclusion = publishResult.totalTargets === 0 ? "skipped" : publishResult.success ? "success" : "failure";
			const title =
				publishResult.totalTargets === 0
					? "No packages to validate"
					: publishResult.success
						? `All ${publishResult.readyTargets} target(s) ready to publish`
						: `${publishResult.readyTargets}/${publishResult.totalTargets} target(s) ready`;

			// Complete the check
			await octokit.rest.checks.update({
				owner: context.repo.owner,
				repo: context.repo.repo,
				check_run_id: checkIds[3],
				status: "completed",
				conclusion,
				output: {
					title,
					summary: publishResult.summary,
				},
			});

			logger.endStep();
		} else {
			// Skip publish validation if builds failed
			logger.warn("Builds failed, skipping publish validation");

			await octokit.rest.checks.update({
				owner: context.repo.owner,
				repo: context.repo.repo,
				check_run_id: checkIds[3],
				status: "completed",
				conclusion: "skipped",
				output: {
					title: "Skipped",
					summary: "Build validation failed",
				},
			});
		}

		// Step 5: Generate release notes preview
		logger.step(5, "Generate Release Notes Preview");

		await octokit.rest.checks.update({
			owner: context.repo.owner,
			repo: context.repo.repo,
			check_run_id: checkIds[4],
			status: "in_progress",
		});

		const releaseNotesResult = await generateReleaseNotesPreview(publishResult.validations);

		// Complete the placeholder check with full release notes content
		await octokit.rest.checks.update({
			owner: context.repo.owner,
			repo: context.repo.repo,
			check_run_id: checkIds[4],
			status: "completed",
			conclusion: "success",
			output: {
				title: `${releaseNotesResult.packages.length} package(s) ready for release`,
				summary: releaseNotesResult.summaryContent,
			},
		});

		logger.endStep();

		// Step 6: Create unified validation check
		logger.step(6, "Create Unified Validation Check");

		const validationResults = [
			{
				name: checkNames[0],
				success: true,
				checkId: checkIds[0],
				outcome: `${issuesResult.linkedIssues.length} issue(s) linked`,
			},
			{
				name: checkNames[1],
				success: true,
				checkId: checkIds[1],
				outcome: inputs.anthropicApiKey ? "Description generated" : "Skipped",
			},
			{
				name: checkNames[2],
				success: buildResult.success,
				checkId: checkIds[2],
				outcome: buildResult.success ? "Build passed" : "Build failed",
			},
			{
				name: checkNames[3],
				success: buildResult.success && publishResult.success,
				checkId: checkIds[3],
				outcome:
					publishResult.totalTargets === 0
						? "No targets"
						: `${publishResult.readyTargets}/${publishResult.totalTargets} target(s) ready`,
			},
			{
				name: checkNames[4],
				success: true,
				checkId: checkIds[4],
				outcome: `${releaseNotesResult.packages.length} package(s) ready`,
			},
		];

		await createValidationCheck(validationResults, inputs.dryRun);

		logger.endStep();

		// Step 7: Update sticky comment on PR
		logger.step(7, "Update Sticky Comment");

		try {
			// Find the PR for the release branch
			const { data: prs } = await octokit.rest.pulls.list({
				owner: context.repo.owner,
				repo: context.repo.repo,
				state: "open",
				head: `${context.repo.owner}:${inputs.releaseBranch}`,
				base: inputs.targetBranch,
			});

			if (prs.length > 0) {
				const pr = prs[0];
				logger.success(`Found release PR #${pr.number}`);

				// Generate validation summary
				const allSuccess = validationResults.every((r) => r.success);
				const failedChecks = validationResults.filter((r) => !r.success);

				// Build check run URL helper
				const getCheckUrl = (checkId: number): string =>
					`https://github.com/${context.repo.owner}/${context.repo.repo}/runs/${checkId}`;

				// Build validation results table with linked check names (status column leftmost with empty header)
				const validationTable = summaryWriter.table(
					[" ", "Check", "Outcome"],
					validationResults.map((r) => [r.success ? "✅" : "❌", `[${r.name}](${getCheckUrl(r.checkId)})`, r.outcome]),
				);

				// Build comment sections using summaryWriter
				const commentSections: Array<{ heading?: string; level?: 2 | 3 | 4; content: string }> = [
					{
						heading: `📦 Release Validation ${allSuccess ? "✅" : "❌"}`,
						level: 2,
						content: inputs.dryRun ? "> 🧪 **DRY RUN MODE** - No actual publishing will occur" : "",
					},
					{
						content: validationTable,
					},
				];

				// Add status section only if there are failed checks
				if (failedChecks.length > 0) {
					commentSections.push({
						heading: "❌ Failed Checks",
						level: 3,
						content: `${summaryWriter.list(failedChecks.map((c) => `**${c.name}**`))}\n\nPlease resolve the issues above before merging.`,
					});
				}

				// Add publish validation section if available (no header, summary already has header)
				if (buildResult.success && publishResult.totalTargets > 0) {
					commentSections.push({
						content: publishResult.summary,
					});
				}

				// Add release notes preview link
				if (releaseNotesResult.packages.length > 0) {
					commentSections.push({
						heading: "📋 Release Notes Preview",
						level: 3,
						content: `[View detailed release notes →](${getCheckUrl(checkIds[4])})`,
					});
				}

				// Add footer
				commentSections.push({
					content: `---\n\n<sub>Updated at ${new Date().toISOString()}</sub>`,
				});

				const commentBody = `<!-- sticky-comment-id: release-validation -->\n${summaryWriter.build(commentSections)}`;

				await updateStickyComment(pr.number, commentBody, "release-validation");
				logger.success("Updated sticky comment on PR");
			} else {
				logger.warn("No open PR found for release branch - skipping sticky comment update");
			}
		} catch (stickyError) {
			logger.warn(
				`Failed to update sticky comment: ${stickyError instanceof Error ? stickyError.message : String(stickyError)}`,
			);
			// Don't fail the entire workflow if sticky comment update fails
		}

		logger.endStep();

		logger.phaseComplete(2);
	} catch (error) {
		// Cleanup incomplete checks on error
		logger.error(`Phase 2 failed: ${error instanceof Error ? error.message : String(error)}`);

		if (checkIds.length > 0) {
			logger.info("Cleaning up incomplete validation checks...");
			await cleanupValidationChecks(
				checkIds,
				error instanceof Error ? error.message : "Workflow failed",
				inputs.dryRun,
			);
		}

		core.setFailed(`Phase 2 failed: ${error instanceof Error ? error.message : String(error)}`);
		throw error;
	}
}

/**
 * Phase 3: Release Publishing
 *
 * @remarks
 * Runs on merge to main with version commit:
 * 1. Detect packages from merge commit (changesets are already consumed)
 * 2. Publish packages to configured registries (NPM, GitHub Packages, JSR, custom)
 * 3. Determine tag strategy (single vs multiple)
 * 4. Create git tags
 * 5. Create GitHub releases with artifacts
 * 6. Set comprehensive workflow outputs
 */
async function runPhase3Publishing(inputs: Inputs, mergedPRNumber?: number): Promise<void> {
	const octokit = github.getOctokit(inputs.token);

	// Create publishing checks upfront
	const checkNames = ["Publish Packages", "Create Tags", "Create GitHub Releases"];
	const checkIds: number[] = [];

	try {
		logger.step(0, "Creating Publishing Checks");

		const checkRuns = await Promise.all(
			checkNames.map((name) =>
				octokit.rest.checks.create({
					owner: context.repo.owner,
					repo: context.repo.repo,
					name: inputs.dryRun ? `🧪 ${name} (Dry Run)` : name,
					head_sha: context.sha,
					status: "queued",
				}),
			),
		);

		checkIds.push(...checkRuns.map((r) => r.data.id));
		logger.success(`Created ${checkIds.length} publishing checks`);
		logger.endStep();

		// Step 1: Detect and publish packages
		logger.step(1, "Detect and Publish Packages");

		await octokit.rest.checks.update({
			owner: context.repo.owner,
			repo: context.repo.repo,
			check_run_id: checkIds[0],
			status: "in_progress",
		});

		// Detect packages that were released in the merge commit
		// Since changesets are consumed after the release PR merge, we need to detect
		// packages by looking at what package.json versions changed
		let preDetectedReleases: PreDetectedRelease[] | undefined;

		if (mergedPRNumber) {
			logger.info(`Detecting released packages from PR #${mergedPRNumber}...`);
			const detectionResult = await detectReleasedPackagesFromPR(inputs.token, mergedPRNumber);
			if (detectionResult.success && detectionResult.packages.length > 0) {
				preDetectedReleases = detectionResult.packages.map((p) => ({
					name: p.name,
					version: p.version,
					path: p.path,
				}));
				logger.success(`Detected ${preDetectedReleases.length} package(s) from PR`);
			} else {
				logger.warn("Could not detect packages from PR, falling back to commit comparison");
			}
		}

		// Fallback: detect from commit comparison
		if (!preDetectedReleases || preDetectedReleases.length === 0) {
			logger.info("Detecting released packages from commit comparison...");
			const detectionResult = await detectReleasedPackagesFromCommit(inputs.token);
			if (detectionResult.success && detectionResult.packages.length > 0) {
				preDetectedReleases = detectionResult.packages.map((p) => ({
					name: p.name,
					version: p.version,
					path: p.path,
				}));
				logger.success(`Detected ${preDetectedReleases.length} package(s) from commit`);
			}
		}

		const publishResult = await publishPackages(
			inputs.packageManager,
			inputs.targetBranch,
			inputs.dryRun,
			preDetectedReleases,
		);

		// Set outputs
		core.setOutput("released_packages", JSON.stringify(publishResult.packages));
		core.setOutput("package_count", publishResult.totalPackages);
		core.setOutput("publish_results", JSON.stringify(publishResult.packages));
		core.setOutput("success", publishResult.success);

		// Check if this was a build failure (no packages published)
		const isBuildFailure = publishResult.buildError !== undefined;

		// Generate appropriate summary
		const publishSummary = isBuildFailure
			? generateBuildFailureSummary(publishResult, inputs.dryRun)
			: generatePublishResultsSummary(publishResult.packages, inputs.dryRun);

		// Determine check title based on failure type
		let checkTitle: string;
		if (publishResult.success) {
			checkTitle = `Published ${publishResult.successfulPackages}/${publishResult.totalPackages} package(s)`;
		} else if (isBuildFailure) {
			checkTitle = "Build failed - publishing aborted";
		} else {
			checkTitle = `Publishing failed: ${publishResult.successfulPackages}/${publishResult.totalPackages} succeeded`;
		}

		await octokit.rest.checks.update({
			owner: context.repo.owner,
			repo: context.repo.repo,
			check_run_id: checkIds[0],
			status: "completed",
			conclusion: publishResult.success ? "success" : "failure",
			output: {
				title: checkTitle,
				summary: publishSummary,
			},
		});

		logger.endStep();

		// If publishing failed, don't continue with tags/releases
		if (!publishResult.success) {
			const failureReason = isBuildFailure ? "Build failed" : "Publishing failed";
			logger.error(`${failureReason}, skipping tag and release creation`);

			// Mark remaining checks as skipped
			for (let i = 1; i < checkIds.length; i++) {
				await octokit.rest.checks.update({
					owner: context.repo.owner,
					repo: context.repo.repo,
					check_run_id: checkIds[i],
					status: "completed",
					conclusion: "skipped",
					output: {
						title: "Skipped",
						summary: failureReason,
					},
				});
			}

			// Write detailed job summary with error information
			await core.summary
				.addHeading(`❌ Release ${failureReason}`, 1)
				.addRaw(inputs.dryRun ? "> 🧪 **DRY RUN MODE**\n\n" : "")
				.addRaw(publishSummary)
				.write();

			core.setFailed(failureReason);
			return;
		}

		// Step 2: Determine tag strategy and create tags
		logger.step(2, "Determine Tag Strategy");

		await octokit.rest.checks.update({
			owner: context.repo.owner,
			repo: context.repo.repo,
			check_run_id: checkIds[1],
			status: "in_progress",
		});

		const tagStrategy = determineTagStrategy(publishResult.packages);

		// Get bump types for release type determination
		const changesetStatus = await getChangesetStatus(inputs.packageManager, inputs.targetBranch);
		const bumpTypes = new Map<string, string>();
		for (const release of changesetStatus.releases) {
			bumpTypes.set(release.name, release.type);
		}

		const releaseType = determineReleaseType(publishResult.packages, bumpTypes);

		core.setOutput("release_type", releaseType);
		core.setOutput("release_tags", JSON.stringify(tagStrategy.tags.map((t) => t.name)));

		await octokit.rest.checks.update({
			owner: context.repo.owner,
			repo: context.repo.repo,
			check_run_id: checkIds[1],
			status: "completed",
			conclusion: "success",
			output: {
				title: `${tagStrategy.strategy === "single" ? "Single tag" : `${tagStrategy.tags.length} tags`}: ${tagStrategy.tags.map((t) => t.name).join(", ")}`,
				summary: `**Strategy:** ${tagStrategy.strategy}\n**Release Type:** ${releaseType}\n\n**Tags:**\n${tagStrategy.tags.map((t) => `- \`${t.name}\` (${t.packageName}@${t.version})`).join("\n")}`,
			},
		});

		logger.endStep();

		// Step 3: Create GitHub releases
		logger.step(3, "Create GitHub Releases");

		await octokit.rest.checks.update({
			owner: context.repo.owner,
			repo: context.repo.repo,
			check_run_id: checkIds[2],
			status: "in_progress",
		});

		const releasesResult = await createGitHubReleases(tagStrategy.tags, publishResult.packages, inputs.dryRun);

		core.setOutput("release_urls", JSON.stringify(releasesResult.releases.map((r) => r.url)));

		// Build releases summary
		const releasesSummary = releasesResult.releases
			.map((r) => {
				const assetList =
					r.assets.length > 0 ? `\n  - Assets: ${r.assets.map((a) => `[${a.name}](${a.downloadUrl})`).join(", ")}` : "";
				return `- [${r.tag}](${r.url})${assetList}`;
			})
			.join("\n");

		await octokit.rest.checks.update({
			owner: context.repo.owner,
			repo: context.repo.repo,
			check_run_id: checkIds[2],
			status: "completed",
			conclusion: releasesResult.success ? "success" : "failure",
			output: {
				title: releasesResult.success
					? `Created ${releasesResult.releases.length} release(s)`
					: `Release creation had errors`,
				summary: `**Created Releases:**\n${releasesSummary}${releasesResult.errors.length > 0 ? `\n\n**Errors:**\n${releasesResult.errors.map((e) => `- ${e}`).join("\n")}` : ""}`,
			},
		});

		logger.endStep();

		// Write job summary
		await core.summary
			.addHeading("🚀 Release Published", 1)
			.addRaw(inputs.dryRun ? "> 🧪 **DRY RUN MODE** - No actual changes were made\n\n" : "")
			.addHeading("📦 Published Packages", 2)
			.addRaw(publishSummary)
			.addHeading("🏷️ Tags Created", 2)
			.addList(tagStrategy.tags.map((t) => `\`${t.name}\``))
			.addHeading("📝 GitHub Releases", 2)
			.addList(releasesResult.releases.map((r) => `[${r.tag}](${r.url})`))
			.write();

		logger.phaseComplete(3);
	} catch (error) {
		logger.error(`Phase 3 failed: ${error instanceof Error ? error.message : String(error)}`);

		// Cleanup incomplete checks
		if (checkIds.length > 0) {
			logger.info("Cleaning up incomplete publishing checks...");
			await cleanupValidationChecks(
				checkIds,
				error instanceof Error ? error.message : "Workflow failed",
				inputs.dryRun,
			);
		}

		core.setFailed(`Phase 3 failed: ${error instanceof Error ? error.message : String(error)}`);
		throw error;
	}
}

// Run the action
await run();
