import * as fs from "node:fs";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { context, getOctokit } from "@actions/github";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getWorkspaces } from "workspace-tools";
import { clearWorkspaceCache } from "../src/utils/find-package-path.js";
import { validateNPMPublish, validatePackageNPMPublish } from "../src/utils/validate-publish-npm.js";
import { cleanupTestEnvironment, createMockOctokit, setupTestEnvironment } from "./utils/github-mocks.js";
import type { ExecOptionsWithListeners, MockOctokit } from "./utils/test-types.js";

// Mock modules
vi.mock("@actions/core");
vi.mock("@actions/exec");
vi.mock("@actions/github");
vi.mock("workspace-tools");
vi.mock("node:fs");

describe("validate-publish-npm", () => {
	let mockOctokit: MockOctokit;

	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });

		// Clear workspace cache before each test
		clearWorkspaceCache();

		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "token") return "test-token";
			return "";
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

		// Default exec mock
		vi.mocked(exec.exec).mockResolvedValue(0);

		// Default workspace-tools mock - empty workspaces
		vi.mocked(getWorkspaces).mockReturnValue([]);

		// Default fs mocks for changeset status temp file
		vi.mocked(fs.existsSync).mockImplementation((path) => {
			const pathStr = String(path);
			return pathStr.includes(".changeset-status");
		});
		vi.mocked(fs.readFileSync).mockImplementation((path) => {
			const pathStr = String(path);
			if (pathStr.includes(".changeset-status")) {
				return JSON.stringify({ releases: [], changesets: [] });
			}
			return "";
		});
		vi.mocked(fs.unlinkSync).mockImplementation(() => {});
	});

	afterEach(() => {
		cleanupTestEnvironment();
		clearWorkspaceCache();
	});

	describe("validatePackageNPMPublish", () => {
		it("should validate package ready for NPM publish", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				if (cmd === "cat") {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg",
									version: "1.0.0",
									publishConfig: { access: "public" },
								}),
							),
						);
					}
				}
				if (cmd === "npm" && args?.includes("publish")) {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(Buffer.from(JSON.stringify({ id: "@test/pkg@1.0.0", provenance: true })));
					}
				}
				return 0;
			});

			const result = await validatePackageNPMPublish("/path/to/pkg", "@test/pkg", "1.0.0", "pnpm", false);

			expect(result.canPublish).toBe(true);
			expect(result.message).toContain("Ready for NPM publish");
			expect(result.hasProvenance).toBe(true);
		});

		it("should reject private packages", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, _args, options?: ExecOptionsWithListeners) => {
				if (cmd === "cat") {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/private-pkg",
									private: true,
								}),
							),
						);
					}
				}
				return 0;
			});

			const result = await validatePackageNPMPublish("/path/to/pkg", "@test/private-pkg", "1.0.0", "pnpm", false);

			expect(result.canPublish).toBe(false);
			expect(result.message).toContain("Not publishable");
		});

		it("should reject packages without publishConfig.access", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, _args, options?: ExecOptionsWithListeners) => {
				if (cmd === "cat") {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg",
									version: "1.0.0",
								}),
							),
						);
					}
				}
				return 0;
			});

			const result = await validatePackageNPMPublish("/path/to/pkg", "@test/pkg", "1.0.0", "pnpm", false);

			expect(result.canPublish).toBe(false);
			expect(result.message).toContain("Not publishable");
		});

		it("should skip publish validation in dry-run mode", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, _args, options?: ExecOptionsWithListeners) => {
				if (cmd === "cat") {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg",
									publishConfig: { access: "public" },
								}),
							),
						);
					}
				}
				return 0;
			});

			const result = await validatePackageNPMPublish("/path/to/pkg", "@test/pkg", "1.0.0", "pnpm", true);

			expect(result.canPublish).toBe(true);
			expect(core.info).toHaveBeenCalledWith(expect.stringContaining("[DRY RUN]"));
		});

		it("should detect version conflicts", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				if (cmd === "cat") {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg",
									publishConfig: { access: "public" },
								}),
							),
						);
					}
				}
				if (cmd === "npm" && args?.includes("publish")) {
					if (options?.listeners?.stderr) {
						options.listeners.stderr(Buffer.from("cannot publish over previously published version"));
					}
				}
				return 0;
			});

			const result = await validatePackageNPMPublish("/path/to/pkg", "@test/pkg", "1.0.0", "pnpm", false);

			expect(result.canPublish).toBe(false);
			expect(result.message).toContain("Version conflict");
		});

		it("should handle auth errors", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				if (cmd === "cat") {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg",
									publishConfig: { access: "public" },
								}),
							),
						);
					}
					return 0;
				}
				if (cmd === "npm" && args?.includes("publish")) {
					if (options?.listeners?.stderr) {
						options.listeners.stderr(Buffer.from("ENEEDAUTH: authentication required"));
					}
					return 1;
				}
				return 0;
			});

			const result = await validatePackageNPMPublish("/path/to/pkg", "@test/pkg", "1.0.0", "pnpm", false);

			expect(result.canPublish).toBe(false);
			expect(result.message).toContain("NPM authentication required");
		});

		it("should handle restricted publishConfig.access", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, _args, options?: ExecOptionsWithListeners) => {
				if (cmd === "cat") {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg",
									publishConfig: { access: "restricted" },
								}),
							),
						);
					}
				}
				return 0;
			});

			const result = await validatePackageNPMPublish("/path/to/pkg", "@test/pkg", "1.0.0", "pnpm", true);

			expect(result.canPublish).toBe(true);
		});
	});

	describe("validateNPMPublish", () => {
		it("should validate all packages successfully", async () => {
			// Mock workspace-tools to return a package
			vi.mocked(getWorkspaces).mockReturnValue([
				{
					name: "@test/pkg",
					path: "/path/to/pkg",
					packageJson: { name: "@test/pkg", version: "1.0.0", packageJsonPath: "/path/to/pkg/package.json" },
				},
			]);

			// Mock fs to return changeset status
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes(".changeset-status")) {
					return JSON.stringify({
						releases: [{ name: "@test/pkg", newVersion: "1.0.0", type: "minor" }],
						changesets: [],
					});
				}
				return "";
			});

			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				// cat for package.json
				if (cmd === "cat") {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg",
									publishConfig: { access: "public" },
								}),
							),
						);
					}
					return 0;
				}
				// npm publish --dry-run
				if (cmd === "npm" && args?.includes("publish")) {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(Buffer.from("provenance: true"));
					}
					return 0;
				}
				return 0;
			});

			const result = await validateNPMPublish("pnpm", "main", false);

			expect(result.success).toBe(true);
			expect(result.results).toHaveLength(1);
			expect(result.checkId).toBe(12345);
		});

		it("should handle no packages to validate", async () => {
			// Default fs mock already returns empty releases
			const result = await validateNPMPublish("pnpm", "main", false);

			// No packages = success (nothing to validate)
			expect(result.success).toBe(true);
			expect(result.results).toHaveLength(0);
		});

		it("should include dry-run in check name", async () => {
			// Default fs mock already returns empty releases
			await validateNPMPublish("pnpm", "main", true);

			expect(mockOctokit.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					name: expect.stringContaining("Dry Run"),
				}),
			);
		});

		it("should use yarn command for yarn package manager", async () => {
			await validateNPMPublish("yarn", "main", false);

			// Command uses a temp filename: --output=.changeset-status-{timestamp}.json
			expect(exec.exec).toHaveBeenCalledWith(
				"yarn",
				expect.arrayContaining(["changeset", "status"]),
				expect.any(Object),
			);
		});

		it("should skip packages when path is not found", async () => {
			// workspace-tools returns empty array (no matching package)
			vi.mocked(getWorkspaces).mockReturnValue([]);

			// Mock fs to return a release
			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes(".changeset-status")) {
					return JSON.stringify({
						releases: [{ name: "@test/unknown-pkg", newVersion: "1.0.0", type: "minor" }],
						changesets: [],
					});
				}
				return "";
			});

			await validateNPMPublish("pnpm", "main", false);

			expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Could not find"));
		});

		it("should use npm run for npm package manager", async () => {
			await validateNPMPublish("npm", "main", false);

			// Command uses a temp filename: --output=.changeset-status-{timestamp}.json
			expect(exec.exec).toHaveBeenCalledWith(
				"npm",
				expect.arrayContaining(["run", "changeset", "status"]),
				expect.any(Object),
			);
		});
	});

	describe("validatePackageNPMPublish additional cases", () => {
		it("should handle invalid publishConfig.access values", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, _args, options?: ExecOptionsWithListeners) => {
				if (cmd === "cat") {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg",
									publishConfig: { access: "invalid-value" },
								}),
							),
						);
					}
				}
				return 0;
			});

			const result = await validatePackageNPMPublish("/path/to/pkg", "@test/pkg", "1.0.0", "pnpm", false);

			expect(result.canPublish).toBe(false);
		});

		it("should handle E404 errors", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				if (cmd === "cat") {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg",
									publishConfig: { access: "public" },
								}),
							),
						);
					}
					return 0;
				}
				if (cmd === "npm" && args?.includes("publish")) {
					if (options?.listeners?.stderr) {
						options.listeners.stderr(Buffer.from("E404: Package not found"));
					}
					return 1;
				}
				return 0;
			});

			const result = await validatePackageNPMPublish("/path/to/pkg", "@test/pkg", "1.0.0", "pnpm", false);

			expect(result.canPublish).toBe(false);
			expect(result.message).toContain("not found");
		});

		it("should handle provenance errors", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				if (cmd === "cat") {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg",
									publishConfig: { access: "public" },
								}),
							),
						);
					}
					return 0;
				}
				if (cmd === "npm" && args?.includes("publish")) {
					if (options?.listeners?.stderr) {
						options.listeners.stderr(Buffer.from("provenance: Error generating attestation"));
					}
					return 1;
				}
				return 0;
			});

			const result = await validatePackageNPMPublish("/path/to/pkg", "@test/pkg", "1.0.0", "pnpm", false);

			expect(result.canPublish).toBe(false);
			expect(result.message).toContain("Provenance");
		});

		it("should handle general publish errors", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				if (cmd === "cat") {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg",
									publishConfig: { access: "public" },
								}),
							),
						);
					}
					return 0;
				}
				if (cmd === "npm" && args?.includes("publish")) {
					if (options?.listeners?.stderr) {
						options.listeners.stderr(Buffer.from("Some other error occurred\nMore details"));
					}
					return 1;
				}
				return 0;
			});

			const result = await validatePackageNPMPublish("/path/to/pkg", "@test/pkg", "1.0.0", "pnpm", false);

			expect(result.canPublish).toBe(false);
			expect(result.message).toContain("Publish validation failed");
		});

		it("should handle publish exec throwing error", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args) => {
				if (cmd === "cat") {
					return 0;
				}
				if (cmd === "npm" && args?.includes("publish")) {
					throw new Error("Network timeout");
				}
				return 0;
			});

			// Mock cat to return package.json with publishConfig
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				if (cmd === "cat") {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg",
									publishConfig: { access: "public" },
								}),
							),
						);
					}
					return 0;
				}
				if (cmd === "npm" && args?.includes("publish")) {
					throw new Error("Network timeout");
				}
				return 0;
			});

			const result = await validatePackageNPMPublish("/path/to/pkg", "@test/pkg", "1.0.0", "pnpm", false);

			expect(result.canPublish).toBe(false);
		});

		it("should find package via workspace-tools", async () => {
			// Mock workspace-tools to return a package
			vi.mocked(getWorkspaces).mockReturnValue([
				{
					name: "@test/my-pkg",
					path: "/path/to/packages/my-pkg",
					packageJson: {
						name: "@test/my-pkg",
						version: "1.0.0",
						packageJsonPath: "/path/to/packages/my-pkg/package.json",
					},
				},
			]);

			// Mock fs to return changeset status
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes(".changeset-status")) {
					return JSON.stringify({
						releases: [{ name: "@test/my-pkg", newVersion: "1.0.0", type: "minor" }],
						changesets: [],
					});
				}
				return "";
			});

			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				// cat for package.json
				if (cmd === "cat") {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/my-pkg",
									publishConfig: { access: "public" },
								}),
							),
						);
					}
					return 0;
				}
				// npm publish
				if (cmd === "npm" && args?.includes("publish")) {
					return 0;
				}
				return 0;
			});

			const result = await validateNPMPublish("pnpm", "main", false);

			expect(result.results).toHaveLength(1);
		});

		it("should handle version conflict in stderr with alternate message", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				if (cmd === "cat") {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg",
									publishConfig: { access: "public" },
								}),
							),
						);
					}
					return 0;
				}
				if (cmd === "npm" && args?.includes("publish")) {
					if (options?.listeners?.stderr) {
						options.listeners.stderr(Buffer.from("You cannot publish over the previously published versions"));
					}
					return 0;
				}
				return 0;
			});

			const result = await validatePackageNPMPublish("/path/to/pkg", "@test/pkg", "1.0.0", "pnpm", false);

			expect(result.canPublish).toBe(false);
			expect(result.message).toContain("Version conflict");
		});

		it("should log changeset status stderr to debug", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				if (cmd === "pnpm" && args?.includes("changeset")) {
					// Emit stderr output to trigger the debug branch
					if (options?.listeners?.stderr) {
						options.listeners.stderr(Buffer.from("npm warn some warning"));
					}
					if (options?.listeners?.stdout) {
						options.listeners.stdout(Buffer.from(JSON.stringify({ releases: [], changesets: [] })));
					}
				}
				return 0;
			});

			await validateNPMPublish("pnpm", "main", false);

			expect(core.debug).toHaveBeenCalledWith(expect.stringContaining("changeset status stderr"));
		});

		it("should report failure check summary when some packages fail", async () => {
			// Mock workspace-tools to return both packages
			vi.mocked(getWorkspaces).mockReturnValue([
				{
					name: "@test/pkg-a",
					path: "/path/to/pkg-a",
					packageJson: {
						name: "@test/pkg-a",
						version: "1.0.0",
						packageJsonPath: "/path/to/pkg-a/package.json",
					},
				},
				{
					name: "@test/pkg-b",
					path: "/path/to/pkg-b",
					packageJson: {
						name: "@test/pkg-b",
						version: "2.0.0",
						packageJsonPath: "/path/to/pkg-b/package.json",
					},
				},
			]);

			// Mock fs to return changeset status with two packages
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes(".changeset-status")) {
					return JSON.stringify({
						releases: [
							{ name: "@test/pkg-a", newVersion: "1.0.0", type: "minor" },
							{ name: "@test/pkg-b", newVersion: "2.0.0", type: "major" },
						],
						changesets: [],
					});
				}
				return "";
			});

			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				// cat for package.json - first pkg is publishable, second is private
				if (cmd === "cat") {
					if (args?.[0]?.includes("pkg-a")) {
						if (options?.listeners?.stdout) {
							options.listeners.stdout(
								Buffer.from(
									JSON.stringify({
										name: "@test/pkg-a",
										publishConfig: { access: "public" },
									}),
								),
							);
						}
					} else {
						if (options?.listeners?.stdout) {
							options.listeners.stdout(
								Buffer.from(
									JSON.stringify({
										name: "@test/pkg-b",
										private: true,
									}),
								),
							);
						}
					}
					return 0;
				}
				// npm publish
				if (cmd === "npm" && args?.includes("publish")) {
					return 0;
				}
				return 0;
			});

			const result = await validateNPMPublish("pnpm", "main", false);

			expect(result.success).toBe(false);
			expect(result.results).toHaveLength(2);
			expect(mockOctokit.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					conclusion: "failure",
				}),
			);
		});

		it("should find nested package via workspace-tools", async () => {
			// Mock workspace-tools to return a nested package
			vi.mocked(getWorkspaces).mockReturnValue([
				{
					name: "@test/nested-pkg",
					path: "/path/to/packages/nested/nested-pkg",
					packageJson: {
						name: "@test/nested-pkg",
						version: "1.0.0",
						packageJsonPath: "/path/to/packages/nested/nested-pkg/package.json",
					},
				},
			]);

			// Mock fs to return changeset status
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes(".changeset-status")) {
					return JSON.stringify({
						releases: [{ name: "@test/nested-pkg", newVersion: "1.0.0", type: "minor" }],
						changesets: [],
					});
				}
				return "";
			});

			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				// cat for package.json
				if (cmd === "cat") {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/nested-pkg",
									publishConfig: { access: "public" },
								}),
							),
						);
					}
					return 0;
				}
				// npm publish
				if (cmd === "npm" && args?.includes("publish")) {
					return 0;
				}
				return 0;
			});

			const result = await validateNPMPublish("pnpm", "main", false);

			expect(result.results).toHaveLength(1);
			expect(result.results[0].name).toBe("@test/nested-pkg");
		});

		it("should use dist/npm path for publishable packages", async () => {
			// Mock workspace-tools to return a package
			vi.mocked(getWorkspaces).mockReturnValue([
				{
					name: "@test/resolved-pkg",
					path: "/path/to/packages/resolved-pkg",
					packageJson: {
						name: "@test/resolved-pkg",
						version: "1.0.0",
						packageJsonPath: "/path/to/packages/resolved-pkg/package.json",
					},
				},
			]);

			// Mock fs to return changeset status
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes(".changeset-status")) {
					return JSON.stringify({
						releases: [{ name: "@test/resolved-pkg", newVersion: "1.0.0", type: "minor" }],
						changesets: [],
					});
				}
				return "";
			});

			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				// cat for package.json - note the path includes dist/npm
				if (cmd === "cat") {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/resolved-pkg",
									publishConfig: { access: "public" },
								}),
							),
						);
					}
					return 0;
				}
				// npm publish
				if (cmd === "npm" && args?.includes("publish")) {
					return 0;
				}
				return 0;
			});

			const result = await validateNPMPublish("pnpm", "main", false);

			expect(result.results).toHaveLength(1);
			// The path should include dist/npm subdirectory
			expect(result.results[0].path).toContain("dist/npm");
		});
	});
});
