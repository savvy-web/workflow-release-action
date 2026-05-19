/**
 * Detect which workflow phase should run from the current git context.
 *
 * @remarks
 * Looks at the event name, ref, and (for push events on `main`) queries
 * GitHub for PR associations to decide between:
 *
 * - **Phase 3a (close-issues)** — `pull_request` event where the release
 *   PR was merged.
 * - **Phase 3 (publishing)** — push to `main` whose SHA came from a
 *   merged release PR.
 * - **Phase 2 (validation)** — push to the release branch.
 * - **Phase 1 (branch-management)** — push to `main` that is not a
 *   release commit.
 * - **none** — anything else.
 */

import { FileSystem } from "@effect/platform";
import type { ActionEnvironmentError, PullRequestError } from "@savvy-web/github-action-effects";
import { ActionEnvironment, PullRequest } from "@savvy-web/github-action-effects";
import { Duration, Effect, Option } from "effect";

/**
 * The five phases this action knows how to dispatch.
 */
export type WorkflowPhase = "branch-management" | "validation" | "publishing" | "close-issues" | "none";

/**
 * Phase detection result.
 */
export interface PhaseDetectionResult {
	phase: WorkflowPhase;
	reason: string;
	isReleaseBranch: boolean;
	isMainBranch: boolean;
	isReleaseCommit: boolean;
	mergedReleasePRNumber?: number;
	isPullRequestEvent: boolean;
	isPRMerged: boolean;
	isReleasePRMerged: boolean;
	commitMessage: string;
}

/**
 * Options for {@link detectWorkflowPhase}.
 */
export interface PhaseDetectionOptions {
	releaseBranch: string;
	targetBranch: string;
	/**
	 * Explicit phase override. When provided, detection short-circuits and
	 * the only API call made is to backfill `mergedReleasePRNumber` for
	 * `publishing` / `close-issues`.
	 */
	explicitPhase?: WorkflowPhase;
}

/** Subset of the event payload we care about. */
interface EventPayload {
	pull_request?: {
		merged?: boolean;
		number: number;
		head?: { ref: string };
		base?: { ref: string };
	};
	head_commit?: { message?: string };
}

/**
 * Read and parse the GitHub event payload referenced by `GITHUB_EVENT_PATH`.
 *
 * @internal
 */
const readEventPayload = Effect.gen(function* () {
	const env = yield* ActionEnvironment;
	const fs = yield* FileSystem.FileSystem;

	const pathOpt = yield* env.getOptional("GITHUB_EVENT_PATH");
	if (Option.isNone(pathOpt) || pathOpt.value === "") return {} as EventPayload;

	const result = yield* Effect.either(fs.readFileString(pathOpt.value));
	if (result._tag === "Left") return {} as EventPayload;
	try {
		return JSON.parse(result.right) as EventPayload;
	} catch {
		return {} as EventPayload;
	}
});

/**
 * One attempt at detecting a release commit. Tries two strategies:
 *
 * 1. `listAssociatedWithCommit` — fast and accurate when the
 *    branch still exists.
 * 2. List recent closed PRs from the release branch and match
 *    `merge_commit_sha` — works after the branch is auto-deleted.
 *
 * @internal
 */
const attemptReleaseCommitDetection = (
	releaseBranch: string,
	targetBranch: string,
): Effect.Effect<
	{ isReleaseCommit: boolean; mergedPR?: { number: number } },
	ActionEnvironmentError | PullRequestError,
	ActionEnvironment | PullRequest
> =>
	Effect.gen(function* () {
		const env = yield* ActionEnvironment;
		const pr = yield* PullRequest;
		const { sha, repository } = yield* env.github;
		const [owner] = repository.split("/");

		// Strategy 1: associated PRs.
		const associated = yield* Effect.either(pr.listAssociatedWithCommit(sha));

		if (associated._tag === "Right") {
			const match = associated.right.find(
				(p) => (p.mergedAt ?? null) !== null && p.head === releaseBranch && p.base === targetBranch,
			);
			if (match) {
				yield* Effect.logInfo(
					`Detected merged release PR #${match.number} from ${releaseBranch} (via commit association)`,
				);
				return { isReleaseCommit: true, mergedPR: { number: match.number } };
			}
		} else {
			yield* Effect.logWarning(`Failed to check for associated PRs: ${associated.left.reason}`);
		}

		// Strategy 2: list closed PRs from the release branch.
		yield* Effect.logInfo(`Checking for merged release PRs with merge_commit_sha matching ${sha}`);
		const closed = yield* Effect.either(
			pr.list({ state: "closed", head: `${owner}:${releaseBranch}`, base: targetBranch }),
		);

		if (closed._tag === "Right") {
			const match = closed.right.find((p) => (p.mergedAt ?? null) !== null && p.mergeCommitSha === sha);
			if (match) {
				yield* Effect.logInfo(
					`Detected merged release PR #${match.number} from ${releaseBranch} (via merge_commit_sha match)`,
				);
				return { isReleaseCommit: true, mergedPR: { number: match.number } };
			}
			yield* Effect.logInfo(`No merged release PR found matching commit ${sha}`);
			return { isReleaseCommit: false };
		}

		yield* Effect.logWarning(`Failed to check for merged PRs: ${closed.left.reason}`);
		return { isReleaseCommit: false };
	});

/**
 * Retry-aware release-commit detection — handles GitHub API eventual
 * consistency after PR merge.
 *
 * @internal
 */
const detectReleaseCommit = (
	releaseBranch: string,
	targetBranch: string,
): Effect.Effect<
	{ isReleaseCommit: boolean; mergedPR?: { number: number } },
	ActionEnvironmentError | PullRequestError,
	ActionEnvironment | PullRequest
> =>
	Effect.gen(function* () {
		const maxRetries = 3;
		const retryDelay = Duration.seconds(5);

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			const result = yield* attemptReleaseCommitDetection(releaseBranch, targetBranch);
			if (result.isReleaseCommit) return result;
			if (attempt < maxRetries) {
				yield* Effect.logInfo(
					`Release commit not detected on attempt ${attempt}/${maxRetries}, waiting ${Duration.toSeconds(retryDelay)}s before retry...`,
				);
				yield* Effect.sleep(retryDelay);
			}
		}

		yield* Effect.logInfo(`No merged release PR found after ${maxRetries} attempts`);
		return { isReleaseCommit: false };
	});

/**
 * Determine the workflow phase to run.
 *
 * @public
 */
export const detectWorkflowPhase = (
	options: PhaseDetectionOptions,
): Effect.Effect<
	PhaseDetectionResult,
	ActionEnvironmentError | PullRequestError,
	ActionEnvironment | FileSystem.FileSystem | PullRequest
> =>
	Effect.gen(function* () {
		const env = yield* ActionEnvironment;
		const { releaseBranch, targetBranch, explicitPhase } = options;

		const { ref, eventName } = yield* env.github;
		const payload = yield* readEventPayload;

		const commitMessage = payload.head_commit?.message ?? "";
		const isReleaseBranch = ref === `refs/heads/${releaseBranch}`;
		const isMainBranch = ref === `refs/heads/${targetBranch}`;

		const isPullRequestEvent = eventName === "pull_request";
		const pullRequest = payload.pull_request;
		const isPRMerged = isPullRequestEvent && pullRequest?.merged === true;
		const isReleasePRMerged =
			isPRMerged === true && pullRequest?.head?.ref === releaseBranch && pullRequest?.base?.ref === targetBranch;

		const truncatedCommit = commitMessage.substring(0, 100) + (commitMessage.length > 100 ? "..." : "");

		// Explicit phase override.
		if (explicitPhase !== undefined) {
			const result: PhaseDetectionResult = {
				phase: explicitPhase,
				reason: `Explicit phase provided: ${explicitPhase}`,
				isReleaseBranch,
				isMainBranch,
				isReleaseCommit: false,
				isPullRequestEvent,
				isPRMerged: isPRMerged === true,
				isReleasePRMerged: isReleasePRMerged === true,
				commitMessage: truncatedCommit,
			};

			if (explicitPhase === "publishing" && isMainBranch && eventName === "push") {
				const detection = yield* detectReleaseCommit(releaseBranch, targetBranch);
				result.isReleaseCommit = detection.isReleaseCommit;
				if (detection.mergedPR) result.mergedReleasePRNumber = detection.mergedPR.number;
			}
			if (explicitPhase === "close-issues" && pullRequest !== undefined) {
				result.mergedReleasePRNumber = pullRequest.number;
				result.isReleaseCommit = true;
			}
			return result;
		}

		// Phase 3a: close-issues on release-PR merge.
		if (isReleasePRMerged === true && pullRequest !== undefined) {
			return {
				phase: "close-issues",
				reason: `Release PR #${pullRequest.number} merged via pull_request event`,
				isReleaseBranch,
				isMainBranch,
				isReleaseCommit: true,
				mergedReleasePRNumber: pullRequest.number,
				isPullRequestEvent,
				isPRMerged: isPRMerged === true,
				isReleasePRMerged: true,
				commitMessage: truncatedCommit,
			};
		}

		// Push to main: detect release commit.
		let mergedPR: { number: number } | undefined;
		let isReleaseCommit = false;
		if (isMainBranch && eventName === "push") {
			const detection = yield* detectReleaseCommit(releaseBranch, targetBranch);
			isReleaseCommit = detection.isReleaseCommit;
			mergedPR = detection.mergedPR;
		}

		const baseResult: PhaseDetectionResult = {
			phase: "none",
			reason: "",
			isReleaseBranch,
			isMainBranch,
			isReleaseCommit,
			isPullRequestEvent,
			isPRMerged: isPRMerged === true,
			isReleasePRMerged: isReleasePRMerged === true,
			commitMessage: truncatedCommit,
		};
		if (mergedPR) baseResult.mergedReleasePRNumber = mergedPR.number;

		// Phase 3: publishing.
		if (isMainBranch && isReleaseCommit) {
			baseResult.phase = "publishing";
			baseResult.reason = mergedPR
				? `Merged release PR #${mergedPR.number} from ${releaseBranch}`
				: `Release commit detected on ${targetBranch}`;
			return baseResult;
		}

		// Phase 2: validation.
		if (isReleaseBranch) {
			baseResult.phase = "validation";
			baseResult.reason = `Push to release branch ${releaseBranch}`;
			return baseResult;
		}

		// Phase 1: branch-management.
		if (isMainBranch && !isReleaseCommit) {
			baseResult.phase = "branch-management";
			baseResult.reason = `Push to ${targetBranch} (not a release commit)`;
			return baseResult;
		}

		baseResult.reason = `Not on ${targetBranch} or ${releaseBranch} branch`;
		return baseResult;
	});
