import { existsSync, readFileSync } from "node:fs";
import * as core from "@actions/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadReleaseConfig, loadSBOMConfig } from "../src/utils/load-release-config.js";

// Mock fs modules
vi.mock("node:fs", () => ({
	existsSync: vi.fn(),
	readFileSync: vi.fn(),
}));

vi.mock("@actions/core", () => ({
	debug: vi.fn(),
	info: vi.fn(),
	warning: vi.fn(),
	getInput: vi.fn(),
}));

describe("load-release-config", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		vi.resetAllMocks();
		process.env = { ...originalEnv };
		delete process.env.SILK_RELEASE_SBOM_TEMPLATE;
	});

	afterEach(() => {
		vi.resetAllMocks();
		process.env = originalEnv;
	});

	describe("loadReleaseConfig", () => {
		it("should load config from .github/silk-release.json", () => {
			vi.mocked(existsSync).mockImplementation((path) => {
				return String(path).endsWith(".github/silk-release.json");
			});
			vi.mocked(readFileSync).mockReturnValue(
				JSON.stringify({
					sbom: {
						supplier: { name: "Test Company" },
					},
				}),
			);

			const result = loadReleaseConfig("/repo");

			expect(result.config).toEqual({
				sbom: {
					supplier: { name: "Test Company" },
				},
			});
			expect(result.source.source).toBe("local");
			expect(result.source.location).toBe(".github/silk-release.json");
		});

		it("should load config from .github/silk-release.jsonc", () => {
			vi.mocked(existsSync).mockImplementation((path) => {
				return String(path).endsWith(".github/silk-release.jsonc");
			});
			vi.mocked(readFileSync).mockReturnValue(
				JSON.stringify({
					sbom: {
						supplier: { name: "Test Company" },
					},
				}),
			);

			const result = loadReleaseConfig("/repo");

			expect(result.config).toEqual({
				sbom: {
					supplier: { name: "Test Company" },
				},
			});
			expect(result.source.source).toBe("local");
		});

		it("should strip single-line comments from JSONC", () => {
			vi.mocked(existsSync).mockImplementation((path) => {
				return String(path).endsWith(".github/silk-release.json");
			});
			vi.mocked(readFileSync).mockReturnValue(`{
				// This is a comment
				"sbom": {
					"supplier": { "name": "Test Company" }
				}
			}`);

			const result = loadReleaseConfig("/repo");

			expect(result.config).toEqual({
				sbom: {
					supplier: { name: "Test Company" },
				},
			});
		});

		it("should strip multi-line comments from JSONC", () => {
			vi.mocked(existsSync).mockImplementation((path) => {
				return String(path).endsWith(".github/silk-release.json");
			});
			vi.mocked(readFileSync).mockReturnValue(`{
				/* This is a
				   multi-line comment */
				"sbom": {
					"supplier": { "name": "Test Company" }
				}
			}`);

			const result = loadReleaseConfig("/repo");

			expect(result.config).toEqual({
				sbom: {
					supplier: { name: "Test Company" },
				},
			});
		});

		it("should return none source when no config file exists", () => {
			vi.mocked(existsSync).mockReturnValue(false);

			const result = loadReleaseConfig("/repo");

			expect(result.config).toBeUndefined();
			expect(result.source.source).toBe("none");
		});

		it("should return none source for invalid JSON", () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue("invalid json");

			const result = loadReleaseConfig("/repo");

			expect(result.config).toBeUndefined();
			expect(result.source.source).toBe("none");
		});

		it("should return none source for invalid sbom config", () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(
				JSON.stringify({
					sbom: "invalid", // should be object
				}),
			);

			const result = loadReleaseConfig("/repo");

			expect(result.config).toBeUndefined();
		});

		it("should return undefined config when supplier.name is not a string", () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(
				JSON.stringify({
					sbom: {
						supplier: { name: 123 }, // should be string
					},
				}),
			);

			const result = loadReleaseConfig("/repo");

			expect(result.config).toBeUndefined();
		});

		it("should return undefined config when supplier.url is invalid type", () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(
				JSON.stringify({
					sbom: {
						supplier: { name: "Test", url: 123 }, // should be string or array
					},
				}),
			);

			const result = loadReleaseConfig("/repo");

			expect(result.config).toBeUndefined();
		});

		it("should return undefined config when copyright.holder is not a string", () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(
				JSON.stringify({
					sbom: {
						copyright: { holder: 123 }, // should be string
					},
				}),
			);

			const result = loadReleaseConfig("/repo");

			expect(result.config).toBeUndefined();
		});

		it("should return undefined config when copyright.startYear is not a number", () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(
				JSON.stringify({
					sbom: {
						copyright: { startYear: "2024" }, // should be number
					},
				}),
			);

			const result = loadReleaseConfig("/repo");

			expect(result.config).toBeUndefined();
		});

		it("should return undefined config when publisher is not a string", () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(
				JSON.stringify({
					sbom: {
						publisher: 123, // should be string
					},
				}),
			);

			const result = loadReleaseConfig("/repo");

			expect(result.config).toBeUndefined();
		});

		it("should return undefined config when documentationUrl is not a string", () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(
				JSON.stringify({
					sbom: {
						documentationUrl: 123, // should be string
					},
				}),
			);

			const result = loadReleaseConfig("/repo");

			expect(result.config).toBeUndefined();
		});

		it("should accept valid config with all fields", () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(
				JSON.stringify({
					sbom: {
						supplier: {
							name: "Test Company",
							url: ["https://test.com"],
						},
						copyright: {
							holder: "Test Company LLC",
							startYear: 2020,
						},
						publisher: "Test Publisher",
						documentationUrl: "https://docs.test.com",
					},
				}),
			);

			const result = loadReleaseConfig("/repo");

			expect(result.config).toEqual({
				sbom: {
					supplier: {
						name: "Test Company",
						url: ["https://test.com"],
					},
					copyright: {
						holder: "Test Company LLC",
						startYear: 2020,
					},
					publisher: "Test Publisher",
					documentationUrl: "https://docs.test.com",
				},
			});
		});

		it("should accept config without sbom section", () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(JSON.stringify({}));

			const result = loadReleaseConfig("/repo");

			expect(result.config).toEqual({});
		});

		it("should use current working directory when no rootDir provided", () => {
			vi.mocked(existsSync).mockReturnValue(false);

			loadReleaseConfig();

			// Should have been called with paths starting from cwd
			expect(existsSync).toHaveBeenCalled();
		});

		it("should prefer .github/silk-release.json over .jsonc", () => {
			// Both files exist
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(
				JSON.stringify({
					sbom: { supplier: { name: "JSON file" } },
				}),
			);

			const result = loadReleaseConfig("/repo");

			// Should have loaded the .json file (first in CONFIG_FILE_NAMES)
			expect(result.config?.sbom?.supplier?.name).toBe("JSON file");
		});

		it("should return undefined config when supplier is not an object", () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(
				JSON.stringify({
					sbom: {
						supplier: null, // should be object
					},
				}),
			);

			const result = loadReleaseConfig("/repo");

			expect(result.config).toBeUndefined();
		});

		it("should return undefined config when copyright is not an object", () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(
				JSON.stringify({
					sbom: {
						copyright: null, // should be object
					},
				}),
			);

			const result = loadReleaseConfig("/repo");

			expect(result.config).toBeUndefined();
		});

		it("should load config from SILK_RELEASE_SBOM_TEMPLATE variable", () => {
			vi.mocked(existsSync).mockReturnValue(false);
			process.env.SILK_RELEASE_SBOM_TEMPLATE = JSON.stringify({
				sbom: { supplier: { name: "Variable Company" } },
			});

			const result = loadReleaseConfig("/repo");

			expect(result.config).toEqual({
				sbom: { supplier: { name: "Variable Company" } },
			});
			expect(result.source.source).toBe("variable");
			expect(result.source.location).toBe("SILK_RELEASE_SBOM_TEMPLATE");
		});

		it("should prefer local file over variable", () => {
			vi.mocked(existsSync).mockImplementation((path) => {
				return String(path).endsWith(".github/silk-release.json");
			});
			vi.mocked(readFileSync).mockReturnValue(
				JSON.stringify({
					sbom: { supplier: { name: "Local Company" } },
				}),
			);
			process.env.SILK_RELEASE_SBOM_TEMPLATE = JSON.stringify({
				sbom: { supplier: { name: "Variable Company" } },
			});

			const result = loadReleaseConfig("/repo");

			expect(result.config?.sbom?.supplier?.name).toBe("Local Company");
			expect(result.source.source).toBe("local");
		});

		it("should return none source when variable has invalid JSON", () => {
			vi.mocked(existsSync).mockReturnValue(false);
			process.env.SILK_RELEASE_SBOM_TEMPLATE = "invalid json";

			const result = loadReleaseConfig("/repo");

			expect(result.config).toBeUndefined();
			expect(result.source.source).toBe("none");
			expect(core.warning).toHaveBeenCalled();
		});

		it("should return none source when variable has invalid sbom config", () => {
			vi.mocked(existsSync).mockReturnValue(false);
			process.env.SILK_RELEASE_SBOM_TEMPLATE = JSON.stringify({
				sbom: { supplier: { name: 123 } }, // invalid
			});

			const result = loadReleaseConfig("/repo");

			expect(result.config).toBeUndefined();
			expect(result.source.source).toBe("none");
		});

		it("should reject unwrapped SBOM config from environment variable with helpful error", () => {
			vi.mocked(existsSync).mockReturnValue(false);
			// Config without the 'sbom' wrapper - direct SBOM config at root level
			process.env.SILK_RELEASE_SBOM_TEMPLATE = JSON.stringify({
				supplier: { name: "Unwrapped Company", url: "https://example.com" },
				copyright: { holder: "Unwrapped LLC" },
			});

			const result = loadReleaseConfig("/repo");

			expect(result.config).toBeUndefined();
			expect(result.source.source).toBe("none");
			expect(core.warning).toHaveBeenCalledWith(
				expect.stringContaining("Found SBOM fields (supplier, copyright) at root level"),
			);
			expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('must be wrapped in an "sbom" key'));
		});

		it("should reject unwrapped config with single SBOM field", () => {
			vi.mocked(existsSync).mockReturnValue(false);
			process.env.SILK_RELEASE_SBOM_TEMPLATE = JSON.stringify({
				publisher: "Test Publisher",
			});

			const result = loadReleaseConfig("/repo");

			expect(result.config).toBeUndefined();
			expect(result.source.source).toBe("none");
			expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Found SBOM fields (publisher) at root level"));
		});

		it("should reject unwrapped config with documentationUrl field", () => {
			vi.mocked(existsSync).mockReturnValue(false);
			process.env.SILK_RELEASE_SBOM_TEMPLATE = JSON.stringify({
				documentationUrl: "https://docs.example.com",
			});

			const result = loadReleaseConfig("/repo");

			expect(result.config).toBeUndefined();
			expect(result.source.source).toBe("none");
			expect(core.warning).toHaveBeenCalledWith(
				expect.stringContaining("Found SBOM fields (documentationUrl) at root level"),
			);
		});

		it("should include schema URL in unwrapped config error message", () => {
			vi.mocked(existsSync).mockReturnValue(false);
			process.env.SILK_RELEASE_SBOM_TEMPLATE = JSON.stringify({
				supplier: { name: "Test" },
			});

			loadReleaseConfig("/repo");

			expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("silk-release.schema.json"));
		});

		it("should accept config that has sbom key along with other non-SBOM root fields", () => {
			vi.mocked(existsSync).mockReturnValue(false);
			// Config with sbom key should be accepted even if there are also extra root-level fields
			process.env.SILK_RELEASE_SBOM_TEMPLATE = JSON.stringify({
				sbom: { supplier: { name: "Wrapped Company" } },
				someOtherField: "value", // Non-SBOM field is fine
			});

			const result = loadReleaseConfig("/repo");

			expect(result.config?.sbom?.supplier?.name).toBe("Wrapped Company");
			expect(result.source.source).toBe("variable");
		});

		it("should also reject unwrapped config in local files", () => {
			vi.mocked(existsSync).mockImplementation((path) => {
				return String(path).endsWith(".github/silk-release.json");
			});
			vi.mocked(readFileSync).mockReturnValue(
				JSON.stringify({
					supplier: { name: "Local Unwrapped" },
				}),
			);

			const result = loadReleaseConfig("/repo");

			expect(result.config).toBeUndefined();
			expect(result.source.source).toBe("none");
			expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Found SBOM fields (supplier) at root level"));
		});

		it("should load config from sbom-config action input", () => {
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(core.getInput).mockReturnValue(
				JSON.stringify({
					sbom: { supplier: { name: "Input Company" } },
				}),
			);

			const result = loadReleaseConfig("/repo");

			expect(result.config).toEqual({
				sbom: { supplier: { name: "Input Company" } },
			});
			expect(result.source.source).toBe("input");
			expect(result.source.location).toBe("sbom-config");
		});

		it("should prefer local file over action input", () => {
			vi.mocked(existsSync).mockImplementation((path) => {
				return String(path).endsWith(".github/silk-release.json");
			});
			vi.mocked(readFileSync).mockReturnValue(
				JSON.stringify({
					sbom: { supplier: { name: "Local Company" } },
				}),
			);
			vi.mocked(core.getInput).mockReturnValue(
				JSON.stringify({
					sbom: { supplier: { name: "Input Company" } },
				}),
			);

			const result = loadReleaseConfig("/repo");

			expect(result.config?.sbom?.supplier?.name).toBe("Local Company");
			expect(result.source.source).toBe("local");
		});

		it("should prefer action input over environment variable", () => {
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(core.getInput).mockReturnValue(
				JSON.stringify({
					sbom: { supplier: { name: "Input Company" } },
				}),
			);
			process.env.SILK_RELEASE_SBOM_TEMPLATE = JSON.stringify({
				sbom: { supplier: { name: "Env Company" } },
			});

			const result = loadReleaseConfig("/repo");

			expect(result.config?.sbom?.supplier?.name).toBe("Input Company");
			expect(result.source.source).toBe("input");
		});

		it("should handle empty sbom-config input", () => {
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(core.getInput).mockReturnValue("");

			const result = loadReleaseConfig("/repo");

			expect(result.config).toBeUndefined();
			expect(result.source.source).toBe("none");
		});

		it("should handle getInput throwing (not in action context)", () => {
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(core.getInput).mockImplementation(() => {
				throw new Error("Input required and not supplied: sbom-config");
			});
			process.env.SILK_RELEASE_SBOM_TEMPLATE = JSON.stringify({
				sbom: { supplier: { name: "Fallback Env" } },
			});

			const result = loadReleaseConfig("/repo");

			// Should fall back to env var
			expect(result.config?.sbom?.supplier?.name).toBe("Fallback Env");
			expect(result.source.source).toBe("variable");
		});

		it("should log supplier name when loading from input", () => {
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(core.getInput).mockReturnValue(
				JSON.stringify({
					sbom: { supplier: { name: "Test Supplier Inc" } },
				}),
			);

			loadReleaseConfig("/repo");

			expect(core.info).toHaveBeenCalledWith("  Supplier: Test Supplier Inc");
		});
	});

	describe("loadSBOMConfig", () => {
		it("should return sbom section from release config", () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(
				JSON.stringify({
					sbom: {
						supplier: { name: "Test Company" },
					},
				}),
			);

			const result = loadSBOMConfig("/repo");

			expect(result).toEqual({
				supplier: { name: "Test Company" },
			});
		});

		it("should return undefined when no release config", () => {
			vi.mocked(existsSync).mockReturnValue(false);

			const result = loadSBOMConfig("/repo");

			expect(result).toBeUndefined();
		});

		it("should return undefined when no sbom section in config", () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(JSON.stringify({}));

			const result = loadSBOMConfig("/repo");

			expect(result).toBeUndefined();
		});

		it("should load from variable when local file not found", () => {
			vi.mocked(existsSync).mockReturnValue(false);
			process.env.SILK_RELEASE_SBOM_TEMPLATE = JSON.stringify({
				sbom: { supplier: { name: "Variable Company" } },
			});

			const result = loadSBOMConfig("/repo");

			expect(result).toEqual({
				supplier: { name: "Variable Company" },
			});
		});
	});
});
