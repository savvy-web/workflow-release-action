import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import validatePublishGitHubPackages from "../.github/actions/setup-release/validate-publish-github-packages.js";
import type { MockContext, MockCore, MockExec, MockGithub } from "./utils/github-mocks.js";
import { createMockContext, createMockCore, createMockExec, createMockGithub } from "./utils/github-mocks.js";

// Mock node:fs
vi.mock("node:fs", () => ({
	existsSync: vi.fn(),
}));

// Mock node:fs/promises
vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(),
}));

describe("validatePublishGitHubPackages", () => {
	let mockCore: MockCore;
	let mockExec: MockExec;
	let mockGithub: MockGithub;
	let mockContext: MockContext;

	beforeEach(() => {
		vi.clearAllMocks();

		mockCore = createMockCore();
		mockExec = createMockExec();
		mockGithub = createMockGithub({ checkId: 123456 });
		mockContext = createMockContext({
			owner: "test-owner",
			repo: "test-repo",
			sha: "abc123",
		});

		// Default environment
		delete process.env.PACKAGE_MANAGER;
		delete process.env.DRY_RUN;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("happy path", () => {
		it("should validate all packages successfully for GitHub Packages", async () => {
			// Mock changeset status output
			mockExec.exec.mockImplementation(async (_cmd, args, options) => {
				if (args?.[0] === "changeset") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								releases: [
									{
										name: "@test-owner/package-a",
										type: "minor",
										oldVersion: "1.0.0",
										newVersion: "1.1.0",
										changesets: ["abc123"],
									},
									{
										name: "@test-owner/package-b",
										type: "patch",
										oldVersion: "2.0.0",
										newVersion: "2.0.1",
										changesets: ["def456"],
									},
								],
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "list") {
					// npm list
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								dependencies: {
									"@test-owner/package-a": {},
									"@test-owner/package-b": {},
								},
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "package.json") {
					// cat package.json
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								name: "@test-owner/package-a",
								version: "1.1.0",
								publishConfig: {
									registry: "https://npm.pkg.github.com",
									access: "public",
								},
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "publish") {
					// npm publish --dry-run
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								id: "@test-owner/package-a@1.1.0",
								provenance: true,
							}),
						),
					);
					return 0;
				}

				return 0;
			});

			await validatePublishGitHubPackages({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "true");
			expect(mockCore.notice).toHaveBeenCalledWith("✓ All 2 package(s) ready for GitHub Packages");
			expect(mockGithub.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					conclusion: "success",
					output: expect.objectContaining({
						title: "All 2 package(s) ready for GitHub Packages",
					}),
				}),
			);
		});

		it("should handle dry-run mode", async () => {
			process.env.DRY_RUN = "true";

			mockExec.exec.mockImplementation(async (_cmd, args, options) => {
				if (args?.[0] === "changeset") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								releases: [
									{
										name: "@test-owner/package-a",
										type: "minor",
										oldVersion: "1.0.0",
										newVersion: "1.1.0",
										changesets: ["abc123"],
									},
								],
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "list") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								dependencies: {
									"@test-owner/package-a": {},
								},
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "package.json") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								name: "@test-owner/package-a",
								version: "1.1.0",
								publishConfig: {
									registry: "https://npm.pkg.github.com",
								},
							}),
						),
					);
					return 0;
				}

				return 0;
			});

			await validatePublishGitHubPackages({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.notice).toHaveBeenCalledWith("🧪 Running in dry-run mode (preview only)");
			expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining("[DRY RUN] Would run:"));
			expect(mockCore.setFailed).not.toHaveBeenCalled();
		});
	});

	describe("package validation", () => {
		it("should reject non-scoped packages", async () => {
			mockExec.exec.mockImplementation(async (_cmd, args, options) => {
				if (args?.[0] === "changeset") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								releases: [
									{
										name: "unscoped-package",
										type: "minor",
										oldVersion: "1.0.0",
										newVersion: "1.1.0",
										changesets: ["abc123"],
									},
								],
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "list") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								dependencies: {
									"unscoped-package": {},
								},
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "package.json") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								name: "unscoped-package",
								version: "1.1.0",
							}),
						),
					);
					return 0;
				}

				return 0;
			});

			await validatePublishGitHubPackages({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "false");
			expect(mockCore.error).toHaveBeenCalledWith("❌ 1 of 1 package(s) failed validation");
			expect(mockCore.setFailed).toHaveBeenCalledWith("GitHub Packages validation failed. See check run for details.");
		});

		it("should reject private packages without publishConfig", async () => {
			mockExec.exec.mockImplementation(async (_cmd, args, options) => {
				if (args?.[0] === "changeset") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								releases: [
									{
										name: "@test-owner/private-pkg",
										type: "minor",
										oldVersion: "1.0.0",
										newVersion: "1.1.0",
										changesets: ["abc123"],
									},
								],
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "list") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								dependencies: {
									"@test-owner/private-pkg": {},
								},
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "package.json") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								name: "@test-owner/private-pkg",
								version: "1.1.0",
								private: true,
							}),
						),
					);
					return 0;
				}

				return 0;
			});

			await validatePublishGitHubPackages({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "false");
			expect(mockCore.setFailed).toHaveBeenCalledWith("GitHub Packages validation failed. See check run for details.");
		});

		it("should reject packages with wrong registry", async () => {
			mockExec.exec.mockImplementation(async (_cmd, args, options) => {
				if (args?.[0] === "changeset") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								releases: [
									{
										name: "@test-owner/npm-pkg",
										type: "minor",
										oldVersion: "1.0.0",
										newVersion: "1.1.0",
										changesets: ["abc123"],
									},
								],
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "list") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								dependencies: {
									"@test-owner/npm-pkg": {},
								},
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "package.json") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								name: "@test-owner/npm-pkg",
								version: "1.1.0",
								publishConfig: {
									registry: "https://registry.npmjs.org",
								},
							}),
						),
					);
					return 0;
				}

				return 0;
			});

			await validatePublishGitHubPackages({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "false");
			expect(mockCore.debug).toHaveBeenCalledWith(
				expect.stringContaining("registry is not GitHub Packages: https://registry.npmjs.org"),
			);
		});

		it("should handle package.json read failure", async () => {
			mockExec.exec.mockImplementation(async (_cmd, args, options) => {
				if (args?.[0] === "changeset") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								releases: [
									{
										name: "@test-owner/broken-pkg",
										type: "minor",
										oldVersion: "1.0.0",
										newVersion: "1.1.0",
										changesets: ["abc123"],
									},
								],
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "list") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								dependencies: {
									"@test-owner/broken-pkg": {},
								},
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "package.json") {
					// cat fails
					return 1;
				}

				return 0;
			});

			await validatePublishGitHubPackages({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining("Failed to read package.json"));
			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "false");
		});
	});

	describe("package path resolution", () => {
		it("should find package path using npm list", async () => {
			mockExec.exec.mockImplementation(async (_cmd, args, options) => {
				if (args?.[0] === "changeset") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								releases: [
									{
										name: "@test-owner/package-a",
										type: "minor",
										oldVersion: "1.0.0",
										newVersion: "1.1.0",
										changesets: ["abc123"],
									},
								],
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "list") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								dependencies: {
									"@test-owner/package-a": {},
								},
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "package.json") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								name: "@test-owner/package-a",
								version: "1.1.0",
								publishConfig: {
									registry: "https://npm.pkg.github.com",
								},
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "publish") {
					options?.listeners?.stdout(Buffer.from(JSON.stringify({ id: "@test-owner/package-a@1.1.0" })));
					return 0;
				}

				return 0;
			});

			await validatePublishGitHubPackages({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.debug).toHaveBeenCalledWith("Found package @test-owner/package-a at: .");
		});

		it("should find package using fallback path with test command", async () => {
			mockExec.exec.mockImplementation(async (_cmd, args, options) => {
				if (args?.[0] === "changeset") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								releases: [
									{
										name: "@test-owner/package-a",
										type: "minor",
										oldVersion: "1.0.0",
										newVersion: "1.1.0",
										changesets: ["abc123"],
									},
								],
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "list") {
					// npm list fails
					return 1;
				}

				if (_cmd === "test" && args?.[1] === "packages/package-a/package.json") {
					// test -f succeeds for this path
					return 0;
				}

				if (args?.[0] === "package.json") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								name: "@test-owner/package-a",
								version: "1.1.0",
								publishConfig: {
									registry: "https://npm.pkg.github.com",
								},
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "publish") {
					options?.listeners?.stdout(Buffer.from(JSON.stringify({ id: "@test-owner/package-a@1.1.0" })));
					return 0;
				}

				return 1; // Default: command not found
			});

			await validatePublishGitHubPackages({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.debug).toHaveBeenCalledWith("Found package @test-owner/package-a at: packages/package-a");
		});

		it("should handle package path not found", async () => {
			mockExec.exec.mockImplementation(async (_cmd, args, options) => {
				if (args?.[0] === "changeset") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								releases: [
									{
										name: "@test-owner/missing-pkg",
										type: "minor",
										oldVersion: "1.0.0",
										newVersion: "1.1.0",
										changesets: ["abc123"],
									},
								],
							}),
						),
					);
					return 0;
				}

				// npm list fails, test commands all fail
				return 1;
			});

			await validatePublishGitHubPackages({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.warning).toHaveBeenCalledWith("Could not find path for package: @test-owner/missing-pkg");
			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "false");
		});

		it("should find package in nested dependencies", async () => {
			mockExec.exec.mockImplementation(async (_cmd, args, options) => {
				if (args?.[0] === "changeset") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								releases: [
									{
										name: "@test-owner/nested-pkg",
										type: "minor",
										oldVersion: "1.0.0",
										newVersion: "1.1.0",
										changesets: ["abc123"],
									},
								],
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "list") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								dependencies: {
									"@other/package": {
										dependencies: {
											"@test-owner/nested-pkg": {},
										},
									},
								},
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "package.json") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								name: "@test-owner/nested-pkg",
								version: "1.1.0",
								publishConfig: {
									registry: "https://npm.pkg.github.com",
								},
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "publish") {
					options?.listeners?.stdout(Buffer.from(JSON.stringify({ id: "@test-owner/nested-pkg@1.1.0" })));
					return 0;
				}

				return 0;
			});

			await validatePublishGitHubPackages({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "true");
		});

		it("should handle non-Error exception in npm list", async () => {
			mockExec.exec.mockImplementation(async (_cmd, args, _options) => {
				if (args?.[0] === "changeset") {
					throw "String error from changeset";
				}

				if (args?.[0] === "list") {
					throw "String error from npm list";
				}

				return 0;
			});

			await validatePublishGitHubPackages({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setFailed).toHaveBeenCalledWith(
				"Failed to validate GitHub Packages publish: String error from changeset",
			);
		});
	});

	describe("publish validation errors", () => {
		it("should handle version conflict error", async () => {
			mockExec.exec.mockImplementation(async (_cmd, args, options) => {
				if (args?.[0] === "changeset") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								releases: [
									{
										name: "@test-owner/package-a",
										type: "minor",
										oldVersion: "1.0.0",
										newVersion: "1.1.0",
										changesets: ["abc123"],
									},
								],
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "list") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								dependencies: {
									"@test-owner/package-a": {},
								},
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "package.json") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								name: "@test-owner/package-a",
								version: "1.1.0",
								publishConfig: {
									registry: "https://npm.pkg.github.com",
								},
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "publish") {
					options?.listeners?.stderr(Buffer.from("cannot publish over previously published version 1.1.0"));
					return 1;
				}

				return 0;
			});

			await validatePublishGitHubPackages({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "false");
			expect(mockCore.setFailed).toHaveBeenCalledWith("GitHub Packages validation failed. See check run for details.");
		});

		it("should handle authentication error", async () => {
			mockExec.exec.mockImplementation(async (_cmd, args, options) => {
				if (args?.[0] === "changeset") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								releases: [
									{
										name: "@test-owner/package-a",
										type: "minor",
										oldVersion: "1.0.0",
										newVersion: "1.1.0",
										changesets: ["abc123"],
									},
								],
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "list") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								dependencies: {
									"@test-owner/package-a": {},
								},
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "package.json") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								name: "@test-owner/package-a",
								version: "1.1.0",
								publishConfig: {
									registry: "https://npm.pkg.github.com",
								},
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "publish") {
					options?.listeners?.stderr(Buffer.from("ENEEDAUTH This command requires authentication"));
					return 1;
				}

				return 0;
			});

			await validatePublishGitHubPackages({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			const packagesOutput = mockCore.setOutput.mock.calls.find((call) => call[0] === "packages")?.[1];
			const packages = JSON.parse(packagesOutput);
			expect(packages[0].message).toBe("GitHub Packages authentication required");
		});

		it("should handle E404 (first publish) as success", async () => {
			mockExec.exec.mockImplementation(async (_cmd, args, options) => {
				if (args?.[0] === "changeset") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								releases: [
									{
										name: "@test-owner/new-package",
										type: "minor",
										oldVersion: "0.0.0",
										newVersion: "1.0.0",
										changesets: ["abc123"],
									},
								],
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "list") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								dependencies: {
									"@test-owner/new-package": {},
								},
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "package.json") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								name: "@test-owner/new-package",
								version: "1.0.0",
								publishConfig: {
									registry: "https://npm.pkg.github.com",
								},
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "publish") {
					options?.listeners?.stderr(Buffer.from("E404 Not found - package not found in registry"));
					return 1;
				}

				return 0;
			});

			await validatePublishGitHubPackages({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			const packagesOutput = mockCore.setOutput.mock.calls.find((call) => call[0] === "packages")?.[1];
			const packages = JSON.parse(packagesOutput);
			expect(packages[0].message).toBe("Package not found in registry (first publish)");
			expect(packages[0].canPublish).toBe(true);
			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "true");
		});

		it("should handle E403 permission error", async () => {
			mockExec.exec.mockImplementation(async (_cmd, args, options) => {
				if (args?.[0] === "changeset") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								releases: [
									{
										name: "@test-owner/package-a",
										type: "minor",
										oldVersion: "1.0.0",
										newVersion: "1.1.0",
										changesets: ["abc123"],
									},
								],
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "list") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								dependencies: {
									"@test-owner/package-a": {},
								},
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "package.json") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								name: "@test-owner/package-a",
								version: "1.1.0",
								publishConfig: {
									registry: "https://npm.pkg.github.com",
								},
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "publish") {
					options?.listeners?.stderr(Buffer.from("E403 Forbidden - you do not have permission to publish"));
					return 1;
				}

				return 0;
			});

			await validatePublishGitHubPackages({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			const packagesOutput = mockCore.setOutput.mock.calls.find((call) => call[0] === "packages")?.[1];
			const packages = JSON.parse(packagesOutput);
			expect(packages[0].message).toBe("GitHub Packages permission denied");
		});

		it("should handle provenance configuration error", async () => {
			mockExec.exec.mockImplementation(async (_cmd, args, options) => {
				if (args?.[0] === "changeset") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								releases: [
									{
										name: "@test-owner/package-a",
										type: "minor",
										oldVersion: "1.0.0",
										newVersion: "1.1.0",
										changesets: ["abc123"],
									},
								],
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "list") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								dependencies: {
									"@test-owner/package-a": {},
								},
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "package.json") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								name: "@test-owner/package-a",
								version: "1.1.0",
								publishConfig: {
									registry: "https://npm.pkg.github.com",
								},
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "publish") {
					options?.listeners?.stderr(Buffer.from("Error: provenance generation failed"));
					return 1;
				}

				return 0;
			});

			await validatePublishGitHubPackages({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			const packagesOutput = mockCore.setOutput.mock.calls.find((call) => call[0] === "packages")?.[1];
			const packages = JSON.parse(packagesOutput);
			expect(packages[0].message).toBe("Provenance configuration issue");
		});

		it("should handle generic publish error", async () => {
			mockExec.exec.mockImplementation(async (_cmd, args, options) => {
				if (args?.[0] === "changeset") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								releases: [
									{
										name: "@test-owner/package-a",
										type: "minor",
										oldVersion: "1.0.0",
										newVersion: "1.1.0",
										changesets: ["abc123"],
									},
								],
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "list") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								dependencies: {
									"@test-owner/package-a": {},
								},
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "package.json") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								name: "@test-owner/package-a",
								version: "1.1.0",
								publishConfig: {
									registry: "https://npm.pkg.github.com",
								},
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "publish") {
					options?.listeners?.stderr(Buffer.from("Something went wrong\nMultiple error lines\nWith various messages"));
					return 1;
				}

				return 0;
			});

			await validatePublishGitHubPackages({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			const packagesOutput = mockCore.setOutput.mock.calls.find((call) => call[0] === "packages")?.[1];
			const packages = JSON.parse(packagesOutput);
			expect(packages[0].message).toBe("Something went wrong");
		});

		it("should handle non-Error exception in npm publish", async () => {
			mockExec.exec.mockImplementation(async (_cmd, args, _options) => {
				if (args?.[0] === "changeset") {
					throw "String error from changeset";
				}
				return 0;
			});

			await validatePublishGitHubPackages({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setFailed).toHaveBeenCalledWith(
				"Failed to validate GitHub Packages publish: String error from changeset",
			);
		});
	});

	describe("package manager support", () => {
		it("should handle yarn package manager", async () => {
			process.env.PACKAGE_MANAGER = "yarn";

			mockExec.exec.mockImplementation(async (cmd, args, options) => {
				if (args?.[0] === "changeset") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								releases: [
									{
										name: "@test-owner/package-a",
										type: "minor",
										oldVersion: "1.0.0",
										newVersion: "1.1.0",
										changesets: ["abc123"],
									},
								],
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "list") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								dependencies: {
									"@test-owner/package-a": {},
								},
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "package.json") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								name: "@test-owner/package-a",
								version: "1.1.0",
								publishConfig: {
									registry: "https://npm.pkg.github.com",
								},
							}),
						),
					);
					return 0;
				}

				if (cmd === "yarn" && args?.[0] === "publish") {
					expect(args).toEqual(["publish", "--dry-run", "--registry", "https://npm.pkg.github.com"]);
					return 0;
				}

				return 0;
			});

			await validatePublishGitHubPackages({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "true");
		});
	});

	describe("outputs and summary", () => {
		it("should set all outputs correctly", async () => {
			mockExec.exec.mockImplementation(async (_cmd, args, options) => {
				if (args?.[0] === "changeset") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								releases: [
									{
										name: "@test-owner/package-a",
										type: "minor",
										oldVersion: "1.0.0",
										newVersion: "1.1.0",
										changesets: ["abc123"],
									},
								],
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "list") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								dependencies: {
									"@test-owner/package-a": {},
								},
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "package.json") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								name: "@test-owner/package-a",
								version: "1.1.0",
								publishConfig: {
									registry: "https://npm.pkg.github.com",
								},
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "publish") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								id: "@test-owner/package-a@1.1.0",
								provenance: true,
							}),
						),
					);
					return 0;
				}

				return 0;
			});

			await validatePublishGitHubPackages({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "true");
			expect(mockCore.setOutput).toHaveBeenCalledWith("packages", expect.any(String));
			expect(mockCore.setOutput).toHaveBeenCalledWith("check_id", "123456");

			const packagesOutput = mockCore.setOutput.mock.calls.find((call) => call[0] === "packages")?.[1];
			const packages = JSON.parse(packagesOutput);
			expect(packages).toHaveLength(1);
			expect(packages[0]).toMatchObject({
				name: "@test-owner/package-a",
				version: "1.1.0",
				canPublish: true,
			});
		});

		it("should create job summary with table", async () => {
			mockExec.exec.mockImplementation(async (_cmd, args, options) => {
				if (args?.[0] === "changeset") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								releases: [
									{
										name: "@test-owner/package-a",
										type: "minor",
										oldVersion: "1.0.0",
										newVersion: "1.1.0",
										changesets: ["abc123"],
									},
								],
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "list") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								dependencies: {
									"@test-owner/package-a": {},
								},
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "package.json") {
					options?.listeners?.stdout(
						Buffer.from(
							JSON.stringify({
								name: "@test-owner/package-a",
								version: "1.1.0",
								publishConfig: {
									registry: "https://npm.pkg.github.com",
								},
							}),
						),
					);
					return 0;
				}

				if (args?.[0] === "publish") {
					options?.listeners?.stdout(Buffer.from(JSON.stringify({ id: "@test-owner/package-a@1.1.0" })));
					return 0;
				}

				return 0;
			});

			await validatePublishGitHubPackages({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.summary.addHeading).toHaveBeenCalledWith("GitHub Packages Validation", 2);
			expect(mockCore.summary.addTable).toHaveBeenCalledWith(
				expect.arrayContaining([
					expect.arrayContaining([
						{ data: "Package", header: true },
						{ data: "Version", header: true },
						{ data: "Status", header: true },
						{ data: "Message", header: true },
					]),
				]),
			);
			expect(mockCore.summary.write).toHaveBeenCalled();
		});
	});
});
