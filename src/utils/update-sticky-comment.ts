import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";

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
export async function updateStickyComment(
	prNumber: number,
	commentBody: string,
	commentIdentifier: string,
): Promise<StickyCommentResult> {
	const token = core.getInput("token", { required: true });
	const github = getOctokit(token);
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
