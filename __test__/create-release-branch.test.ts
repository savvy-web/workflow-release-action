import { readFile } from "node:fs/promises";

import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { context, getOctokit } from "@actions/github";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApiCommit } from "../src/utils/create-api-commit.js";
import { createReleaseBranch } from "../src/utils/create-release-branch.js";
import { isSinglePackage } from "../src/utils/detect-repo-type.js";
import { getLinkedIssuesFromCommits } from "../src/utils/link-issues-from-commits.js";
import { cleanupTestEnvironment, createMockOctokit, setupTestEnvironment } from "./utils/github-mocks.js";

import type { ExecOptionsWithListeners, MockOctokit } from "./utils/test-types.js";

// Mock modules
vi.mock("node:fs/promises");
vi.mock("@actions/core");
vi.mock("@actions/exec");
vi.mock("@actions/github");
vi.mock("../src/utils/create-api-commit.js");
vi.mock("../src/utils/link-issues-from-commits.js");
vi.mock("../src/utils/detect-repo-type.js");

describe("create-release-branch", () => {
	let mockOctokit: MockOctokit;

	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });

		// Setup core.getState to return token and packageManager
		vi.mocked(core.getState).mockImplementation((name: string) => {
			if (name === "token") return "test-token";
			if (name === "packageManager") return "pnpm";
			return "";
		});

		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "release-branch") return "changeset-release/main";
			if (name === "target-branch") return "main";
			if (name === "version-command") return "";
			if (name === "pr-title-prefix") return "chore: release";
			return "";
		});
		vi.mocked(core.getBooleanInput).mockImplementation((name: string) => {
			if (name === "dry-run") return false;
			return false;
		});

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

		mockOctokit = createMockOctokit();

		// Set default GraphQL mock for createPullRequest
		mockOctokit.graphql.mockResolvedValue({
			createPullRequest: {
				pullRequest: {
					number: 123,
					url: "https://github.com/test/pull/123",
					id: "test-pr-node-id",
				},
			},
		});

		vi.mocked(getOctokit).mockReturnValue(mockOctokit as unknown as ReturnType<typeof getOctokit>);
		Object.defineProperty(vi.mocked(context), "repo", {
			value: { owner: "test-owner", repo: "test-repo" },
			writable: true,
		});
		Object.defineProperty(vi.mocked(context), "sha", { value: "abc123", writable: true });
		Object.defineProperty(vi.mocked(context), "runId", { value: 12345, writable: true });

		// Default exec mock
		vi.mocked(exec.exec).mockResolvedValue(0);

		// Mock createApiCommit
		vi.mocked(createApiCommit).mockResolvedValue({ sha: "abc123def456", created: true });

		// Mock getLinkedIssuesFromCommits to return empty by default
		vi.mocked(getLinkedIssuesFromCommits).mockResolvedValue({ linkedIssues: [], commits: [] });

		// Mock isSinglePackage to return false by default (multi-package repo)
		vi.mocked(isSinglePackage).mockReturnValue(false);

		// Mock readFile for package.json reading
		vi.mocked(readFile).mockResolvedValue(JSON.stringify({ name: "test-package", version: "1.0.0" }));
	});

	afterEach(() => {
		vi.useRealTimers(); // Reset to real timers after each test
		cleanupTestEnvironment();
	});

	it("should create release branch and PR successfully", async () => {
		// Mock git status to show changes
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\nM CHANGELOG.md\n"));
				}
			}
			return 0;
		});

		// Mock GraphQL createPullRequest mutation
		mockOctokit.graphql.mockResolvedValue({
			createPullRequest: {
				pullRequest: {
					number: 123,
					url: "https://github.com/test/pull/123",
					id: "test-pr-node-id",
				},
			},
		});

		const result = await createReleaseBranch("pnpm");

		expect(result.created).toBe(true);
		expect(result.prNumber).toBe(123);
		expect(result.checkId).toBe(12345);
		expect(mockOctokit.graphql).toHaveBeenCalled();
		expect(mockOctokit.rest.issues.addLabels).toHaveBeenCalledWith(
			expect.objectContaining({
				labels: ["automated", "release"],
			}),
		);
	});

	it("should not create branch when no changes from version command", async () => {
		// Mock git status to show no changes
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from(""));
				}
			}
			return 0;
		});

		const result = await createReleaseBranch("pnpm");

		expect(result.created).toBe(false);
		expect(result.prNumber).toBeNull();
		expect(result.versionSummary).toBe("No changes");
		expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
	});

	it("should skip actual operations in dry-run mode", async () => {
		vi.mocked(core.getBooleanInput).mockImplementation((name: string) => {
			if (name === "dry-run") return true;
			return false;
		});

		const result = await createReleaseBranch("pnpm");

		expect(result.created).toBe(true);
		expect(result.prNumber).toBeNull(); // No PR created in dry-run
		expect(core.info).toHaveBeenCalledWith(expect.stringContaining("[DRY RUN]"));
		expect(mockOctokit.graphql).not.toHaveBeenCalled();
	});

	it("should retry PR creation on failure", async () => {
		vi.useFakeTimers(); // PR retry uses setTimeout with 2000ms delay

		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		// First GraphQL call fails, second succeeds
		mockOctokit.graphql.mockRejectedValueOnce(new Error("API Error")).mockResolvedValueOnce({
			createPullRequest: {
				pullRequest: {
					number: 456,
					url: "https://github.com/test/pull/456",
					id: "test-pr-node-id",
				},
			},
		});

		const actionPromise = createReleaseBranch("pnpm");
		await vi.advanceTimersByTimeAsync(5000); // Advance past the 2s retry delay
		const result = await actionPromise;

		expect(result.created).toBe(true);
		expect(result.prNumber).toBe(456);
		expect(mockOctokit.graphql).toHaveBeenCalledTimes(2);
	});

	it("should use npm command for npm package manager", async () => {
		vi.mocked(core.getState).mockImplementation((name: string) => {
			if (name === "token") return "test-token";
			if (name === "packageManager") return "npm";
			return "";
		});
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "version-command") return "";
			return "";
		});

		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		await createReleaseBranch("npm");

		expect(exec.exec).toHaveBeenCalledWith("npm", ["run", "ci:version"], expect.any(Object));
	});

	it("should use yarn command for yarn package manager", async () => {
		vi.mocked(core.getState).mockImplementation((name: string) => {
			if (name === "token") return "test-token";
			if (name === "packageManager") return "yarn";
			return "";
		});
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "version-command") return "";
			return "";
		});

		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		await createReleaseBranch("yarn");

		expect(exec.exec).toHaveBeenCalledWith("yarn", ["ci:version"], expect.any(Object));
	});

	it("should use custom version command when provided", async () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "token") return "test-token";
			if (name === "version-command") return "turbo run version";
			return "";
		});

		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		await createReleaseBranch("pnpm");

		expect(exec.exec).toHaveBeenCalledWith("turbo run version", ["turbo", "run", "version"], expect.any(Object));
	});

	it("should create commit via GitHub API for verified signatures", async () => {
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		await createReleaseBranch("pnpm");

		// Verify createApiCommit was called instead of git commit
		expect(createApiCommit).toHaveBeenCalledWith(
			"test-token",
			"changeset-release/main",
			expect.stringContaining("chore: release"),
			expect.objectContaining({
				parentCommitSha: expect.any(String),
			}),
		);
		// Verify git config is NOT called (we use API commits now)
		expect(exec.exec).not.toHaveBeenCalledWith("git", ["config", "user.name", expect.any(String)]);
	});

	it("should include check run with neutral conclusion when no changes", async () => {
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from(""));
				}
			}
			return 0;
		});

		await createReleaseBranch("pnpm");

		expect(mockOctokit.rest.checks.create).toHaveBeenCalledWith(
			expect.objectContaining({
				conclusion: "neutral",
			}),
		);
	});

	it("should retry on ECONNRESET errors", async () => {
		vi.useFakeTimers(); // Enable fake timers for retry test

		let versionCallCount = 0;
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "pnpm" && args?.[0] === "ci:version") {
				versionCallCount++;
				if (versionCallCount === 1) {
					throw new Error("ECONNRESET: Connection reset by peer");
				}
				return 0;
			}
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		const actionPromise = createReleaseBranch("pnpm");
		await vi.advanceTimersByTimeAsync(60000); // Advance time to cover all retries
		const result = await actionPromise;

		expect(result.created).toBe(true);
		expect(versionCallCount).toBe(2);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("ECONNRESET"));
	});

	it("should throw immediately on non-retryable errors", async () => {
		vi.mocked(exec.exec).mockImplementation(async (cmd, args) => {
			if (cmd === "pnpm" && args?.[0] === "ci:version") {
				throw new Error("Permission denied");
			}
			return 0;
		});

		await expect(createReleaseBranch("pnpm")).rejects.toThrow("Permission denied");
	});

	it("should throw after max retries exhausted", async () => {
		vi.useFakeTimers(); // Enable fake timers for retry test

		vi.mocked(exec.exec).mockImplementation(async (cmd, args) => {
			if (cmd === "pnpm" && args?.[0] === "ci:version") {
				throw new Error("ETIMEDOUT: Connection timed out");
			}
			return 0;
		});

		const actionPromise = createReleaseBranch("pnpm");

		// Advance timers and catch rejection in a controlled way
		let caughtError: Error | null = null;
		actionPromise.catch((e: Error) => {
			caughtError = e;
		});

		await vi.advanceTimersByTimeAsync(60000); // Advance time to cover all retries
		await vi.runAllTimersAsync(); // Ensure all timers complete

		expect(caughtError).toBeInstanceOf(Error);
		expect((caughtError as unknown as Error).message).toContain("ETIMEDOUT");
	});

	it("should skip branch linking when no final commit SHA is available", async () => {
		// Mock createApiCommit to return no commit SHA
		vi.mocked(createApiCommit).mockResolvedValue({ sha: "", created: false });

		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		await createReleaseBranch("pnpm");

		expect(core.info).toHaveBeenCalledWith("No final commit SHA available, skipping branch linking");
	});

	it("should link branch to issues when linked issues are found", async () => {
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			if (cmd === "git" && args?.includes("rev-parse") && args?.includes("HEAD")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("abc123\n"));
				}
			}
			return 0;
		});

		// Mock repos.get to return node_id
		mockOctokit.rest.repos.get.mockResolvedValue({
			data: { node_id: "test-repo-node-id" },
		} as never);

		// Mock linked issues
		vi.mocked(getLinkedIssuesFromCommits).mockResolvedValue({
			linkedIssues: [
				{
					number: 10,
					title: "Test Issue",
					node_id: "issue-node-id-1",
					state: "open",
					url: "https://github.com/test/issues/10",
					commits: ["commit1"],
				},
				{
					number: 20,
					title: "Another Issue",
					node_id: "issue-node-id-2",
					state: "open",
					url: "https://github.com/test/issues/20",
					commits: ["commit1"],
				},
			],
			commits: [{ sha: "commit1", message: "Fixes #10", author: "Test User" }],
		});

		// Mock GraphQL for both PR creation and branch linking
		mockOctokit.graphql.mockImplementation(async (query: string) => {
			if (query.includes("createPullRequest")) {
				return {
					createPullRequest: {
						pullRequest: {
							number: 123,
							url: "https://github.com/test/pull/123",
							id: "test-pr-node-id",
						},
					},
				};
			}
			if (query.includes("createLinkedBranch")) {
				return {
					createLinkedBranch: { linkedBranch: { id: "linked-branch-id" } },
				};
			}
			return {};
		});

		await createReleaseBranch("pnpm");

		expect(mockOctokit.graphql).toHaveBeenCalledWith(
			expect.stringContaining("createLinkedBranch"),
			expect.objectContaining({
				issueId: "issue-node-id-1",
				name: "changeset-release/main",
				oid: "abc123def456",
				repositoryId: "test-repo-node-id",
			}),
		);
	});

	it("should handle GraphQL errors when linking individual issues", async () => {
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			if (cmd === "git" && args?.includes("rev-parse") && args?.includes("HEAD")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("abc123\n"));
				}
			}
			return 0;
		});

		mockOctokit.rest.repos.get.mockResolvedValue({
			data: { node_id: "test-repo-node-id" },
		} as never);

		vi.mocked(getLinkedIssuesFromCommits).mockResolvedValue({
			linkedIssues: [
				{
					number: 10,
					title: "Test Issue",
					node_id: "issue-node-id-1",
					state: "open",
					url: "https://github.com/test/issues/10",
					commits: ["commit1"],
				},
			],
			commits: [{ sha: "commit1", message: "Fixes #10", author: "Test User" }],
		});

		// Mock GraphQL to succeed for PR creation but fail for branch linking
		mockOctokit.graphql.mockImplementation(async (query: string) => {
			if (query.includes("createPullRequest")) {
				return {
					createPullRequest: {
						pullRequest: {
							number: 123,
							url: "https://github.com/test/pull/123",
							id: "test-pr-node-id",
						},
					},
				};
			}
			if (query.includes("createLinkedBranch")) {
				throw new Error("GraphQL API error");
			}
			return {};
		});

		await createReleaseBranch("pnpm");

		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Failed to link issue #10"));
	});

	it("should handle errors from getLinkedIssuesFromCommits gracefully", async () => {
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			if (cmd === "git" && args?.includes("rev-parse") && args?.includes("HEAD")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("abc123\n"));
				}
			}
			return 0;
		});

		mockOctokit.rest.repos.get.mockResolvedValue({
			data: { node_id: "test-repo-node-id" },
		} as never);

		// Mock getLinkedIssuesFromCommits to throw
		vi.mocked(getLinkedIssuesFromCommits).mockRejectedValue(new Error("Failed to fetch linked issues"));

		await createReleaseBranch("pnpm");

		expect(core.warning).toHaveBeenCalledWith(
			expect.stringContaining("Failed to link branch to issues: Failed to fetch linked issues"),
		);
	});

	it("should use version-based PR title for single-package repos", async () => {
		// Mock isSinglePackage to return true
		vi.mocked(isSinglePackage).mockReturnValue(true);

		// Mock readFile to return package.json with version
		vi.mocked(readFile).mockResolvedValue(JSON.stringify({ name: "my-package", version: "0.1.0" }));

		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		mockOctokit.rest.repos.get.mockResolvedValue({
			data: { node_id: "test-repo-node-id" },
		} as never);

		await createReleaseBranch("pnpm");

		// Verify the PR was created with the version-based title
		expect(core.info).toHaveBeenCalledWith("Single-package repo detected, using PR title: release: 0.1.0");
	});

	it("should use default PR title for multi-package repos", async () => {
		// Mock isSinglePackage to return false (multi-package repo)
		vi.mocked(isSinglePackage).mockReturnValue(false);

		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		mockOctokit.rest.repos.get.mockResolvedValue({
			data: { node_id: "test-repo-node-id" },
		} as never);

		await createReleaseBranch("pnpm");

		// Should NOT use version-based title
		expect(core.info).not.toHaveBeenCalledWith(expect.stringContaining("Single-package repo detected"));
	});
});
