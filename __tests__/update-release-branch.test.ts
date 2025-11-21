import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import updateReleaseBranch from "../.github/actions/setup-release/update-release-branch.js";
import type { AsyncFunctionArguments } from "../.github/actions/shared/types.js";
import type { MockCore, MockExec } from "./utils/github-mocks.js";
import { createMockAsyncFunctionArguments, createMockCore, createMockExec } from "./utils/github-mocks.js";

describe("updateReleaseBranch", () => {
	let mockCore: MockCore;
	let mockExec: MockExec;
	let mockArgs: AsyncFunctionArguments;

	let mockGithub: {
		rest: {
			issues: {
				createComment: ReturnType<typeof vi.fn>;
				addLabels: ReturnType<typeof vi.fn>;
			};
			checks: {
				create: ReturnType<typeof vi.fn>;
			};
		};
	};

	beforeEach(() => {
		vi.clearAllMocks();

		mockCore = createMockCore();
		mockExec = createMockExec();

		mockGithub = {
			rest: {
				issues: {
					createComment: vi.fn().mockResolvedValue({}),
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
		process.env.PR_NUMBER = "42";
		process.env.PACKAGE_MANAGER = "pnpm";
		process.env.VERSION_COMMAND = "";
		process.env.DRY_RUN = "false";
	});

	afterEach(() => {
		vi.restoreAllMocks();
		delete process.env.RELEASE_BRANCH;
		delete process.env.TARGET_BRANCH;
		delete process.env.PR_NUMBER;
		delete process.env.PACKAGE_MANAGER;
		delete process.env.VERSION_COMMAND;
		delete process.env.DRY_RUN;
	});

	describe("successful merge without conflicts", () => {
		it("should merge target branch successfully", async () => {
			mockExec.exec.mockImplementation(async (cmd, args, options) => {
				// Mock git status to return no conflicts
				if (cmd === "git" && args?.[0] === "status" && options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from(""));
				}
				return 0;
			});

			await updateReleaseBranch(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "true");
			expect(mockCore.setOutput).toHaveBeenCalledWith("had_conflicts", "false");
			expect(mockExec.exec).toHaveBeenCalledWith(
				"git",
				expect.arrayContaining(["merge", "origin/main"]),
				expect.anything(),
			);
		});

		it("should run changeset version after merge", async () => {
			mockExec.exec.mockImplementation(async (cmd, args, options) => {
				if (cmd === "git" && args?.[0] === "status" && options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from(""));
				}
				return 0;
			});

			await updateReleaseBranch(mockArgs);

			expect(mockExec.exec).toHaveBeenCalledWith("pnpm", ["ci:version"], expect.anything());
		});

		it("should commit and push new changes", async () => {
			mockExec.exec.mockImplementation(async (cmd, args, options) => {
				if (cmd === "git" && args?.[0] === "status") {
					const callCount = (mockExec.exec.mock.calls as unknown[][]).filter(
						(call) => call[0] === "git" && (call[1] as string[])?.[0] === "status",
					).length;

					// First git status (after merge) - no conflicts
					// Second git status (after changeset version) - has changes
					if (callCount === 2 && options?.listeners?.stdout) {
						options.listeners.stdout(Buffer.from("M package.json\nM CHANGELOG.md\n"));
					} else if (options?.listeners?.stdout) {
						options.listeners.stdout(Buffer.from(""));
					}
				}
				return 0;
			});

			await updateReleaseBranch(mockArgs);

			expect(mockExec.exec).toHaveBeenCalledWith("git", ["add", "."]);
			expect(mockExec.exec).toHaveBeenCalledWith("git", expect.arrayContaining(["commit"]));
			expect(mockExec.exec).toHaveBeenCalledWith(
				"git",
				["push", "origin", "changeset-release/main"],
				expect.anything(),
			);
		});
	});

	describe("merge conflicts", () => {
		it("should detect merge conflicts from git status", async () => {
			mockExec.exec.mockImplementation(async (cmd, args, options) => {
				if (cmd === "git" && args?.[0] === "status" && options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("UU package.json\n"));
				}
				return 0;
			});

			await updateReleaseBranch(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "false");
			expect(mockCore.setOutput).toHaveBeenCalledWith("had_conflicts", "true");
			expect(mockExec.exec).toHaveBeenCalledWith("git", ["merge", "--abort"]);
		});

		it("should detect conflicts from stderr", async () => {
			mockExec.exec.mockImplementation(async (cmd, args, options) => {
				if (cmd === "git" && args?.[0] === "merge" && options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from("CONFLICT (content): Merge conflict in package.json\n"));
				}
				if (cmd === "git" && args?.[0] === "status" && options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from(""));
				}
				return 0;
			});

			await updateReleaseBranch(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("had_conflicts", "true");
		});

		it("should post conflict resolution instructions to PR", async () => {
			mockExec.exec.mockImplementation(async (cmd, args, options) => {
				if (cmd === "git" && args?.[0] === "status" && options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("UU package.json\n"));
				}
				return 0;
			});

			await updateReleaseBranch(mockArgs);

			expect(mockGithub.rest.issues.createComment).toHaveBeenCalledWith({
				owner: "test-owner",
				repo: "test-repo",
				issue_number: 42,
				body: expect.stringContaining("Merge Conflicts Detected"),
			});
		});

		it("should add conflicts label to PR", async () => {
			mockExec.exec.mockImplementation(async (cmd, args, options) => {
				if (cmd === "git" && args?.[0] === "status" && options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("UU package.json\n"));
				}
				return 0;
			});

			await updateReleaseBranch(mockArgs);

			expect(mockGithub.rest.issues.addLabels).toHaveBeenCalledWith({
				owner: "test-owner",
				repo: "test-repo",
				issue_number: 42,
				labels: ["conflicts"],
			});
		});

		it("should create action_required check on conflicts", async () => {
			mockExec.exec.mockImplementation(async (cmd, args, options) => {
				if (cmd === "git" && args?.[0] === "status" && options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("UU package.json\n"));
				}
				return 0;
			});

			await updateReleaseBranch(mockArgs);

			expect(mockGithub.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					conclusion: "action_required",
					output: expect.objectContaining({
						title: "Merge conflicts detected",
					}),
				}),
			);
		});

		it("should not post comment if PR number not provided", async () => {
			process.env.PR_NUMBER = "";

			mockExec.exec.mockImplementation(async (cmd, args, options) => {
				if (cmd === "git" && args?.[0] === "status" && options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("UU package.json\n"));
				}
				return 0;
			});

			await updateReleaseBranch(mockArgs);

			expect(mockGithub.rest.issues.createComment).not.toHaveBeenCalled();
		});
	});

	describe("no new changes after merge", () => {
		it("should handle no changes gracefully", async () => {
			mockExec.exec.mockImplementation(async (cmd, args, options) => {
				if (cmd === "git" && args?.[0] === "status" && options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from(""));
				}
				return 0;
			});

			await updateReleaseBranch(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "true");
			expect(mockExec.exec).not.toHaveBeenCalledWith("git", expect.arrayContaining(["commit"]));
		});
	});

	describe("package managers", () => {
		it("should use npm commands for npm package manager", async () => {
			process.env.PACKAGE_MANAGER = "npm";

			mockExec.exec.mockImplementation(async (cmd, args, options) => {
				if (cmd === "git" && args?.[0] === "status" && options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from(""));
				}
				return 0;
			});

			await updateReleaseBranch(mockArgs);

			expect(mockExec.exec).toHaveBeenCalledWith("npm", ["run", "ci:version"], expect.anything());
		});

		it("should use yarn commands for yarn package manager", async () => {
			process.env.PACKAGE_MANAGER = "yarn";

			mockExec.exec.mockImplementation(async (cmd, args, options) => {
				if (cmd === "git" && args?.[0] === "status" && options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from(""));
				}
				return 0;
			});

			await updateReleaseBranch(mockArgs);

			expect(mockExec.exec).toHaveBeenCalledWith("yarn", ["ci:version"], expect.anything());
		});
	});

	describe("dry-run mode", () => {
		it("should skip actual operations in dry-run mode", async () => {
			process.env.DRY_RUN = "true";

			await updateReleaseBranch(mockArgs);

			expect(mockCore.notice).toHaveBeenCalledWith("🧪 Running in dry-run mode (preview only)");
			expect(mockExec.exec).not.toHaveBeenCalledWith("git", expect.arrayContaining(["checkout"]));
		});

		it("should indicate dry-run in check title", async () => {
			process.env.DRY_RUN = "true";

			await updateReleaseBranch(mockArgs);

			expect(mockGithub.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "🧪 Update Release Branch (Dry Run)",
				}),
			);
		});
	});

	describe("error handling", () => {
		it("should handle errors gracefully", async () => {
			mockExec.exec.mockRejectedValue(new Error("Git command failed"));

			await updateReleaseBranch(mockArgs);

			expect(mockCore.setFailed).toHaveBeenCalledWith(expect.stringContaining("Failed to update release branch"));
		});

		it("should handle merge errors as conflicts", async () => {
			mockExec.exec.mockImplementation(async (cmd, args) => {
				if (cmd === "git" && args?.[0] === "merge") {
					throw new Error("Merge failed");
				}
				return 0;
			});

			await updateReleaseBranch(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("had_conflicts", "true");
		});
	});

	describe("retry logic", () => {
		it("should retry git push on network errors", async () => {
			vi.useFakeTimers();

			let pushAttempts = 0;
			mockExec.exec.mockImplementation(async (cmd, args, options) => {
				if (cmd === "git" && args?.[0] === "status") {
					const callCount = (mockExec.exec.mock.calls as unknown[][]).filter(
						(call) => call[0] === "git" && (call[1] as string[])?.[0] === "status",
					).length;

					// First git status (after merge) - no conflicts
					// Second git status (after changeset version) - has changes
					if (callCount === 2 && options?.listeners?.stdout) {
						options.listeners.stdout(Buffer.from("M package.json\n"));
					} else if (options?.listeners?.stdout) {
						options.listeners.stdout(Buffer.from(""));
					}
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

			const actionPromise = updateReleaseBranch(mockArgs);
			await vi.runAllTimersAsync();
			await actionPromise;

			expect(pushAttempts).toBe(3);
			expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining("Attempt 1 failed"));
			expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining("Retrying in"));

			vi.useRealTimers();
		});

		it("should retry version command on network errors", async () => {
			vi.useFakeTimers();

			let versionAttempts = 0;
			mockExec.exec.mockImplementation(async (cmd, args, options) => {
				if (cmd === "pnpm" && args?.[0] === "ci:version") {
					versionAttempts++;
					if (versionAttempts < 2) {
						throw new Error("ETIMEDOUT: Connection timed out");
					}
					return 0;
				}
				if (cmd === "git" && args?.[0] === "status" && options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from(""));
				}
				return 0;
			});

			const actionPromise = updateReleaseBranch(mockArgs);
			await vi.runAllTimersAsync();
			await actionPromise;

			expect(versionAttempts).toBe(2);
			expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining("Attempt 1 failed"));
			expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining("Retrying in"));

			vi.useRealTimers();
		});
	});

	describe("output verification", () => {
		it("should set all outputs correctly on success", async () => {
			mockExec.exec.mockImplementation(async (cmd, args, options) => {
				if (cmd === "git" && args?.[0] === "status") {
					const callCount = (mockExec.exec.mock.calls as unknown[][]).filter(
						(call) => call[0] === "git" && (call[1] as string[])?.[0] === "status",
					).length;

					if (callCount === 2 && options?.listeners?.stdout) {
						options.listeners.stdout(Buffer.from("M packages/pkg-a/package.json\n"));
					} else if (options?.listeners?.stdout) {
						options.listeners.stdout(Buffer.from(""));
					}
				}
				return 0;
			});

			await updateReleaseBranch(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "true");
			expect(mockCore.setOutput).toHaveBeenCalledWith("had_conflicts", "false");
			expect(mockCore.setOutput).toHaveBeenCalledWith("pr_number", "42");
			expect(mockCore.setOutput).toHaveBeenCalledWith("check_id", "12345");
			expect(mockCore.setOutput).toHaveBeenCalledWith(
				"version_summary",
				expect.stringContaining("packages/pkg-a/package.json"),
			);
		});

		it("should set outputs correctly on conflicts", async () => {
			mockExec.exec.mockImplementation(async (cmd, args, options) => {
				if (cmd === "git" && args?.[0] === "status" && options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("UU package.json\n"));
				}
				return 0;
			});

			await updateReleaseBranch(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "false");
			expect(mockCore.setOutput).toHaveBeenCalledWith("had_conflicts", "true");
			expect(mockCore.setOutput).toHaveBeenCalledWith("version_summary", "");
		});
	});
});
