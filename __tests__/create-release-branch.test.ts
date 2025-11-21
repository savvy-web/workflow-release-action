import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import createReleaseBranch from "../.github/actions/setup-release/create-release-branch.js";
import type { AsyncFunctionArguments } from "../.github/actions/shared/types.js";
import type { MockCore, MockExec } from "./utils/github-mocks.js";
import { createMockAsyncFunctionArguments, createMockCore, createMockExec } from "./utils/github-mocks.js";

describe("createReleaseBranch", () => {
	let mockCore: MockCore;
	let mockExec: MockExec;
	let mockArgs: AsyncFunctionArguments;
	let mockGithub: {
		rest: {
			pulls: { create: ReturnType<typeof vi.fn> };
			issues: { addLabels: ReturnType<typeof vi.fn> };
			checks: { create: ReturnType<typeof vi.fn> };
		};
	};

	beforeEach(() => {
		vi.clearAllMocks();

		mockCore = createMockCore();
		mockExec = createMockExec();

		mockGithub = {
			rest: {
				pulls: {
					create: vi.fn().mockResolvedValue({
						data: {
							number: 42,
							html_url: "https://github.com/test-owner/test-repo/pull/42",
						},
					}),
				},
				issues: {
					addLabels: vi.fn().mockResolvedValue({}),
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
			exec: mockExec as never,
			github: mockGithub as never,
			context: {
				repo: {
					owner: "test-owner",
					repo: "test-repo",
				},
				sha: "abc123",
				runId: 1,
			} as never,
		});

		// Default environment
		process.env.RELEASE_BRANCH = "changeset-release/main";
		process.env.TARGET_BRANCH = "main";
		process.env.PACKAGE_MANAGER = "pnpm";
		process.env.VERSION_COMMAND = "";
		process.env.PR_TITLE_PREFIX = "chore: release";
		process.env.DRY_RUN = "false";
	});

	afterEach(() => {
		vi.useRealTimers(); // Always reset timers between tests
		vi.restoreAllMocks();
		delete process.env.RELEASE_BRANCH;
		delete process.env.TARGET_BRANCH;
		delete process.env.PACKAGE_MANAGER;
		delete process.env.VERSION_COMMAND;
		delete process.env.PR_TITLE_PREFIX;
		delete process.env.DRY_RUN;
	});

	describe("successful branch creation", () => {
		it("should create release branch and PR with changes", async () => {
			mockExec.exec.mockImplementation(async (cmd, args, options) => {
				// Mock git status to return changes
				if (cmd === "git" && args?.[0] === "status" && options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\nM CHANGELOG.md\n"));
				}
				return 0;
			});

			await createReleaseBranch(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("created", "true");
			expect(mockCore.setOutput).toHaveBeenCalledWith("pr_number", "42");
			expect(mockGithub.rest.pulls.create).toHaveBeenCalled();
			expect(mockGithub.rest.issues.addLabels).toHaveBeenCalledWith({
				owner: "test-owner",
				repo: "test-repo",
				issue_number: 42,
				labels: ["automated", "release"],
			});
		});

		it("should configure git with bot credentials", async () => {
			mockExec.exec.mockImplementation(async (cmd, args, options) => {
				if (cmd === "git" && args?.[0] === "status" && options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
				return 0;
			});

			await createReleaseBranch(mockArgs);

			expect(mockExec.exec).toHaveBeenCalledWith("git", ["config", "user.name", "github-actions[bot]"]);
			expect(mockExec.exec).toHaveBeenCalledWith("git", [
				"config",
				"user.email",
				"github-actions[bot]@users.noreply.github.com",
			]);
		});

		it("should checkout new branch from target branch", async () => {
			mockExec.exec.mockImplementation(async (cmd, args, options) => {
				if (cmd === "git" && args?.[0] === "status" && options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
				return 0;
			});

			await createReleaseBranch(mockArgs);

			expect(mockExec.exec).toHaveBeenCalledWith("git", ["checkout", "-b", "changeset-release/main", "origin/main"]);
		});

		it("should run changeset version with package manager", async () => {
			mockExec.exec.mockImplementation(async (cmd, args, options) => {
				if (cmd === "git" && args?.[0] === "status" && options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
				return 0;
			});

			await createReleaseBranch(mockArgs);

			expect(mockExec.exec).toHaveBeenCalledWith("pnpm", ["ci:version"], expect.anything());
		});
	});

	describe("no changes scenario", () => {
		it("should cleanup and exit when no changes generated", async () => {
			mockExec.exec.mockImplementation(async (cmd, args, options) => {
				// Mock git status to return no changes
				if (cmd === "git" && args?.[0] === "status" && options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from(""));
				}
				return 0;
			});

			await createReleaseBranch(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("created", "false");
			expect(mockCore.setOutput).toHaveBeenCalledWith("pr_number", "");
			expect(mockGithub.rest.pulls.create).not.toHaveBeenCalled();
			expect(mockExec.exec).toHaveBeenCalledWith("git", ["checkout", "main"]);
			expect(mockExec.exec).toHaveBeenCalledWith("git", ["branch", "-D", "changeset-release/main"]);
		});

		it("should create neutral check when no changes", async () => {
			mockExec.exec.mockImplementation(async (cmd, args, options) => {
				if (cmd === "git" && args?.[0] === "status" && options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from(""));
				}
				return 0;
			});

			await createReleaseBranch(mockArgs);

			expect(mockGithub.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					conclusion: "neutral",
					output: expect.objectContaining({
						title: "No version changes generated",
					}),
				}),
			);
		});
	});

	describe("package managers", () => {
		it("should use npm commands for npm package manager", async () => {
			process.env.PACKAGE_MANAGER = "npm";

			mockExec.exec.mockImplementation(async (cmd, args, options) => {
				if (cmd === "git" && args?.[0] === "status" && options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
				return 0;
			});

			await createReleaseBranch(mockArgs);

			expect(mockExec.exec).toHaveBeenCalledWith("npm", ["run", "ci:version"], expect.anything());
		});

		it("should use yarn commands for yarn package manager", async () => {
			process.env.PACKAGE_MANAGER = "yarn";

			mockExec.exec.mockImplementation(async (cmd, args, options) => {
				if (cmd === "git" && args?.[0] === "status" && options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
				return 0;
			});

			await createReleaseBranch(mockArgs);

			expect(mockExec.exec).toHaveBeenCalledWith("yarn", ["ci:version"], expect.anything());
		});
	});

	describe("PR creation with retry", () => {
		it("should retry PR creation on failure", async () => {
			vi.useFakeTimers();

			mockExec.exec.mockImplementation(async (cmd, args, options) => {
				if (cmd === "git" && args?.[0] === "status" && options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
				return 0;
			});

			mockGithub.rest.pulls.create.mockRejectedValueOnce(new Error("API error")).mockResolvedValueOnce({
				data: {
					number: 43,
					html_url: "https://github.com/test-owner/test-repo/pull/43",
				},
			});

			const actionPromise = createReleaseBranch(mockArgs);
			await vi.advanceTimersByTimeAsync(60000); // Advance 60 seconds to cover all potential retries
			await actionPromise;

			expect(mockGithub.rest.pulls.create).toHaveBeenCalledTimes(2);
			expect(mockCore.setOutput).toHaveBeenCalledWith("pr_number", "43");

			vi.useRealTimers();
		});

		it("should retry git push on network errors", async () => {
			vi.useFakeTimers();

			let pushAttempts = 0;
			mockExec.exec.mockImplementation(async (cmd, args, options) => {
				if (cmd === "git" && args?.[0] === "status" && options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
					return 0;
				}
				if (cmd === "git" && args?.[0] === "push") {
					pushAttempts++;
					if (pushAttempts < 3) {
						throw new Error("ECONNRESET: Connection reset by peer");
					}
					return 0;
				}
				return 0;
			});

			mockGithub.rest.pulls.create.mockResolvedValue({
				data: {
					number: 44,
					html_url: "https://github.com/test-owner/test-repo/pull/44",
				},
			} as never);

			const actionPromise = createReleaseBranch(mockArgs);
			await vi.runAllTimersAsync();
			await actionPromise;

			expect(pushAttempts).toBe(3);
			expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining("Attempt 1 failed"));
			expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining("Retrying in"));

			vi.useRealTimers();
		});
	});

	describe("dry-run mode", () => {
		it("should skip actual operations in dry-run mode", async () => {
			process.env.DRY_RUN = "true";

			await createReleaseBranch(mockArgs);

			expect(mockCore.notice).toHaveBeenCalledWith("🧪 Running in dry-run mode (preview only)");
			expect(mockExec.exec).not.toHaveBeenCalledWith("git", expect.arrayContaining(["checkout"]));
			expect(mockGithub.rest.pulls.create).not.toHaveBeenCalled();
		});

		it("should indicate dry-run in check title", async () => {
			process.env.DRY_RUN = "true";

			await createReleaseBranch(mockArgs);

			expect(mockGithub.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "🧪 Create Release Branch (Dry Run)",
				}),
			);
		});
	});

	describe("error handling", () => {
		it("should handle errors gracefully", async () => {
			mockExec.exec.mockRejectedValue(new Error("Git command failed"));

			await createReleaseBranch(mockArgs);

			expect(mockCore.setFailed).toHaveBeenCalledWith(expect.stringContaining("Failed to create release branch"));
		});
	});

	describe("custom configurations", () => {
		it("should use custom branch names from environment", async () => {
			process.env.RELEASE_BRANCH = "custom-release";
			process.env.TARGET_BRANCH = "develop";

			mockExec.exec.mockImplementation(async (cmd, args, options) => {
				if (cmd === "git" && args?.[0] === "status" && options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
				return 0;
			});

			await createReleaseBranch(mockArgs);

			expect(mockExec.exec).toHaveBeenCalledWith("git", ["checkout", "-b", "custom-release", "origin/develop"]);
		});

		it("should use custom PR title prefix", async () => {
			process.env.PR_TITLE_PREFIX = "release:";

			mockExec.exec.mockImplementation(async (cmd, args, options) => {
				if (cmd === "git" && args?.[0] === "status" && options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M package.json\n"));
				}
				return 0;
			});

			await createReleaseBranch(mockArgs);

			expect(mockGithub.rest.pulls.create).toHaveBeenCalledWith(
				expect.objectContaining({
					title: "release:",
				}),
			);
		});
	});

	describe("output verification", () => {
		it("should set all outputs correctly", async () => {
			mockExec.exec.mockImplementation(async (cmd, args, options) => {
				if (cmd === "git" && args?.[0] === "status" && options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("M packages/pkg-a/package.json\nM packages/pkg-a/CHANGELOG.md\n"));
				}
				return 0;
			});

			await createReleaseBranch(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("created", "true");
			expect(mockCore.setOutput).toHaveBeenCalledWith("pr_number", "42");
			expect(mockCore.setOutput).toHaveBeenCalledWith("check_id", "12345");
			expect(mockCore.setOutput).toHaveBeenCalledWith(
				"version_summary",
				expect.stringContaining("packages/pkg-a/package.json"),
			);
		});
	});
});
