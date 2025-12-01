import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { updateStickyComment } from "../src/utils/update-sticky-comment.js";
import { cleanupTestEnvironment, createMockOctokit, setupTestEnvironment } from "./utils/github-mocks.js";
import type { MockOctokit } from "./utils/test-types.js";

// Mock modules
vi.mock("@actions/core");
vi.mock("@actions/github");

describe("update-sticky-comment", () => {
	let mockOctokit: MockOctokit;

	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });

		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "token") return "test-token";
			return "";
		});

		mockOctokit = createMockOctokit();
		vi.mocked(getOctokit).mockReturnValue(mockOctokit as unknown as ReturnType<typeof getOctokit>);
		Object.defineProperty(vi.mocked(context), "repo", {
			value: { owner: "test-owner", repo: "test-repo" },
			writable: true,
		});
	});

	afterEach(() => {
		cleanupTestEnvironment();
	});

	it("should create new comment when no existing comment found", async () => {
		mockOctokit.rest.issues.listComments.mockResolvedValue({
			data: [],
		});
		mockOctokit.rest.issues.createComment.mockResolvedValue({
			data: {
				id: 456,
				html_url: "https://github.com/test-owner/test-repo/issues/123#issuecomment-456",
			},
		});

		const commentBody = `<!-- sticky-comment-id: test-id -->
## Test Comment
This is a test.`;

		const result = await updateStickyComment(123, commentBody, "test-id");

		expect(result.commentId).toBe(456);
		expect(result.created).toBe(true);
		expect(result.url).toBe("https://github.com/test-owner/test-repo/issues/123#issuecomment-456");
	});

	it("should update existing comment when found", async () => {
		const existingComment = {
			id: 789,
			body: `<!-- sticky-comment-id: test-id -->
## Old Comment
Old content.`,
		};

		mockOctokit.rest.issues.listComments.mockResolvedValue({
			data: [existingComment],
		});
		mockOctokit.rest.issues.updateComment.mockResolvedValue({
			data: {
				id: 789,
				html_url: "https://github.com/test-owner/test-repo/issues/123#issuecomment-789",
			},
		});

		const newCommentBody = `<!-- sticky-comment-id: test-id -->
## Updated Comment
New content.`;

		const result = await updateStickyComment(123, newCommentBody, "test-id");

		expect(result.commentId).toBe(789);
		expect(result.created).toBe(false);
		expect(result.url).toBe("https://github.com/test-owner/test-repo/issues/123#issuecomment-789");
	});

	it("should find correct comment among multiple comments", async () => {
		const comments = [
			{ id: 100, body: "Regular comment" },
			{ id: 200, body: `<!-- sticky-comment-id: other-id -->Other` },
			{ id: 300, body: `<!-- sticky-comment-id: test-id -->Target` },
		];

		mockOctokit.rest.issues.listComments.mockResolvedValue({
			data: comments,
		});
		mockOctokit.rest.issues.updateComment.mockResolvedValue({
			data: { id: 300, html_url: "https://example.com" },
		});

		await updateStickyComment(123, `<!-- sticky-comment-id: test-id -->Updated`, "test-id");

		expect(mockOctokit.rest.issues.updateComment).toHaveBeenCalledWith(
			expect.objectContaining({
				comment_id: 300,
			}),
		);
	});
});
