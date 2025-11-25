import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { context, getOctokit } from "@actions/github";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createReleaseBranch } from "../src/utils/create-release-branch.js";
import { cleanupTestEnvironment, createMockOctokit, setupTestEnvironment } from "./utils/github-mocks.js";
import type { ExecOptionsWithListeners, MockOctokit } from "./utils/test-types.js";

// Mock modules
vi.mock("@actions/core");
vi.mock("@actions/exec");
vi.mock("@actions/github");

describe("create-release-branch", () => {
	let mockOctokit: MockOctokit;

	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });

		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "token") return "test-token";
			if (name === "release-branch") return "changeset-release/main";
			if (name === "target-branch") return "main";
			if (name === "package-manager") return "pnpm";
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
		vi.mocked(getOctokit).mockReturnValue(mockOctokit as unknown as ReturnType<typeof getOctokit>);
		Object.defineProperty(vi.mocked(context), "repo", {
			value: { owner: "test-owner", repo: "test-repo" },
			writable: true,
		});
		Object.defineProperty(vi.mocked(context), "sha", { value: "abc123", writable: true });
		Object.defineProperty(vi.mocked(context), "runId", { value: 12345, writable: true });

		// Default exec mock
		vi.mocked(exec.exec).mockResolvedValue(0);
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

		const result = await createReleaseBranch();

		expect(result.created).toBe(true);
		expect(result.prNumber).toBe(123);
		expect(result.checkId).toBe(12345);
		expect(mockOctokit.rest.pulls.create).toHaveBeenCalled();
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

		const result = await createReleaseBranch();

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

		const result = await createReleaseBranch();

		expect(result.created).toBe(true);
		expect(result.prNumber).toBeNull(); // No PR created in dry-run
		expect(core.info).toHaveBeenCalledWith(expect.stringContaining("[DRY RUN]"));
		expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
	});

	it("should retry PR creation on failure", async () => {
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		// First call fails, second succeeds
		mockOctokit.rest.pulls.create
			.mockRejectedValueOnce(new Error("API Error"))
			.mockResolvedValueOnce({ data: { number: 456, html_url: "https://github.com/test/pull/456" } });

		const result = await createReleaseBranch();

		expect(result.created).toBe(true);
		expect(result.prNumber).toBe(456);
		expect(mockOctokit.rest.pulls.create).toHaveBeenCalledTimes(2);
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

		await createReleaseBranch();

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

		await createReleaseBranch();

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

		await createReleaseBranch();

		expect(exec.exec).toHaveBeenCalledWith("turbo run version", ["turbo", "run", "version"], expect.any(Object));
	});

	it("should configure git user before operations", async () => {
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
			}
			return 0;
		});

		await createReleaseBranch();

		expect(exec.exec).toHaveBeenCalledWith("git", ["config", "user.name", "github-actions[bot]"]);
		expect(exec.exec).toHaveBeenCalledWith("git", [
			"config",
			"user.email",
			"github-actions[bot]@users.noreply.github.com",
		]);
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

		await createReleaseBranch();

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

		const actionPromise = createReleaseBranch();
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

		await expect(createReleaseBranch()).rejects.toThrow("Permission denied");
	});

	it("should throw after max retries exhausted", async () => {
		vi.useFakeTimers(); // Enable fake timers for retry test

		vi.mocked(exec.exec).mockImplementation(async (cmd, args) => {
			if (cmd === "pnpm" && args?.[0] === "ci:version") {
				throw new Error("ETIMEDOUT: Connection timed out");
			}
			return 0;
		});

		const actionPromise = createReleaseBranch();

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

	it("should retry on network errors for git push", async () => {
		vi.useFakeTimers(); // Enable fake timers for retry test

		let pushCallCount = 0;
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.includes("push")) {
				pushCallCount++;
				if (pushCallCount === 1) {
					throw new Error("ENOTFOUND: Could not resolve host");
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

		const actionPromise = createReleaseBranch();
		await vi.advanceTimersByTimeAsync(60000); // Advance time to cover all retries
		const result = await actionPromise;

		expect(result.created).toBe(true);
		expect(pushCallCount).toBe(2);
	});
});
