import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { context, getOctokit } from "@actions/github";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiCommit } from "../src/utils/create-api-commit.js";
import { updateReleaseBranch } from "../src/utils/update-release-branch.js";
import { cleanupTestEnvironment, createMockOctokit, setupTestEnvironment } from "./utils/github-mocks.js";
import type { ExecOptionsWithListeners, MockOctokit } from "./utils/test-types.js";

// Mock modules
vi.mock("@actions/core");
vi.mock("@actions/exec");
vi.mock("@actions/github");
vi.mock("../src/utils/create-api-commit.js");

describe("update-release-branch", () => {
	let mockOctokit: MockOctokit;

	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });

		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "token") return "test-token";
			if (name === "release-branch") return "changeset-release/main";
			if (name === "target-branch") return "main";
			if (name === "package-manager") return "pnpm";
			if (name === "version-command") return "";
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
		vi.mocked(getOctokit).mockReturnValue(mockOctokit as unknown as ReturnType<typeof getOctokit>);
		Object.defineProperty(vi.mocked(context), "repo", {
			value: { owner: "test-owner", repo: "test-repo" },
			writable: true,
		});
		Object.defineProperty(vi.mocked(context), "sha", { value: "abc123", writable: true });
		Object.defineProperty(vi.mocked(context), "runId", { value: 12345, writable: true });

		// Default exec mock
		vi.mocked(exec.exec).mockResolvedValue(0);

		// Default PR list mock (open PR exists)
		mockOctokit.rest.pulls.list.mockResolvedValue({
			data: [{ number: 456, html_url: "https://github.com/test/pull/456" }],
		});

		// Mock createApiCommit
		vi.mocked(createApiCommit).mockResolvedValue({ sha: "abc123def456", created: true });
	});

	afterEach(() => {
		vi.useRealTimers(); // Reset to real timers after each test
		cleanupTestEnvironment();
	});

	it("should update release branch successfully with new changes", async () => {
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\nM CHANGELOG.md\n"));
				}
			}
			return 0;
		});

		const result = await updateReleaseBranch();

		expect(result.success).toBe(true);
		expect(result.hadConflicts).toBe(false);
		expect(result.prNumber).toBe(456);
		expect(result.checkId).toBe(12345);
	});

	it("should recreate branch from main instead of merging", async () => {
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		await updateReleaseBranch();

		// Should delete existing local branch and create new one
		expect(exec.exec).toHaveBeenCalledWith("git", ["branch", "-D", "changeset-release/main"], {
			ignoreReturnCode: true,
		});
		expect(exec.exec).toHaveBeenCalledWith("git", ["checkout", "-b", "changeset-release/main"]);
		// Should NOT call merge
		expect(exec.exec).not.toHaveBeenCalledWith("git", expect.arrayContaining(["merge"]), expect.any(Object));
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

		await updateReleaseBranch();

		// Verify createApiCommit was called
		expect(createApiCommit).toHaveBeenCalledWith(
			"test-token",
			"changeset-release/main",
			expect.stringContaining("chore: release"),
		);
	});

	it("should force push to update remote branch", async () => {
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		await updateReleaseBranch();

		// Should force push
		expect(exec.exec).toHaveBeenCalledWith(
			"git",
			["push", "-f", "-u", "origin", "changeset-release/main"],
			expect.any(Object),
		);
	});

	it("should handle no version changes from changesets", async () => {
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from(""));
				}
			}
			return 0;
		});

		const result = await updateReleaseBranch();

		expect(result.success).toBe(true);
		expect(result.hadConflicts).toBe(false);
		expect(result.versionSummary).toBe("");
		// Should still force push to sync branch
		expect(exec.exec).toHaveBeenCalledWith(
			"git",
			["push", "-f", "-u", "origin", "changeset-release/main"],
			expect.any(Object),
		);
		// Should NOT call createApiCommit when no changes
		expect(createApiCommit).not.toHaveBeenCalled();
	});

	it("should skip actual operations in dry-run mode", async () => {
		vi.mocked(core.getBooleanInput).mockImplementation((name: string) => {
			if (name === "dry-run") return true;
			return false;
		});

		const result = await updateReleaseBranch();

		expect(result.success).toBe(true);
		expect(core.info).toHaveBeenCalledWith(expect.stringContaining("[DRY RUN]"));
	});

	it("should handle missing open PR", async () => {
		mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });

		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		const result = await updateReleaseBranch();

		expect(result.success).toBe(true);
		expect(result.prNumber).toBeNull();
	});

	it("should use npm command for npm package manager", async () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "token") return "test-token";
			if (name === "package-manager") return "npm";
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

		await updateReleaseBranch();

		expect(exec.exec).toHaveBeenCalledWith("npm", ["run", "ci:version"], expect.any(Object));
	});

	it("should use yarn command for yarn package manager", async () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "token") return "test-token";
			if (name === "package-manager") return "yarn";
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

		await updateReleaseBranch();

		expect(exec.exec).toHaveBeenCalledWith("yarn", ["ci:version"], expect.any(Object));
	});

	it("should handle errors when checking for PR", async () => {
		mockOctokit.rest.pulls.list.mockRejectedValue(new Error("API Error"));

		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		const result = await updateReleaseBranch();

		expect(result.success).toBe(true);
		expect(result.prNumber).toBeNull();
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Could not find PR"));
	});

	it("should find and reopen a closed PR after force push", async () => {
		// First call returns no open PRs, second call returns a closed unmerged PR
		mockOctokit.rest.pulls.list
			.mockResolvedValueOnce({ data: [] }) // open PRs
			.mockResolvedValueOnce({
				data: [{ number: 789, html_url: "https://github.com/test/pull/789", merged_at: null }],
			}); // closed PRs
		mockOctokit.rest.pulls.update.mockResolvedValue({});

		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		const result = await updateReleaseBranch();

		expect(result.success).toBe(true);
		expect(result.prNumber).toBe(789);
		expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Found closed (unmerged) PR #789"));
		expect(mockOctokit.rest.pulls.update).toHaveBeenCalledWith({
			owner: "test-owner",
			repo: "test-repo",
			pull_number: 789,
			state: "open",
		});
		expect(core.info).toHaveBeenCalledWith("✓ Reopened PR #789");
	});

	it("should not reopen a merged PR", async () => {
		// First call returns no open PRs, second call returns a merged PR
		mockOctokit.rest.pulls.list
			.mockResolvedValueOnce({ data: [] }) // open PRs
			.mockResolvedValueOnce({
				data: [{ number: 789, html_url: "https://github.com/test/pull/789", merged_at: "2024-01-01T00:00:00Z" }],
			}); // closed PRs (merged)

		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		const result = await updateReleaseBranch();

		expect(result.success).toBe(true);
		expect(result.prNumber).toBeNull();
		expect(mockOctokit.rest.pulls.update).not.toHaveBeenCalled();
	});

	it("should handle error when reopening PR", async () => {
		mockOctokit.rest.pulls.list
			.mockResolvedValueOnce({ data: [] }) // open PRs
			.mockResolvedValueOnce({
				data: [{ number: 789, html_url: "https://github.com/test/pull/789", merged_at: null }],
			}); // closed PRs
		mockOctokit.rest.pulls.update.mockRejectedValue(new Error("PR cannot be reopened"));

		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		const result = await updateReleaseBranch();

		expect(result.success).toBe(true);
		expect(result.prNumber).toBe(789);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Could not reopen PR #789"));
	});

	it("should retry on ECONNRESET errors for version command", async () => {
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

		const actionPromise = updateReleaseBranch();
		await vi.advanceTimersByTimeAsync(60000); // Advance time to cover all retries
		const result = await actionPromise;

		expect(result.success).toBe(true);
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

		await expect(updateReleaseBranch()).rejects.toThrow("Permission denied");
	});

	it("should throw after max retries exhausted", async () => {
		vi.useFakeTimers(); // Enable fake timers for retry test

		vi.mocked(exec.exec).mockImplementation(async (cmd, args) => {
			if (cmd === "pnpm" && args?.[0] === "ci:version") {
				throw new Error("ETIMEDOUT: Connection timed out");
			}
			return 0;
		});

		const actionPromise = updateReleaseBranch();

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

	it("should retry on EAI_AGAIN errors for git push", async () => {
		vi.useFakeTimers(); // Enable fake timers for retry test

		let pushCallCount = 0;
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("push")) {
				pushCallCount++;
				if (pushCallCount === 1) {
					throw new Error("EAI_AGAIN: Temporary DNS failure");
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

		const actionPromise = updateReleaseBranch();
		await vi.advanceTimersByTimeAsync(60000); // Advance time to cover all retries
		const result = await actionPromise;

		expect(result.success).toBe(true);
		expect(pushCallCount).toBe(2);
	});
});
