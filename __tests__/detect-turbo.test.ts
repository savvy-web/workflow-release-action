import { existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import detectTurbo from "../.github/actions/detect-turbo/detect-turbo.js";
import type { AsyncFunctionArguments } from "../.github/actions/shared/types.js";
import type { MockCore } from "./utils/github-mocks.js";
import { createMockAsyncFunctionArguments, createMockCore } from "./utils/github-mocks.js";

// Mock node:fs
vi.mock("node:fs", () => ({
	existsSync: vi.fn(),
}));

describe("detectTurbo", () => {
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

	describe("Turbo detection", () => {
		it("should detect Turbo when turbo.json exists", async () => {
			vi.mocked(existsSync).mockImplementation((path) => path === "turbo.json");

			await detectTurbo(mockArgs);

			expect(mockCore.info).toHaveBeenCalledWith("Detected Turbo configuration: turbo.json");
			expect(mockCore.setOutput).toHaveBeenCalledWith("enabled", "true");
			expect(mockCore.setOutput).toHaveBeenCalledWith("config-file", "turbo.json");
			expect(mockCore.notice).toHaveBeenCalledWith("✓ Turbo configuration found, enabling Turbo cache");
		});

		it("should return false when turbo.json does not exist", async () => {
			vi.mocked(existsSync).mockReturnValue(false);

			await detectTurbo(mockArgs);

			expect(mockCore.info).toHaveBeenCalledWith("No Turbo configuration found");
			expect(mockCore.setOutput).toHaveBeenCalledWith("enabled", "false");
			expect(mockCore.setOutput).toHaveBeenCalledWith("config-file", "");
			expect(mockCore.notice).toHaveBeenCalledWith("✓ No Turbo configuration found, skipping Turbo cache");
		});
	});

	describe("error handling", () => {
		it("should handle filesystem errors with setFailed", async () => {
			vi.mocked(existsSync).mockImplementation(() => {
				throw new Error("Filesystem error");
			});

			await detectTurbo(mockArgs);

			expect(mockCore.setFailed).toHaveBeenCalledWith("Failed to detect Turbo: Filesystem error");
		});

		it("should handle non-Error exceptions", async () => {
			vi.mocked(existsSync).mockImplementation(() => {
				throw "string error";
			});

			await detectTurbo(mockArgs);

			expect(mockCore.setFailed).toHaveBeenCalledWith("Failed to detect Turbo: string error");
		});
	});

	describe("output verification", () => {
		it("should set all outputs and debug info when Turbo is found", async () => {
			vi.mocked(existsSync).mockImplementation((path) => path === "turbo.json");

			await detectTurbo(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledTimes(2);
			expect(mockCore.setOutput).toHaveBeenCalledWith("enabled", "true");
			expect(mockCore.setOutput).toHaveBeenCalledWith("config-file", "turbo.json");
			expect(mockCore.debug).toHaveBeenCalledWith("Set output 'enabled' to: true");
			expect(mockCore.debug).toHaveBeenCalledWith("Set output 'config-file' to: turbo.json");
		});

		it("should set all outputs and debug info when Turbo is not found", async () => {
			vi.mocked(existsSync).mockReturnValue(false);

			await detectTurbo(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("enabled", "false");
			expect(mockCore.setOutput).toHaveBeenCalledWith("config-file", "");
			expect(mockCore.debug).toHaveBeenCalledWith("Set output 'enabled' to: false");
			expect(mockCore.debug).toHaveBeenCalledWith("Set output 'config-file' to: ");
		});
	});
});
