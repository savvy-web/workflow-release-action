import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import detectRuntime from "../.github/actions/detect-runtime/detect-runtime.js";
import type { AsyncFunctionArguments } from "../.github/actions/shared/types.js";
import type { MockCore } from "./utils/github-mocks.js";
import { createMockAsyncFunctionArguments, createMockCore } from "./utils/github-mocks.js";

// Mock node:fs and node:fs/promises
vi.mock("node:fs", () => ({
	existsSync: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(),
}));

describe("detectRuntime", () => {
	let mockCore: MockCore;
	let mockArgs: AsyncFunctionArguments;

	beforeEach(() => {
		vi.clearAllMocks();
		mockCore = createMockCore();
		mockArgs = createMockAsyncFunctionArguments({
			core: mockCore as never,
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("Deno detection", () => {
		it("should detect Deno from deno.lock", async () => {
			vi.mocked(existsSync).mockImplementation((path) => path === "deno.lock");

			await detectRuntime(mockArgs);

			expect(mockCore.info).toHaveBeenCalledWith("Detected Deno runtime from lock/config file");
			expect(mockCore.setOutput).toHaveBeenCalledWith("runtime", "deno");
			expect(mockCore.setOutput).toHaveBeenCalledWith("package-manager", "deno");
			expect(mockCore.notice).toHaveBeenCalledWith("✓ Detected runtime: deno");
			expect(mockCore.notice).toHaveBeenCalledWith("✓ Detected package manager: deno");
		});

		it("should detect Deno from deno.json", async () => {
			vi.mocked(existsSync).mockImplementation((path) => path === "deno.json");

			await detectRuntime(mockArgs);

			expect(mockCore.info).toHaveBeenCalledWith("Detected Deno runtime from lock/config file");
			expect(mockCore.setOutput).toHaveBeenCalledWith("runtime", "deno");
			expect(mockCore.setOutput).toHaveBeenCalledWith("package-manager", "deno");
		});

		it("should detect Deno from deno.jsonc", async () => {
			vi.mocked(existsSync).mockImplementation((path) => path === "deno.jsonc");

			await detectRuntime(mockArgs);

			expect(mockCore.info).toHaveBeenCalledWith("Detected Deno runtime from lock/config file");
			expect(mockCore.setOutput).toHaveBeenCalledWith("runtime", "deno");
			expect(mockCore.setOutput).toHaveBeenCalledWith("package-manager", "deno");
		});

		it("should prioritize Deno over Bun when both files exist", async () => {
			vi.mocked(existsSync).mockImplementation((path) => path === "deno.lock" || path === "bun.lockb");

			await detectRuntime(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("runtime", "deno");
		});
	});

	describe("Bun detection", () => {
		it("should detect Bun from bun.lockb", async () => {
			vi.mocked(existsSync).mockImplementation((path) => path === "bun.lockb");

			await detectRuntime(mockArgs);

			expect(mockCore.info).toHaveBeenCalledWith("Detected Bun runtime from bun.lockb");
			expect(mockCore.setOutput).toHaveBeenCalledWith("runtime", "bun");
			expect(mockCore.setOutput).toHaveBeenCalledWith("package-manager", "bun");
			expect(mockCore.notice).toHaveBeenCalledWith("✓ Detected runtime: bun");
			expect(mockCore.notice).toHaveBeenCalledWith("✓ Detected package manager: bun");
		});
	});

	describe("Node.js detection", () => {
		it("should detect Node.js with pnpm from packageManager field", async () => {
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(readFile).mockResolvedValueOnce(
				JSON.stringify({
					packageManager: "pnpm@10.20.0",
				}),
			);

			await detectRuntime(mockArgs);

			expect(mockCore.info).toHaveBeenCalledWith("Detected Node.js runtime with pnpm package manager");
			expect(mockCore.setOutput).toHaveBeenCalledWith("runtime", "node");
			expect(mockCore.setOutput).toHaveBeenCalledWith("package-manager", "pnpm");
			expect(mockCore.notice).toHaveBeenCalledWith("✓ Detected runtime: node");
			expect(mockCore.notice).toHaveBeenCalledWith("✓ Detected package manager: pnpm");
		});

		it("should detect Node.js with yarn from packageManager field", async () => {
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(readFile).mockResolvedValueOnce(
				JSON.stringify({
					packageManager: "yarn@4.0.0",
				}),
			);

			await detectRuntime(mockArgs);

			expect(mockCore.info).toHaveBeenCalledWith("Detected Node.js runtime with yarn package manager");
			expect(mockCore.setOutput).toHaveBeenCalledWith("package-manager", "yarn");
		});

		it("should detect Node.js with npm from packageManager field", async () => {
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(readFile).mockResolvedValueOnce(
				JSON.stringify({
					packageManager: "npm@10.0.0",
				}),
			);

			await detectRuntime(mockArgs);

			expect(mockCore.info).toHaveBeenCalledWith("Detected Node.js runtime with npm package manager");
			expect(mockCore.setOutput).toHaveBeenCalledWith("package-manager", "npm");
		});

		it("should default to npm when packageManager field is missing", async () => {
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify({}));

			await detectRuntime(mockArgs);

			expect(mockCore.info).toHaveBeenCalledWith("Detected Node.js runtime with npm package manager");
			expect(mockCore.setOutput).toHaveBeenCalledWith("package-manager", "npm");
		});

		it("should default to npm for invalid package manager", async () => {
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(readFile).mockResolvedValueOnce(
				JSON.stringify({
					packageManager: "invalid@1.0.0",
				}),
			);

			await detectRuntime(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("package-manager", "npm");
		});

		it("should default to npm when package.json cannot be read", async () => {
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(readFile).mockRejectedValueOnce(new Error("File not found"));

			await detectRuntime(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("package-manager", "npm");
		});

		it("should default to npm when package.json is invalid JSON", async () => {
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(readFile).mockResolvedValueOnce("invalid json");

			await detectRuntime(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("package-manager", "npm");
		});
	});

	describe("error handling", () => {
		it("should handle top-level errors with setFailed", async () => {
			vi.mocked(existsSync).mockImplementation(() => {
				throw new Error("Filesystem error");
			});

			await detectRuntime(mockArgs);

			expect(mockCore.setFailed).toHaveBeenCalledWith("Failed to detect runtime: Filesystem error");
		});

		it("should handle non-Error exceptions", async () => {
			vi.mocked(existsSync).mockImplementation(() => {
				throw "string error";
			});

			await detectRuntime(mockArgs);

			expect(mockCore.setFailed).toHaveBeenCalledWith("Failed to detect runtime: string error");
		});
	});

	describe("output verification", () => {
		it("should set all outputs and debug info", async () => {
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(readFile).mockResolvedValueOnce(
				JSON.stringify({
					packageManager: "pnpm@10.20.0",
				}),
			);

			await detectRuntime(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledTimes(2);
			expect(mockCore.setOutput).toHaveBeenCalledWith("runtime", "node");
			expect(mockCore.setOutput).toHaveBeenCalledWith("package-manager", "pnpm");
			expect(mockCore.debug).toHaveBeenCalledWith("Set output 'runtime' to: node");
			expect(mockCore.debug).toHaveBeenCalledWith("Set output 'package-manager' to: pnpm");
		});
	});
});
