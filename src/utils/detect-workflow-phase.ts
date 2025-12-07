import { info, warning } from "@actions/core";
import type { Context } from "@actions/github/lib/context.js";
import type { GitHub } from "@actions/github/lib/utils.js";

/**
 * Workflow phases for release management
 */
export type WorkflowPhase =
	| "branch-management" // Phase 1: Create/update release branch
	| "validation" // Phase 2: Validate release branch
	| "publishing" // Phase 3: Publish packages
	| "close-issues" // Phase 3a: Close linked issues on PR merge
	| "none"; // No action needed

/**
 * Result of workflow phase detection
 */
export interface PhaseDetectionResult {
	/** The detected phase to run */
	phase: WorkflowPhase;

	/** Human-readable reason for the detection */
	reason: string;

	/** Whether on the release branch */
	isReleaseBranch: boolean;

	/** Whether on the target (main) branch */
	isMainBranch: boolean;

	/** Whether this is a release commit (merged from release PR) */
	isReleaseCommit: boolean;

	/** PR number if a merged release PR was detected */
	mergedReleasePRNumber?: number;

	/** Whether this is a pull_request event */
	isPullRequestEvent: boolean;

	/** Whether the PR was merged (for pull_request events) */
	isPRMerged: boolean;

	/** Whether this is a release PR being merged */
	isReleasePRMerged: boolean;

	/** Commit message (truncated) */
	commitMessage: string;
}

/**
 * Options for phase detection
 */
export interface PhaseDetectionOptions {
	/** Name of the release branch (default: changeset-release/main) */
	releaseBranch: string;

	/** Name of the target branch (default: main) */
	targetBranch: string;

	/** GitHub context from @actions/github */
	context: Context;

	/** Authenticated Octokit instance */
	octokit: InstanceType<typeof GitHub>;

	/**
	 * Explicit phase to use, skipping automatic detection.
	 * Useful when phase was already determined by workflow-control-action.
	 */
	explicitPhase?: WorkflowPhase;
}

/**
 * Detects which workflow phase should run based on git context
 *
 * @remarks
 * Phase detection logic:
 * - **Phase 3a (close-issues)**: PR merge event where release PR was merged
 * - **Phase 3 (publishing)**: Push to main that came from a merged release PR
 * - **Phase 2 (validation)**: Push to release branch
 * - **Phase 1 (branch-management)**: Push to main (non-release commit)
 * - **none**: Any other scenario
 *
 * @param options - Phase detection options
 * @returns Detection result with phase and metadata
 */
export async function detectWorkflowPhase(options: PhaseDetectionOptions): Promise<PhaseDetectionResult> {
	const { releaseBranch, targetBranch, context, octokit, explicitPhase } = options;

	// Extract context info
	const commitMessage = context.payload.head_commit?.message || "";
	const isReleaseBranch = context.ref === `refs/heads/${releaseBranch}`;
	const isMainBranch = context.ref === `refs/heads/${targetBranch}`;

	// Detect PR merge event (for pull_request trigger)
	const isPullRequestEvent = context.eventName === "pull_request";
	const pullRequest = context.payload.pull_request as
		| { merged?: boolean; head?: { ref: string }; base?: { ref: string }; number: number }
		| undefined;
	const isPRMerged = isPullRequestEvent && pullRequest?.merged === true;
	const isReleasePRMerged =
		isPRMerged && pullRequest?.head?.ref === releaseBranch && pullRequest?.base?.ref === targetBranch;

	// Initialize result
	const result: PhaseDetectionResult = {
		phase: "none",
		reason: "",
		isReleaseBranch,
		isMainBranch,
		isReleaseCommit: false,
		isPullRequestEvent,
		isPRMerged,
		isReleasePRMerged,
		commitMessage: commitMessage.substring(0, 100) + (commitMessage.length > 100 ? "..." : ""),
	};

	// If explicit phase provided, use it directly (skip detection)
	if (explicitPhase) {
		result.phase = explicitPhase;
		result.reason = `Explicit phase provided: ${explicitPhase}`;
		// For explicit publishing phase, try to detect merged PR number
		if (explicitPhase === "publishing" && isMainBranch && context.eventName === "push") {
			const detection = await detectReleaseCommit({
				context,
				octokit,
				releaseBranch,
				targetBranch,
			});
			if (detection.mergedPR) {
				result.mergedReleasePRNumber = detection.mergedPR.number;
			}
			result.isReleaseCommit = detection.isReleaseCommit;
		}
		// For explicit close-issues phase, get PR number from payload
		if (explicitPhase === "close-issues" && pullRequest) {
			result.mergedReleasePRNumber = pullRequest.number;
			result.isReleaseCommit = true;
		}
		return result;
	}

	// Phase 3a: Close linked issues (on release PR merge via pull_request event)
	if (isReleasePRMerged && pullRequest) {
		result.phase = "close-issues";
		result.reason = `Release PR #${pullRequest.number} merged via pull_request event`;
		result.mergedReleasePRNumber = pullRequest.number;
		result.isReleaseCommit = true;
		return result;
	}

	// Detect if this push is from a merged release PR (for push trigger)
	let mergedReleasePR: { number: number } | undefined;

	if (isMainBranch && context.eventName === "push") {
		const releaseCommitDetection = await detectReleaseCommit({
			context,
			octokit,
			releaseBranch,
			targetBranch,
		});

		result.isReleaseCommit = releaseCommitDetection.isReleaseCommit;
		mergedReleasePR = releaseCommitDetection.mergedPR;

		if (mergedReleasePR) {
			result.mergedReleasePRNumber = mergedReleasePR.number;
		}
	}

	// Phase 3: Release Publishing (on merge to main with version commit)
	if (isMainBranch && result.isReleaseCommit) {
		result.phase = "publishing";
		result.reason = mergedReleasePR
			? `Merged release PR #${mergedReleasePR.number} from ${releaseBranch}`
			: `Release commit detected on ${targetBranch}`;
		return result;
	}

	// Phase 2: Release Validation (on release branch)
	if (isReleaseBranch) {
		result.phase = "validation";
		result.reason = `Push to release branch ${releaseBranch}`;
		return result;
	}

	// Phase 1: Release Branch Management (on main branch, non-release commit)
	if (isMainBranch && !result.isReleaseCommit) {
		result.phase = "branch-management";
		result.reason = `Push to ${targetBranch} (not a release commit)`;
		return result;
	}

	// No action needed for other branches/scenarios
	result.reason = `Not on ${targetBranch} or ${releaseBranch} branch`;
	return result;
}

/**
 * Options for release commit detection
 */
interface ReleaseCommitDetectionOptions {
	context: Context;
	octokit: InstanceType<typeof GitHub>;
	releaseBranch: string;
	targetBranch: string;
}

/**
 * Detects if the current commit is a release commit (from merged release PR)
 *
 * @remarks
 * Uses GitHub API to query for PRs associated with the commit.
 * Returns false if the API call fails (no fallback to commit message patterns
 * since those are not stable across different merge strategies and user configurations).
 *
 * @param options - Detection options
 * @returns Whether this is a release commit and the merged PR if found
 */
async function detectReleaseCommit(
	options: ReleaseCommitDetectionOptions,
): Promise<{ isReleaseCommit: boolean; mergedPR?: { number: number } }> {
	const { context, octokit, releaseBranch, targetBranch } = options;

	try {
		const { data: associatedPRs } = await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
			owner: context.repo.owner,
			repo: context.repo.repo,
			commit_sha: context.sha,
		});

		// Find a merged PR from the release branch to target branch
		const mergedReleasePR = associatedPRs.find(
			(pr) => pr.merged_at !== null && pr.head.ref === releaseBranch && pr.base.ref === targetBranch,
		);

		if (mergedReleasePR) {
			info(`Detected merged release PR #${mergedReleasePR.number} from ${releaseBranch}`);
			return { isReleaseCommit: true, mergedPR: { number: mergedReleasePR.number } };
		}

		return { isReleaseCommit: false };
	} catch (err) {
		warning(`Failed to check for associated PRs: ${err instanceof Error ? err.message : String(err)}`);
		return { isReleaseCommit: false };
	}
}

/**
 * Simplified phase detection for workflow control (no API calls)
 *
 * @remarks
 * This is a lightweight version that only uses local context.
 * It can only detect release commits via the `pull_request` event payload
 * (when the release PR is merged). For push events, use the async
 * {@link detectWorkflowPhase} which queries the GitHub API.
 *
 * @param options - Detection options (subset of full options)
 * @returns Detection result
 */
export function detectWorkflowPhaseSync(options: {
	releaseBranch: string;
	targetBranch: string;
	context: Context;
}): Omit<PhaseDetectionResult, "mergedReleasePRNumber"> {
	const { releaseBranch, targetBranch, context } = options;

	const commitMessage = context.payload.head_commit?.message || "";
	const isReleaseBranch = context.ref === `refs/heads/${releaseBranch}`;
	const isMainBranch = context.ref === `refs/heads/${targetBranch}`;

	const isPullRequestEvent = context.eventName === "pull_request";
	const pullRequest = context.payload.pull_request as
		| { merged?: boolean; head?: { ref: string }; base?: { ref: string }; number: number }
		| undefined;
	const isPRMerged = isPullRequestEvent && pullRequest?.merged === true;
	const isReleasePRMerged =
		isPRMerged && pullRequest?.head?.ref === releaseBranch && pullRequest?.base?.ref === targetBranch;

	const result: Omit<PhaseDetectionResult, "mergedReleasePRNumber"> = {
		phase: "none",
		reason: "",
		isReleaseBranch,
		isMainBranch,
		isReleaseCommit: isReleasePRMerged,
		isPullRequestEvent,
		isPRMerged,
		isReleasePRMerged,
		commitMessage: commitMessage.substring(0, 100) + (commitMessage.length > 100 ? "..." : ""),
	};

	// Phase 3a: Close issues (release PR merged via pull_request event)
	if (isReleasePRMerged) {
		result.phase = "close-issues";
		result.reason = "Release PR merged via pull_request event";
		return result;
	}

	// Phase 2: Validation
	if (isReleaseBranch) {
		result.phase = "validation";
		result.reason = `Push to release branch ${releaseBranch}`;
		return result;
	}

	// Phase 1: Branch management (push to main)
	// Note: Cannot detect publishing phase without API call
	if (isMainBranch) {
		result.phase = "branch-management";
		result.reason = `Push to ${targetBranch}`;
		return result;
	}

	result.reason = `Not on ${targetBranch} or ${releaseBranch} branch`;
	return result;
}
