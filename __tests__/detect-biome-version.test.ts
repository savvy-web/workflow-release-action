import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import detectBiomeVersion from "../.github/actions/biome/detect-biome-version.js";
import type { MockCore } from "./utils/github-mocks.js";
import { createMockCore } from "./utils/github-mocks.js";

// Mock node:fs and node:fs/promises
vi.mock("node:fs", () => ({
	existsSync: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(),
}));

// Type for mock arguments
interface MockArgs {
	core: MockCore;
	parse: ReturnType<typeof vi.fn>;
}

describe("detectBiomeVersion", () => {
	let mockCore: MockCore;
	let mockParse: ReturnType<typeof vi.fn>;
	let mockArgs: MockArgs;

	beforeEach(() => {
		vi.clearAllMocks();
		mockCore = createMockCore();
		mockParse = vi.fn();
		mockArgs = {
			core: mockCore as never,
			parse: mockParse as never,
		};
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("provided version", () => {
		it("should use provided version when specified", async () => {
			await detectBiomeVersion(mockArgs as never, "2.5.0");

			expect(mockCore.info).toHaveBeenCalledWith("Using provided Biome version: 2.5.0");
			expect(mockCore.setOutput).toHaveBeenCalledWith("version", "2.5.0");
			expect(mockCore.setOutput).toHaveBeenCalledWith("config-file", "");
			expect(vi.mocked(existsSync)).not.toHaveBeenCalled();
		});

		it("should set debug outputs when using provided version", async () => {
			await detectBiomeVersion(mockArgs as never, "3.0.0");

			expect(mockCore.debug).toHaveBeenCalledWith("Set output 'version' to: 3.0.0");
			expect(mockCore.debug).toHaveBeenCalledWith("Set output 'config-file' to: ");
		});
	});

	describe("config file detection", () => {
		it("should detect biome.jsonc first", async () => {
			vi.mocked(existsSync).mockImplementation((path) => path === "biome.jsonc");
			vi.mocked(readFile).mockResolvedValueOnce(
				JSON.stringify({
					$schema: "https://biomejs.dev/schemas/2.3.6/schema.json",
				}),
			);
			mockParse.mockReturnValueOnce({
				$schema: "https://biomejs.dev/schemas/2.3.6/schema.json",
			});

			await detectBiomeVersion(mockArgs as never);

			expect(mockCore.info).toHaveBeenCalledWith("Detected Biome config: biome.jsonc");
			expect(mockCore.info).toHaveBeenCalledWith("Detected Biome version: 2.3.6 from biome.jsonc");
			expect(mockCore.setOutput).toHaveBeenCalledWith("version", "2.3.6");
			expect(mockCore.setOutput).toHaveBeenCalledWith("config-file", "biome.jsonc");
		});

		it("should fall back to biome.json if biome.jsonc doesn't exist", async () => {
			vi.mocked(existsSync).mockImplementation((path) => path === "biome.json");
			vi.mocked(readFile).mockResolvedValueOnce(
				JSON.stringify({
					$schema: "https://biomejs.dev/schemas/2.4.0/schema.json",
				}),
			);
			mockParse.mockReturnValueOnce({
				$schema: "https://biomejs.dev/schemas/2.4.0/schema.json",
			});

			await detectBiomeVersion(mockArgs as never);

			expect(mockCore.info).toHaveBeenCalledWith("Detected Biome config: biome.json");
			expect(mockCore.info).toHaveBeenCalledWith("Detected Biome version: 2.4.0 from biome.json");
			expect(mockCore.setOutput).toHaveBeenCalledWith("version", "2.4.0");
			expect(mockCore.setOutput).toHaveBeenCalledWith("config-file", "biome.json");
		});

		it("should use latest when no config file exists", async () => {
			vi.mocked(existsSync).mockReturnValue(false);

			await detectBiomeVersion(mockArgs as never);

			expect(mockCore.warning).toHaveBeenCalledWith("No Biome config file found, using 'latest' version");
			expect(mockCore.setOutput).toHaveBeenCalledWith("version", "latest");
			expect(mockCore.setOutput).toHaveBeenCalledWith("config-file", "");
		});
	});

	describe("schema parsing", () => {
		it("should extract version from $schema URL", async () => {
			vi.mocked(existsSync).mockImplementation((path) => path === "biome.jsonc");
			vi.mocked(readFile).mockResolvedValueOnce(
				JSON.stringify({
					$schema: "https://biomejs.dev/schemas/1.9.0/schema.json",
				}),
			);
			mockParse.mockReturnValueOnce({
				$schema: "https://biomejs.dev/schemas/1.9.0/schema.json",
			});

			await detectBiomeVersion(mockArgs as never);

			expect(mockCore.setOutput).toHaveBeenCalledWith("version", "1.9.0");
		});

		it("should use latest when $schema field is missing", async () => {
			vi.mocked(existsSync).mockImplementation((path) => path === "biome.jsonc");
			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify({}));
			mockParse.mockReturnValueOnce({});

			await detectBiomeVersion(mockArgs as never);

			expect(mockCore.warning).toHaveBeenCalledWith("No $schema field found in biome.jsonc, using 'latest' version");
			expect(mockCore.setOutput).toHaveBeenCalledWith("version", "latest");
			expect(mockCore.setOutput).toHaveBeenCalledWith("config-file", "biome.jsonc");
		});

		it("should use latest when $schema URL format is invalid", async () => {
			vi.mocked(existsSync).mockImplementation((path) => path === "biome.jsonc");
			vi.mocked(readFile).mockResolvedValueOnce(
				JSON.stringify({
					$schema: "https://example.com/invalid.json",
				}),
			);
			mockParse.mockReturnValueOnce({
				$schema: "https://example.com/invalid.json",
			});

			await detectBiomeVersion(mockArgs as never);

			expect(mockCore.warning).toHaveBeenCalledWith(
				"Could not parse version from $schema in biome.jsonc (URL: https://example.com/invalid.json), using 'latest' version",
			);
			expect(mockCore.setOutput).toHaveBeenCalledWith("version", "latest");
		});

		it("should handle various version formats", async () => {
			const versions = ["1.0.0", "2.10.5", "10.20.30"];

			for (const version of versions) {
				vi.clearAllMocks();
				vi.mocked(existsSync).mockImplementation((path) => path === "biome.json");
				vi.mocked(readFile).mockResolvedValueOnce(
					JSON.stringify({
						$schema: `https://biomejs.dev/schemas/${version}/schema.json`,
					}),
				);
				mockParse.mockReturnValueOnce({
					$schema: `https://biomejs.dev/schemas/${version}/schema.json`,
				});

				await detectBiomeVersion(mockArgs as never);

				expect(mockCore.setOutput).toHaveBeenCalledWith("version", version);
			}
		});
	});

	describe("error handling", () => {
		it("should handle config file read errors", async () => {
			vi.mocked(existsSync).mockImplementation((path) => path === "biome.jsonc");
			vi.mocked(readFile).mockRejectedValueOnce(new Error("Permission denied"));

			await detectBiomeVersion(mockArgs as never);

			expect(mockCore.warning).toHaveBeenCalledWith(
				"Failed to parse biome.jsonc: Permission denied, using 'latest' version",
			);
			expect(mockCore.setOutput).toHaveBeenCalledWith("version", "latest");
			expect(mockCore.setOutput).toHaveBeenCalledWith("config-file", "biome.jsonc");
		});

		it("should handle parse errors", async () => {
			vi.mocked(existsSync).mockImplementation((path) => path === "biome.jsonc");
			vi.mocked(readFile).mockResolvedValueOnce("not valid json");
			mockParse.mockImplementation(() => {
				throw new Error("Parse error");
			});

			await detectBiomeVersion(mockArgs as never);

			expect(mockCore.warning).toHaveBeenCalledWith("Failed to parse biome.jsonc: Parse error, using 'latest' version");
			expect(mockCore.setOutput).toHaveBeenCalledWith("version", "latest");
		});

		it("should handle non-Error exceptions", async () => {
			vi.mocked(existsSync).mockImplementation((path) => path === "biome.jsonc");
			vi.mocked(readFile).mockResolvedValueOnce("content");
			mockParse.mockImplementation(() => {
				throw "string error";
			});

			await detectBiomeVersion(mockArgs as never);

			expect(mockCore.warning).toHaveBeenCalledWith(
				"Failed to parse biome.jsonc: string error, using 'latest' version",
			);
		});

		it("should handle top-level errors with setFailed", async () => {
			vi.mocked(existsSync).mockImplementation(() => {
				throw new Error("Filesystem error");
			});

			await detectBiomeVersion(mockArgs as never);

			expect(mockCore.setFailed).toHaveBeenCalledWith("Failed to detect Biome version: Filesystem error");
		});
	});

	describe("output verification", () => {
		it("should set all outputs correctly", async () => {
			vi.mocked(existsSync).mockImplementation((path) => path === "biome.json");
			vi.mocked(readFile).mockResolvedValueOnce(
				JSON.stringify({
					$schema: "https://biomejs.dev/schemas/2.0.0/schema.json",
				}),
			);
			mockParse.mockReturnValueOnce({
				$schema: "https://biomejs.dev/schemas/2.0.0/schema.json",
			});

			await detectBiomeVersion(mockArgs as never);

			expect(mockCore.setOutput).toHaveBeenCalledTimes(2);
			expect(mockCore.setOutput).toHaveBeenCalledWith("version", "2.0.0");
			expect(mockCore.setOutput).toHaveBeenCalledWith("config-file", "biome.json");
			expect(mockCore.debug).toHaveBeenCalledWith("Set output 'version' to: 2.0.0");
			expect(mockCore.debug).toHaveBeenCalledWith("Set output 'config-file' to: biome.json");
		});
	});
});
