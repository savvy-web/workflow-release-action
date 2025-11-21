import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import updateStickyComment from "../.github/actions/setup-release/update-sticky-comment.js";
import type { MockContext, MockCore, MockGithub } from "./utils/github-mocks.js";
import {
	cleanupTestEnvironment,
	createMockContext,
	createMockCore,
	createMockGithub,
	setupTestEnvironment,
} from "./utils/github-mocks.js";

describe("updateStickyComment", () => {
	let mockCore: MockCore;
	let mockGithub: MockGithub;
	let mockContext: MockContext;

	beforeEach(() => {
		setupTestEnvironment();

		mockCore = createMockCore();
		mockGithub = createMockGithub();

		// Override default comment IDs for this test file
		vi.mocked(mockGithub.rest.issues.createComment).mockResolvedValue({
			data: {
				id: 111,
				html_url: "https://github.com/owner/repo/pull/123#issuecomment-111",
			},
		} as never);
		vi.mocked(mockGithub.rest.issues.updateComment).mockResolvedValue({
			data: {
				id: 222,
				html_url: "https://github.com/owner/repo/pull/123#issuecomment-222",
			},
		} as never);

		mockContext = createMockContext();

		// Default environment
		delete process.env.PR_NUMBER;
		delete process.env.COMMENT_BODY;
		delete process.env.COMMENT_IDENTIFIER;
	});

	afterEach(() => {
		cleanupTestEnvironment();
	});

	describe("creating new comment", () => {
		it("should create new comment when no existing comment found", async () => {
			process.env.PR_NUMBER = "123";
			process.env.COMMENT_IDENTIFIER = "release-status";
			process.env.COMMENT_BODY = `## Release Status
All checks passed!
<!-- sticky-comment-id: release-status -->`;

			mockGithub.rest.issues.listComments.mockResolvedValueOnce({ data: [] });

			await updateStickyComment({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockGithub.rest.issues.createComment).toHaveBeenCalledWith({
				owner: "test-owner",
				repo: "test-repo",
				issue_number: 123,
				body: expect.stringContaining("<!-- sticky-comment-id: release-status -->"),
			});

			expect(mockCore.setOutput).toHaveBeenCalledWith("comment_id", "111");
			expect(mockCore.setOutput).toHaveBeenCalledWith("created", "true");
			expect(mockCore.notice).toHaveBeenCalledWith(expect.stringContaining("Created new comment on PR #123"));
		});

		it("should create new comment when existing comments don't have identifier", async () => {
			process.env.PR_NUMBER = "123";
			process.env.COMMENT_IDENTIFIER = "release-status";
			process.env.COMMENT_BODY = `## Release Status
All checks passed!
<!-- sticky-comment-id: release-status -->`;

			mockGithub.rest.issues.listComments.mockResolvedValueOnce({
				data: [
					{
						id: 100,
						body: "Some other comment without identifier",
					},
					{
						id: 101,
						body: "<!-- sticky-comment-id: different-id -->",
					},
				],
			});

			await updateStickyComment({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockGithub.rest.issues.createComment).toHaveBeenCalled();
			expect(mockCore.setOutput).toHaveBeenCalledWith("created", "true");
		});
	});

	describe("updating existing comment", () => {
		it("should update existing comment when found", async () => {
			process.env.PR_NUMBER = "123";
			process.env.COMMENT_IDENTIFIER = "release-status";
			process.env.COMMENT_BODY = `## Release Status
All checks passed!
<!-- sticky-comment-id: release-status -->`;

			mockGithub.rest.issues.listComments.mockResolvedValueOnce({
				data: [
					{
						id: 222,
						body: `## Release Status
Previous status
<!-- sticky-comment-id: release-status -->`,
					},
				],
			});

			await updateStickyComment({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockGithub.rest.issues.updateComment).toHaveBeenCalledWith({
				owner: "test-owner",
				repo: "test-repo",
				comment_id: 222,
				body: expect.stringContaining("<!-- sticky-comment-id: release-status -->"),
			});

			expect(mockGithub.rest.issues.createComment).not.toHaveBeenCalled();
			expect(mockCore.setOutput).toHaveBeenCalledWith("created", "false");
			expect(mockCore.notice).toHaveBeenCalledWith(expect.stringContaining("Updated existing comment on PR #123"));
		});

		it("should find existing comment among multiple comments", async () => {
			process.env.PR_NUMBER = "123";
			process.env.COMMENT_IDENTIFIER = "release-status";
			process.env.COMMENT_BODY = `## Release Status
Updated!
<!-- sticky-comment-id: release-status -->`;

			mockGithub.rest.issues.listComments.mockResolvedValueOnce({
				data: [
					{
						id: 100,
						body: "First comment",
					},
					{
						id: 200,
						body: "Second comment <!-- sticky-comment-id: other-id -->",
					},
					{
						id: 300,
						body: "Target comment <!-- sticky-comment-id: release-status -->",
					},
					{
						id: 400,
						body: "Fourth comment",
					},
				],
			});

			await updateStickyComment({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockGithub.rest.issues.updateComment).toHaveBeenCalledWith({
				owner: "test-owner",
				repo: "test-repo",
				comment_id: 300,
				body: expect.any(String),
			});
		});

		it("should update first matching comment when multiple matches exist", async () => {
			process.env.PR_NUMBER = "123";
			process.env.COMMENT_IDENTIFIER = "release-status";
			process.env.COMMENT_BODY = `## Release Status
Updated!
<!-- sticky-comment-id: release-status -->`;

			mockGithub.rest.issues.listComments.mockResolvedValueOnce({
				data: [
					{
						id: 300,
						body: "First match <!-- sticky-comment-id: release-status -->",
					},
					{
						id: 400,
						body: "Second match <!-- sticky-comment-id: release-status -->",
					},
				],
			});

			await updateStickyComment({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockGithub.rest.issues.updateComment).toHaveBeenCalledWith(
				expect.objectContaining({
					comment_id: 300,
				}),
			);
		});
	});

	describe("input validation", () => {
		it("should fail when PR_NUMBER is missing", async () => {
			process.env.COMMENT_IDENTIFIER = "test";
			process.env.COMMENT_BODY = "Body <!-- sticky-comment-id: test -->";

			await updateStickyComment({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setFailed).toHaveBeenCalledWith("PR_NUMBER environment variable is required");
		});

		it("should fail when COMMENT_BODY is missing", async () => {
			process.env.PR_NUMBER = "123";
			process.env.COMMENT_IDENTIFIER = "test";

			await updateStickyComment({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setFailed).toHaveBeenCalledWith("COMMENT_BODY environment variable is required");
		});

		it("should fail when COMMENT_IDENTIFIER is missing", async () => {
			process.env.PR_NUMBER = "123";
			process.env.COMMENT_BODY = "Body";

			await updateStickyComment({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setFailed).toHaveBeenCalledWith("COMMENT_IDENTIFIER environment variable is required");
		});

		it("should fail when PR_NUMBER is not a number", async () => {
			process.env.PR_NUMBER = "not-a-number";
			process.env.COMMENT_IDENTIFIER = "test";
			process.env.COMMENT_BODY = "Body <!-- sticky-comment-id: test -->";

			await updateStickyComment({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setFailed).toHaveBeenCalledWith(expect.stringContaining("Invalid PR_NUMBER: not-a-number"));
		});

		it("should fail when PR_NUMBER is zero", async () => {
			process.env.PR_NUMBER = "0";
			process.env.COMMENT_IDENTIFIER = "test";
			process.env.COMMENT_BODY = "Body <!-- sticky-comment-id: test -->";

			await updateStickyComment({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setFailed).toHaveBeenCalledWith(expect.stringContaining("Invalid PR_NUMBER: 0"));
		});

		it("should fail when PR_NUMBER is negative", async () => {
			process.env.PR_NUMBER = "-5";
			process.env.COMMENT_IDENTIFIER = "test";
			process.env.COMMENT_BODY = "Body <!-- sticky-comment-id: test -->";

			await updateStickyComment({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setFailed).toHaveBeenCalledWith(expect.stringContaining("Invalid PR_NUMBER: -5"));
		});

		it("should fail when COMMENT_BODY doesn't contain identifier marker", async () => {
			process.env.PR_NUMBER = "123";
			process.env.COMMENT_IDENTIFIER = "test";
			process.env.COMMENT_BODY = "Body without marker";

			await updateStickyComment({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setFailed).toHaveBeenCalledWith(
				expect.stringContaining("COMMENT_BODY must include the identifier marker"),
			);
		});

		it("should fail when identifier marker has wrong ID", async () => {
			process.env.PR_NUMBER = "123";
			process.env.COMMENT_IDENTIFIER = "expected-id";
			process.env.COMMENT_BODY = "Body <!-- sticky-comment-id: wrong-id -->";

			await updateStickyComment({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setFailed).toHaveBeenCalledWith(
				expect.stringContaining("COMMENT_BODY must include the identifier marker"),
			);
		});
	});

	describe("outputs and logging", () => {
		it("should set all outputs correctly when creating new comment", async () => {
			process.env.PR_NUMBER = "123";
			process.env.COMMENT_IDENTIFIER = "test";
			process.env.COMMENT_BODY = "Body <!-- sticky-comment-id: test -->";

			mockGithub.rest.issues.createComment.mockResolvedValueOnce({
				data: {
					id: 999,
					html_url: "https://github.com/test/repo/pull/123#issuecomment-999",
				},
			});

			await updateStickyComment({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setOutput).toHaveBeenCalledWith("comment_id", "999");
			expect(mockCore.setOutput).toHaveBeenCalledWith("created", "true");
			expect(mockCore.setOutput).toHaveBeenCalledWith("url", "https://github.com/test/repo/pull/123#issuecomment-999");
		});

		it("should set all outputs correctly when updating existing comment", async () => {
			process.env.PR_NUMBER = "123";
			process.env.COMMENT_IDENTIFIER = "test";
			process.env.COMMENT_BODY = "Body <!-- sticky-comment-id: test -->";

			mockGithub.rest.issues.listComments.mockResolvedValueOnce({
				data: [
					{
						id: 888,
						body: "Old <!-- sticky-comment-id: test -->",
					},
				],
			});

			mockGithub.rest.issues.updateComment.mockResolvedValueOnce({
				data: {
					id: 888,
					html_url: "https://github.com/test/repo/pull/123#issuecomment-888",
				},
			});

			await updateStickyComment({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setOutput).toHaveBeenCalledWith("comment_id", "888");
			expect(mockCore.setOutput).toHaveBeenCalledWith("created", "false");
			expect(mockCore.setOutput).toHaveBeenCalledWith("url", "https://github.com/test/repo/pull/123#issuecomment-888");
		});

		it("should set debug outputs", async () => {
			process.env.PR_NUMBER = "123";
			process.env.COMMENT_IDENTIFIER = "test";
			process.env.COMMENT_BODY = "Body <!-- sticky-comment-id: test -->";

			await updateStickyComment({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.debug).toHaveBeenCalledWith(expect.stringContaining("Set output 'comment_id'"));
			expect(mockCore.debug).toHaveBeenCalledWith(expect.stringContaining("Set output 'created'"));
			expect(mockCore.debug).toHaveBeenCalledWith(expect.stringContaining("Set output 'url'"));
		});

		it("should log processing steps", async () => {
			process.env.PR_NUMBER = "123";
			process.env.COMMENT_IDENTIFIER = "test";
			process.env.COMMENT_BODY = "Body <!-- sticky-comment-id: test -->";

			await updateStickyComment({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.startGroup).toHaveBeenCalledWith("Updating sticky comment on PR #123");
			expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining("No existing comment found"));
			expect(mockCore.endGroup).toHaveBeenCalled();
		});
	});

	describe("error handling", () => {
		it("should handle GitHub API errors when listing comments", async () => {
			process.env.PR_NUMBER = "123";
			process.env.COMMENT_IDENTIFIER = "test";
			process.env.COMMENT_BODY = "Body <!-- sticky-comment-id: test -->";

			mockGithub.rest.issues.listComments.mockRejectedValueOnce(new Error("API rate limit exceeded"));

			await updateStickyComment({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setFailed).toHaveBeenCalledWith("Failed to update sticky comment: API rate limit exceeded");
		});

		it("should handle GitHub API errors when creating comment", async () => {
			process.env.PR_NUMBER = "123";
			process.env.COMMENT_IDENTIFIER = "test";
			process.env.COMMENT_BODY = "Body <!-- sticky-comment-id: test -->";

			mockGithub.rest.issues.createComment.mockRejectedValueOnce(new Error("Forbidden"));

			await updateStickyComment({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setFailed).toHaveBeenCalledWith("Failed to update sticky comment: Forbidden");
		});

		it("should handle GitHub API errors when updating comment", async () => {
			process.env.PR_NUMBER = "123";
			process.env.COMMENT_IDENTIFIER = "test";
			process.env.COMMENT_BODY = "Body <!-- sticky-comment-id: test -->";

			mockGithub.rest.issues.listComments.mockResolvedValueOnce({
				data: [
					{
						id: 888,
						body: "Old <!-- sticky-comment-id: test -->",
					},
				],
			});

			mockGithub.rest.issues.updateComment.mockRejectedValueOnce(new Error("Comment not found"));

			await updateStickyComment({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setFailed).toHaveBeenCalledWith("Failed to update sticky comment: Comment not found");
		});

		it("should handle non-Error exceptions", async () => {
			process.env.PR_NUMBER = "123";
			process.env.COMMENT_IDENTIFIER = "test";
			process.env.COMMENT_BODY = "Body <!-- sticky-comment-id: test -->";

			mockGithub.rest.issues.listComments.mockRejectedValueOnce("String error");

			await updateStickyComment({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setFailed).toHaveBeenCalledWith("Failed to update sticky comment: String error");
		});
	});
});
