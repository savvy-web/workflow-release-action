import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeLinkedIssues } from "../src/utils/close-linked-issues.js";
import { cleanupTestEnvironment, createMockOctokit, setupTestEnvironment } from "./utils/github-mocks.js";
import type { MockOctokit } from "./utils/test-types.js";

// Mock modules
vi.mock("@actions/core");
vi.mock("@actions/github");

describe("closeLinkedIssues", () => {
	let mockOctokit: MockOctokit;

	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });
		mockOctokit = createMockOctokit();

		// Mock core.summary
		const mockSummary = {
			addHeading: vi.fn().mockReturnThis(),
			addEOL: vi.fn().mockReturnThis(),
			addTable: vi.fn().mockReturnThis(),
			addRaw: vi.fn().mockReturnThis(),
			addCodeBlock: vi.fn().mockReturnThis(),
			write: vi.fn().mockResolvedValue(undefined),
			stringify: vi.fn().mockReturnValue(""),
		};
		Object.defineProperty(core, "summary", { value: mockSummary, writable: true });

		// Setup GitHub context mock
		Object.defineProperty(vi.mocked(context), "repo", {
			value: { owner: "test-owner", repo: "test-repo" },
			writable: true,
		});
		Object.defineProperty(vi.mocked(context), "sha", { value: "abc123", writable: true });
		vi.mocked(getOctokit).mockReturnValue(mockOctokit as unknown as ReturnType<typeof getOctokit>);
	});

	afterEach(() => {
		cleanupTestEnvironment();
	});

	describe("extracting issues from PR body", () => {
		it("should extract issue numbers from linked issues section", async () => {
			// Mock PR body with linked issues section
			mockOctokit.rest.pulls.get.mockResolvedValue({
				data: {
					body: `## Summary
Some changes here

## Linked Issues

- #123: Fix bug in auth
- #456: Add new feature

## Test Plan
Test it manually`,
				},
			});

			// Mock issue fetches
			mockOctokit.rest.issues.get
				.mockResolvedValueOnce({ data: { number: 123, title: "Fix bug in auth", state: "open" } })
				.mockResolvedValueOnce({ data: { number: 456, title: "Add new feature", state: "open" } });

			const result = await closeLinkedIssues("test-token", 1, false);

			expect(result.closedCount).toBe(2);
			expect(result.issues).toHaveLength(2);
			expect(mockOctokit.rest.issues.update).toHaveBeenCalledTimes(2);
		});

		it("should handle strikethrough format for already-closed issues", async () => {
			mockOctokit.rest.pulls.get.mockResolvedValue({
				data: {
					body: `## Linked Issues

- #123: Open issue
- ~~#456: Already closed issue~~`,
				},
			});

			mockOctokit.rest.issues.get
				.mockResolvedValueOnce({ data: { number: 123, title: "Open issue", state: "open" } })
				.mockResolvedValueOnce({ data: { number: 456, title: "Already closed issue", state: "closed" } });

			const result = await closeLinkedIssues("test-token", 1, false);

			// Only issue 123 should be closed
			expect(result.closedCount).toBe(1);
			expect(result.issues).toHaveLength(2);
			expect(mockOctokit.rest.issues.update).toHaveBeenCalledTimes(1);
		});

		it("should return empty when no linked issues section exists", async () => {
			mockOctokit.rest.pulls.get.mockResolvedValue({
				data: { body: "Just a regular PR body without linked issues" },
			});

			const result = await closeLinkedIssues("test-token", 1, false);

			expect(result.closedCount).toBe(0);
			expect(result.issues).toHaveLength(0);
		});

		it("should handle PR with no body", async () => {
			mockOctokit.rest.pulls.get.mockResolvedValue({
				data: { body: null },
			});

			const result = await closeLinkedIssues("test-token", 1, false);

			expect(result.closedCount).toBe(0);
			expect(result.issues).toHaveLength(0);
		});
	});

	describe("closing issues", () => {
		it("should close issues and add comments", async () => {
			mockOctokit.rest.pulls.get.mockResolvedValue({
				data: {
					body: `## Linked Issues

- #123: Test issue`,
				},
			});

			mockOctokit.rest.issues.get.mockResolvedValue({
				data: { number: 123, title: "Test issue", state: "open" },
			});

			const result = await closeLinkedIssues("test-token", 42, false);

			expect(result.closedCount).toBe(1);
			expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith({
				owner: "test-owner",
				repo: "test-repo",
				issue_number: 123,
				body: expect.stringContaining("Closed by release PR #42 merge"),
			});
			expect(mockOctokit.rest.issues.update).toHaveBeenCalledWith({
				owner: "test-owner",
				repo: "test-repo",
				issue_number: 123,
				state: "closed",
				state_reason: "completed",
			});
		});

		it("should skip already closed issues", async () => {
			mockOctokit.rest.pulls.get.mockResolvedValue({
				data: {
					body: `## Linked Issues

- #123: Already closed issue`,
				},
			});

			mockOctokit.rest.issues.get.mockResolvedValue({
				data: { number: 123, title: "Already closed issue", state: "closed" },
			});

			const result = await closeLinkedIssues("test-token", 1, false);

			expect(result.closedCount).toBe(0);
			expect(result.issues[0].error).toBe("Already closed");
			expect(mockOctokit.rest.issues.update).not.toHaveBeenCalled();
		});

		it("should handle API errors when closing issues", async () => {
			mockOctokit.rest.pulls.get.mockResolvedValue({
				data: {
					body: `## Linked Issues

- #123: First issue
- #456: Second issue`,
				},
			});

			mockOctokit.rest.issues.get
				.mockResolvedValueOnce({ data: { number: 123, title: "First issue", state: "open" } })
				.mockResolvedValueOnce({ data: { number: 456, title: "Second issue", state: "open" } });

			// First issue fails, second succeeds
			mockOctokit.rest.issues.createComment
				.mockRejectedValueOnce(new Error("Permission denied"))
				.mockResolvedValueOnce({ data: { id: 1 } });

			const result = await closeLinkedIssues("test-token", 1, false);

			expect(result.closedCount).toBe(1);
			expect(result.failedCount).toBe(1);
			expect(result.issues[0].closed).toBe(false);
			expect(result.issues[0].error).toBe("Permission denied");
		});
	});

	describe("dry run mode", () => {
		it("should not close issues in dry run mode", async () => {
			mockOctokit.rest.pulls.get.mockResolvedValue({
				data: {
					body: `## Linked Issues

- #123: Test issue`,
				},
			});

			mockOctokit.rest.issues.get.mockResolvedValue({
				data: { number: 123, title: "Test issue", state: "open" },
			});

			const result = await closeLinkedIssues("test-token", 1, true);

			expect(result.closedCount).toBe(1);
			expect(mockOctokit.rest.issues.update).not.toHaveBeenCalled();
			expect(mockOctokit.rest.issues.createComment).not.toHaveBeenCalled();
		});

		it("should still create check run in dry run mode", async () => {
			mockOctokit.rest.pulls.get.mockResolvedValue({
				data: {
					body: `## Linked Issues

- #123: Test issue`,
				},
			});

			mockOctokit.rest.issues.get.mockResolvedValue({
				data: { number: 123, title: "Test issue", state: "open" },
			});

			await closeLinkedIssues("test-token", 1, true);

			expect(mockOctokit.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					name: expect.stringContaining("Dry Run"),
				}),
			);
		});
	});

	describe("check run creation", () => {
		it("should create success check run when all issues closed", async () => {
			mockOctokit.rest.pulls.get.mockResolvedValue({
				data: {
					body: `## Linked Issues

- #123: Test issue`,
				},
			});

			mockOctokit.rest.issues.get.mockResolvedValue({
				data: { number: 123, title: "Test issue", state: "open" },
			});

			await closeLinkedIssues("test-token", 1, false);

			expect(mockOctokit.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					conclusion: "success",
					name: "Close Linked Issues",
				}),
			);
		});

		it("should create neutral check run when some issues failed", async () => {
			mockOctokit.rest.pulls.get.mockResolvedValue({
				data: {
					body: `## Linked Issues

- #123: Test issue`,
				},
			});

			mockOctokit.rest.issues.get.mockResolvedValue({
				data: { number: 123, title: "Test issue", state: "open" },
			});

			mockOctokit.rest.issues.createComment.mockRejectedValue(new Error("Failed"));

			await closeLinkedIssues("test-token", 1, false);

			expect(mockOctokit.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					conclusion: "neutral",
				}),
			);
		});

		it("should create check run even with no linked issues", async () => {
			mockOctokit.rest.pulls.get.mockResolvedValue({
				data: { body: "No linked issues section here" },
			});

			await closeLinkedIssues("test-token", 1, false);

			expect(mockOctokit.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					conclusion: "success",
					output: expect.objectContaining({
						title: "No linked issues to close",
					}),
				}),
			);
		});
	});

	describe("edge cases", () => {
		it("should handle multiple issues with mixed states", async () => {
			mockOctokit.rest.pulls.get.mockResolvedValue({
				data: {
					body: `## Linked Issues

- #123: Open issue
- ~~#456: Closed issue~~
- #789: Another open`,
				},
			});

			mockOctokit.rest.issues.get
				.mockResolvedValueOnce({ data: { number: 123, title: "Open issue", state: "open" } })
				.mockResolvedValueOnce({ data: { number: 456, title: "Closed issue", state: "closed" } })
				.mockResolvedValueOnce({ data: { number: 789, title: "Another open", state: "open" } });

			const result = await closeLinkedIssues("test-token", 1, false);

			// 123 and 789 should be closed, 456 already closed
			expect(result.closedCount).toBe(2);
			expect(result.issues).toHaveLength(3);
			expect(mockOctokit.rest.issues.update).toHaveBeenCalledTimes(2);
		});

		it("should handle empty linked issues section", async () => {
			mockOctokit.rest.pulls.get.mockResolvedValue({
				data: {
					body: `## Linked Issues

## Next Section`,
				},
			});

			const result = await closeLinkedIssues("test-token", 1, false);

			expect(result.closedCount).toBe(0);
			expect(result.issues).toHaveLength(0);
		});

		it("should extract commit info from PR body", async () => {
			mockOctokit.rest.pulls.get.mockResolvedValue({
				data: {
					body: `## Linked Issues
<!-- commit:abc1234:feat: add new feature -->
<!-- commit:def5678:fix: bug fix -->

- #123: Some issue`,
				},
			});

			mockOctokit.rest.issues.get.mockResolvedValue({
				data: { number: 123, title: "Some issue", state: "open" },
			});

			// Should not throw - commit info is just logged
			const result = await closeLinkedIssues("test-token", 1, false);
			expect(result.closedCount).toBe(1);
		});
	});
});
