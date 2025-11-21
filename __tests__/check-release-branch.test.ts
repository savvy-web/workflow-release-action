import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import checkReleaseBranch from "../.github/actions/setup-release/check-release-branch.js";
import type { AsyncFunctionArguments } from "../.github/actions/shared/types.js";
import type { MockCore } from "./utils/github-mocks.js";
import { createMockAsyncFunctionArguments, createMockCore } from "./utils/github-mocks.js";

describe("checkReleaseBranch", () => {
	let mockCore: MockCore;
	let mockArgs: AsyncFunctionArguments;
	let mockGithub: {
		rest: {
			repos: { getBranch: ReturnType<typeof vi.fn> };
			pulls: { list: ReturnType<typeof vi.fn> };
			checks: { create: ReturnType<typeof vi.fn> };
		};
	};

	beforeEach(() => {
		vi.clearAllMocks();

		mockCore = createMockCore();

		mockGithub = {
			rest: {
				repos: {
					getBranch: vi.fn(),
				},
				pulls: {
					list: vi.fn(),
				},
				checks: {
					create: vi.fn().mockResolvedValue({
						data: {
							id: 12345,
							html_url: "https://github.com/owner/repo/runs/12345",
						},
					}),
				},
			},
		};

		mockArgs = createMockAsyncFunctionArguments({
			core: mockCore as never,
			github: mockGithub as never,
			context: {
				repo: {
					owner: "test-owner",
					repo: "test-repo",
				},
				sha: "abc123",
			} as never,
		});

		// Default environment
		process.env.RELEASE_BRANCH = "changeset-release/main";
		process.env.TARGET_BRANCH = "main";
		process.env.DRY_RUN = "false";
	});

	afterEach(() => {
		vi.restoreAllMocks();
		delete process.env.RELEASE_BRANCH;
		delete process.env.TARGET_BRANCH;
		delete process.env.DRY_RUN;
	});

	describe("branch does not exist", () => {
		it("should detect when release branch does not exist", async () => {
			mockGithub.rest.repos.getBranch.mockRejectedValue({ status: 404 });

			await checkReleaseBranch(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("exists", "false");
			expect(mockCore.setOutput).toHaveBeenCalledWith("has_open_pr", "false");
			expect(mockCore.setOutput).toHaveBeenCalledWith("pr_number", "");
			expect(mockCore.info).toHaveBeenCalledWith("Release branch 'changeset-release/main' does not exist");
		});
	});

	describe("branch exists without PR", () => {
		it("should detect branch exists but no open PR", async () => {
			mockGithub.rest.repos.getBranch.mockResolvedValue({ data: { name: "changeset-release/main" } });
			mockGithub.rest.pulls.list.mockResolvedValue({ data: [] });

			await checkReleaseBranch(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("exists", "true");
			expect(mockCore.setOutput).toHaveBeenCalledWith("has_open_pr", "false");
			expect(mockCore.setOutput).toHaveBeenCalledWith("pr_number", "");
			expect(mockCore.info).toHaveBeenCalledWith("✓ Release branch 'changeset-release/main' exists");
			expect(mockCore.info).toHaveBeenCalledWith("No open PR found from 'changeset-release/main' to 'main'");
		});
	});

	describe("branch exists with open PR", () => {
		it("should detect branch exists with open PR", async () => {
			mockGithub.rest.repos.getBranch.mockResolvedValue({ data: { name: "changeset-release/main" } });
			mockGithub.rest.pulls.list.mockResolvedValue({
				data: [
					{
						number: 42,
						html_url: "https://github.com/test-owner/test-repo/pull/42",
					},
				],
			});

			await checkReleaseBranch(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("exists", "true");
			expect(mockCore.setOutput).toHaveBeenCalledWith("has_open_pr", "true");
			expect(mockCore.setOutput).toHaveBeenCalledWith("pr_number", "42");
			expect(mockCore.info).toHaveBeenCalledWith(
				"✓ Open PR found: #42 (https://github.com/test-owner/test-repo/pull/42)",
			);
		});

		it("should use the first PR when multiple PRs exist", async () => {
			mockGithub.rest.repos.getBranch.mockResolvedValue({ data: { name: "changeset-release/main" } });
			mockGithub.rest.pulls.list.mockResolvedValue({
				data: [
					{ number: 42, html_url: "https://github.com/test-owner/test-repo/pull/42" },
					{ number: 43, html_url: "https://github.com/test-owner/test-repo/pull/43" },
				],
			});

			await checkReleaseBranch(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("pr_number", "42");
		});
	});

	describe("custom branch names", () => {
		it("should use custom release branch name from env", async () => {
			process.env.RELEASE_BRANCH = "custom-release";

			mockGithub.rest.repos.getBranch.mockResolvedValue({ data: { name: "custom-release" } });
			mockGithub.rest.pulls.list.mockResolvedValue({ data: [] });

			await checkReleaseBranch(mockArgs);

			expect(mockGithub.rest.repos.getBranch).toHaveBeenCalledWith({
				owner: "test-owner",
				repo: "test-repo",
				branch: "custom-release",
			});
		});

		it("should use custom target branch name from env", async () => {
			process.env.TARGET_BRANCH = "develop";

			mockGithub.rest.repos.getBranch.mockResolvedValue({ data: { name: "changeset-release/main" } });
			mockGithub.rest.pulls.list.mockResolvedValue({ data: [] });

			await checkReleaseBranch(mockArgs);

			expect(mockGithub.rest.pulls.list).toHaveBeenCalledWith({
				owner: "test-owner",
				repo: "test-repo",
				state: "open",
				head: "test-owner:changeset-release/main",
				base: "develop",
			});
		});
	});

	describe("error handling", () => {
		it("should handle non-404 errors when checking branch", async () => {
			mockGithub.rest.repos.getBranch.mockRejectedValue({ status: 500, message: "Internal server error" });

			await checkReleaseBranch(mockArgs);

			expect(mockCore.warning).toHaveBeenCalledWith(
				expect.stringContaining("Failed to check if branch 'changeset-release/main' exists"),
			);
			expect(mockCore.setOutput).toHaveBeenCalledWith("exists", "false");
		});

		it("should handle errors when listing PRs", async () => {
			mockGithub.rest.repos.getBranch.mockResolvedValue({ data: { name: "changeset-release/main" } });
			mockGithub.rest.pulls.list.mockRejectedValue(new Error("API error"));

			await checkReleaseBranch(mockArgs);

			expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining("Failed to check for open PRs"));
			expect(mockCore.setOutput).toHaveBeenCalledWith("has_open_pr", "false");
		});

		it("should handle general errors gracefully", async () => {
			mockGithub.rest.repos.getBranch.mockRejectedValue(new Error("Unexpected error"));
			mockGithub.rest.checks.create.mockRejectedValue(new Error("Check creation failed"));

			await checkReleaseBranch(mockArgs);

			expect(mockCore.setFailed).toHaveBeenCalledWith(expect.stringContaining("Failed to check release branch"));
		});
	});

	describe("dry-run mode", () => {
		it("should indicate dry-run in check title", async () => {
			process.env.DRY_RUN = "true";

			mockGithub.rest.repos.getBranch.mockResolvedValue({ data: { name: "changeset-release/main" } });
			mockGithub.rest.pulls.list.mockResolvedValue({ data: [] });

			await checkReleaseBranch(mockArgs);

			expect(mockCore.notice).toHaveBeenCalledWith("🧪 Running in dry-run mode (preview only)");
			expect(mockGithub.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "🧪 Check Release Branch (Dry Run)",
				}),
			);
		});
	});

	describe("GitHub check creation", () => {
		it("should create check with correct parameters when branch doesn't exist", async () => {
			mockGithub.rest.repos.getBranch.mockRejectedValue({ status: 404 });

			await checkReleaseBranch(mockArgs);

			expect(mockGithub.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					owner: "test-owner",
					repo: "test-repo",
					name: "Check Release Branch",
					head_sha: "abc123",
					status: "completed",
					conclusion: "success",
					output: expect.objectContaining({
						title: "Release branch does not exist",
						summary: expect.stringContaining("Branch"),
					}),
				}),
			);
		});

		it("should create check with correct parameters when branch exists with PR", async () => {
			mockGithub.rest.repos.getBranch.mockResolvedValue({ data: { name: "changeset-release/main" } });
			mockGithub.rest.pulls.list.mockResolvedValue({
				data: [{ number: 42, html_url: "https://github.com/test-owner/test-repo/pull/42" }],
			});

			await checkReleaseBranch(mockArgs);

			expect(mockGithub.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					output: expect.objectContaining({
						title: "Release branch exists with open PR #42",
					}),
				}),
			);
		});

		it("should set check_id output", async () => {
			mockGithub.rest.repos.getBranch.mockRejectedValue({ status: 404 });

			await checkReleaseBranch(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("check_id", "12345");
		});
	});

	describe("summary messages", () => {
		it("should log correct summary when branch doesn't exist", async () => {
			mockGithub.rest.repos.getBranch.mockRejectedValue({ status: 404 });

			await checkReleaseBranch(mockArgs);

			expect(mockCore.notice).toHaveBeenCalledWith("✓ Release branch 'changeset-release/main' does not exist");
		});

		it("should log correct summary when branch exists without PR", async () => {
			mockGithub.rest.repos.getBranch.mockResolvedValue({ data: { name: "changeset-release/main" } });
			mockGithub.rest.pulls.list.mockResolvedValue({ data: [] });

			await checkReleaseBranch(mockArgs);

			expect(mockCore.notice).toHaveBeenCalledWith("✓ Release branch 'changeset-release/main' exists without open PR");
		});

		it("should log correct summary when branch exists with PR", async () => {
			mockGithub.rest.repos.getBranch.mockResolvedValue({ data: { name: "changeset-release/main" } });
			mockGithub.rest.pulls.list.mockResolvedValue({
				data: [{ number: 42, html_url: "https://github.com/test-owner/test-repo/pull/42" }],
			});

			await checkReleaseBranch(mockArgs);

			expect(mockCore.notice).toHaveBeenCalledWith("✓ Release branch 'changeset-release/main' exists with open PR #42");
		});
	});
});
