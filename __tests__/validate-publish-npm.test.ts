import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { context, getOctokit } from "@actions/github";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateNPMPublish, validatePackageNPMPublish } from "../src/utils/validate-publish-npm.js";
import { cleanupTestEnvironment, createMockOctokit, setupTestEnvironment } from "./utils/github-mocks.js";
import type { ExecOptionsWithListeners, MockOctokit } from "./utils/test-types.js";

// Mock modules
vi.mock("@actions/core");
vi.mock("@actions/exec");
vi.mock("@actions/github");

describe("validate-publish-npm", () => {
	let mockOctokit: MockOctokit;

	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });

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
	});

	afterEach(() => {
		cleanupTestEnvironment();
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
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				// Changeset status
				if (cmd === "pnpm" && args?.includes("changeset")) {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/pkg", newVersion: "1.0.0", type: "minor" }],
									changesets: [],
								}),
							),
						);
					}
					return 0;
				}
				// npm list for finding package path
				if (cmd === "npm" && args?.includes("list")) {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									dependencies: {
										"@test/pkg": { path: "/path/to/pkg" },
									},
								}),
							),
						);
					}
					return 0;
				}
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

			const result = await validateNPMPublish("pnpm", false);

			expect(result.success).toBe(true);
			expect(result.results).toHaveLength(1);
			expect(result.checkId).toBe(12345);
		});

		it("should handle no packages to validate", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				if (cmd === "pnpm" && args?.includes("changeset")) {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(Buffer.from(JSON.stringify({ releases: [], changesets: [] })));
					}
				}
				return 0;
			});

			const result = await validateNPMPublish("pnpm", false);

			expect(result.success).toBe(false);
			expect(result.results).toHaveLength(0);
		});

		it("should include dry-run in check name", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				if (cmd === "pnpm" && args?.includes("changeset")) {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(Buffer.from(JSON.stringify({ releases: [], changesets: [] })));
					}
				}
				return 0;
			});

			await validateNPMPublish("pnpm", true);

			expect(mockOctokit.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					name: expect.stringContaining("Dry Run"),
				}),
			);
		});

		it("should use yarn command for yarn package manager", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				if (cmd === "yarn" && args?.includes("changeset")) {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(Buffer.from(JSON.stringify({ releases: [], changesets: [] })));
					}
				}
				return 0;
			});

			await validateNPMPublish("yarn", false);

			expect(exec.exec).toHaveBeenCalledWith("yarn", ["changeset", "status", "--output=json"], expect.any(Object));
		});

		it("should skip packages when path is not found", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				// Changeset status
				if (cmd === "pnpm" && args?.includes("changeset")) {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/unknown-pkg", newVersion: "1.0.0", type: "minor" }],
									changesets: [],
								}),
							),
						);
					}
					return 0;
				}
				// npm list for finding package path - return empty
				if (cmd === "npm" && args?.includes("list")) {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(Buffer.from(JSON.stringify({})));
					}
					return 0;
				}
				// test for package.json existence - all fail
				if (cmd === "test") {
					return 1;
				}
				return 0;
			});

			await validateNPMPublish("pnpm", false);

			expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Could not find path"));
		});

		it("should use npm run for npm package manager", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				if (cmd === "npm" && args?.includes("run") && args?.includes("changeset")) {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(Buffer.from(JSON.stringify({ releases: [], changesets: [] })));
					}
				}
				return 0;
			});

			await validateNPMPublish("npm", false);

			expect(exec.exec).toHaveBeenCalledWith(
				"npm",
				["run", "changeset", "status", "--output=json"],
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

		it("should find package via common monorepo paths when npm list fails", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				// Changeset status
				if (cmd === "pnpm" && args?.includes("changeset")) {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/my-pkg", newVersion: "1.0.0", type: "minor" }],
									changesets: [],
								}),
							),
						);
					}
					return 0;
				}
				// npm list - throws error
				if (cmd === "npm" && args?.includes("list")) {
					throw new Error("npm list failed");
				}
				// test for package.json - packages/my-pkg exists
				if (cmd === "test" && args?.[1]?.includes("packages/my-pkg")) {
					return 0;
				}
				if (cmd === "test") {
					return 1;
				}
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

			const result = await validateNPMPublish("pnpm", false);

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

			await validateNPMPublish("pnpm", false);

			expect(core.debug).toHaveBeenCalledWith(expect.stringContaining("changeset status stderr"));
		});

		it("should report failure check summary when some packages fail", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				// Changeset status - return two packages
				if (cmd === "pnpm" && args?.includes("changeset")) {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									releases: [
										{ name: "@test/pkg-a", newVersion: "1.0.0", type: "minor" },
										{ name: "@test/pkg-b", newVersion: "2.0.0", type: "major" },
									],
									changesets: [],
								}),
							),
						);
					}
					return 0;
				}
				// npm list for finding package paths
				if (cmd === "npm" && args?.includes("list")) {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									dependencies: {
										"@test/pkg-a": { path: "/path/to/pkg-a" },
										"@test/pkg-b": { path: "/path/to/pkg-b" },
									},
								}),
							),
						);
					}
					return 0;
				}
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

			const result = await validateNPMPublish("pnpm", false);

			expect(result.success).toBe(false);
			expect(result.results).toHaveLength(2);
			expect(mockOctokit.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					conclusion: "failure",
				}),
			);
		});

		it("should find package via recursive dependency search", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				// Changeset status
				if (cmd === "pnpm" && args?.includes("changeset")) {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/nested-pkg", newVersion: "1.0.0", type: "minor" }],
									changesets: [],
								}),
							),
						);
					}
					return 0;
				}
				// npm list - return nested structure where package is in a nested dependency
				if (cmd === "npm" && args?.includes("list")) {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									dependencies: {
										"@other/pkg": {
											dependencies: {
												"@test/nested-pkg": { path: "/path/to/nested-pkg" },
											},
										},
									},
								}),
							),
						);
					}
					return 0;
				}
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

			const result = await validateNPMPublish("pnpm", false);

			expect(result.results).toHaveLength(1);
			expect(result.results[0].name).toBe("@test/nested-pkg");
		});

		it("should handle npm list returning dependency with resolved field", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				// Changeset status
				if (cmd === "pnpm" && args?.includes("changeset")) {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/resolved-pkg", newVersion: "1.0.0", type: "minor" }],
									changesets: [],
								}),
							),
						);
					}
					return 0;
				}
				// npm list - return dependency with resolved field instead of path
				if (cmd === "npm" && args?.includes("list")) {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									dependencies: {
										"@test/resolved-pkg": { resolved: "/path/to/resolved-pkg" },
									},
								}),
							),
						);
					}
					return 0;
				}
				// cat for package.json
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

			const result = await validateNPMPublish("pnpm", false);

			expect(result.results).toHaveLength(1);
		});
	});
});
