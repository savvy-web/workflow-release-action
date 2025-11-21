import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import detectPublishableChanges from "../.github/actions/setup-release/detect-publishable-changes.js";
import type { AsyncFunctionArguments } from "../.github/actions/shared/types.js";
import type { MockCore, MockExec, MockGithub } from "./utils/github-mocks.js";
import {
	createMockAsyncFunctionArguments,
	createMockCore,
	createMockExec,
	createMockGithub,
} from "./utils/github-mocks.js";

// Mock node:fs and node:fs/promises
vi.mock("node:fs", () => ({
	existsSync: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(),
}));

describe("detectPublishableChanges", () => {
	let mockCore: MockCore;
	let mockExec: MockExec;
	let mockGithub: MockGithub;
	let mockArgs: AsyncFunctionArguments;

	beforeEach(() => {
		vi.clearAllMocks();

		mockCore = createMockCore();
		mockExec = createMockExec();
		mockGithub = createMockGithub({ checkId: 12345 });

		mockArgs = createMockAsyncFunctionArguments({
			core: mockCore as never,
			exec: mockExec as never,
			github: mockGithub as never,
			context: {
				repo: {
					owner: "test-owner",
					repo: "test-repo",
				},
				sha: "abc123",
				runId: 1,
			} as never,
		});

		// Default environment
		process.env.PACKAGE_MANAGER = "pnpm";
		process.env.DRY_RUN = "false";
	});

	afterEach(() => {
		vi.restoreAllMocks();
		delete process.env.PACKAGE_MANAGER;
		delete process.env.DRY_RUN;
	});

	describe("no changesets", () => {
		it("should detect no publishable changes when no changesets exist", async () => {
			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from(JSON.stringify({ releases: [], changesets: [] })));
				}
				return 0;
			});

			await detectPublishableChanges(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("has_changes", "false");
			expect(mockCore.setOutput).toHaveBeenCalledWith("packages", "[]");
			expect(mockCore.notice).toHaveBeenCalledWith("✓ No publishable packages with changes detected");
		});
	});

	describe("changesets with no publishable packages", () => {
		it("should filter out packages without publishConfig.access", async () => {
			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(
						Buffer.from(
							JSON.stringify({
								releases: [
									{
										name: "@test/private-pkg",
										newVersion: "1.0.0",
										type: "patch",
									},
								],
								changesets: [{ id: "test-changeset", summary: "Test", releases: [] }],
							}),
						),
					);
				}
				return 0;
			});

			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFile).mockResolvedValue(
				JSON.stringify({
					name: "@test/private-pkg",
					version: "0.9.0",
					private: true,
					// No publishConfig
				}),
			);

			await detectPublishableChanges(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("has_changes", "false");
			expect(mockCore.setOutput).toHaveBeenCalledWith("packages", "[]");
		});

		it("should skip packages with type 'none'", async () => {
			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(
						Buffer.from(
							JSON.stringify({
								releases: [
									{
										name: "@test/no-bump",
										newVersion: "1.0.0",
										type: "none",
									},
								],
								changesets: [],
							}),
						),
					);
				}
				return 0;
			});

			await detectPublishableChanges(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("has_changes", "false");
			expect(mockCore.debug).toHaveBeenCalledWith("Skipping @test/no-bump: no version bump");
		});
	});

	describe("publishable packages", () => {
		it("should detect publishable package with access: public", async () => {
			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(
						Buffer.from(
							JSON.stringify({
								releases: [
									{
										name: "@test/public-pkg",
										newVersion: "1.0.0",
										type: "minor",
									},
								],
								changesets: [{ id: "test-changeset", summary: "Add feature", releases: [] }],
							}),
						),
					);
				}
				return 0;
			});

			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFile).mockResolvedValue(
				JSON.stringify({
					name: "@test/public-pkg",
					version: "0.9.0",
					private: true,
					publishConfig: {
						access: "public",
					},
				}),
			);

			await detectPublishableChanges(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("has_changes", "true");
			expect(mockCore.setOutput).toHaveBeenCalledWith(
				"packages",
				JSON.stringify([
					{
						name: "@test/public-pkg",
						newVersion: "1.0.0",
						type: "minor",
					},
				]),
			);
			expect(mockCore.info).toHaveBeenCalledWith("✓ @test/public-pkg is publishable (access: public)");
		});

		it("should detect publishable package with access: restricted", async () => {
			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(
						Buffer.from(
							JSON.stringify({
								releases: [
									{
										name: "@test/restricted-pkg",
										newVersion: "2.0.0",
										type: "major",
									},
								],
								changesets: [],
							}),
						),
					);
				}
				return 0;
			});

			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFile).mockResolvedValue(
				JSON.stringify({
					name: "@test/restricted-pkg",
					version: "1.0.0",
					publishConfig: {
						access: "restricted",
					},
				}),
			);

			await detectPublishableChanges(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("has_changes", "true");
			expect(mockCore.info).toHaveBeenCalledWith("✓ @test/restricted-pkg is publishable (access: restricted)");
		});

		it("should detect multiple publishable packages", async () => {
			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(
						Buffer.from(
							JSON.stringify({
								releases: [
									{ name: "@test/pkg-a", newVersion: "1.0.0", type: "patch" },
									{ name: "@test/pkg-b", newVersion: "2.0.0", type: "major" },
								],
								changesets: [],
							}),
						),
					);
				}
				return 0;
			});

			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFile)
				.mockResolvedValueOnce(
					JSON.stringify({
						name: "@test/pkg-a",
						publishConfig: { access: "public" },
					}),
				)
				.mockResolvedValueOnce(
					JSON.stringify({
						name: "@test/pkg-b",
						publishConfig: { access: "public" },
					}),
				);

			await detectPublishableChanges(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("has_changes", "true");
			const packagesArg = (mockCore.setOutput.mock.calls.find((call) => call[0] === "packages") || [])[1];
			const packages = JSON.parse(packagesArg as string);
			expect(packages).toHaveLength(2);
		});
	});

	describe("package.json lookup", () => {
		it("should warn if package.json not found", async () => {
			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(
						Buffer.from(
							JSON.stringify({
								releases: [{ name: "@test/missing", newVersion: "1.0.0", type: "patch" }],
								changesets: [],
							}),
						),
					);
				}
				return 0;
			});

			vi.mocked(existsSync).mockReturnValue(false);

			await detectPublishableChanges(mockArgs);

			expect(mockCore.warning).toHaveBeenCalledWith("Could not find package.json for @test/missing, skipping");
		});
	});

	describe("package managers", () => {
		it("should use npm command for npm package manager", async () => {
			process.env.PACKAGE_MANAGER = "npm";

			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from(JSON.stringify({ releases: [], changesets: [] })));
				}
				return 0;
			});

			await detectPublishableChanges(mockArgs);

			expect(mockExec.exec).toHaveBeenCalledWith("npx", ["changeset", "status", "--output=json"], expect.anything());
		});

		it("should use yarn command for yarn package manager", async () => {
			process.env.PACKAGE_MANAGER = "yarn";

			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from(JSON.stringify({ releases: [], changesets: [] })));
				}
				return 0;
			});

			await detectPublishableChanges(mockArgs);

			expect(mockExec.exec).toHaveBeenCalledWith("yarn", ["changeset", "status", "--output=json"], expect.anything());
		});
	});

	describe("dry-run mode", () => {
		it("should indicate dry-run in check title and summary", async () => {
			process.env.DRY_RUN = "true";

			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from(JSON.stringify({ releases: [], changesets: [] })));
				}
				return 0;
			});

			await detectPublishableChanges(mockArgs);

			expect(mockCore.notice).toHaveBeenCalledWith("🧪 Running in dry-run mode (preview only)");
			expect(mockGithub.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "🧪 Detect Publishable Changes (Dry Run)",
				}),
			);
		});
	});

	describe("error handling", () => {
		it("should handle changeset command execution failure", async () => {
			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from("Changeset error"));
				}
				return 0;
			});

			await detectPublishableChanges(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("has_changes", "false");
		});

		it("should handle invalid JSON output from changeset", async () => {
			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("invalid json"));
				}
				return 0;
			});

			await detectPublishableChanges(mockArgs);

			expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining("Failed to parse changeset status"));
			expect(mockCore.setOutput).toHaveBeenCalledWith("has_changes", "false");
		});

		it("should handle errors gracefully", async () => {
			mockExec.exec.mockRejectedValue(new Error("Command failed"));

			await detectPublishableChanges(mockArgs);

			expect(mockCore.setFailed).toHaveBeenCalledWith(expect.stringContaining("Failed to detect publishable changes"));
		});
	});

	describe("GitHub check creation", () => {
		it("should create check with correct parameters", async () => {
			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from(JSON.stringify({ releases: [], changesets: [] })));
				}
				return 0;
			});

			await detectPublishableChanges(mockArgs);

			expect(mockGithub.rest.checks.create).toHaveBeenCalledWith({
				owner: "test-owner",
				repo: "test-repo",
				name: "Detect Publishable Changes",
				head_sha: "abc123",
				status: "completed",
				conclusion: "success",
				output: expect.objectContaining({
					title: expect.any(String),
					summary: expect.any(String),
				}),
			});
		});

		it("should set check_id output", async () => {
			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from(JSON.stringify({ releases: [], changesets: [] })));
				}
				return 0;
			});

			await detectPublishableChanges(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("check_id", "12345");
		});
	});
});
