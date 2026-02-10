import * as fs from "node:fs/promises";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { context, getOctokit } from "@actions/github";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiCommit, updateBranchToRef } from "../src/utils/create-api-commit.js";
import { isSinglePackage } from "../src/utils/detect-repo-type.js";
import { updateReleaseBranch } from "../src/utils/update-release-branch.js";
import { cleanupTestEnvironment, createMockOctokit, setupTestEnvironment } from "./utils/github-mocks.js";
import type { ExecOptionsWithListeners, MockOctokit } from "./utils/test-types.js";

// Mock modules
vi.mock("@actions/core");
vi.mock("@actions/exec");
vi.mock("@actions/github");
vi.mock("../src/utils/create-api-commit.js");
vi.mock("../src/utils/detect-repo-type.js");
vi.mock("node:fs/promises");

describe("update-release-branch", () => {
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

		// Mock createApiCommit and updateBranchToRef
		vi.mocked(createApiCommit).mockResolvedValue({ sha: "abc123def456", created: true });
		vi.mocked(updateBranchToRef).mockResolvedValue("main123sha");

		// Mock fs.readdir to return no changeset files by default
		vi.mocked(fs.readdir).mockResolvedValue([]);

		// Mock fs.readFile for package.json version detection
		vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ version: "1.2.3" }));

		// Mock isSinglePackage to return false by default (multi-package repo)
		vi.mocked(isSinglePackage).mockReturnValue(false);
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

		const result = await updateReleaseBranch("pnpm");

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

		await updateReleaseBranch("pnpm");

		// Should delete existing local branch and create new one
		expect(exec.exec).toHaveBeenCalledWith("git", ["branch", "-D", "changeset-release/main"], {
			ignoreReturnCode: true,
		});
		expect(exec.exec).toHaveBeenCalledWith("git", ["checkout", "-b", "changeset-release/main"]);
		// Should NOT call merge
		expect(exec.exec).not.toHaveBeenCalledWith("git", expect.arrayContaining(["merge"]), expect.any(Object));
	});

	it("should create commit via GitHub API for verified signatures with parent branch", async () => {
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		await updateReleaseBranch("pnpm");

		// Verify createApiCommit was called with parentBranch option
		expect(createApiCommit).toHaveBeenCalledWith(
			"test-token",
			"changeset-release/main",
			expect.stringContaining("chore: release"),
			{ parentBranch: "main" },
		);
	});

	it("should not use git push (uses API commit instead)", async () => {
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		await updateReleaseBranch("pnpm");

		// Should NOT use git push - uses API commit instead to avoid triggering multiple workflows
		expect(exec.exec).not.toHaveBeenCalledWith("git", expect.arrayContaining(["push"]), expect.any(Object));
		// Should use createApiCommit with parentBranch option
		expect(createApiCommit).toHaveBeenCalled();
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

		const result = await updateReleaseBranch("pnpm");

		expect(result.success).toBe(true);
		expect(result.hadConflicts).toBe(false);
		expect(result.versionSummary).toBe("");
		// Should use updateBranchToRef to sync branch via API (no git push)
		expect(updateBranchToRef).toHaveBeenCalledWith("test-token", "changeset-release/main", "main");
		// Should NOT call createApiCommit when no changes
		expect(createApiCommit).not.toHaveBeenCalled();
	});

	it("should skip actual operations in dry-run mode", async () => {
		vi.mocked(core.getBooleanInput).mockImplementation((name: string) => {
			if (name === "dry-run") return true;
			return false;
		});

		const result = await updateReleaseBranch("pnpm");

		expect(result.success).toBe(true);
		expect(core.info).toHaveBeenCalledWith(expect.stringContaining("[DRY RUN]"));
	});

	it("should create new PR when no existing PR found", async () => {
		// No open PRs and no closed PRs
		mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });

		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		const result = await updateReleaseBranch("pnpm");

		expect(result.success).toBe(true);
		// Should create a new PR (mock returns number 123)
		expect(result.prNumber).toBe(123);
		expect(mockOctokit.rest.pulls.create).toHaveBeenCalledWith(
			expect.objectContaining({
				owner: "test-owner",
				repo: "test-repo",
				head: "changeset-release/main",
				base: "main",
			}),
		);
		expect(mockOctokit.rest.issues.addLabels).toHaveBeenCalledWith(
			expect.objectContaining({
				issue_number: 123,
				labels: ["automated", "release"],
			}),
		);
		expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Created new release PR #123"));
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

		await updateReleaseBranch("npm");

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

		await updateReleaseBranch("yarn");

		expect(exec.exec).toHaveBeenCalledWith("yarn", ["ci:version"], expect.any(Object));
	});

	it("should create new PR when checking for PR fails with error", async () => {
		mockOctokit.rest.pulls.list.mockRejectedValue(new Error("API Error"));

		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		const result = await updateReleaseBranch("pnpm");

		expect(result.success).toBe(true);
		// Should warn about the error and create a new PR
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Could not find PR"));
		// Should create a new PR (mock returns number 123)
		expect(result.prNumber).toBe(123);
		expect(mockOctokit.rest.pulls.create).toHaveBeenCalled();
		expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Created new release PR #123"));
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

		const result = await updateReleaseBranch("pnpm");

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

	it("should create new PR when only merged PRs exist (not reopen merged PR)", async () => {
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

		const result = await updateReleaseBranch("pnpm");

		expect(result.success).toBe(true);
		// Should NOT try to reopen the merged PR
		expect(mockOctokit.rest.pulls.update).not.toHaveBeenCalledWith(expect.objectContaining({ state: "open" }));
		// Should create a new PR instead (mock returns number 123)
		expect(result.prNumber).toBe(123);
		expect(mockOctokit.rest.pulls.create).toHaveBeenCalled();
		expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Created new release PR #123"));
	});

	it("should create new PR when reopen fails", async () => {
		mockOctokit.rest.pulls.list
			.mockResolvedValueOnce({ data: [] }) // open PRs
			.mockResolvedValueOnce({
				data: [{ number: 789, html_url: "https://github.com/test/pull/789", merged_at: null }],
			}); // closed PRs
		mockOctokit.rest.pulls.update.mockRejectedValue(new Error("state cannot be changed"));

		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		const result = await updateReleaseBranch("pnpm");

		expect(result.success).toBe(true);
		// Should warn about the reopen failure
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Could not reopen PR #789"));
		// Should log intent to create new PR
		expect(core.info).toHaveBeenCalledWith("Will create a new PR instead");
		// Should fall through and create a new PR (mock returns number 123)
		expect(result.prNumber).toBe(123);
		expect(mockOctokit.rest.pulls.create).toHaveBeenCalled();
		expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Created new release PR #123"));
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

		const actionPromise = updateReleaseBranch("pnpm");
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

		await expect(updateReleaseBranch("pnpm")).rejects.toThrow("Permission denied");
	});

	it("should throw after max retries exhausted", async () => {
		vi.useFakeTimers(); // Enable fake timers for retry test

		vi.mocked(exec.exec).mockImplementation(async (cmd, args) => {
			if (cmd === "pnpm" && args?.[0] === "ci:version") {
				throw new Error("ETIMEDOUT: Connection timed out");
			}
			return 0;
		});

		const actionPromise = updateReleaseBranch("pnpm");

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

	it("should collect linked issues from changeset commits", async () => {
		// Mock changeset files exist
		vi.mocked(fs.readdir).mockResolvedValue(["fix-bug.md", "add-feature.md"] as unknown as Awaited<
			ReturnType<typeof fs.readdir>
		>);

		// Mock git log to return commit info for each changeset file
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("log") && args?.includes("--diff-filter=A")) {
				const filePath = args[args.length - 1];
				if (options?.listeners?.stdout) {
					if (filePath === ".changeset/fix-bug.md") {
						options.listeners.stdout(Buffer.from("abc123\nfix: resolve bug fixes #42\n---END---"));
					} else if (filePath === ".changeset/add-feature.md") {
						options.listeners.stdout(Buffer.from("def456\nfeat: add new feature closes #99\n---END---"));
					}
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

		// Mock issue fetching
		mockOctokit.rest.issues.get
			.mockResolvedValueOnce({
				data: { title: "Bug in login", state: "open", html_url: "https://github.com/test/issues/42" },
			})
			.mockResolvedValueOnce({
				data: { title: "New feature request", state: "open", html_url: "https://github.com/test/issues/99" },
			});

		const result = await updateReleaseBranch("pnpm");

		expect(result.success).toBe(true);
		expect(result.linkedIssues).toHaveLength(2);
		expect(result.linkedIssues[0].number).toBe(42);
		expect(result.linkedIssues[1].number).toBe(99);
	});

	it("should update PR body with linked issues", async () => {
		// Mock changeset files exist
		vi.mocked(fs.readdir).mockResolvedValue(["fix-bug.md"] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

		// Mock git log
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("log") && args?.includes("--diff-filter=A")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("abc123\nfix: bug fixes #42\n---END---"));
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

		// Mock issue fetching
		mockOctokit.rest.issues.get.mockResolvedValue({
			data: { title: "Bug in login", state: "open", html_url: "https://github.com/test/issues/42" },
		});

		// Mock PR get for body update
		mockOctokit.rest.pulls.get.mockResolvedValue({
			data: { body: "Existing PR description" },
		});

		// Mock PR update
		mockOctokit.rest.pulls.update.mockResolvedValue({});

		const result = await updateReleaseBranch("pnpm");

		expect(result.success).toBe(true);
		expect(mockOctokit.rest.pulls.update).toHaveBeenCalledWith(
			expect.objectContaining({
				pull_number: 456,
				body: expect.stringContaining("## Linked Issues"),
			}),
		);
	});

	it("should handle fs.readdir errors gracefully", async () => {
		// Mock fs.readdir to throw an error
		vi.mocked(fs.readdir).mockRejectedValue(new Error("ENOENT: no such file or directory"));

		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		const result = await updateReleaseBranch("pnpm");

		expect(result.success).toBe(true);
		expect(result.linkedIssues).toHaveLength(0);
	});

	it("should handle git log returning no output for changeset file", async () => {
		vi.mocked(fs.readdir).mockResolvedValue(["orphan.md"] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("log") && args?.includes("--diff-filter=A")) {
				// Return empty output for this file
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from(""));
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

		const result = await updateReleaseBranch("pnpm");

		expect(result.success).toBe(true);
		expect(result.linkedIssues).toHaveLength(0);
	});

	it("should handle issue fetch errors gracefully", async () => {
		vi.mocked(fs.readdir).mockResolvedValue(["fix-bug.md"] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("log") && args?.includes("--diff-filter=A")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("abc123\nfix: bug fixes #42\n---END---"));
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

		// Mock issue fetch failure
		mockOctokit.rest.issues.get.mockRejectedValue(new Error("Issue not found"));

		const result = await updateReleaseBranch("pnpm");

		expect(result.success).toBe(true);
		expect(result.linkedIssues).toHaveLength(0);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Failed to fetch issue #42"));
	});

	it("should replace existing linked issues section in PR body", async () => {
		vi.mocked(fs.readdir).mockResolvedValue(["fix-bug.md"] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("log") && args?.includes("--diff-filter=A")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("abc123\nfix: bug fixes #42\n---END---"));
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

		mockOctokit.rest.issues.get.mockResolvedValue({
			data: { title: "Bug in login", state: "open", html_url: "https://github.com/test/issues/42" },
		});

		// Mock existing PR body with linked issues section
		mockOctokit.rest.pulls.get.mockResolvedValue({
			data: { body: "## Linked Issues\n\n- Old issue #1\n\n## Other Section\n\nOther content" },
		});

		mockOctokit.rest.pulls.update.mockResolvedValue({});

		await updateReleaseBranch("pnpm");

		expect(mockOctokit.rest.pulls.update).toHaveBeenCalledWith(
			expect.objectContaining({
				body: expect.stringContaining("#42"),
			}),
		);
		// Should not have duplicated the "Linked Issues" section
		// calls[0] is title update, calls[1] is body update with linked issues
		const bodyUpdateCall = mockOctokit.rest.pulls.update.mock.calls.find(
			(call: [{ body?: string }]) => call[0].body !== undefined,
		);
		const linkedIssuesCount = (bodyUpdateCall?.[0].body?.match(/## Linked Issues/g) || []).length;
		expect(linkedIssuesCount).toBe(1);
	});

	it("should handle closed issues with strikethrough in linked issues section", async () => {
		vi.mocked(fs.readdir).mockResolvedValue(["fix-bug.md"] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("log") && args?.includes("--diff-filter=A")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("abc123\nfix: bug fixes #42\n---END---"));
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

		// Mock a closed issue
		mockOctokit.rest.issues.get.mockResolvedValue({
			data: { title: "Bug in login", state: "closed", html_url: "https://github.com/test/issues/42" },
		});

		mockOctokit.rest.pulls.get.mockResolvedValue({ data: { body: "" } });
		mockOctokit.rest.pulls.update.mockResolvedValue({});

		const result = await updateReleaseBranch("pnpm");

		expect(result.linkedIssues[0].state).toBe("closed");
		expect(mockOctokit.rest.pulls.update).toHaveBeenCalledWith(
			expect.objectContaining({
				body: expect.stringContaining("~~#42"),
			}),
		);
	});

	it("should skip PR body update when no linked issues found", async () => {
		vi.mocked(fs.readdir).mockResolvedValue(["no-issue-ref.md"] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("log") && args?.includes("--diff-filter=A")) {
				if (options?.listeners?.stdout) {
					// Commit message without issue reference
					options.listeners.stdout(Buffer.from("abc123\nchore: update dependencies\n---END---"));
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

		const result = await updateReleaseBranch("pnpm");

		expect(result.success).toBe(true);
		expect(result.linkedIssues).toHaveLength(0);
		// Should not try to update PR body for linked issues
		expect(mockOctokit.rest.pulls.get).not.toHaveBeenCalled();
	});

	it("should handle PR body update errors gracefully", async () => {
		vi.mocked(fs.readdir).mockResolvedValue(["fix-bug.md"] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("log") && args?.includes("--diff-filter=A")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("abc123\nfix: bug fixes #42\n---END---"));
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

		mockOctokit.rest.issues.get.mockResolvedValue({
			data: { title: "Bug", state: "open", html_url: "https://github.com/test/issues/42" },
		});

		mockOctokit.rest.pulls.get.mockRejectedValue(new Error("PR not found"));

		const result = await updateReleaseBranch("pnpm");

		// Should succeed despite PR body update failure
		expect(result.success).toBe(true);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Could not update PR body"));
	});

	it("should show linked issues in dry-run mode without updating PR", async () => {
		vi.mocked(core.getBooleanInput).mockImplementation((name: string) => {
			if (name === "dry-run") return true;
			return false;
		});

		const result = await updateReleaseBranch("pnpm");

		expect(result.success).toBe(true);
		// In dry-run mode, should not collect issues or update PR
		expect(mockOctokit.rest.pulls.get).not.toHaveBeenCalled();
	});

	it("should handle git log output without end marker", async () => {
		vi.mocked(fs.readdir).mockResolvedValue(["partial.md"] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("log") && args?.includes("--diff-filter=A")) {
				if (options?.listeners?.stdout) {
					// Output without ---END--- marker
					options.listeners.stdout(Buffer.from("abc123\nsome message"));
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

		const result = await updateReleaseBranch("pnpm");

		expect(result.success).toBe(true);
		expect(result.linkedIssues).toHaveLength(0);
	});

	it("should handle git log output with SHA only (no message)", async () => {
		vi.mocked(fs.readdir).mockResolvedValue(["sha-only.md"] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("log") && args?.includes("--diff-filter=A")) {
				if (options?.listeners?.stdout) {
					// Output with SHA only, no newline for message
					options.listeners.stdout(Buffer.from("abc123---END---"));
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

		const result = await updateReleaseBranch("pnpm");

		expect(result.success).toBe(true);
		expect(result.linkedIssues).toHaveLength(0);
	});

	it("should handle git log exec error gracefully", async () => {
		vi.mocked(fs.readdir).mockResolvedValue(["error.md"] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("log") && args?.includes("--diff-filter=A")) {
				throw new Error("git log failed");
			}
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		const result = await updateReleaseBranch("pnpm");

		expect(result.success).toBe(true);
		expect(result.linkedIssues).toHaveLength(0);
	});

	it("should retry PR creation on failure", async () => {
		// No open PRs and no closed PRs
		mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });

		// First PR creation fails, second succeeds
		let createCallCount = 0;
		mockOctokit.rest.pulls.create.mockImplementation(async () => {
			createCallCount++;
			if (createCallCount === 1) {
				throw new Error("Network error");
			}
			return { data: { number: 999, html_url: "https://github.com/test/pull/999" } };
		});

		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		const result = await updateReleaseBranch("pnpm");

		expect(result.success).toBe(true);
		expect(result.prNumber).toBe(999);
		expect(createCallCount).toBe(2);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("PR creation failed, retrying"));
		expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Created new release PR #999"));
	});

	it("should log dry-run message when no PR found in dry-run mode", async () => {
		// No open PRs and no closed PRs
		mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });

		vi.mocked(core.getBooleanInput).mockImplementation((name: string) => {
			if (name === "dry-run") return true;
			return false;
		});

		const result = await updateReleaseBranch("pnpm");

		expect(result.success).toBe(true);
		expect(result.prNumber).toBeNull();
		// Should NOT create a PR in dry-run mode
		expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
		// Should log dry-run message
		expect(core.info).toHaveBeenCalledWith("[DRY RUN] Would create new release PR (no existing PR found)");
	});

	it("should include linked issues in new PR body when creating PR", async () => {
		// No open PRs - will create new PR
		mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });

		// Mock linked issues via git log output
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("log") && args?.includes("--diff-filter=A")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("commit1\nCloses #42\n---END---\n"));
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

		// Mock changeset directory
		vi.mocked(fs.readdir).mockResolvedValue(["feature.md"] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

		// Mock issue API call
		mockOctokit.rest.issues.get.mockResolvedValue({
			data: {
				number: 42,
				title: "Bug fix",
				state: "open",
				html_url: "https://github.com/test/issues/42",
			},
		});

		// Mock PR creation
		mockOctokit.rest.pulls.create.mockResolvedValue({
			data: { number: 999, html_url: "https://github.com/test/pulls/999" },
		});

		const result = await updateReleaseBranch("pnpm");

		expect(result.success).toBe(true);
		expect(result.linkedIssues).toHaveLength(1);
		// Should create PR with linked issues in body
		expect(mockOctokit.rest.pulls.create).toHaveBeenCalledWith(
			expect.objectContaining({
				body: expect.stringContaining("## Linked Issues"),
			}),
		);
		expect(mockOctokit.rest.pulls.create).toHaveBeenCalledWith(
			expect.objectContaining({
				body: expect.stringContaining("#42"),
			}),
		);
	});

	it("should handle PR body update when existing linked issues section has no next heading", async () => {
		// Mock PR exists
		mockOctokit.rest.pulls.list.mockResolvedValue({
			data: [{ number: 123, title: "chore: release", state: "open", head: { sha: "old-sha" } }],
		});

		// Mock PR body with linked issues section at the end (no next heading)
		mockOctokit.rest.pulls.get.mockResolvedValue({
			data: {
				body: "## Summary\n\nSome changes\n\n## Linked Issues\n\n- Closes #99: Old issue",
			},
		});

		// Mock linked issues via git log output
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("log") && args?.includes("--diff-filter=A")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("commit1\nCloses #42\n---END---\n"));
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

		// Mock changeset directory
		vi.mocked(fs.readdir).mockResolvedValue(["feature.md"] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

		// Mock issue API call
		mockOctokit.rest.issues.get.mockResolvedValue({
			data: {
				number: 42,
				title: "New bug fix",
				state: "open",
				html_url: "https://github.com/test/issues/42",
			},
		});

		const result = await updateReleaseBranch("pnpm");

		expect(result.success).toBe(true);
		expect(result.linkedIssues).toHaveLength(1);
		// Should update PR body, removing old linked issues section
		expect(mockOctokit.rest.pulls.update).toHaveBeenCalledWith(
			expect.objectContaining({
				pull_number: 123,
				body: expect.stringContaining("## Linked Issues"),
			}),
		);
		// Old issue should be removed
		expect(mockOctokit.rest.pulls.update).toHaveBeenCalledWith(
			expect.objectContaining({
				body: expect.not.stringContaining("#99"),
			}),
		);
	});

	it("should handle error when updating PR body with linked issues", async () => {
		// Mock PR exists
		mockOctokit.rest.pulls.list.mockResolvedValue({
			data: [{ number: 123, title: "chore: release", state: "open", head: { sha: "old-sha" } }],
		});

		// Mock PR body fetch
		mockOctokit.rest.pulls.get.mockResolvedValue({
			data: { body: "Existing content" },
		});

		// Mock linked issues via git log output
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("log") && args?.includes("--diff-filter=A")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("commit1\nCloses #42\n---END---\n"));
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

		// Mock changeset directory
		vi.mocked(fs.readdir).mockResolvedValue(["feature.md"] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

		// Mock issue API call
		mockOctokit.rest.issues.get.mockResolvedValue({
			data: {
				number: 42,
				title: "Bug fix",
				state: "open",
				html_url: "https://github.com/test/issues/42",
			},
		});

		// Mock PR update to throw error
		mockOctokit.rest.pulls.update.mockRejectedValue(new Error("API rate limit exceeded"));

		const result = await updateReleaseBranch("pnpm");

		// Should handle error gracefully
		expect(result.success).toBe(true);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Could not update PR body"));
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("API rate limit exceeded"));
	});

	it("should handle when createApiCommit returns created false", async () => {
		// Mock changesets exist
		vi.mocked(fs.readdir).mockResolvedValue(["feature.md"] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

		// Mock version command that modifies files
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "pnpm" && args?.includes("ci:version")) {
				return 0;
			}
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		// Mock PR exists
		mockOctokit.rest.pulls.list.mockResolvedValue({
			data: [{ number: 123, title: "chore: release", state: "open", head: { sha: "old-sha" } }],
		});

		// Mock createApiCommit to return created: false (no changes)
		vi.mocked(createApiCommit).mockResolvedValue({
			created: false,
			sha: "",
		});

		const result = await updateReleaseBranch("pnpm");

		expect(result.success).toBe(true);
		expect(core.warning).toHaveBeenCalledWith("No changes to commit via API");
	});

	it("should handle reopening closed PR in dry-run mode", async () => {
		vi.mocked(core.getBooleanInput).mockImplementation((name: string) => {
			if (name === "dry-run") return true;
			return false;
		});

		// Mock PR that was closed
		mockOctokit.rest.pulls.list
			.mockResolvedValueOnce({ data: [] }) // No open PRs
			.mockResolvedValueOnce({
				data: [
					{
						number: 123,
						title: "chore: release",
						state: "closed",
						head: { sha: "old-sha" },
						closed_at: new Date().toISOString(),
						merged_at: null, // Closed but not merged
					},
				],
			}); // Closed PR found

		// Mock changesets exist
		vi.mocked(fs.readdir).mockResolvedValue(["feature.md"] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

		// Mock version command
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		const result = await updateReleaseBranch("pnpm");

		expect(result.success).toBe(true);
		expect(result.prNumber).toBe(123);
		// Should log dry-run message for reopening PR
		expect(core.info).toHaveBeenCalledWith(expect.stringContaining("[DRY RUN] Would reopen PR #123"));
		// Should NOT actually reopen PR in dry-run mode
		expect(mockOctokit.rest.pulls.update).not.toHaveBeenCalled();
	});

	it("should update PR title for existing open PR in single-package repo", async () => {
		// Mock single-package repo
		vi.mocked(isSinglePackage).mockReturnValue(true);
		vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ version: "2.0.0" }));

		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\nM CHANGELOG.md\n"));
				}
			}
			return 0;
		});

		const result = await updateReleaseBranch("pnpm");

		expect(result.success).toBe(true);
		expect(result.prNumber).toBe(456);
		// Should update the PR title to version-based title
		expect(mockOctokit.rest.pulls.update).toHaveBeenCalledWith(
			expect.objectContaining({
				pull_number: 456,
				title: "release: 2.0.0",
			}),
		);
		expect(core.info).toHaveBeenCalledWith("✓ Updated PR #456 title to: release: 2.0.0");
	});

	it("should use prefix title for multi-package repos", async () => {
		// Mock multi-package repo (default: isSinglePackage returns false)
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		const result = await updateReleaseBranch("pnpm");

		expect(result.success).toBe(true);
		expect(result.prNumber).toBe(456);
		// Should update with prefix title (not version-based)
		expect(mockOctokit.rest.pulls.update).toHaveBeenCalledWith(
			expect.objectContaining({
				pull_number: 456,
				title: "chore: release",
			}),
		);
	});

	it("should use version-based title when creating new PR for single-package repo", async () => {
		// No existing PR
		mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });

		// Mock single-package repo
		vi.mocked(isSinglePackage).mockReturnValue(true);
		vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ version: "3.1.0" }));

		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		const result = await updateReleaseBranch("pnpm");

		expect(result.success).toBe(true);
		expect(result.prNumber).toBe(123);
		// Should create PR with version-based title
		expect(mockOctokit.rest.pulls.create).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "release: 3.1.0",
			}),
		);
	});

	it("should handle PR title update error gracefully", async () => {
		// Mock single-package repo
		vi.mocked(isSinglePackage).mockReturnValue(true);
		vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ version: "1.0.0" }));

		// Mock PR title update failure
		mockOctokit.rest.pulls.update.mockRejectedValue(new Error("API error"));

		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		const result = await updateReleaseBranch("pnpm");

		expect(result.success).toBe(true);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Could not update PR title"));
	});

	it("should fall back to prefix title when readFile fails for single-package repo", async () => {
		// Mock single-package repo but readFile fails
		vi.mocked(isSinglePackage).mockReturnValue(true);
		vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		const result = await updateReleaseBranch("pnpm");

		expect(result.success).toBe(true);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Failed to read version for PR title"));
		// Should use prefix title as fallback
		expect(mockOctokit.rest.pulls.update).toHaveBeenCalledWith(
			expect.objectContaining({
				pull_number: 456,
				title: "chore: release",
			}),
		);
	});
});
