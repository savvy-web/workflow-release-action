import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import validateBuilds from "../.github/actions/setup-release/validate-builds.js";
import type { MockContext, MockCore, MockExec, MockGithub } from "./utils/github-mocks.js";
import {
	cleanupTestEnvironment,
	createMockContext,
	createMockCore,
	createMockExec,
	createMockGithub,
	setupTestEnvironment,
} from "./utils/github-mocks.js";

describe("validateBuilds", () => {
	let mockCore: MockCore;
	let mockExec: MockExec;
	let mockGithub: MockGithub;
	let mockContext: MockContext;

	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });

		mockCore = createMockCore();
		mockExec = createMockExec();
		mockGithub = createMockGithub();
		mockContext = createMockContext();

		// Default environment
		process.env.PACKAGE_MANAGER = "pnpm";
		process.env.BUILD_COMMAND = "";
		process.env.DRY_RUN = "false";
	});

	afterEach(() => {
		cleanupTestEnvironment();
		delete process.env.PACKAGE_MANAGER;
		delete process.env.BUILD_COMMAND;
		delete process.env.DRY_RUN;
	});

	describe("successful builds", () => {
		it("should validate successful build", async () => {
			mockExec.exec.mockResolvedValueOnce(0);

			await validateBuilds({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "true");
			expect(mockCore.notice).toHaveBeenCalledWith("✓ All packages built successfully");
			expect(mockCore.setFailed).not.toHaveBeenCalled();
		});

		it("should run build command with pnpm", async () => {
			await validateBuilds({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockExec.exec).toHaveBeenCalledWith(
				"pnpm",
				["ci:build"],
				expect.objectContaining({
					ignoreReturnCode: true,
					listeners: expect.any(Object),
				}),
			);
		});

		it("should run build command with npm", async () => {
			process.env.PACKAGE_MANAGER = "npm";

			await validateBuilds({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockExec.exec).toHaveBeenCalledWith("npm", ["run", "ci:build"], expect.anything());
		});

		it("should run build command with yarn", async () => {
			process.env.PACKAGE_MANAGER = "yarn";

			await validateBuilds({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockExec.exec).toHaveBeenCalledWith("yarn", ["ci:build"], expect.anything());
		});

		it("should use custom build command", async () => {
			process.env.BUILD_COMMAND = "turbo build";

			await validateBuilds({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockExec.exec).toHaveBeenCalledWith("turbo build", ["turbo", "build"], expect.anything());
		});

		it("should create success check", async () => {
			await validateBuilds({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockGithub.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					conclusion: "success",
					output: expect.objectContaining({
						title: "All packages built successfully",
					}),
				}),
			);
		});

		it("should set all outputs on success", async () => {
			await validateBuilds({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "true");
			expect(mockCore.setOutput).toHaveBeenCalledWith("errors", "");
			expect(mockCore.setOutput).toHaveBeenCalledWith("check_id", "12345");
		});
	});

	describe("build failures", () => {
		it("should detect build failure from stderr", async () => {
			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from("ERROR: Build failed\n"));
				}
				return 0;
			});

			await validateBuilds({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "false");
			expect(mockCore.error).toHaveBeenCalledWith("❌ Build validation failed");
		});

		it("should parse TypeScript errors", async () => {
			const tsError = "src/index.ts:42:10 - error TS2304: Cannot find name 'foo'.\n";
			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from(tsError));
				}
				return 0;
			});

			await validateBuilds({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockGithub.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					output: expect.objectContaining({
						annotations: [
							{
								path: "src/index.ts",
								start_line: 42,
								end_line: 42,
								annotation_level: "failure",
								message: "Cannot find name 'foo'.",
							},
						],
					}),
				}),
			);
		});

		it("should parse multiple TypeScript errors", async () => {
			const tsErrors =
				"src/index.ts:42:10 - error TS2304: Cannot find name 'foo'.\n" +
				"src/utils.ts:15:5 - error TS2322: Type 'string' is not assignable to type 'number'.\n";

			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from(tsErrors));
				}
				return 0;
			});

			await validateBuilds({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockGithub.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					output: expect.objectContaining({
						annotations: expect.arrayContaining([
							expect.objectContaining({
								path: "src/index.ts",
								start_line: 42,
								message: "Cannot find name 'foo'.",
							}),
							expect.objectContaining({
								path: "src/utils.ts",
								start_line: 15,
								message: "Type 'string' is not assignable to type 'number'.",
							}),
						]),
					}),
				}),
			);
		});

		it("should parse generic build errors", async () => {
			const buildError = "ERROR in src/index.ts Module not found\n";
			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from(buildError));
				}
				return 0;
			});

			await validateBuilds({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockGithub.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					output: expect.objectContaining({
						annotations: [
							{
								path: "src/index.ts",
								start_line: 1,
								end_line: 1,
								annotation_level: "failure",
								message: "Module not found",
							},
						],
					}),
				}),
			);
		});

		it("should skip non-TS files in generic errors", async () => {
			const buildError = "ERROR in webpack.config.js Invalid configuration\n";
			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from(buildError));
				}
				return 0;
			});

			await validateBuilds({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockGithub.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					output: expect.objectContaining({
						annotations: [],
					}),
				}),
			);
		});

		it("should limit annotations to 50", async () => {
			// Generate 60 errors
			const errors = Array.from({ length: 60 }, (_, i) => `src/file${i}.ts:1:1 - error TS2304: Error ${i}.\n`).join("");

			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from(errors));
				}
				return 0;
			});

			await validateBuilds({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			const checkCall = mockGithub.rest.checks.create.mock.calls[0][0];
			expect(checkCall.output.annotations).toHaveLength(50);
		});

		it("should log first 10 errors to console", async () => {
			const errors = Array.from({ length: 15 }, (_, i) => `src/file${i}.ts:1:1 - error TS2304: Error ${i}.\n`).join("");

			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from(errors));
				}
				return 0;
			});

			await validateBuilds({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			// Should call core.error exactly 10 times (for logging errors, not the final failure)
			const errorCalls = mockCore.error.mock.calls.filter((call) => !call[0].includes("Build validation failed"));
			expect(errorCalls).toHaveLength(10);
		});

		it("should set outputs correctly on failure", async () => {
			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from("ERROR: Build failed\n"));
				}
				return 0;
			});

			await validateBuilds({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "false");
			expect(mockCore.setOutput).toHaveBeenCalledWith("errors", expect.stringContaining("ERROR: Build failed"));
			expect(mockCore.setOutput).toHaveBeenCalledWith("check_id", "12345");
		});

		it("should fail action on build failure", async () => {
			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from("ERROR: Build failed\n"));
				}
				return 0;
			});

			await validateBuilds({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setFailed).toHaveBeenCalledWith("Build validation failed. See check run for details.");
		});

		it("should create failure check with error details", async () => {
			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from("ERROR: Build failed\n"));
				}
				return 0;
			});

			await validateBuilds({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockGithub.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					conclusion: "failure",
					output: expect.objectContaining({
						title: "Build failed with errors",
						summary: expect.stringContaining("ERROR: Build failed"),
					}),
				}),
			);
		});
	});

	describe("dry-run mode", () => {
		it("should skip build in dry-run mode", async () => {
			process.env.DRY_RUN = "true";

			await validateBuilds({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.notice).toHaveBeenCalledWith("🧪 Running in dry-run mode (preview only)");
			expect(mockExec.exec).not.toHaveBeenCalled();
		});

		it("should assume success in dry-run mode", async () => {
			process.env.DRY_RUN = "true";

			await validateBuilds({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "true");
			expect(mockCore.notice).toHaveBeenCalledWith("✓ All packages built successfully");
		});

		it("should not fail action in dry-run mode even with errors", async () => {
			process.env.DRY_RUN = "true";
			// Simulate error that would be caught if we were running
			mockExec.exec.mockRejectedValueOnce(new Error("Build error"));

			await validateBuilds({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setFailed).not.toHaveBeenCalled();
		});

		it("should indicate dry-run in check title", async () => {
			process.env.DRY_RUN = "true";

			await validateBuilds({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockGithub.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "🧪 Build Validation (Dry Run)",
				}),
			);
		});
	});

	describe("error handling", () => {
		it("should handle build command errors", async () => {
			mockExec.exec.mockRejectedValueOnce(new Error("Command not found"));

			await validateBuilds({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "false");
			expect(mockCore.error).toHaveBeenCalledWith("Build command failed: Command not found");
		});

		it("should handle unexpected errors gracefully", async () => {
			mockGithub.rest.checks.create.mockRejectedValueOnce(new Error("GitHub API error"));

			await validateBuilds({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setFailed).toHaveBeenCalledWith("Failed to validate builds: GitHub API error");
		});
	});

	describe("output capturing", () => {
		it("should capture stdout from build", async () => {
			let capturedStdout = "";
			const originalWrite = process.stdout.write;
			process.stdout.write = vi.fn((chunk: string) => {
				capturedStdout += chunk;
				return true;
			}) as never;

			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("Building packages...\n"));
				}
				return 0;
			});

			await validateBuilds({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(capturedStdout).toContain("Building packages...");
			process.stdout.write = originalWrite;
		});

		it("should capture stderr from build", async () => {
			let capturedStderr = "";
			const originalWrite = process.stderr.write;
			process.stderr.write = vi.fn((chunk: string) => {
				capturedStderr += chunk;
				return true;
			}) as never;

			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from("Warning: Deprecated API\n"));
				}
				return 0;
			});

			await validateBuilds({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(capturedStderr).toContain("Warning: Deprecated API");
			process.stderr.write = originalWrite;
		});
	});
});
