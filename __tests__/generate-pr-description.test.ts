import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import generatePRDescription from "../.github/actions/setup-release/generate-pr-description.js";
import type { MockCore } from "./utils/github-mocks.js";
import { createMockCore } from "./utils/github-mocks.js";

// Create a shared mock instance that will be used by all tests
const mockMessages: {
	create: ReturnType<typeof vi.fn>;
} = {
	create: vi.fn(),
};

// Mock the module with a factory function that returns the shared instance
vi.mock("@anthropic-ai/sdk", () => {
	return {
		default: class MockAnthropic {
			messages = mockMessages;

			constructor(options: { apiKey: string }) {
				// Validate API key like the real Anthropic SDK would
				if (!options.apiKey || options.apiKey.trim() === "") {
					throw new Error("API key is required");
				}
			}
		},
	};
});

import Anthropic from "@anthropic-ai/sdk";

// Custom interface matching the action's requirements
interface GeneratePRDescriptionArgs {
	core: typeof import("@actions/core");
	github: ReturnType<typeof import("@actions/github").getOctokit>;
	context: typeof import("@actions/github").context;
	Anthropic: typeof Anthropic;
}

describe("generate-pr-description", () => {
	let mockCore: MockCore;
	let mockArgs: GeneratePRDescriptionArgs;

	let mockGithub: {
		rest: {
			pulls: {
				update: ReturnType<typeof vi.fn>;
			};
			checks: {
				create: ReturnType<typeof vi.fn>;
			};
		};
	};

	const linkedIssues = [
		{
			number: 123,
			title: "Add new feature",
			state: "open",
			url: "https://github.com/test-owner/test-repo/issues/123",
			commits: ["abc123"],
		},
		{
			number: 456,
			title: "Fix critical bug",
			state: "closed",
			url: "https://github.com/test-owner/test-repo/issues/456",
			commits: ["def456"],
		},
	];

	const commits = [
		{
			sha: "abc123",
			message: "feat: add new feature\n\ncloses #123",
			author: "Alice",
		},
		{
			sha: "def456",
			message: "fix: resolve critical bug\n\nfixes #456",
			author: "Bob",
		},
	];

	beforeEach(() => {
		vi.clearAllMocks();

		mockCore = createMockCore();

		mockGithub = {
			rest: {
				pulls: {
					update: vi.fn(),
				},
				checks: {
					create: vi.fn(),
				},
			},
		};

		mockArgs = {
			core: mockCore as never,
			github: mockGithub as never,
			context: {
				repo: {
					owner: "test-owner",
					repo: "test-repo",
				},
				sha: "abc123",
			} as never,
			Anthropic: Anthropic as never,
		};

		// Default successful responses
		mockMessages.create.mockResolvedValue({
			content: [
				{
					type: "text",
					text: "- Added new feature X\n- Fixed critical bug in Y\n- Improved performance",
				},
			],
		} as never);

		mockGithub.rest.pulls.update.mockResolvedValue({ data: {} } as never);

		mockGithub.rest.checks.create.mockResolvedValue({
			data: {
				id: 999,
				html_url: "https://github.com/test-owner/test-repo/runs/999",
			},
		} as never);

		// Setup default environment
		process.env.LINKED_ISSUES = JSON.stringify(linkedIssues);
		process.env.COMMITS = JSON.stringify(commits);
		process.env.PR_NUMBER = "42";
		process.env.ANTHROPIC_API_KEY = "test-api-key";
	});

	afterEach(() => {
		vi.useRealTimers();
		// Don't restore mocks - let clearAllMocks in beforeEach handle cleanup
		delete process.env.LINKED_ISSUES;
		delete process.env.COMMITS;
		delete process.env.PR_NUMBER;
		delete process.env.ANTHROPIC_API_KEY;
		delete process.env.DRY_RUN;
	});

	describe("PR description generation", () => {
		it("should generate description with Claude API", async () => {
			await generatePRDescription(mockArgs);

			expect(mockMessages.create).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "claude-sonnet-4-20250514",
					max_tokens: 1024,
					messages: expect.arrayContaining([
						expect.objectContaining({
							role: "user",
							content: expect.stringContaining("Linked Issues"),
						}),
					]),
				}),
			);

			expect(mockGithub.rest.pulls.update).toHaveBeenCalledWith({
				owner: "test-owner",
				repo: "test-repo",
				pull_number: 42,
				body: expect.stringContaining("Added new feature"),
			});
		});

		it("should include linked issues in prompt", async () => {
			await generatePRDescription(mockArgs);

			const createCall = mockMessages.create.mock.calls[0][0];
			const prompt = createCall.messages[0].content as string;

			expect(prompt).toContain("#123: Add new feature");
			expect(prompt).toContain("#456: Fix critical bug");
		});

		it("should include commits in prompt", async () => {
			await generatePRDescription(mockArgs);

			const createCall = mockMessages.create.mock.calls[0][0];
			const prompt = createCall.messages[0].content as string;

			expect(prompt).toContain("abc123: feat: add new feature");
			expect(prompt).toContain("def456: fix: resolve critical bug");
		});

		it("should set outputs correctly", async () => {
			await generatePRDescription(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("description", expect.stringContaining("Added new feature"));
			expect(mockCore.setOutput).toHaveBeenCalledWith("check_id", "999");
		});
	});

	describe("fallback description generation", () => {
		it("should use fallback when API key is missing", async () => {
			delete process.env.ANTHROPIC_API_KEY;

			await generatePRDescription(mockArgs);

			expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining("ANTHROPIC_API_KEY not provided"));

			expect(mockGithub.rest.pulls.update).toHaveBeenCalledWith(
				expect.objectContaining({
					body: expect.stringContaining("## Changes"),
				}),
			);
		});

		it("should use fallback when Claude API fails", async () => {
			mockMessages.create.mockRejectedValue(new Error("Rate limit exceeded"));

			await generatePRDescription(mockArgs);

			expect(mockCore.warning).toHaveBeenCalledWith(
				expect.stringContaining("Failed to generate description with Claude"),
			);

			expect(mockGithub.rest.pulls.update).toHaveBeenCalledWith(
				expect.objectContaining({
					body: expect.stringContaining("Fixes #123"),
				}),
			);
		});

		it("should handle empty inputs", async () => {
			process.env.LINKED_ISSUES = "[]";
			process.env.COMMITS = "[]";

			await generatePRDescription(mockArgs);

			expect(mockCore.warning).toHaveBeenCalledWith("No linked issues or commits provided");

			expect(mockGithub.rest.pulls.update).toHaveBeenCalledWith(
				expect.objectContaining({
					body: expect.stringContaining("No changes detected"),
				}),
			);
		});
	});

	describe("retry logic", () => {
		it("should retry on rate limit errors", async () => {
			vi.useFakeTimers();

			mockMessages.create
				.mockRejectedValueOnce(new Error("rate_limit_error"))
				.mockRejectedValueOnce(new Error("rate_limit_error"))
				.mockResolvedValueOnce({
					content: [
						{
							type: "text",
							text: "- Success after retry",
						},
					],
				} as never);

			const actionPromise = generatePRDescription(mockArgs);
			await vi.advanceTimersByTimeAsync(60000); // Advance 60 seconds to cover all potential retries
			await actionPromise;

			expect(mockMessages.create).toHaveBeenCalledTimes(3);
			expect(mockGithub.rest.pulls.update).toHaveBeenCalledWith(
				expect.objectContaining({
					body: expect.stringContaining("Success after retry"),
				}),
			);

			vi.useRealTimers();
		});

		it("should retry on network errors", async () => {
			vi.useFakeTimers();

			mockMessages.create.mockRejectedValueOnce(new Error("ECONNRESET")).mockResolvedValueOnce({
				content: [
					{
						type: "text",
						text: "- Success after retry",
					},
				],
			} as never);

			const actionPromise = generatePRDescription(mockArgs);
			await vi.advanceTimersByTimeAsync(60000); // Advance 60 seconds to cover all potential retries
			await actionPromise;

			expect(mockMessages.create).toHaveBeenCalledTimes(2);

			vi.useRealTimers();
		});

		it("should retry GitHub API calls", async () => {
			vi.useFakeTimers();

			mockGithub.rest.pulls.update
				.mockRejectedValueOnce(new Error("timeout"))
				.mockResolvedValueOnce({ data: {} } as never);

			const actionPromise = generatePRDescription(mockArgs);
			await vi.advanceTimersByTimeAsync(60000); // Advance 60 seconds to cover all potential retries
			await actionPromise;

			expect(mockGithub.rest.pulls.update).toHaveBeenCalledTimes(2);

			vi.useRealTimers();
		});

		it("should not retry on non-retryable errors", async () => {
			vi.useFakeTimers();

			mockMessages.create.mockRejectedValue(new Error("Invalid API key"));

			const actionPromise = generatePRDescription(mockArgs);
			await vi.advanceTimersByTimeAsync(60000); // Advance 60 seconds to cover all potential retries
			await actionPromise;

			expect(mockMessages.create).toHaveBeenCalledTimes(1);
			expect(mockCore.warning).toHaveBeenCalledWith(
				expect.stringContaining("Failed to generate description with Claude"),
			);

			vi.useRealTimers();
		});
	});

	describe("dry-run mode", () => {
		it("should not update PR in dry-run mode", async () => {
			process.env.DRY_RUN = "true";

			await generatePRDescription(mockArgs);

			expect(mockCore.notice).toHaveBeenCalledWith(expect.stringContaining("dry-run mode"));
			expect(mockGithub.rest.pulls.update).not.toHaveBeenCalled();
			expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining("[Dry Run] Would update PR"));
		});

		it("should still call Claude API in dry-run mode with API key", async () => {
			process.env.DRY_RUN = "true";

			await generatePRDescription(mockArgs);

			// API key is set, so it should attempt to call Claude
			expect(mockMessages.create).toHaveBeenCalled();
		});
	});

	describe("input validation", () => {
		it("should require PR_NUMBER", async () => {
			delete process.env.PR_NUMBER;

			await generatePRDescription(mockArgs);

			expect(mockCore.setFailed).toHaveBeenCalledWith(
				expect.stringContaining("PR_NUMBER environment variable is required"),
			);
		});

		it("should validate PR_NUMBER is a number", async () => {
			process.env.PR_NUMBER = "not-a-number";

			await generatePRDescription(mockArgs);

			expect(mockCore.setFailed).toHaveBeenCalledWith(expect.stringContaining("Invalid PR_NUMBER"));
		});

		it("should parse JSON inputs correctly", async () => {
			await generatePRDescription(mockArgs);

			// If Claude API was called, check the prompt
			if (mockMessages.create.mock.calls.length > 0) {
				const createCall = mockMessages.create.mock.calls[0][0];
				const prompt = createCall.messages[0].content as string;

				expect(prompt).toContain("#123");
				expect(prompt).toContain("abc123");
			}

			// Verify outputs were set
			expect(mockCore.setOutput).toHaveBeenCalledWith("description", expect.any(String));
			expect(mockCore.setOutput).toHaveBeenCalledWith("check_id", "999");
		});
	});

	describe("check run creation", () => {
		it("should create check run with generated description", async () => {
			await generatePRDescription(mockArgs);

			expect(mockGithub.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "Generate PR Description",
					head_sha: "abc123",
					status: "completed",
					conclusion: "success",
					output: expect.objectContaining({
						title: "Generated PR description with AI assistance",
						summary: expect.any(String),
					}),
				}),
			);

			// Check that summary contains some relevant content
			const checkCall = mockGithub.rest.checks.create.mock.calls[0][0];
			expect(checkCall.output?.summary).toBeTruthy();
		});

		it("should include linked issues in check output", async () => {
			await generatePRDescription(mockArgs);

			const checkCall = mockGithub.rest.checks.create.mock.calls[0][0];
			// Tables are stringified as "Table with N rows" in test environment
			expect(checkCall.output?.summary).toContain("Linked Issues");
			expect(checkCall.output?.summary).toContain("Table with 3 rows");
		});
	});

	describe("error handling", () => {
		it("should handle malformed JSON inputs", async () => {
			process.env.LINKED_ISSUES = "invalid json";

			await generatePRDescription(mockArgs);

			expect(mockCore.setFailed).toHaveBeenCalledWith(expect.stringContaining("Failed to generate PR description"));
		});

		it("should handle missing text content in Claude response", async () => {
			mockMessages.create.mockResolvedValue({
				content: [{ type: "image", source: {} }],
			} as never);

			await generatePRDescription(mockArgs);

			expect(mockCore.warning).toHaveBeenCalledWith(
				expect.stringContaining("Failed to generate description with Claude"),
			);
		});
	});
});
