import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { context, getOctokit } from "@actions/github";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	validatePackageGitHubPublish,
	validatePublishGitHubPackages,
} from "../src/utils/validate-publish-github-packages.js";
import { cleanupTestEnvironment, createMockOctokit, setupTestEnvironment } from "./utils/github-mocks.js";
import type { ExecOptionsWithListeners, MockOctokit } from "./utils/test-types.js";

// Mock modules
vi.mock("@actions/core");
vi.mock("@actions/exec");
vi.mock("@actions/github");

describe("validate-publish-github-packages", () => {
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

	describe("validatePackageGitHubPublish", () => {
		it("should validate scoped package ready for GitHub Packages", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				if (cmd === "cat" && args?.[0] === "package.json") {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg",
									version: "1.0.0",
									publishConfig: { registry: "https://npm.pkg.github.com" },
								}),
							),
						);
					}
				}
				if (cmd === "npm" && args?.includes("publish")) {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(Buffer.from("provenance: published"));
					}
				}
				return 0;
			});

			const result = await validatePackageGitHubPublish("/path/to/pkg", "@test/pkg", "1.0.0", "npm", false);

			expect(result.canPublish).toBe(true);
			expect(result.message).toContain("Ready to publish");
			expect(result.hasProvenance).toBe(true);
		});

		it("should reject non-scoped packages", async () => {
			const result = await validatePackageGitHubPublish("/path/to/pkg", "unscoped-pkg", "1.0.0", "npm", false);

			expect(result.canPublish).toBe(false);
			expect(result.message).toContain("Not publishable");
		});

		it("should reject private packages without registry config", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				if (cmd === "cat" && args?.[0] === "package.json") {
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

			const result = await validatePackageGitHubPublish("/path/to/pkg", "@test/private-pkg", "1.0.0", "npm", false);

			expect(result.canPublish).toBe(false);
		});

		it("should reject packages with non-GitHub registry", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				if (cmd === "cat" && args?.[0] === "package.json") {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg",
									publishConfig: { registry: "https://registry.npmjs.org" },
								}),
							),
						);
					}
				}
				return 0;
			});

			const result = await validatePackageGitHubPublish("/path/to/pkg", "@test/pkg", "1.0.0", "npm", false);

			expect(result.canPublish).toBe(false);
		});

		it("should skip validation in dry-run mode", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				if (cmd === "cat" && args?.[0] === "package.json") {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg",
									publishConfig: { registry: "https://npm.pkg.github.com" },
								}),
							),
						);
					}
				}
				return 0;
			});

			const result = await validatePackageGitHubPublish("/path/to/pkg", "@test/pkg", "1.0.0", "npm", true);

			expect(result.canPublish).toBe(true);
			expect(core.info).toHaveBeenCalledWith(expect.stringContaining("[DRY RUN]"));
		});

		it("should detect version conflicts", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				if (cmd === "cat" && args?.[0] === "package.json") {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg",
									publishConfig: { registry: "https://npm.pkg.github.com" },
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

			const result = await validatePackageGitHubPublish("/path/to/pkg", "@test/pkg", "1.0.0", "npm", false);

			expect(result.canPublish).toBe(false);
			expect(result.message).toContain("already exists");
		});

		it("should handle E404 (first publish) as success", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				if (cmd === "cat" && args?.[0] === "package.json") {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg",
									publishConfig: { registry: "https://npm.pkg.github.com" },
								}),
							),
						);
					}
					return 0;
				}
				if (cmd === "npm" && args?.includes("publish")) {
					if (options?.listeners?.stderr) {
						options.listeners.stderr(Buffer.from("E404 Not found"));
					}
					return 1;
				}
				return 0;
			});

			const result = await validatePackageGitHubPublish("/path/to/pkg", "@test/pkg", "1.0.0", "npm", false);

			expect(result.canPublish).toBe(true);
			expect(result.message).toContain("first publish");
		});

		it("should handle authentication errors", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				if (cmd === "cat" && args?.[0] === "package.json") {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg",
									publishConfig: { registry: "https://npm.pkg.github.com" },
								}),
							),
						);
					}
					return 0;
				}
				if (cmd === "npm" && args?.includes("publish")) {
					if (options?.listeners?.stderr) {
						options.listeners.stderr(Buffer.from("ENEEDAUTH authentication required"));
					}
					return 1;
				}
				return 0;
			});

			const result = await validatePackageGitHubPublish("/path/to/pkg", "@test/pkg", "1.0.0", "npm", false);

			expect(result.canPublish).toBe(false);
			expect(result.message).toContain("authentication required");
		});

		it("should use yarn command for yarn package manager", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				if (cmd === "cat" && args?.[0] === "package.json") {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg",
									publishConfig: { registry: "https://npm.pkg.github.com" },
								}),
							),
						);
					}
				}
				return 0;
			});

			await validatePackageGitHubPublish("/path/to/pkg", "@test/pkg", "1.0.0", "yarn", false);

			expect(exec.exec).toHaveBeenCalledWith(
				"yarn",
				expect.arrayContaining(["publish", "--dry-run"]),
				expect.any(Object),
			);
		});
	});

	describe("validatePublishGitHubPackages", () => {
		it("should validate all packages successfully", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				// Changeset status
				if (cmd === "npx" && args?.includes("changeset")) {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/pkg", newVersion: "1.0.0", type: "minor", changesets: [] }],
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
									dependencies: { "@test/pkg": {} },
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
									publishConfig: { registry: "https://npm.pkg.github.com" },
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

			const result = await validatePublishGitHubPackages("npm", "main", false);

			expect(result.success).toBe(true);
			expect(result.packages).toHaveLength(1);
			expect(result.checkId).toBe(12345);
		});

		it("should handle package path not found", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				// Changeset status
				if (cmd === "npx" && args?.includes("changeset")) {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/unknown-pkg", newVersion: "1.0.0", type: "minor", changesets: [] }],
								}),
							),
						);
					}
					return 0;
				}
				// npm list - no results
				if (cmd === "npm" && args?.includes("list")) {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(Buffer.from(JSON.stringify({})));
					}
					return 0;
				}
				// test for package.json - all fail
				if (cmd === "test") {
					return 1;
				}
				return 0;
			});

			const result = await validatePublishGitHubPackages("npm", "main", false);

			expect(result.packages).toHaveLength(1);
			expect(result.packages[0].canPublish).toBe(false);
			expect(result.packages[0].message).toContain("not found");
		});

		it("should include dry-run in check name", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				if (cmd === "npx" && args?.includes("changeset")) {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(Buffer.from(JSON.stringify({ releases: [] })));
					}
				}
				return 0;
			});

			await validatePublishGitHubPackages("npm", "main", true);

			expect(mockOctokit.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					name: expect.stringContaining("Dry Run"),
				}),
			);
		});

		it("should handle invalid registry URL", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				if (cmd === "cat" && args?.[0] === "package.json") {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg",
									publishConfig: { registry: "not-a-valid-url" },
								}),
							),
						);
					}
				}
				return 0;
			});

			const result = await validatePackageGitHubPublish("/path/to/pkg", "@test/pkg", "1.0.0", "npm", false);

			expect(result.canPublish).toBe(false);
		});

		it("should handle E403 forbidden errors", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				if (cmd === "cat" && args?.[0] === "package.json") {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg",
									publishConfig: { registry: "https://npm.pkg.github.com" },
								}),
							),
						);
					}
					return 0;
				}
				if (cmd === "npm" && args?.includes("publish")) {
					if (options?.listeners?.stderr) {
						options.listeners.stderr(Buffer.from("E403 Forbidden"));
					}
					return 1;
				}
				return 0;
			});

			const result = await validatePackageGitHubPublish("/path/to/pkg", "@test/pkg", "1.0.0", "npm", false);

			expect(result.canPublish).toBe(false);
			expect(result.message).toContain("permission denied");
		});

		it("should handle provenance errors", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				if (cmd === "cat" && args?.[0] === "package.json") {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg",
									publishConfig: { registry: "https://npm.pkg.github.com" },
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

			const result = await validatePackageGitHubPublish("/path/to/pkg", "@test/pkg", "1.0.0", "npm", false);

			expect(result.canPublish).toBe(false);
			expect(result.message).toContain("Provenance");
		});

		it("should handle general publish errors", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				if (cmd === "cat" && args?.[0] === "package.json") {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg",
									publishConfig: { registry: "https://npm.pkg.github.com" },
								}),
							),
						);
					}
					return 0;
				}
				if (cmd === "npm" && args?.includes("publish")) {
					if (options?.listeners?.stderr) {
						options.listeners.stderr(Buffer.from("Some other error\nWith details"));
					}
					return 1;
				}
				return 0;
			});

			const result = await validatePackageGitHubPublish("/path/to/pkg", "@test/pkg", "1.0.0", "npm", false);

			expect(result.canPublish).toBe(false);
		});

		it("should handle publish error with empty stderr", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				if (cmd === "cat" && args?.[0] === "package.json") {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg",
									publishConfig: { registry: "https://npm.pkg.github.com" },
								}),
							),
						);
					}
					return 0;
				}
				if (cmd === "npm" && args?.includes("publish")) {
					return 1;
				}
				return 0;
			});

			const result = await validatePackageGitHubPublish("/path/to/pkg", "@test/pkg", "1.0.0", "npm", false);

			expect(result.canPublish).toBe(false);
			expect(result.message).toContain("validation failed");
		});

		it("should handle version conflict in stdout", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				if (cmd === "cat" && args?.[0] === "package.json") {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg",
									publishConfig: { registry: "https://npm.pkg.github.com" },
								}),
							),
						);
					}
					return 0;
				}
				if (cmd === "npm" && args?.includes("publish")) {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(Buffer.from("cannot publish over previously published version"));
					}
					return 0;
				}
				return 0;
			});

			const result = await validatePackageGitHubPublish("/path/to/pkg", "@test/pkg", "1.0.0", "npm", false);

			expect(result.canPublish).toBe(false);
			expect(result.message).toContain("already exists");
		});

		it("should handle failed package.json read", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args) => {
				if (cmd === "cat" && args?.[0] === "package.json") {
					return 1; // Exit code 1 for cat failure
				}
				return 0;
			});

			const result = await validatePackageGitHubPublish("/path/to/pkg", "@test/pkg", "1.0.0", "npm", false);

			expect(result.canPublish).toBe(false);
		});

		it("should find package via common paths when npm list returns no dependencies", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				// Changeset status
				if (cmd === "npx" && args?.includes("changeset")) {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/my-pkg", newVersion: "1.0.0", type: "minor", changesets: [] }],
								}),
							),
						);
					}
					return 0;
				}
				// npm list - returns empty
				if (cmd === "npm" && args?.includes("list")) {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(Buffer.from(JSON.stringify({})));
					}
					return 0;
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
									publishConfig: { registry: "https://npm.pkg.github.com" },
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

			const result = await validatePublishGitHubPackages("npm", "main", false);

			expect(result.packages).toHaveLength(1);
		});

		it("should handle multiple failed packages", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				// Changeset status
				if (cmd === "npx" && args?.includes("changeset")) {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									releases: [
										{ name: "@test/pkg-a", newVersion: "1.0.0", type: "minor", changesets: [] },
										{ name: "@test/pkg-b", newVersion: "2.0.0", type: "major", changesets: [] },
									],
								}),
							),
						);
					}
					return 0;
				}
				// npm list - returns nested deps
				if (cmd === "npm" && args?.includes("list")) {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									dependencies: {
										"@test/pkg-a": { dependencies: {} },
										"@test/pkg-b": {},
									},
								}),
							),
						);
					}
					return 0;
				}
				// cat for package.json - all fail
				if (cmd === "cat") {
					return 1;
				}
				return 0;
			});

			const result = await validatePublishGitHubPackages("npm", "main", false);

			expect(result.success).toBe(false);
		});

		it("should handle npm list throwing non-Error", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				// Changeset status
				if (cmd === "npx" && args?.includes("changeset")) {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/pkg", newVersion: "1.0.0", type: "minor", changesets: [] }],
								}),
							),
						);
					}
					return 0;
				}
				// npm list - throws non-Error
				if (cmd === "npm" && args?.includes("list")) {
					throw "String error from npm list"; // Non-Error throw to hit String(error) path
				}
				// test for package.json - fail all common paths
				if (cmd === "test") {
					return 1;
				}
				return 0;
			});

			const result = await validatePublishGitHubPackages("npm", "main", false);

			expect(result.packages).toHaveLength(1);
			expect(result.packages[0].canPublish).toBe(false);
			expect(result.packages[0].message).toContain("not found");
		});

		it("should find package in deeply nested npm list dependencies", async () => {
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
				// Changeset status
				if (cmd === "npx" && args?.includes("changeset")) {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/nested-pkg", newVersion: "1.0.0", type: "minor", changesets: [] }],
								}),
							),
						);
					}
					return 0;
				}
				// npm list - nested structure where target is in nested deps
				if (cmd === "npm" && args?.includes("list")) {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(
							Buffer.from(
								JSON.stringify({
									dependencies: {
										"@other/pkg": {
											dependencies: {
												"@test/nested-pkg": {},
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
									publishConfig: { registry: "https://npm.pkg.github.com" },
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

			const result = await validatePublishGitHubPackages("npm", "main", false);

			expect(result.packages).toHaveLength(1);
		});
	});
});
