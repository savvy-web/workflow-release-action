import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generatePRDescriptionDirect } from "../src/utils/generate-pr-description.js";
import { cleanupTestEnvironment, createMockOctokit, setupTestEnvironment } from "./utils/github-mocks.js";
import type { MockOctokit } from "./utils/test-types.js";

// Hoisted mocks for Anthropic - must be in same hoisted block
const { mockCreate, MockAnthropic }: { mockCreate: ReturnType<typeof vi.fn>; MockAnthropic: ReturnType<typeof vi.fn> } =
	vi.hoisted(() => {
		const create = vi.fn().mockResolvedValue({
			content: [{ type: "text", text: "- Added new feature\n- Fixed bug" }],
		});
		const MockClass = vi.fn().mockImplementation(() => ({
			messages: { create },
		}));
		return { mockCreate: create, MockAnthropic: MockClass };
	});

// Mock modules
vi.mock("@actions/core");
vi.mock("@actions/github");
vi.mock("@anthropic-ai/sdk", () => ({
	default: MockAnthropic,
}));

describe("generate-pr-description", () => {
	let mockOctokit: MockOctokit;

	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });

		// Mock core.summary on the actual core module (used by summaryWriter)
		const mockSummary = {
			addRaw: vi.fn().mockReturnThis(),
			write: vi.fn().mockResolvedValue(undefined),
		};
		Object.defineProperty(core, "summary", { value: mockSummary, writable: true });

		// Setup mock octokit
		mockOctokit = createMockOctokit();
		vi.mocked(getOctokit).mockReturnValue(mockOctokit as unknown as ReturnType<typeof getOctokit>);

		// Default mock for pulls.get (PR body with no linked issues)
		mockOctokit.rest.pulls.get.mockResolvedValue({ data: { body: "" } });

		// Mock context
		Object.defineProperty(vi.mocked(context), "repo", {
			value: { owner: "test-owner", repo: "test-repo" },
			writable: true,
		});
		Object.defineProperty(vi.mocked(context), "sha", { value: "abc123", writable: true });

		// Reset and set default Anthropic mock response
		mockCreate.mockReset();
		mockCreate.mockResolvedValue({
			content: [{ type: "text", text: "- Added new feature\n- Fixed bug" }],
		});
	});

	afterEach(() => {
		cleanupTestEnvironment();
		vi.clearAllMocks();
	});

	it("should generate PR description and update PR", async () => {
		const linkedIssues = [
			{ number: 42, title: "Feature request", state: "open", url: "https://github.com/test/issues/42", commits: [] },
		];
		const commits = [{ sha: "abc123", message: "feat: add feature", author: "Test User" }];

		const result = await generatePRDescriptionDirect("test-token", linkedIssues, commits, 123, "test-api-key", false);

		// Should have generated a description and updated the PR
		expect(mockOctokit.rest.pulls.update).toHaveBeenCalledWith(
			expect.objectContaining({
				pull_number: 123,
				body: expect.any(String),
			}),
		);
		expect(result.description).toBeDefined();
		expect(result.description.length).toBeGreaterThan(0);
	});

	it("should handle empty linked issues and commits", async () => {
		const result = await generatePRDescriptionDirect("test-token", [], [], 123, "test-api-key", false);

		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("No linked issues or commits"));
		expect(result.description).toContain("No changes detected");
	});

	it("should skip PR update in dry-run mode", async () => {
		const commits = [{ sha: "abc123", message: "test", author: "Test" }];

		await generatePRDescriptionDirect("test-token", [], commits, 123, "test-api-key", true);

		expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Dry Run"));
		expect(mockOctokit.rest.pulls.update).not.toHaveBeenCalled();
	});

	it("should use fallback when Claude API fails", async () => {
		const commits = [{ sha: "abc123", message: "feat: add feature", author: "Test" }];
		mockCreate.mockRejectedValue(new Error("API rate limit"));

		const result = await generatePRDescriptionDirect("test-token", [], commits, 123, "test-api-key", false);

		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Failed to generate description with Claude"));
		// Should still succeed with fallback
		expect(result.description).toBeDefined();
	});

	it("should handle Claude response without text content", async () => {
		const commits = [{ sha: "abc123", message: "test", author: "Test" }];
		mockCreate.mockResolvedValue({
			content: [{ type: "image", source: {} }], // No text content
		});

		const result = await generatePRDescriptionDirect("test-token", [], commits, 123, "test-api-key", false);

		// Should fallback when no text content
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Failed to generate description with Claude"));
		expect(result.description).toBeDefined();
	});

	it("should create check run with results", async () => {
		const commits = [{ sha: "abc123", message: "test", author: "Test" }];

		const result = await generatePRDescriptionDirect("test-token", [], commits, 123, "test-api-key", false);

		expect(mockOctokit.rest.checks.create).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "Generate PR Description",
				status: "completed",
				conclusion: "success",
			}),
		);
		expect(result.checkId).toBeDefined();
	});

	it("should include linked issues in fallback description", async () => {
		const linkedIssues = [
			{ number: 42, title: "Bug fix", state: "closed", url: "https://github.com/test/issues/42", commits: ["abc"] },
		];
		mockCreate.mockRejectedValue(new Error("API error"));

		await generatePRDescriptionDirect("test-token", linkedIssues, [], 123, "test-api-key", false);

		expect(mockOctokit.rest.pulls.update).toHaveBeenCalledWith(
			expect.objectContaining({
				body: expect.stringContaining("Fixes #42"),
			}),
		);
	});

	it("should fallback on non-retryable errors", async () => {
		const commits = [{ sha: "abc123", message: "test", author: "Test" }];

		// Non-retryable error should fallback immediately
		mockCreate.mockRejectedValue(new Error("Invalid API key"));

		const result = await generatePRDescriptionDirect("test-token", [], commits, 123, "test-api-key", false);

		// Should fallback with warning
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Failed to generate description with Claude"));
		expect(result.description).toBeDefined();
	});

	it("should work with empty API key using fallback", async () => {
		const commits = [{ sha: "abc123", message: "feat: new feature", author: "Test" }];

		// Empty API key - should use fallback
		const result = await generatePRDescriptionDirect("test-token", [], commits, 123, "", false);

		expect(result.description).toContain("Commits");
		expect(result.description).toContain("new feature");
	});

	it("should preserve existing linked issues section from PR body", async () => {
		const commits = [{ sha: "abc123", message: "test", author: "Test" }];

		// Mock PR body with existing linked issues section
		mockOctokit.rest.pulls.get.mockResolvedValue({
			data: {
				body: "## Linked Issues\n\n- Closes #42: Fix bug\n- Closes #43: Add feature\n\n## Old Content\n\nSome old text",
			},
		});

		await generatePRDescriptionDirect("test-token", [], commits, 123, "test-api-key", false);

		// Should preserve linked issues section at the top
		expect(mockOctokit.rest.pulls.update).toHaveBeenCalledWith(
			expect.objectContaining({
				body: expect.stringContaining("## Linked Issues"),
			}),
		);
		expect(mockOctokit.rest.pulls.update).toHaveBeenCalledWith(
			expect.objectContaining({
				body: expect.stringContaining("Closes #42"),
			}),
		);
		expect(core.info).toHaveBeenCalledWith("Preserved existing linked issues section");
	});

	it("should not preserve linked issues section when not present", async () => {
		const commits = [{ sha: "abc123", message: "test", author: "Test" }];

		// Mock PR body without linked issues section
		mockOctokit.rest.pulls.get.mockResolvedValue({
			data: { body: "Some random PR description" },
		});

		await generatePRDescriptionDirect("test-token", [], commits, 123, "test-api-key", false);

		// Should not log about preserving linked issues
		expect(core.info).not.toHaveBeenCalledWith("Preserved existing linked issues section");
	});
});
