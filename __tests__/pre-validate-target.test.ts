import * as fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedTarget } from "../src/types/publish-config.js";
import { preValidateTarget } from "../src/utils/pre-validate-target.js";
import { cleanupTestEnvironment, setupTestEnvironment } from "./utils/github-mocks.js";

// Mock modules
vi.mock("@actions/core");
vi.mock("node:fs");

describe("pre-validate-target", () => {
	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });
	});

	afterEach(() => {
		cleanupTestEnvironment();
	});

	describe("preValidateTarget", () => {
		it("returns error when directory does not exist", async () => {
			vi.mocked(fs.existsSync).mockReturnValue(false);

			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/nonexistent/dir",
				access: "public",
				provenance: true,
				tag: "latest",
				tokenEnv: "NPM_TOKEN",
			};

			const result = await preValidateTarget(target, "@test/package", "1.0.0");

			expect(result.valid).toBe(false);
			expect(result.directoryExists).toBe(false);
			expect(result.errors).toContain("Target directory does not exist: /nonexistent/dir");
		});

		it("returns error when package.json does not exist", async () => {
			vi.mocked(fs.existsSync).mockImplementation((filePath) => {
				const path = String(filePath);
				if (path.includes("package.json")) return false;
				return true; // Directory exists
			});

			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: true,
				tag: "latest",
				tokenEnv: "NPM_TOKEN",
			};

			const result = await preValidateTarget(target, "@test/package", "1.0.0");

			expect(result.valid).toBe(false);
			expect(result.directoryExists).toBe(true);
			expect(result.packageJsonExists).toBe(false);
			expect(result.errors[0]).toContain("package.json not found");
		});

		it("returns error when package.json is invalid JSON", async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue("invalid json {");

			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: true,
				tag: "latest",
				tokenEnv: "NPM_TOKEN",
			};

			const result = await preValidateTarget(target, "@test/package", "1.0.0");

			expect(result.valid).toBe(false);
			expect(result.packageJsonExists).toBe(true);
			expect(result.packageJsonValid).toBe(false);
			expect(result.errors[0]).toContain("Failed to parse package.json");
		});

		describe("npm protocol validation", () => {
			it("validates npm package.json successfully", async () => {
				vi.mocked(fs.existsSync).mockReturnValue(true);
				vi.mocked(fs.readFileSync).mockReturnValue(
					JSON.stringify({
						name: "@test/package",
						version: "1.0.0",
					}),
				);

				const target: ResolvedTarget = {
					protocol: "npm",
					registry: "https://registry.npmjs.org/",
					directory: "/test/dist",
					access: "public",
					provenance: true,
					tag: "latest",
					tokenEnv: "NPM_TOKEN",
				};

				const result = await preValidateTarget(target, "@test/package", "1.0.0");

				expect(result.valid).toBe(true);
				expect(result.errors).toHaveLength(0);
				expect(result.builtPackageJson?.name).toBe("@test/package");
			});

			it("returns error for private package", async () => {
				vi.mocked(fs.existsSync).mockReturnValue(true);
				vi.mocked(fs.readFileSync).mockReturnValue(
					JSON.stringify({
						name: "@test/package",
						version: "1.0.0",
						private: true,
					}),
				);

				const target: ResolvedTarget = {
					protocol: "npm",
					registry: "https://registry.npmjs.org/",
					directory: "/test/dist",
					access: "public",
					provenance: true,
					tag: "latest",
					tokenEnv: "NPM_TOKEN",
				};

				const result = await preValidateTarget(target, "@test/package", "1.0.0");

				expect(result.valid).toBe(false);
				expect(result.errors[0]).toContain("private");
			});

			it("returns error for missing name", async () => {
				vi.mocked(fs.existsSync).mockReturnValue(true);
				vi.mocked(fs.readFileSync).mockReturnValue(
					JSON.stringify({
						version: "1.0.0",
					}),
				);

				const target: ResolvedTarget = {
					protocol: "npm",
					registry: "https://registry.npmjs.org/",
					directory: "/test/dist",
					access: "public",
					provenance: true,
					tag: "latest",
					tokenEnv: "NPM_TOKEN",
				};

				const result = await preValidateTarget(target, "@test/package", "1.0.0");

				expect(result.valid).toBe(false);
				expect(result.errors).toContain("Built package.json missing 'name' field");
			});

			it("returns error for missing version", async () => {
				vi.mocked(fs.existsSync).mockReturnValue(true);
				vi.mocked(fs.readFileSync).mockReturnValue(
					JSON.stringify({
						name: "@test/package",
					}),
				);

				const target: ResolvedTarget = {
					protocol: "npm",
					registry: "https://registry.npmjs.org/",
					directory: "/test/dist",
					access: "public",
					provenance: true,
					tag: "latest",
					tokenEnv: "NPM_TOKEN",
				};

				const result = await preValidateTarget(target, "@test/package", "1.0.0");

				expect(result.valid).toBe(false);
				expect(result.errors).toContain("Built package.json missing 'version' field");
			});

			it("warns on name mismatch", async () => {
				vi.mocked(fs.existsSync).mockReturnValue(true);
				vi.mocked(fs.readFileSync).mockReturnValue(
					JSON.stringify({
						name: "@different/package",
						version: "1.0.0",
					}),
				);

				const target: ResolvedTarget = {
					protocol: "npm",
					registry: "https://registry.npmjs.org/",
					directory: "/test/dist",
					access: "public",
					provenance: true,
					tag: "latest",
					tokenEnv: "NPM_TOKEN",
				};

				const result = await preValidateTarget(target, "@test/package", "1.0.0");

				expect(result.valid).toBe(true); // Warning, not error
				expect(result.warnings[0]).toContain("Package name mismatch");
			});

			it("requires scoped name for GitHub Packages", async () => {
				vi.mocked(fs.existsSync).mockReturnValue(true);
				vi.mocked(fs.readFileSync).mockReturnValue(
					JSON.stringify({
						name: "unscoped-package",
						version: "1.0.0",
					}),
				);

				const target: ResolvedTarget = {
					protocol: "npm",
					registry: "https://npm.pkg.github.com/",
					directory: "/test/dist",
					access: "restricted",
					provenance: false,
					tag: "latest",
					tokenEnv: "GITHUB_TOKEN",
				};

				const result = await preValidateTarget(target, "unscoped-package", "1.0.0");

				expect(result.valid).toBe(false);
				expect(result.errors[0]).toContain("GitHub Packages requires scoped package names");
			});
		});

		describe("jsr protocol validation", () => {
			it("validates JSR package.json successfully", async () => {
				vi.mocked(fs.existsSync).mockReturnValue(true);
				vi.mocked(fs.readFileSync).mockReturnValue(
					JSON.stringify({
						name: "@test/package",
						version: "1.0.0",
						exports: {
							".": "./index.ts",
						},
					}),
				);

				const target: ResolvedTarget = {
					protocol: "jsr",
					registry: null,
					directory: "/test/dist/jsr",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: "JSR_TOKEN",
				};

				const result = await preValidateTarget(target, "@test/package", "1.0.0");

				expect(result.valid).toBe(true);
				expect(result.errors).toHaveLength(0);
			});

			it("requires scoped name for JSR", async () => {
				vi.mocked(fs.existsSync).mockReturnValue(true);
				vi.mocked(fs.readFileSync).mockReturnValue(
					JSON.stringify({
						name: "unscoped-package",
						version: "1.0.0",
						exports: {
							".": "./index.ts",
						},
					}),
				);

				const target: ResolvedTarget = {
					protocol: "jsr",
					registry: null,
					directory: "/test/dist/jsr",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: "JSR_TOKEN",
				};

				const result = await preValidateTarget(target, "unscoped-package", "1.0.0");

				expect(result.valid).toBe(false);
				expect(result.errors[0]).toContain("JSR requires scoped package names");
			});

			it("requires exports field for JSR", async () => {
				vi.mocked(fs.existsSync).mockReturnValue(true);
				vi.mocked(fs.readFileSync).mockReturnValue(
					JSON.stringify({
						name: "@test/package",
						version: "1.0.0",
					}),
				);

				const target: ResolvedTarget = {
					protocol: "jsr",
					registry: null,
					directory: "/test/dist/jsr",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: "JSR_TOKEN",
				};

				const result = await preValidateTarget(target, "@test/package", "1.0.0");

				expect(result.valid).toBe(false);
				expect(result.errors).toContain("JSR requires 'exports' field in package.json");
			});

			it("falls back to jsr.json when package.json is missing", async () => {
				vi.mocked(fs.existsSync).mockImplementation((filePath) => {
					const path = String(filePath);
					if (path.endsWith("package.json")) return false;
					if (path.endsWith("jsr.json")) return true;
					return true; // Directory exists
				});
				vi.mocked(fs.readFileSync).mockReturnValue(
					JSON.stringify({
						name: "@test/jsr-package",
						version: "1.0.0",
						exports: {
							".": "./mod.ts",
						},
					}),
				);

				const target: ResolvedTarget = {
					protocol: "jsr",
					registry: null,
					directory: "/test/dist/jsr",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: "JSR_TOKEN",
				};

				const result = await preValidateTarget(target, "@test/jsr-package", "1.0.0");

				expect(result.valid).toBe(true);
			});

			it("validates jsr.json content", async () => {
				vi.mocked(fs.existsSync).mockImplementation((filePath) => {
					const path = String(filePath);
					if (path.endsWith("package.json")) return false;
					if (path.endsWith("jsr.json")) return true;
					return true;
				});
				vi.mocked(fs.readFileSync).mockReturnValue(
					JSON.stringify({
						name: "unscoped", // Invalid - needs scope
						version: "1.0.0",
						exports: {},
					}),
				);

				const target: ResolvedTarget = {
					protocol: "jsr",
					registry: null,
					directory: "/test/dist/jsr",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: "JSR_TOKEN",
				};

				const result = await preValidateTarget(target, "@test/package", "1.0.0");

				expect(result.valid).toBe(false);
				expect(result.errors[0]).toContain("JSR requires scoped names");
			});

			it("handles invalid jsr.json", async () => {
				vi.mocked(fs.existsSync).mockImplementation((filePath) => {
					const path = String(filePath);
					if (path.endsWith("package.json")) return false;
					if (path.endsWith("jsr.json")) return true;
					return true;
				});
				vi.mocked(fs.readFileSync).mockReturnValue("invalid json {");

				const target: ResolvedTarget = {
					protocol: "jsr",
					registry: null,
					directory: "/test/dist/jsr",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: "JSR_TOKEN",
				};

				const result = await preValidateTarget(target, "@test/package", "1.0.0");

				expect(result.valid).toBe(false);
				expect(result.errors[0]).toContain("Failed to parse jsr.json");
			});

			it("validates jsr.json with missing required fields", async () => {
				vi.mocked(fs.existsSync).mockImplementation((filePath) => {
					const path = String(filePath);
					if (path.endsWith("package.json")) return false;
					if (path.endsWith("jsr.json")) return true;
					return true;
				});
				vi.mocked(fs.readFileSync).mockReturnValue(
					JSON.stringify({
						// Missing name, version, exports
					}),
				);

				const target: ResolvedTarget = {
					protocol: "jsr",
					registry: null,
					directory: "/test/dist/jsr",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: "JSR_TOKEN",
				};

				const result = await preValidateTarget(target, "@test/package", "1.0.0");

				expect(result.valid).toBe(false);
				expect(result.errors).toContain("jsr.json missing 'name' field");
				expect(result.errors).toContain("jsr.json missing 'version' field");
				expect(result.errors).toContain("jsr.json missing 'exports' field");
			});
		});

		describe("unknown protocol", () => {
			it("returns valid for unknown protocol", async () => {
				vi.mocked(fs.existsSync).mockReturnValue(true);
				vi.mocked(fs.readFileSync).mockReturnValue(
					JSON.stringify({
						name: "@test/package",
						version: "1.0.0",
					}),
				);

				const target = {
					protocol: "other",
					registry: null,
					directory: "/test/dist",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: null,
				} as unknown as ResolvedTarget;

				const result = await preValidateTarget(target, "@test/package", "1.0.0");

				expect(result.valid).toBe(true);
				expect(result.builtPackageJson).toBeDefined();
			});
		});

		describe("getRegistryDisplayName helper", () => {
			it("handles custom registry URLs", async () => {
				vi.mocked(fs.existsSync).mockReturnValue(true);
				vi.mocked(fs.readFileSync).mockReturnValue(
					JSON.stringify({
						name: "@test/package",
						version: "1.0.0",
						private: true, // This will trigger an error message containing registry name
					}),
				);

				const target: ResolvedTarget = {
					protocol: "npm",
					registry: "https://custom.example.com/npm/",
					directory: "/test/dist",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: "CUSTOM_TOKEN",
				};

				const result = await preValidateTarget(target, "@test/package", "1.0.0");

				expect(result.valid).toBe(false);
				// Error message should contain custom registry display name
				expect(result.errors[0]).toContain("custom.example.com");
			});

			it("handles invalid registry URL gracefully", async () => {
				vi.mocked(fs.existsSync).mockReturnValue(true);
				vi.mocked(fs.readFileSync).mockReturnValue(
					JSON.stringify({
						name: "@test/package",
						version: "1.0.0",
						private: true,
					}),
				);

				const target: ResolvedTarget = {
					protocol: "npm",
					registry: "not-a-valid-url",
					directory: "/test/dist",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: "CUSTOM_TOKEN",
				};

				const result = await preValidateTarget(target, "@test/package", "1.0.0");

				expect(result.valid).toBe(false);
				// Should fallback to showing registry string directly
				expect(result.errors[0]).toContain("not-a-valid-url");
			});

			it("handles null registry", async () => {
				vi.mocked(fs.existsSync).mockReturnValue(true);
				vi.mocked(fs.readFileSync).mockReturnValue(
					JSON.stringify({
						name: "@test/package",
						version: "1.0.0",
						private: true,
					}),
				);

				const target: ResolvedTarget = {
					protocol: "npm",
					registry: null,
					directory: "/test/dist",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: "NPM_TOKEN",
				};

				const result = await preValidateTarget(target, "@test/package", "1.0.0");

				expect(result.valid).toBe(false);
				expect(result.errors[0]).toContain("unknown");
			});
		});

		describe("JSR missing name in package.json", () => {
			it("returns error for missing name in JSR package.json", async () => {
				vi.mocked(fs.existsSync).mockReturnValue(true);
				vi.mocked(fs.readFileSync).mockReturnValue(
					JSON.stringify({
						version: "1.0.0",
						exports: { ".": "./index.ts" },
					}),
				);

				const target: ResolvedTarget = {
					protocol: "jsr",
					registry: null,
					directory: "/test/dist/jsr",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: "JSR_TOKEN",
				};

				const result = await preValidateTarget(target, "@test/package", "1.0.0");

				expect(result.valid).toBe(false);
				expect(result.errors).toContain("Built package.json missing 'name' field");
			});

			it("returns error for missing version in JSR package.json", async () => {
				vi.mocked(fs.existsSync).mockReturnValue(true);
				vi.mocked(fs.readFileSync).mockReturnValue(
					JSON.stringify({
						name: "@test/package",
						exports: { ".": "./index.ts" },
					}),
				);

				const target: ResolvedTarget = {
					protocol: "jsr",
					registry: null,
					directory: "/test/dist/jsr",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: "JSR_TOKEN",
				};

				const result = await preValidateTarget(target, "@test/package", "1.0.0");

				expect(result.valid).toBe(false);
				expect(result.errors).toContain("Built package.json missing 'version' field");
			});
		});
	});
});
