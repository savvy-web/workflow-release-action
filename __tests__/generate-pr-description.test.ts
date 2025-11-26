import * as core from "@actions/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import generatePRDescription from "../src/utils/generate-pr-description.js";
import { cleanupTestEnvironment, createMockOctokit, setupTestEnvironment } from "./utils/github-mocks.js";
import type { MockOctokit } from "./utils/test-types.js";

// Mock modules
vi.mock("@actions/core");

// Create mock Anthropic client
const mockAnthropicCreate: ReturnType<typeof vi.fn> = vi.fn();

// Mock Anthropic class as a proper constructor
class MockAnthropic {
	messages = {
		create: mockAnthropicCreate,
	};
}

describe("generate-pr-description", () => {
	let mockOctokit: MockOctokit;
	let mockCore: typeof core;
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });
		originalEnv = { ...process.env };

		// Set required environment variables
		process.env.PR_NUMBER = "123";
		process.env.ANTHROPIC_API_KEY = "test-api-key";
		process.env.LINKED_ISSUES = "[]";
		process.env.COMMITS = "[]";
		process.env.DRY_RUN = "false";

		// Mock core.summary on the actual core module (used by summaryWriter)
		const mockSummary = {
			addRaw: vi.fn().mockReturnThis(),
			write: vi.fn().mockResolvedValue(undefined),
		};
		Object.defineProperty(core, "summary", { value: mockSummary, writable: true });

		// Mock core module
		mockCore = {
			...core,
			info: vi.fn(),
			debug: vi.fn(),
			warning: vi.fn(),
			error: vi.fn(),
			notice: vi.fn(),
			startGroup: vi.fn(),
			endGroup: vi.fn(),
			setOutput: vi.fn(),
			setFailed: vi.fn(),
			summary: mockSummary,
		} as unknown as typeof core;

		// Setup mock octokit
		mockOctokit = createMockOctokit();

		// Default Anthropic mock response
		mockAnthropicCreate.mockResolvedValue({
			content: [{ type: "text", text: "- Added new feature\n- Fixed bug" }],
		});
	});

	afterEach(() => {
		process.env = originalEnv;
		cleanupTestEnvironment();
		vi.clearAllMocks();
	});

	it("should generate PR description with Claude", async () => {
		process.env.LINKED_ISSUES = JSON.stringify([
			{ number: 42, title: "Feature request", state: "open", url: "https://github.com/test/issues/42", commits: [] },
		]);
		process.env.COMMITS = JSON.stringify([{ sha: "abc123", message: "feat: add feature", author: "Test User" }]);

		const mockContext = {
			repo: { owner: "test-owner", repo: "test-repo" },
			sha: "abc123",
		};

		await generatePRDescription({
			core: mockCore,
			github: mockOctokit as unknown as InstanceType<typeof import("@actions/github/lib/utils").GitHub>,
			context: mockContext as unknown as import("@actions/github/lib/context").Context,
			Anthropic: MockAnthropic as unknown as typeof import("@anthropic-ai/sdk").default,
		});

		expect(mockAnthropicCreate).toHaveBeenCalled();
		expect(mockOctokit.rest.pulls.update).toHaveBeenCalledWith(
			expect.objectContaining({
				pull_number: 123,
				body: expect.any(String),
			}),
		);
		expect(mockCore.setOutput).toHaveBeenCalledWith("description", expect.any(String));
	});

	it("should handle missing PR_NUMBER", async () => {
		delete process.env.PR_NUMBER;

		const mockContext = {
			repo: { owner: "test-owner", repo: "test-repo" },
			sha: "abc123",
		};

		await generatePRDescription({
			core: mockCore,
			github: mockOctokit as unknown as InstanceType<typeof import("@actions/github/lib/utils").GitHub>,
			context: mockContext as unknown as import("@actions/github/lib/context").Context,
			Anthropic: MockAnthropic as unknown as typeof import("@anthropic-ai/sdk").default,
		});

		expect(mockCore.setFailed).toHaveBeenCalledWith(expect.stringContaining("PR_NUMBER"));
	});

	it("should handle invalid PR_NUMBER", async () => {
		process.env.PR_NUMBER = "not-a-number";

		const mockContext = {
			repo: { owner: "test-owner", repo: "test-repo" },
			sha: "abc123",
		};

		await generatePRDescription({
			core: mockCore,
			github: mockOctokit as unknown as InstanceType<typeof import("@actions/github/lib/utils").GitHub>,
			context: mockContext as unknown as import("@actions/github/lib/context").Context,
			Anthropic: MockAnthropic as unknown as typeof import("@anthropic-ai/sdk").default,
		});

		expect(mockCore.setFailed).toHaveBeenCalledWith(expect.stringContaining("Invalid PR_NUMBER"));
	});

	it("should warn when API key is missing", async () => {
		delete process.env.ANTHROPIC_API_KEY;

		const mockContext = {
			repo: { owner: "test-owner", repo: "test-repo" },
			sha: "abc123",
		};

		await generatePRDescription({
			core: mockCore,
			github: mockOctokit as unknown as InstanceType<typeof import("@actions/github/lib/utils").GitHub>,
			context: mockContext as unknown as import("@actions/github/lib/context").Context,
			Anthropic: MockAnthropic as unknown as typeof import("@anthropic-ai/sdk").default,
		});

		expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining("ANTHROPIC_API_KEY not provided"));
	});

	it("should handle empty linked issues and commits", async () => {
		const mockContext = {
			repo: { owner: "test-owner", repo: "test-repo" },
			sha: "abc123",
		};

		await generatePRDescription({
			core: mockCore,
			github: mockOctokit as unknown as InstanceType<typeof import("@actions/github/lib/utils").GitHub>,
			context: mockContext as unknown as import("@actions/github/lib/context").Context,
			Anthropic: MockAnthropic as unknown as typeof import("@anthropic-ai/sdk").default,
		});

		expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining("No linked issues or commits"));
		expect(mockCore.setOutput).toHaveBeenCalledWith("description", expect.stringContaining("No changes detected"));
	});

	it("should skip PR update in dry-run mode", async () => {
		process.env.DRY_RUN = "true";
		process.env.COMMITS = JSON.stringify([{ sha: "abc123", message: "test", author: "Test" }]);

		const mockContext = {
			repo: { owner: "test-owner", repo: "test-repo" },
			sha: "abc123",
		};

		await generatePRDescription({
			core: mockCore,
			github: mockOctokit as unknown as InstanceType<typeof import("@actions/github/lib/utils").GitHub>,
			context: mockContext as unknown as import("@actions/github/lib/context").Context,
			Anthropic: MockAnthropic as unknown as typeof import("@anthropic-ai/sdk").default,
		});

		expect(mockCore.notice).toHaveBeenCalledWith(expect.stringContaining("dry-run"));
		expect(mockOctokit.rest.pulls.update).not.toHaveBeenCalled();
	});

	it("should use fallback when Claude API fails", async () => {
		process.env.COMMITS = JSON.stringify([{ sha: "abc123", message: "feat: add feature", author: "Test" }]);
		mockAnthropicCreate.mockRejectedValue(new Error("API rate limit"));

		const mockContext = {
			repo: { owner: "test-owner", repo: "test-repo" },
			sha: "abc123",
		};

		await generatePRDescription({
			core: mockCore,
			github: mockOctokit as unknown as InstanceType<typeof import("@actions/github/lib/utils").GitHub>,
			context: mockContext as unknown as import("@actions/github/lib/context").Context,
			Anthropic: MockAnthropic as unknown as typeof import("@anthropic-ai/sdk").default,
		});

		expect(mockCore.warning).toHaveBeenCalledWith(
			expect.stringContaining("Failed to generate description with Claude"),
		);
		// Should still succeed with fallback
		expect(mockCore.setOutput).toHaveBeenCalledWith("description", expect.any(String));
	});

	it("should handle Claude response without text content", async () => {
		process.env.COMMITS = JSON.stringify([{ sha: "abc123", message: "test", author: "Test" }]);
		mockAnthropicCreate.mockResolvedValue({
			content: [{ type: "image", source: {} }], // No text content
		});

		const mockContext = {
			repo: { owner: "test-owner", repo: "test-repo" },
			sha: "abc123",
		};

		await generatePRDescription({
			core: mockCore,
			github: mockOctokit as unknown as InstanceType<typeof import("@actions/github/lib/utils").GitHub>,
			context: mockContext as unknown as import("@actions/github/lib/context").Context,
			Anthropic: MockAnthropic as unknown as typeof import("@anthropic-ai/sdk").default,
		});

		// Should fallback when no text content
		expect(mockCore.warning).toHaveBeenCalledWith(
			expect.stringContaining("Failed to generate description with Claude"),
		);
	});

	it("should create check run with results", async () => {
		process.env.COMMITS = JSON.stringify([{ sha: "abc123", message: "test", author: "Test" }]);

		const mockContext = {
			repo: { owner: "test-owner", repo: "test-repo" },
			sha: "abc123",
		};

		await generatePRDescription({
			core: mockCore,
			github: mockOctokit as unknown as InstanceType<typeof import("@actions/github/lib/utils").GitHub>,
			context: mockContext as unknown as import("@actions/github/lib/context").Context,
			Anthropic: MockAnthropic as unknown as typeof import("@anthropic-ai/sdk").default,
		});

		expect(mockOctokit.rest.checks.create).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "Generate PR Description",
				status: "completed",
				conclusion: "success",
			}),
		);
		expect(mockCore.setOutput).toHaveBeenCalledWith("check_id", expect.any(String));
	});

	it("should include linked issues in fallback description", async () => {
		process.env.LINKED_ISSUES = JSON.stringify([
			{ number: 42, title: "Bug fix", state: "closed", url: "https://github.com/test/issues/42", commits: ["abc"] },
		]);
		mockAnthropicCreate.mockRejectedValue(new Error("API error"));

		const mockContext = {
			repo: { owner: "test-owner", repo: "test-repo" },
			sha: "abc123",
		};

		await generatePRDescription({
			core: mockCore,
			github: mockOctokit as unknown as InstanceType<typeof import("@actions/github/lib/utils").GitHub>,
			context: mockContext as unknown as import("@actions/github/lib/context").Context,
			Anthropic: MockAnthropic as unknown as typeof import("@anthropic-ai/sdk").default,
		});

		expect(mockOctokit.rest.pulls.update).toHaveBeenCalledWith(
			expect.objectContaining({
				body: expect.stringContaining("Fixes #42"),
			}),
		);
	});

	it("should retry on retryable errors with exponential backoff", async () => {
		vi.useFakeTimers();
		process.env.COMMITS = JSON.stringify([{ sha: "abc123", message: "test", author: "Test" }]);

		// Use ECONNRESET which is in the retryable errors list
		let callCount = 0;
		mockAnthropicCreate.mockImplementation(() => {
			callCount++;
			if (callCount < 3) {
				return Promise.reject(new Error("ECONNRESET: Connection reset"));
			}
			return Promise.resolve({
				content: [{ type: "text", text: "- Fixed after retry" }],
			});
		});

		const mockContext = {
			repo: { owner: "test-owner", repo: "test-repo" },
			sha: "abc123",
		};

		const actionPromise = generatePRDescription({
			core: mockCore,
			github: mockOctokit as unknown as InstanceType<typeof import("@actions/github/lib/utils").GitHub>,
			context: mockContext as unknown as import("@actions/github/lib/context").Context,
			Anthropic: MockAnthropic as unknown as typeof import("@anthropic-ai/sdk").default,
		});

		// Advance time to allow retries
		await vi.advanceTimersByTimeAsync(60000);
		await actionPromise;

		// Should have retried and succeeded
		expect(callCount).toBe(3);
		expect(mockCore.setOutput).toHaveBeenCalledWith("description", expect.stringContaining("Fixed after retry"));

		vi.useRealTimers();
	});

	it("should fallback after exhausting all retries on retryable errors", async () => {
		vi.useFakeTimers();
		process.env.COMMITS = JSON.stringify([{ sha: "abc123", message: "test", author: "Test" }]);

		// Always fail with retryable error
		mockAnthropicCreate.mockRejectedValue(new Error("ETIMEDOUT: Connection timed out"));

		const mockContext = {
			repo: { owner: "test-owner", repo: "test-repo" },
			sha: "abc123",
		};

		const actionPromise = generatePRDescription({
			core: mockCore,
			github: mockOctokit as unknown as InstanceType<typeof import("@actions/github/lib/utils").GitHub>,
			context: mockContext as unknown as import("@actions/github/lib/context").Context,
			Anthropic: MockAnthropic as unknown as typeof import("@anthropic-ai/sdk").default,
		});

		// Advance time to exhaust all retries
		await vi.advanceTimersByTimeAsync(120000);
		await actionPromise;

		// Should have tried 4 times (initial + 3 retries) and fallen back
		expect(mockAnthropicCreate).toHaveBeenCalledTimes(4);
		expect(mockCore.warning).toHaveBeenCalledWith(
			expect.stringContaining("Failed to generate description with Claude"),
		);
		// Should still succeed with fallback description
		expect(mockCore.setOutput).toHaveBeenCalledWith("description", expect.any(String));

		vi.useRealTimers();
	});
});
