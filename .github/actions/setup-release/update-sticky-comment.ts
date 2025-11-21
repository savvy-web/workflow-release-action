import type * as core from "@actions/core";
import type { Context } from "@actions/github/lib/context";
import type { GitHub } from "@actions/github/lib/utils";
import type { AsyncFunctionArguments } from "../shared/types.js";

/**
 * Sticky comment result
 */
interface StickyCommentResult {
	/** Comment ID (new or existing) */
	commentId: number;
	/** Whether a new comment was created */
	created: boolean;
	/** Comment URL */
	url: string;
}

/**
 * Updates or creates a sticky comment on a PR
 *
 * @param core - GitHub Actions core module
 * @param github - GitHub API client
 * @param context - GitHub Actions context
 * @param prNumber - Pull request number
 * @param commentBody - Comment body content
 * @param commentIdentifier - Unique identifier to find existing comment
 * @returns Sticky comment result
 *
 * @remarks
 * This function:
 * 1. Searches for existing comment with the identifier
 * 2. Updates existing comment if found
 * 3. Creates new comment if not found
 * 4. Returns comment ID, creation status, and URL
 *
 * The comment identifier is a unique marker in the comment body that allows
 * finding and updating the same comment across multiple workflow runs.
 * It should be included in the comment body as an HTML comment.
 *
 * @example
 * ```typescript
 * const commentBody = `
 * ## Release Validation Results
 *
 * All checks passed!
 *
 * <!-- sticky-comment-id: release-validation -->
 * `;
 *
 * await updateStickyComment(core, github, context, 123, commentBody, "release-validation");
 * ```
 */
async function updateStickyComment(
	coreModule: typeof core,
	github: InstanceType<typeof GitHub>,
	context: Context,
	prNumber: number,
	commentBody: string,
	commentIdentifier: string,
): Promise<StickyCommentResult> {
	const core = coreModule;

	core.startGroup(`Updating sticky comment on PR #${prNumber}`);

	// Search for existing comment with identifier
	const { data: comments } = await github.rest.issues.listComments({
		owner: context.repo.owner,
		repo: context.repo.repo,
		issue_number: prNumber,
		per_page: 100,
	});

	// Look for comment containing the identifier
	const identifierMarker = `<!-- sticky-comment-id: ${commentIdentifier} -->`;
	const existingComment = comments.find((comment) => comment.body?.includes(identifierMarker));

	let commentId: number;
	let created: boolean;
	let url: string;

	if (existingComment) {
		// Update existing comment
		core.info(`Found existing comment #${existingComment.id}, updating...`);

		const { data: updatedComment } = await github.rest.issues.updateComment({
			owner: context.repo.owner,
			repo: context.repo.repo,
			comment_id: existingComment.id,
			body: commentBody,
		});

		commentId = updatedComment.id;
		created = false;
		url = updatedComment.html_url;

		core.info(`Updated comment: ${url}`);
	} else {
		// Create new comment
		core.info("No existing comment found, creating new comment...");

		const { data: newComment } = await github.rest.issues.createComment({
			owner: context.repo.owner,
			repo: context.repo.repo,
			issue_number: prNumber,
			body: commentBody,
		});

		commentId = newComment.id;
		created = true;
		url = newComment.html_url;

		core.info(`Created comment: ${url}`);
	}

	core.endGroup();

	return {
		commentId,
		created,
		url,
	};
}

/**
 * Main action entrypoint: Updates or creates sticky comment and sets GitHub Actions outputs
 *
 * @param args - Function arguments from github-script
 * @param args.core - GitHub Actions core module
 * @param args.github - GitHub API client
 * @param args.context - GitHub Actions context
 *
 * @remarks
 * This action updates or creates a sticky comment on a PR.
 * It sets the following outputs:
 * - `comment_id`: The ID of the comment (new or updated)
 * - `created`: Whether a new comment was created (true | false)
 * - `url`: The URL of the comment
 *
 * The action respects environment variables:
 * - `PR_NUMBER`: Pull request number (required)
 * - `COMMENT_BODY`: Comment body content (required)
 * - `COMMENT_IDENTIFIER`: Unique identifier for the comment (required)
 *
 * The comment body MUST include the identifier marker as an HTML comment:
 * `<!-- sticky-comment-id: {COMMENT_IDENTIFIER} -->`
 *
 * @example
 * ```yaml
 * - uses: actions/github-script@v8
 *   env:
 *     PR_NUMBER: ${{ github.event.pull_request.number }}
 *     COMMENT_BODY: |
 *       ## Release Status
 *       All validations passed!
 *       <!-- sticky-comment-id: release-status -->
 *     COMMENT_IDENTIFIER: release-status
 *   with:
 *     script: |
 *       const { default: updateStickyComment } = await import('${{ github.workspace }}/.github/actions/setup-release/update-sticky-comment.ts');
 *       await updateStickyComment({ core, github, context });
 * ```
 */
export default async ({ core, github, context }: AsyncFunctionArguments): Promise<void> => {
	try {
		const prNumberStr = process.env.PR_NUMBER;
		const commentBody = process.env.COMMENT_BODY;
		const commentIdentifier = process.env.COMMENT_IDENTIFIER;

		// Validate required inputs
		if (!prNumberStr) {
			core.setFailed("PR_NUMBER environment variable is required");
			return;
		}

		if (!commentBody) {
			core.setFailed("COMMENT_BODY environment variable is required");
			return;
		}

		if (!commentIdentifier) {
			core.setFailed("COMMENT_IDENTIFIER environment variable is required");
			return;
		}

		// Parse PR number
		const prNumber = Number.parseInt(prNumberStr, 10);
		if (Number.isNaN(prNumber) || prNumber <= 0) {
			core.setFailed(`Invalid PR_NUMBER: ${prNumberStr}. Must be a positive integer.`);
			return;
		}

		// Validate comment body contains identifier marker
		const identifierMarker = `<!-- sticky-comment-id: ${commentIdentifier} -->`;
		if (!commentBody.includes(identifierMarker)) {
			core.setFailed(
				`COMMENT_BODY must include the identifier marker: ${identifierMarker}\n\nThis marker is used to find and update the comment in subsequent runs.`,
			);
			return;
		}

		const result = await updateStickyComment(core, github, context, prNumber, commentBody, commentIdentifier);

		// Set outputs
		core.setOutput("comment_id", result.commentId.toString());
		core.setOutput("created", result.created.toString());
		core.setOutput("url", result.url);

		// Log summary
		if (result.created) {
			core.notice(`✓ Created new comment on PR #${prNumber}: ${result.url}`);
		} else {
			core.notice(`✓ Updated existing comment on PR #${prNumber}: ${result.url}`);
		}

		// Debug outputs
		core.debug(`Set output 'comment_id' to: ${result.commentId}`);
		core.debug(`Set output 'created' to: ${result.created}`);
		core.debug(`Set output 'url' to: ${result.url}`);
	} catch (error) {
		/* v8 ignore next -- @preserve */
		core.setFailed(`Failed to update sticky comment: ${error instanceof Error ? error.message : String(error)}`);
	}
};
