import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { context, getOctokit } from "@actions/github";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateBuilds } from "../src/utils/validate-builds.js";
import { cleanupTestEnvironment, createMockOctokit, setupTestEnvironment } from "./utils/github-mocks.js";
import type { ExecOptionsWithListeners, MockOctokit } from "./utils/test-types.js";

// Mock modules
vi.mock("@actions/core");
vi.mock("@actions/exec");
vi.mock("@actions/github");

describe("validate-builds", () => {
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
			if (name === "build-command") return "";
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
	});

	afterEach(() => {
		cleanupTestEnvironment();
	});

	it("should run build successfully with default command", async () => {
		vi.mocked(exec.exec).mockResolvedValue(0);

		const result = await validateBuilds("pnpm");

		expect(result.success).toBe(true);
		expect(result.checkId).toBe(12345);
		expect(exec.exec).toHaveBeenCalledWith("pnpm", ["ci:build"], expect.any(Object));
	});

	it("should handle build failures", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
			if (options?.listeners?.stderr) {
				options.listeners.stderr(Buffer.from("Error: Build failed\n"));
			}
			throw new Error("Build failed");
		});

		const result = await validateBuilds("pnpm");

		expect(result.success).toBe(false);
	});

	it("should use custom build command when provided", async () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "build-command") return "turbo run build";
			return "";
		});
		vi.mocked(exec.exec).mockResolvedValue(0);

		await validateBuilds("pnpm");

		expect(exec.exec).toHaveBeenCalledWith("pnpm", ["run", "turbo run build"], expect.any(Object));
	});

	it("should handle different package managers", async () => {
		vi.mocked(exec.exec).mockResolvedValue(0);

		await validateBuilds("npm");
		expect(exec.exec).toHaveBeenCalledWith("npm", ["run", "ci:build"], expect.any(Object));
	});

	it("should skip build execution in dry-run mode", async () => {
		vi.mocked(core.getBooleanInput).mockImplementation((name: string) => {
			if (name === "dry-run") return true;
			return false;
		});
		vi.mocked(exec.exec).mockResolvedValue(0);

		const result = await validateBuilds("pnpm");

		expect(result.success).toBe(true);
		expect(exec.exec).not.toHaveBeenCalled();
		expect(core.info).toHaveBeenCalledWith(expect.stringContaining("[DRY RUN]"));
	});

	it("should parse TypeScript errors and create annotations", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
			if (options?.listeners?.stderr) {
				options.listeners.stderr(
					Buffer.from("src/index.ts:10:5 - error TS2322: Type 'string' is not assignable to type 'number'\n"),
				);
			}
			return 0;
		});

		const result = await validateBuilds("pnpm");

		expect(result.success).toBe(false);
		expect(result.errors).toContain("error TS2322");
	});

	it("should use yarn command for yarn package manager", async () => {
		vi.mocked(exec.exec).mockResolvedValue(0);

		await validateBuilds("yarn");

		expect(exec.exec).toHaveBeenCalledWith("yarn", ["ci:build"], expect.any(Object));
	});

	it("should handle non-Error throw from build command", async () => {
		vi.mocked(exec.exec).mockImplementation(async () => {
			throw "String error thrown"; // Non-Error throw to hit String(error) path
		});

		const result = await validateBuilds("pnpm");

		expect(result.success).toBe(false);
		expect(core.error).toHaveBeenCalledWith(expect.stringContaining("String error thrown"));
	});

	it("should capture stdout during build", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
			if (options?.listeners?.stdout) {
				options.listeners.stdout(Buffer.from("Build completed successfully\n"));
			}
			return 0;
		});

		const result = await validateBuilds("pnpm");

		expect(result.success).toBe(true);
	});

	it("should parse generic ERROR in file.ts pattern", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
			if (options?.listeners?.stderr) {
				options.listeners.stderr(Buffer.from("ERROR in src/utils/helper.ts: Cannot find module\n"));
			}
			// Don't throw - let the ERROR substring in stderr trigger failure via success check
			return 0;
		});

		const result = await validateBuilds("pnpm");

		expect(result.success).toBe(false);
		expect(result.errors).toContain("ERROR in src/utils/helper.ts");
	});

	it("should ignore non-TypeScript files in generic error pattern", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
			if (options?.listeners?.stderr) {
				options.listeners.stderr(Buffer.from("ERROR in webpack.config.js: Invalid configuration\n"));
			}
			// Don't throw - let the ERROR substring in stderr trigger failure
			return 0;
		});

		const result = await validateBuilds("pnpm");

		expect(result.success).toBe(false);
		// Non-TS files should be skipped in annotations (the .js file won't create an annotation)
		expect(result.errors).toContain("ERROR in webpack.config.js");
	});

	it("should handle generic error pattern without message", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
			if (options?.listeners?.stderr) {
				options.listeners.stderr(Buffer.from("ERROR in src/broken.ts\n"));
			}
			// Don't throw - let the ERROR substring in stderr trigger failure
			return 0;
		});

		const result = await validateBuilds("pnpm");

		expect(result.success).toBe(false);
		expect(result.errors).toContain("ERROR in src/broken.ts");
	});

	it("should show truncation message when more than 20 errors", async () => {
		// Generate more than 20 TypeScript errors
		const errors = Array.from(
			{ length: 25 },
			(_, i) => `src/file${i}.ts:${i + 1}:5 - error TS2322: Type error ${i}\n`,
		).join("");

		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
			if (options?.listeners?.stderr) {
				options.listeners.stderr(Buffer.from(errors));
			}
			// Don't throw - let the "error" substring in stderr trigger failure via success check
			return 0;
		});

		const result = await validateBuilds("pnpm");

		expect(result.success).toBe(false);
		// The summary should indicate truncation when annotations.length > 20
		expect(core.summary.addRaw).toHaveBeenCalledWith(expect.stringContaining("Showing first 20"));
	});
});
