import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import generateReleaseNotesPreview from "../.github/actions/setup-release/generate-release-notes-preview.js";
import type { AsyncFunctionArguments } from "../.github/actions/shared/types.js";
import type { MockCore, MockExec } from "./utils/github-mocks.js";
import { createMockAsyncFunctionArguments, createMockCore, createMockExec } from "./utils/github-mocks.js";

// Mock fs module
vi.mock("node:fs");
vi.mock("node:path");

describe("generate-release-notes-preview", () => {
	let mockCore: MockCore;
	let mockExec: MockExec;
	let mockArgs: AsyncFunctionArguments;

	let mockGithub: {
		rest: {
			checks: {
				create: ReturnType<typeof vi.fn>;
			};
		};
	};

	const mockChangesetStatus = {
		releases: [
			{ name: "@test/package-a", newVersion: "1.2.0", type: "minor" },
			{ name: "@test/package-b", newVersion: "2.0.0", type: "major" },
		],
		changesets: [],
	};

	const mockChangelog = `# @test/package-a

## 1.2.0

### Minor Changes

- Added new feature X
- Improved performance of Y

### Patch Changes

- Fixed bug in Z

## 1.1.0

### Minor Changes

- Previous release notes
`;

	beforeEach(() => {
		vi.clearAllMocks();

		mockCore = createMockCore();
		mockExec = createMockExec();

		mockGithub = {
			rest: {
				checks: {
					create: vi.fn(),
				},
			},
		};

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
			} as never,
		});

		// Default successful check creation
		mockGithub.rest.checks.create.mockResolvedValue({
			data: {
				id: 999,
				html_url: "https://github.com/test-owner/test-repo/runs/999",
			},
		} as never);

		// Setup default environment
		process.env.PACKAGE_MANAGER = "pnpm";
		process.env.WORKSPACE_ROOT = "/test/workspace";

		// Mock changeset status
		mockExec.exec.mockImplementation(async (_cmd, args, options) => {
			if (args?.includes("status")) {
				options?.listeners?.stdout?.(Buffer.from(JSON.stringify(mockChangesetStatus)));
			}
			return 0;
		});

		// Mock path.join to return predictable paths
		vi.mocked(path.join).mockImplementation((...args) => args.join("/"));

		// Mock fs.existsSync to return true by default
		vi.mocked(fs.existsSync).mockReturnValue(true);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		delete process.env.PACKAGE_MANAGER;
		delete process.env.WORKSPACE_ROOT;
		delete process.env.DRY_RUN;
	});

	describe("changelog extraction", () => {
		it("should extract release notes from CHANGELOG.md", async () => {
			// Override changeset status to only include package-a for this test
			mockExec.exec.mockImplementation(async (_cmd, args, options) => {
				if (args?.includes("status")) {
					options?.listeners?.stdout?.(
						Buffer.from(
							JSON.stringify({
								releases: [{ name: "@test/package-a", newVersion: "1.2.0", type: "minor" }],
								changesets: [],
							}),
						),
					);
				}
				return 0;
			});

			// Mock package.json files
			vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
				const pathStr = filePath.toString();
				if (pathStr.includes("package-a/package.json")) {
					return JSON.stringify({ name: "@test/package-a" });
				}
				if (pathStr.includes("CHANGELOG.md")) {
					return mockChangelog;
				}
				return "{}";
			});

			await generateReleaseNotesPreview(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("packages", expect.stringContaining("@test/package-a"));
			expect(mockCore.notice).toHaveBeenCalledWith(expect.stringContaining("Generated release notes preview"));
		});

		it("should handle missing CHANGELOG.md", async () => {
			vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
				const pathStr = filePath.toString();
				if (pathStr.includes("package.json")) {
					return JSON.stringify({ name: "@test/package-a" });
				}
				throw new Error("File not found");
			});

			vi.mocked(fs.existsSync).mockImplementation((filePath) => {
				const pathStr = filePath.toString();
				return !pathStr.includes("CHANGELOG.md");
			});

			await generateReleaseNotesPreview(mockArgs);

			expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining("No CHANGELOG.md found"));
		});

		it("should handle malformed CHANGELOG.md", async () => {
			const malformedChangelog = "# Changelog\n\nSome text without version headings";

			vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
				const pathStr = filePath.toString();
				if (pathStr.includes("package.json")) {
					return JSON.stringify({ name: "@test/package-a" });
				}
				if (pathStr.includes("CHANGELOG.md")) {
					return malformedChangelog;
				}
				return "{}";
			});

			await generateReleaseNotesPreview(mockArgs);

			expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining("Could not extract version"));
		});

		it("should handle version not found in CHANGELOG", async () => {
			const oldChangelog = `# @test/package-a\n\n## 1.0.0\n\nOld release`;

			vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
				const pathStr = filePath.toString();
				if (pathStr.includes("package.json")) {
					return JSON.stringify({ name: "@test/package-a" });
				}
				if (pathStr.includes("CHANGELOG.md")) {
					return oldChangelog;
				}
				return "{}";
			});

			await generateReleaseNotesPreview(mockArgs);

			expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining("Could not extract version 1.2.0"));
		});
	});

	describe("package discovery", () => {
		it("should find packages in common monorepo locations", async () => {
			vi.mocked(fs.existsSync).mockImplementation((filePath) => {
				const pathStr = filePath.toString();
				return pathStr.includes("/packages/") || pathStr.includes("CHANGELOG.md");
			});

			vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
				const pathStr = filePath.toString();
				if (pathStr.includes("package-a")) {
					if (pathStr.includes("package.json")) {
						return JSON.stringify({ name: "@test/package-a" });
					}
					if (pathStr.includes("CHANGELOG.md")) {
						return mockChangelog;
					}
				}
				return "{}";
			});

			await generateReleaseNotesPreview(mockArgs);

			expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining("Processing @test/package-a"));
		});

		it("should handle package directory not found", async () => {
			vi.mocked(fs.existsSync).mockReturnValue(false);

			await generateReleaseNotesPreview(mockArgs);

			expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining("Could not find package directory"));
		});
	});

	describe("dry-run mode", () => {
		it("should indicate dry-run in outputs", async () => {
			process.env.DRY_RUN = "true";

			vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
				const pathStr = filePath.toString();
				if (pathStr.includes("package.json")) {
					return JSON.stringify({ name: "@test/package-a" });
				}
				if (pathStr.includes("CHANGELOG.md")) {
					return mockChangelog;
				}
				return "{}";
			});

			await generateReleaseNotesPreview(mockArgs);

			expect(mockCore.notice).toHaveBeenCalledWith(expect.stringContaining("dry-run mode"));
			expect(mockGithub.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					name: expect.stringContaining("Dry Run"),
				}),
			);
		});
	});

	describe("output validation", () => {
		it("should set correct outputs", async () => {
			vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
				const pathStr = filePath.toString();
				if (pathStr.includes("package.json")) {
					return JSON.stringify({ name: "@test/package-a" });
				}
				if (pathStr.includes("CHANGELOG.md")) {
					return mockChangelog;
				}
				return "{}";
			});

			await generateReleaseNotesPreview(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("packages", expect.any(String));
			expect(mockCore.setOutput).toHaveBeenCalledWith("check_id", "999");
		});

		it("should handle no packages to release", async () => {
			mockExec.exec.mockImplementation(async (_cmd, args, options) => {
				if (args?.includes("status")) {
					options?.listeners?.stdout?.(
						Buffer.from(
							JSON.stringify({
								releases: [],
								changesets: [],
							}),
						),
					);
				}
				return 0;
			});

			await generateReleaseNotesPreview(mockArgs);

			expect(mockGithub.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					output: expect.objectContaining({
						title: expect.stringContaining("No packages to release"),
					}),
				}),
			);
		});
	});

	describe("error handling", () => {
		it("should handle changeset status failures", async () => {
			mockExec.exec.mockRejectedValue(new Error("Changeset command failed"));

			await generateReleaseNotesPreview(mockArgs);

			expect(mockCore.setFailed).toHaveBeenCalledWith(
				expect.stringContaining("Failed to generate release notes preview"),
			);
		});

		it("should handle file read errors gracefully", async () => {
			vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
				const pathStr = filePath.toString();
				if (pathStr.includes("package.json")) {
					return JSON.stringify({ name: "@test/package-a" });
				}
				if (pathStr.includes("CHANGELOG.md")) {
					throw new Error("Permission denied");
				}
				return "{}";
			});

			await generateReleaseNotesPreview(mockArgs);

			expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining("Failed to read CHANGELOG"));
		});
	});

	describe("version extraction patterns", () => {
		it("should extract from ## [1.2.0] - YYYY-MM-DD format", async () => {
			const changelog = `# Changelog\n\n## [1.2.0] - 2024-01-01\n\n- Feature A\n- Feature B\n\n## [1.1.0]`;

			vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
				const pathStr = filePath.toString();
				if (pathStr.includes("package.json")) {
					return JSON.stringify({ name: "@test/package-a" });
				}
				if (pathStr.includes("CHANGELOG.md")) {
					return changelog;
				}
				return "{}";
			});

			await generateReleaseNotesPreview(mockArgs);

			const packagesOutput = mockCore.setOutput.mock.calls.find((call) => call[0] === "packages");
			expect(packagesOutput).toBeDefined();
			const packages = JSON.parse(packagesOutput?.[1] as string);
			expect(packages[0].notes).toContain("Feature A");
		});

		it("should extract from ## 1.2.0 format", async () => {
			const changelog = `# Changelog\n\n## 1.2.0\n\n- Feature A\n\n## 1.1.0`;

			vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
				const pathStr = filePath.toString();
				if (pathStr.includes("package.json")) {
					return JSON.stringify({ name: "@test/package-a" });
				}
				if (pathStr.includes("CHANGELOG.md")) {
					return changelog;
				}
				return "{}";
			});

			await generateReleaseNotesPreview(mockArgs);

			const packagesOutput = mockCore.setOutput.mock.calls.find((call) => call[0] === "packages");
			expect(packagesOutput).toBeDefined();
			const packages = JSON.parse(packagesOutput?.[1] as string);
			expect(packages[0].notes).toContain("Feature A");
		});

		it("should handle empty version section", async () => {
			// Override to single package
			mockExec.exec.mockImplementation(async (_cmd, args, options) => {
				if (args?.includes("status")) {
					options?.listeners?.stdout?.(
						Buffer.from(
							JSON.stringify({
								releases: [{ name: "@test/package-a", newVersion: "1.2.0", type: "minor" }],
								changesets: [],
							}),
						),
					);
				}
				return 0;
			});

			const changelog = `# Changelog\n\n## 1.2.0\n\n## 1.1.0`;

			vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
				const pathStr = filePath.toString();
				if (pathStr.includes("package.json")) {
					return JSON.stringify({ name: "@test/package-a" });
				}
				if (pathStr.includes("CHANGELOG.md")) {
					return changelog;
				}
				return "{}";
			});

			await generateReleaseNotesPreview(mockArgs);

			const packagesOutput = mockCore.setOutput.mock.calls.find((call) => call[0] === "packages");
			expect(packagesOutput).toBeDefined();
			const packages = JSON.parse(packagesOutput?.[1] as string);
			expect(packages[0].notes).toBe("");
			expect(packages[0].error).toBeUndefined();
		});
	});

	describe("changeset command stderr handling", () => {
		it("should log stderr output from changeset command", async () => {
			// Override to single package
			mockExec.exec.mockImplementation(async (_cmd, args, options) => {
				if (args?.includes("status")) {
					// Simulate stderr output
					options?.listeners?.stderr?.(Buffer.from("Warning: some changeset warning"));
					options?.listeners?.stdout?.(
						Buffer.from(
							JSON.stringify({
								releases: [{ name: "@test/package-a", newVersion: "1.2.0", type: "minor" }],
								changesets: [],
							}),
						),
					);
				}
				return 0;
			});

			vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
				const pathStr = filePath.toString();
				if (pathStr.includes("package.json")) {
					return JSON.stringify({ name: "@test/package-a" });
				}
				if (pathStr.includes("CHANGELOG.md")) {
					return mockChangelog;
				}
				return "{}";
			});

			await generateReleaseNotesPreview(mockArgs);

			expect(mockCore.debug).toHaveBeenCalledWith(expect.stringContaining("changeset status stderr"));
		});
	});

	describe("environment variable defaults", () => {
		it("should use default package manager when PACKAGE_MANAGER not set", async () => {
			delete process.env.PACKAGE_MANAGER;

			// Override to single package
			mockExec.exec.mockImplementation(async (_cmd, args, options) => {
				if (args?.includes("status")) {
					options?.listeners?.stdout?.(
						Buffer.from(
							JSON.stringify({
								releases: [{ name: "@test/package-a", newVersion: "1.2.0", type: "minor" }],
								changesets: [],
							}),
						),
					);
				}
				return 0;
			});

			vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
				const pathStr = filePath.toString();
				if (pathStr.includes("package.json")) {
					return JSON.stringify({ name: "@test/package-a" });
				}
				if (pathStr.includes("CHANGELOG.md")) {
					return mockChangelog;
				}
				return "{}";
			});

			await generateReleaseNotesPreview(mockArgs);

			// Should use pnpm as default
			expect(mockExec.exec).toHaveBeenCalledWith(
				"pnpm",
				expect.arrayContaining(["changeset", "status", "--output=json"]),
				expect.anything(),
			);
		});

		it("should use GITHUB_WORKSPACE when WORKSPACE_ROOT not set", async () => {
			delete process.env.WORKSPACE_ROOT;
			process.env.GITHUB_WORKSPACE = "/github/workspace";

			// Override to single package
			mockExec.exec.mockImplementation(async (_cmd, args, options) => {
				if (args?.includes("status")) {
					options?.listeners?.stdout?.(
						Buffer.from(
							JSON.stringify({
								releases: [{ name: "@test/package-a", newVersion: "1.2.0", type: "minor" }],
								changesets: [],
							}),
						),
					);
				}
				return 0;
			});

			vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
				const pathStr = filePath.toString();
				if (pathStr.includes("package.json")) {
					return JSON.stringify({ name: "@test/package-a" });
				}
				if (pathStr.includes("CHANGELOG.md")) {
					return mockChangelog;
				}
				return "{}";
			});

			await generateReleaseNotesPreview(mockArgs);

			expect(mockCore.info).toHaveBeenCalled();
		});

		it("should use process.cwd() when neither WORKSPACE_ROOT nor GITHUB_WORKSPACE set", async () => {
			delete process.env.WORKSPACE_ROOT;
			delete process.env.GITHUB_WORKSPACE;

			// Override to single package
			mockExec.exec.mockImplementation(async (_cmd, args, options) => {
				if (args?.includes("status")) {
					options?.listeners?.stdout?.(
						Buffer.from(
							JSON.stringify({
								releases: [{ name: "@test/package-a", newVersion: "1.2.0", type: "minor" }],
								changesets: [],
							}),
						),
					);
				}
				return 0;
			});

			vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
				const pathStr = filePath.toString();
				if (pathStr.includes("package.json")) {
					return JSON.stringify({ name: "@test/package-a" });
				}
				if (pathStr.includes("CHANGELOG.md")) {
					return mockChangelog;
				}
				return "{}";
			});

			await generateReleaseNotesPreview(mockArgs);

			expect(mockCore.info).toHaveBeenCalled();
		});
	});
});
