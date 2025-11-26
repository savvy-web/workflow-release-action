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

	describe("getLinkedIssues via GraphQL", () => {
		it("should fetch linked issues from PR via GraphQL", async () => {
			// Mock GraphQL response
			mockOctokit.graphql = vi.fn().mockResolvedValue({
				repository: {
					pullRequest: {
						closingIssuesReferences: {
							nodes: [
								{ number: 123, title: "Some issue", state: "OPEN" },
								{ number: 456, title: "Another issue", state: "OPEN" },
							],
						},
					},
				},
			});

			const result = await closeLinkedIssues("test-token", 1, false);

			expect(result.closedCount).toBe(2);
			expect(result.issues).toHaveLength(2);
			expect(mockOctokit.rest.issues.update).toHaveBeenCalledTimes(2);
		});

		it("should handle GraphQL errors gracefully", async () => {
			// Mock GraphQL error
			mockOctokit.graphql = vi.fn().mockRejectedValue(new Error("GraphQL error"));

			const result = await closeLinkedIssues("test-token", 1, false);

			expect(result.closedCount).toBe(0);
			expect(result.issues).toHaveLength(0);
		});
	});

	describe("closing issues", () => {
		it("should close issues and add comments", async () => {
			mockOctokit.graphql = vi.fn().mockResolvedValue({
				repository: {
					pullRequest: {
						closingIssuesReferences: {
							nodes: [{ number: 123, title: "Test issue", state: "OPEN" }],
						},
					},
				},
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
			mockOctokit.graphql = vi.fn().mockResolvedValue({
				repository: {
					pullRequest: {
						closingIssuesReferences: {
							nodes: [{ number: 123, title: "Already closed issue", state: "CLOSED" }],
						},
					},
				},
			});

			const result = await closeLinkedIssues("test-token", 1, false);

			expect(result.closedCount).toBe(0);
			expect(result.issues[0].error).toBe("Already closed");
			expect(mockOctokit.rest.issues.update).not.toHaveBeenCalled();
		});

		it("should handle API errors when closing issues", async () => {
			mockOctokit.graphql = vi.fn().mockResolvedValue({
				repository: {
					pullRequest: {
						closingIssuesReferences: {
							nodes: [
								{ number: 123, title: "Test issue", state: "OPEN" },
								{ number: 456, title: "Another issue", state: "OPEN" },
							],
						},
					},
				},
			});

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
			mockOctokit.graphql = vi.fn().mockResolvedValue({
				repository: {
					pullRequest: {
						closingIssuesReferences: {
							nodes: [{ number: 123, title: "Test issue", state: "OPEN" }],
						},
					},
				},
			});

			const result = await closeLinkedIssues("test-token", 1, true);

			expect(result.closedCount).toBe(1);
			expect(mockOctokit.rest.issues.update).not.toHaveBeenCalled();
			expect(mockOctokit.rest.issues.createComment).not.toHaveBeenCalled();
		});

		it("should still create check run in dry run mode", async () => {
			mockOctokit.graphql = vi.fn().mockResolvedValue({
				repository: {
					pullRequest: {
						closingIssuesReferences: {
							nodes: [{ number: 123, title: "Test issue", state: "OPEN" }],
						},
					},
				},
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
			mockOctokit.graphql = vi.fn().mockResolvedValue({
				repository: {
					pullRequest: {
						closingIssuesReferences: {
							nodes: [{ number: 123, title: "Test issue", state: "OPEN" }],
						},
					},
				},
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
			mockOctokit.graphql = vi.fn().mockResolvedValue({
				repository: {
					pullRequest: {
						closingIssuesReferences: {
							nodes: [{ number: 123, title: "Test issue", state: "OPEN" }],
						},
					},
				},
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
			mockOctokit.graphql = vi.fn().mockResolvedValue({
				repository: {
					pullRequest: {
						closingIssuesReferences: {
							nodes: [],
						},
					},
				},
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
			mockOctokit.graphql = vi.fn().mockResolvedValue({
				repository: {
					pullRequest: {
						closingIssuesReferences: {
							nodes: [
								{ number: 123, title: "Open issue", state: "OPEN" },
								{ number: 456, title: "Closed issue", state: "CLOSED" },
								{ number: 789, title: "Another open", state: "OPEN" },
							],
						},
					},
				},
			});

			const result = await closeLinkedIssues("test-token", 1, false);

			// 123 and 789 should be closed, 456 already closed
			expect(result.closedCount).toBe(2);
			expect(result.issues).toHaveLength(3);
			expect(mockOctokit.rest.issues.update).toHaveBeenCalledTimes(2);
		});

		it("should handle empty nodes array", async () => {
			mockOctokit.graphql = vi.fn().mockResolvedValue({
				repository: {
					pullRequest: {
						closingIssuesReferences: {
							nodes: [],
						},
					},
				},
			});

			const result = await closeLinkedIssues("test-token", 1, false);

			expect(result.closedCount).toBe(0);
			expect(result.issues).toHaveLength(0);
		});
	});
});
