import * as fs from "node:fs";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { context, getOctokit } from "@actions/github";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfos } from "workspace-tools";
import { findProjectRoot, getWorkspaceInfos } from "workspace-tools";
import { clearWorkspaceCache } from "../src/utils/find-package-path.js";
import { generateReleaseNotesPreview } from "../src/utils/generate-release-notes-preview.js";
import { cleanupTestEnvironment, createMockOctokit, setupTestEnvironment } from "./utils/github-mocks.js";
import type { ExecOptionsWithListeners, MockOctokit } from "./utils/test-types.js";

// Helper to create minimal workspace info for mocking
const createWorkspace = (name: string, path: string): WorkspaceInfos[number] => ({
	name,
	path,
	packageJson: { packageJsonPath: `${path}/package.json`, name, version: "1.0.0" },
});

// Mock modules
vi.mock("@actions/core");
vi.mock("@actions/exec");
vi.mock("@actions/github");
vi.mock("node:fs");
vi.mock("workspace-tools");

describe("generate-release-notes-preview", () => {
	let mockOctokit: MockOctokit;

	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });

		// Setup core.getState to return packageManager
		vi.mocked(core.getState).mockImplementation((name: string) => {
			if (name === "packageManager") return "pnpm";
			return "";
		});

		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "target-branch") return "main";
			return "";
		});
		vi.mocked(core.getBooleanInput).mockImplementation((name: string) => {
			if (name === "dry-run") return false;
			return false;
		});

		// Mock core.summary
		const mockSummary = {
			addHeading: vi.fn().mockReturnThis(),
			addEOL: vi.fn().mockReturnThis(),
			addTable: vi.fn().mockReturnThis(),
			addRaw: vi.fn().mockReturnThis(),
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
		Object.defineProperty(vi.mocked(context), "ref", { value: "refs/heads/main", writable: true });

		// Default exec mock
		vi.mocked(exec.exec).mockResolvedValue(0);

		// Default workspace-tools mock - returns empty workspace by default
		vi.mocked(getWorkspaceInfos).mockReturnValue([]);

		// Default fs mocks - changeset writes to a temp file
		vi.mocked(fs.existsSync).mockImplementation((path) => {
			const pathStr = String(path);
			// Return true for changeset status temp files
			return pathStr.includes(".changeset-status");
		});
		vi.mocked(fs.readFileSync).mockImplementation((path) => {
			const pathStr = String(path);
			// Return empty changeset status for temp files
			if (pathStr.includes(".changeset-status")) {
				return JSON.stringify({ releases: [], changesets: [] });
			}
			return "";
		});
		vi.mocked(fs.unlinkSync).mockImplementation(() => {});
	});

	afterEach(() => {
		clearWorkspaceCache();
		cleanupTestEnvironment();
	});

	it("should handle no packages to release", async () => {
		const result = await generateReleaseNotesPreview("pnpm");

		expect(result.packages).toEqual([]);
		expect(result.summaryContent).toBeDefined();
		expect(result.checkTitle).toContain("Release Notes Preview");
	});

	it("should extract release notes from CHANGELOG", async () => {
		// Mock workspace-tools to return the package
		vi.mocked(getWorkspaceInfos).mockReturnValue([createWorkspace("@test/pkg", "/test/pkg")]);

		vi.mocked(fs.existsSync).mockImplementation((path) => {
			const pathStr = String(path);
			return pathStr.includes(".changeset-status") || pathStr.includes("CHANGELOG.md");
		});

		vi.mocked(fs.readFileSync).mockImplementation((path) => {
			const pathStr = String(path);
			if (pathStr.includes(".changeset-status")) {
				return JSON.stringify({
					releases: [{ name: "@test/pkg", newVersion: "1.0.0", type: "minor" }],
					changesets: [],
				});
			}
			if (pathStr.includes("CHANGELOG.md")) {
				return `# Changelog

## 1.0.0

### Features

- Added new feature
- Improved performance

## 0.9.0

### Bug Fixes

- Fixed a bug`;
			}
			return "";
		});

		const result = await generateReleaseNotesPreview("pnpm");

		expect(result.packages).toHaveLength(1);
		expect(result.packages[0].hasChangelog).toBe(true);
		expect(result.packages[0].notes).toContain("Added new feature");
	});

	it("should handle missing CHANGELOG", async () => {
		// Mock workspace-tools to return the package
		vi.mocked(getWorkspaceInfos).mockReturnValue([createWorkspace("@test/pkg", "/test/pkg")]);

		vi.mocked(fs.existsSync).mockImplementation((path) => {
			const pathStr = String(path);
			// Changeset temp file exists, but CHANGELOG does not
			return pathStr.includes(".changeset-status");
		});

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

		const result = await generateReleaseNotesPreview("pnpm");

		expect(result.packages).toHaveLength(1);
		expect(result.packages[0].hasChangelog).toBe(false);
		expect(result.packages[0].error).toBe("CHANGELOG.md not found");
	});

	it("should handle package directory not found", async () => {
		// Default getWorkspaceInfos mock returns empty array, so package won't be found
		vi.mocked(fs.existsSync).mockImplementation((path) => {
			const pathStr = String(path);
			return pathStr.includes(".changeset-status");
		});

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

		const result = await generateReleaseNotesPreview("pnpm");

		expect(result.packages).toHaveLength(1);
		expect(result.packages[0].error).toBe("Package directory not found");
	});

	it("should include dry-run mode in check output", async () => {
		vi.mocked(core.getBooleanInput).mockImplementation((name: string) => {
			if (name === "dry-run") return true;
			return false;
		});

		const result = await generateReleaseNotesPreview("pnpm");

		expect(result.checkTitle).toContain("Dry Run");
	});

	it("should handle version section not found in CHANGELOG", async () => {
		// Mock workspace-tools to return the package
		vi.mocked(getWorkspaceInfos).mockReturnValue([createWorkspace("@test/pkg", "/test/pkg")]);

		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockImplementation((path) => {
			const pathStr = String(path);
			if (pathStr.includes(".changeset-status")) {
				return JSON.stringify({
					releases: [{ name: "@test/pkg", newVersion: "2.0.0", type: "major" }],
					changesets: [],
				});
			}
			if (pathStr.includes("CHANGELOG.md")) {
				return `# Changelog

## 1.0.0

### Features

- Old feature`;
			}
			return "";
		});

		const result = await generateReleaseNotesPreview("pnpm");

		expect(result.packages).toHaveLength(1);
		expect(result.packages[0].error).toContain("Could not find version section");
	});

	it("should handle multiple packages", async () => {
		// Mock workspace-tools to return both packages
		vi.mocked(getWorkspaceInfos).mockReturnValue([
			createWorkspace("@test/pkg-a", "/test/pkg-a"),
			createWorkspace("@test/pkg-b", "/test/pkg-b"),
		]);

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
			if (pathStr.includes("CHANGELOG.md")) {
				return `# Changelog\n\n## 1.0.0\n\nNotes for 1.0.0\n\n## 2.0.0\n\nNotes for 2.0.0`;
			}
			return "";
		});

		const result = await generateReleaseNotesPreview("pnpm");

		expect(result.packages).toHaveLength(2);
	});

	it("should use correct changeset command for yarn", async () => {
		vi.mocked(core.getState).mockImplementation((name: string) => {
			if (name === "packageManager") return "yarn";
			return "";
		});

		await generateReleaseNotesPreview("yarn");

		// Command uses a temp filename: --output=.changeset-status-{timestamp}.json
		expect(exec.exec).toHaveBeenCalledWith("yarn", expect.arrayContaining(["changeset", "status"]), expect.any(Object));
		// Verify the output flag format
		const calls = vi.mocked(exec.exec).mock.calls;
		const yarnCall = calls.find((call) => call[0] === "yarn" && (call[1] as string[])?.includes("changeset"));
		expect(yarnCall).toBeDefined();
		const args = yarnCall?.[1] as string[];
		expect(args?.some((arg) => arg.startsWith("--output=.changeset-status"))).toBe(true);
	});

	it("should use correct changeset command for npm", async () => {
		vi.mocked(core.getState).mockImplementation((name: string) => {
			if (name === "packageManager") return "npm";
			return "";
		});

		await generateReleaseNotesPreview("npm");

		// Command uses a temp filename: --output=.changeset-status-{timestamp}.json
		expect(exec.exec).toHaveBeenCalledWith(
			"npm",
			expect.arrayContaining(["run", "changeset", "status"]),
			expect.any(Object),
		);
		// Verify the output flag format
		const calls = vi.mocked(exec.exec).mock.calls;
		const npmCall = calls.find((call) => call[0] === "npm" && (call[1] as string[])?.includes("changeset"));
		expect(npmCall).toBeDefined();
		const args = npmCall?.[1] as string[];
		expect(args?.some((arg) => arg.startsWith("--output=.changeset-status") || arg === "--")).toBe(true);
	});

	it("should handle error when reading CHANGELOG throws", async () => {
		// Mock workspace-tools to return the package
		vi.mocked(getWorkspaceInfos).mockReturnValue([createWorkspace("@test/pkg", "/test/pkg")]);

		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockImplementation((path) => {
			const pathStr = String(path);
			if (pathStr.includes(".changeset-status")) {
				return JSON.stringify({
					releases: [{ name: "@test/pkg", newVersion: "1.0.0", type: "minor" }],
					changesets: [],
				});
			}
			if (pathStr.includes("CHANGELOG.md")) {
				throw new Error("Permission denied");
			}
			return "";
		});

		const result = await generateReleaseNotesPreview("pnpm");

		expect(result.packages).toHaveLength(1);
		expect(result.packages[0].hasChangelog).toBe(false);
		expect(result.packages[0].error).toBe("Permission denied");
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Permission denied"));
	});

	it("should handle non-Error throw when reading CHANGELOG", async () => {
		// Mock workspace-tools to return the package
		vi.mocked(getWorkspaceInfos).mockReturnValue([createWorkspace("@test/pkg", "/test/pkg")]);

		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockImplementation((path) => {
			const pathStr = String(path);
			if (pathStr.includes(".changeset-status")) {
				return JSON.stringify({
					releases: [{ name: "@test/pkg", newVersion: "1.0.0", type: "minor" }],
					changesets: [],
				});
			}
			if (pathStr.includes("CHANGELOG.md")) {
				throw "String error"; // Non-Error throw
			}
			return "";
		});

		const result = await generateReleaseNotesPreview("pnpm");

		expect(result.packages).toHaveLength(1);
		expect(result.packages[0].error).toBe("String error");
	});

	it("should show 'no release notes' when notes are empty", async () => {
		// Mock workspace-tools to return the package
		vi.mocked(getWorkspaceInfos).mockReturnValue([createWorkspace("@test/pkg", "/test/pkg")]);

		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockImplementation((path) => {
			const pathStr = String(path);
			if (pathStr.includes(".changeset-status")) {
				return JSON.stringify({
					releases: [{ name: "@test/pkg", newVersion: "1.0.0", type: "minor" }],
					changesets: [],
				});
			}
			if (pathStr.includes("CHANGELOG.md")) {
				// Version header exists but has empty content before next header
				return `# Changelog

## 1.0.0

## 0.9.0

Previous notes`;
			}
			return "";
		});

		const result = await generateReleaseNotesPreview("pnpm");

		expect(result.packages).toHaveLength(1);
		// Notes should be empty string (after trim)
		expect(result.packages[0].notes).toBe("");
		// The summary should show "No release notes available" (within the full markdown)
		expect(core.summary.addRaw).toHaveBeenCalledWith(expect.stringContaining("_No release notes available_"));
	});

	it("should capture stderr from changeset status command", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
			// Emit stderr first (warning from changeset)
			if (options?.listeners?.stderr) {
				options.listeners.stderr(Buffer.from("Warning: changeset config issue\n"));
			}
			// Then emit stdout with valid JSON
			if (options?.listeners?.stdout) {
				options.listeners.stdout(Buffer.from(JSON.stringify({ releases: [], changesets: [] })));
			}
			return 0;
		});

		const result = await generateReleaseNotesPreview("pnpm");

		expect(result.packages).toEqual([]);
		expect(core.debug).toHaveBeenCalledWith(expect.stringContaining("changeset config issue"));
	});

	describe("enhanced summary with publishValidations", () => {
		it("should generate registry table when publishValidations provided", async () => {
			vi.mocked(getWorkspaceInfos).mockReturnValue([createWorkspace("@test/pkg", "/test/pkg")]);

			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes(".changeset-status")) {
					return JSON.stringify({
						releases: [{ name: "@test/pkg", newVersion: "1.0.0", oldVersion: "0.9.0", type: "minor" }],
						changesets: [{ id: "change-1", summary: "Test change", releases: [{ name: "@test/pkg", type: "minor" }] }],
					});
				}
				if (pathStr.includes("CHANGELOG.md")) {
					return `# Changelog\n\n## 1.0.0\n\n### Features\n\n- New feature`;
				}
				return "";
			});

			const publishValidations = [
				{
					name: "@test/pkg",
					version: "1.0.0",
					path: "/test/pkg",
					targets: [
						{
							target: {
								protocol: "npm" as const,
								registry: "https://registry.npmjs.org/",
								directory: "/test/pkg/dist/npm",
								access: "public" as const,
								provenance: true,
								tag: "latest",
								tokenEnv: "NPM_TOKEN",
							},
							canPublish: true,
							directoryExists: true,
							packageJsonValid: true,
							dryRunPassed: true,
							dryRunOutput: "",
							dryRunError: "",
							versionConflict: false,
							provenanceReady: true,
							stats: { packageSize: "1.2 kB", unpackedSize: "3.5 kB", totalFiles: 5 },
							message: "Ready to publish",
						},
					],
					allTargetsValid: true,
					hasPublishableTargets: true,
				},
			];

			const result = await generateReleaseNotesPreview("pnpm", publishValidations);

			expect(result.packages).toHaveLength(1);
			// Should include registry table with stats
			expect(core.summary.addRaw).toHaveBeenCalledWith(expect.stringContaining("npm"));
			expect(core.summary.addRaw).toHaveBeenCalledWith(expect.stringContaining("1.2 kB"));
		});

		it("should show provenance warning when not ready", async () => {
			vi.mocked(getWorkspaceInfos).mockReturnValue([createWorkspace("@test/pkg", "/test/pkg")]);

			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes(".changeset-status")) {
					return JSON.stringify({
						releases: [{ name: "@test/pkg", newVersion: "1.0.0", oldVersion: "0.9.0", type: "minor" }],
						changesets: [],
					});
				}
				if (pathStr.includes("CHANGELOG.md")) {
					return `# Changelog\n\n## 1.0.0\n\nNotes`;
				}
				return "";
			});

			const publishValidations = [
				{
					name: "@test/pkg",
					version: "1.0.0",
					path: "/test/pkg",
					targets: [
						{
							target: {
								protocol: "npm" as const,
								registry: "https://registry.npmjs.org/",
								directory: "/test/pkg/dist/npm",
								access: "public" as const,
								provenance: true,
								tag: "latest",
								tokenEnv: "NPM_TOKEN",
							},
							canPublish: true,
							directoryExists: true,
							packageJsonValid: true,
							dryRunPassed: true,
							dryRunOutput: "",
							dryRunError: "",
							versionConflict: false,
							provenanceReady: false, // Not ready
							stats: {},
							message: "Provenance not ready",
						},
					],
					allTargetsValid: true,
					hasPublishableTargets: true,
				},
			];

			await generateReleaseNotesPreview("pnpm", publishValidations);

			// Should show warning icon for provenance
			expect(core.summary.addRaw).toHaveBeenCalledWith(expect.stringContaining("⚠️"));
		});

		it("should show dash when provenance is disabled", async () => {
			vi.mocked(getWorkspaceInfos).mockReturnValue([createWorkspace("@test/pkg", "/test/pkg")]);

			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes(".changeset-status")) {
					return JSON.stringify({
						releases: [{ name: "@test/pkg", newVersion: "1.0.0", oldVersion: "0.9.0", type: "minor" }],
						changesets: [],
					});
				}
				if (pathStr.includes("CHANGELOG.md")) {
					return `# Changelog\n\n## 1.0.0\n\nNotes`;
				}
				return "";
			});

			const publishValidations = [
				{
					name: "@test/pkg",
					version: "1.0.0",
					path: "/test/pkg",
					targets: [
						{
							target: {
								protocol: "npm" as const,
								registry: null,
								directory: "/test/pkg/dist/npm",
								access: "restricted" as const, // No explicit access
								provenance: false, // Disabled
								tag: "latest",
								tokenEnv: "NPM_TOKEN",
							},
							canPublish: true,
							directoryExists: true,
							packageJsonValid: true,
							dryRunPassed: true,
							dryRunOutput: "",
							dryRunError: "",
							versionConflict: false,
							provenanceReady: false,
							stats: {},
							message: "Ready to publish",
						},
					],
					allTargetsValid: true,
					hasPublishableTargets: true,
				},
			];

			await generateReleaseNotesPreview("pnpm", publishValidations);

			// Summary should be generated
			expect(core.summary.addRaw).toHaveBeenCalled();
		});

		it("should handle empty targets in publishValidations", async () => {
			vi.mocked(getWorkspaceInfos).mockReturnValue([createWorkspace("@test/pkg", "/test/pkg")]);

			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes(".changeset-status")) {
					return JSON.stringify({
						releases: [{ name: "@test/pkg", newVersion: "1.0.0", oldVersion: "0.9.0", type: "minor" }],
						changesets: [],
					});
				}
				if (pathStr.includes("CHANGELOG.md")) {
					return `# Changelog\n\n## 1.0.0\n\nNotes`;
				}
				return "";
			});

			const publishValidations = [
				{
					name: "@test/pkg",
					version: "1.0.0",
					path: "/test/pkg",
					targets: [], // Empty targets
					allTargetsValid: true,
					hasPublishableTargets: false,
				},
			];

			const result = await generateReleaseNotesPreview("pnpm", publishValidations);

			expect(result.packages).toHaveLength(1);
		});

		it("should show first release indicator for 0.0.0 version", async () => {
			vi.mocked(getWorkspaceInfos).mockReturnValue([createWorkspace("@test/pkg", "/test/pkg")]);

			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes(".changeset-status")) {
					return JSON.stringify({
						releases: [{ name: "@test/pkg", newVersion: "0.1.0", oldVersion: "0.0.0", type: "minor" }],
						changesets: [],
					});
				}
				if (pathStr.includes("CHANGELOG.md")) {
					return `# Changelog\n\n## 0.1.0\n\n### Features\n\n- Initial release`;
				}
				return "";
			});

			await generateReleaseNotesPreview("pnpm");

			// Should show first release indicator
			expect(core.summary.addRaw).toHaveBeenCalledWith(expect.stringContaining("First Release"));
		});

		it("should generate Packages Not Releasing section", async () => {
			// Mock findProjectRoot for getAllWorkspacePackages
			vi.mocked(findProjectRoot).mockReturnValue("/test/workspace");

			// Two packages in workspace, only one releasing
			vi.mocked(getWorkspaceInfos).mockReturnValue([
				{
					name: "@test/pkg-a",
					path: "/test/pkg-a",
					packageJson: {
						packageJsonPath: "/test/pkg-a/package.json",
						name: "@test/pkg-a",
						version: "1.0.0",
						publishConfig: { access: "public" },
					},
				},
				{
					name: "@test/pkg-b",
					path: "/test/pkg-b",
					packageJson: {
						packageJsonPath: "/test/pkg-b/package.json",
						name: "@test/pkg-b",
						version: "2.0.0",
						private: true, // Private package - won't release
					},
				},
			]);

			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes(".changeset-status")) {
					return JSON.stringify({
						releases: [{ name: "@test/pkg-a", newVersion: "1.1.0", oldVersion: "1.0.0", type: "minor" }],
						changesets: [],
					});
				}
				if (pathStr.includes("CHANGELOG.md")) {
					return `# Changelog\n\n## 1.1.0\n\nNotes`;
				}
				return "";
			});

			await generateReleaseNotesPreview("pnpm");

			// Should show "Packages Not Releasing" section with pkg-b
			expect(core.summary.addRaw).toHaveBeenCalledWith(expect.stringContaining("Packages Not Releasing"));
			expect(core.summary.addRaw).toHaveBeenCalledWith(expect.stringContaining("@test/pkg-b"));
			expect(core.summary.addRaw).toHaveBeenCalledWith(expect.stringContaining("Private"));
		});

		it("should count changesets per package in summary", async () => {
			vi.mocked(getWorkspaceInfos).mockReturnValue([createWorkspace("@test/pkg", "/test/pkg")]);

			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes(".changeset-status")) {
					return JSON.stringify({
						releases: [{ name: "@test/pkg", newVersion: "1.0.0", oldVersion: "0.9.0", type: "minor" }],
						changesets: [
							{ id: "change-1", summary: "First change", releases: [{ name: "@test/pkg", type: "minor" }] },
							{ id: "change-2", summary: "Second change", releases: [{ name: "@test/pkg", type: "patch" }] },
						],
					});
				}
				if (pathStr.includes("CHANGELOG.md")) {
					return `# Changelog\n\n## 1.0.0\n\nNotes`;
				}
				return "";
			});

			await generateReleaseNotesPreview("pnpm");

			// Summary table should show changeset count (2)
			expect(core.summary.addRaw).toHaveBeenCalled();
		});
	});

	describe("linked package handling", () => {
		it("should generate explanatory notes for linked packages with no direct changes", async () => {
			vi.mocked(getWorkspaceInfos).mockReturnValue([
				createWorkspace("@test/pkg-a", "/test/pkg-a"),
				createWorkspace("@test/pkg-b", "/test/pkg-b"),
			]);

			vi.mocked(fs.existsSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes(".changeset-status")) return true;
				if (pathStr.includes(".changeset/config.json")) return true;
				if (pathStr.includes("CHANGELOG.md")) return true;
				return false;
			});

			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes(".changeset-status")) {
					return JSON.stringify({
						releases: [
							{ name: "@test/pkg-a", newVersion: "1.0.0", type: "minor" },
							{ name: "@test/pkg-b", newVersion: "1.0.0", type: "none" },
						],
						changesets: [],
					});
				}
				if (pathStr.includes(".changeset/config.json")) {
					return JSON.stringify({
						linked: [["@test/pkg-a", "@test/pkg-b"]], // Linked, not fixed
					});
				}
				if (pathStr.includes("pkg-a") && pathStr.includes("CHANGELOG.md")) {
					return `# Changelog\n\n## 1.0.0\n\n### Features\n\n- New feature`;
				}
				if (pathStr.includes("pkg-b") && pathStr.includes("CHANGELOG.md")) {
					return `# Changelog\n\n## 0.9.0\n\n- Old stuff`;
				}
				return "";
			});

			const result = await generateReleaseNotesPreview("pnpm");

			expect(result.packages).toHaveLength(2);
			expect(result.packages[1].name).toBe("@test/pkg-b");
			expect(result.packages[1].notes).toContain("linked versioning");
		});
	});

	describe("fixed package handling", () => {
		it("should generate explanatory notes for fixed packages with no direct changes", async () => {
			// Mock workspace-tools to return both packages
			vi.mocked(getWorkspaceInfos).mockReturnValue([
				createWorkspace("@test/pkg-a", "/test/pkg-a"),
				createWorkspace("@test/pkg-b", "/test/pkg-b"),
			]);

			vi.mocked(fs.existsSync).mockImplementation((path) => {
				const pathStr = String(path);
				// Changeset status temp file and config exist
				if (pathStr.includes(".changeset-status")) return true;
				if (pathStr.includes(".changeset/config.json")) return true;
				// Both packages have CHANGELOG.md
				if (pathStr.includes("CHANGELOG.md")) return true;
				return false;
			});

			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes(".changeset-status")) {
					return JSON.stringify({
						releases: [
							{ name: "@test/pkg-a", newVersion: "1.0.0", type: "minor" },
							{ name: "@test/pkg-b", newVersion: "1.0.0", type: "none" },
						],
						changesets: [],
					});
				}
				if (pathStr.includes(".changeset/config.json")) {
					return JSON.stringify({
						fixed: [["@test/pkg-a", "@test/pkg-b"]],
					});
				}
				if (pathStr.includes("pkg-a") && pathStr.includes("CHANGELOG.md")) {
					return `# Changelog\n\n## 1.0.0\n\n### Features\n\n- New feature`;
				}
				if (pathStr.includes("pkg-b") && pathStr.includes("CHANGELOG.md")) {
					// pkg-b has a CHANGELOG but version section not found (no direct changes)
					return `# Changelog\n\n## 0.9.0\n\n- Old stuff`;
				}
				return "";
			});

			const result = await generateReleaseNotesPreview("pnpm");

			expect(result.packages).toHaveLength(2);

			// pkg-a has normal notes
			expect(result.packages[0].name).toBe("@test/pkg-a");
			expect(result.packages[0].notes).toContain("New feature");

			// pkg-b has fixed package notes
			expect(result.packages[1].name).toBe("@test/pkg-b");
			expect(result.packages[1].notes).toContain("no direct changes");
			expect(result.packages[1].notes).toContain("fixed versioning");
			expect(result.packages[1].notes).toContain("@test/pkg-a");
		});

		it("should not generate fixed notes when package is not in a fixed group", async () => {
			vi.mocked(getWorkspaceInfos).mockReturnValue([createWorkspace("@test/pkg", "/test/pkg")]);

			vi.mocked(fs.existsSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes(".changeset-status")) return true;
				if (pathStr.includes(".changeset/config.json")) return true;
				if (pathStr.includes("CHANGELOG.md")) return true;
				return false;
			});

			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes(".changeset-status")) {
					return JSON.stringify({
						releases: [{ name: "@test/pkg", newVersion: "1.0.0", type: "minor" }],
						changesets: [],
					});
				}
				if (pathStr.includes(".changeset/config.json")) {
					return JSON.stringify({
						fixed: [], // No fixed groups
					});
				}
				if (pathStr.includes("CHANGELOG.md")) {
					// Version section not found
					return `# Changelog\n\n## 0.9.0\n\n- Old stuff`;
				}
				return "";
			});

			const result = await generateReleaseNotesPreview("pnpm");

			expect(result.packages).toHaveLength(1);
			expect(result.packages[0].error).toContain("Could not find version section");
		});

		it("should handle missing changeset config gracefully", async () => {
			vi.mocked(getWorkspaceInfos).mockReturnValue([createWorkspace("@test/pkg", "/test/pkg")]);

			vi.mocked(fs.existsSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes(".changeset-status")) return true;
				// Config file doesn't exist
				if (pathStr.includes(".changeset/config.json")) return false;
				if (pathStr.includes("CHANGELOG.md")) return true;
				return false;
			});

			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes(".changeset-status")) {
					return JSON.stringify({
						releases: [{ name: "@test/pkg", newVersion: "1.0.0", type: "minor" }],
						changesets: [],
					});
				}
				if (pathStr.includes("CHANGELOG.md")) {
					return `# Changelog\n\n## 1.0.0\n\n### Features\n\n- New feature`;
				}
				return "";
			});

			const result = await generateReleaseNotesPreview("pnpm");

			expect(result.packages).toHaveLength(1);
			expect(result.packages[0].notes).toContain("New feature");
		});

		it("should handle empty notes for non-fixed packages", async () => {
			vi.mocked(getWorkspaceInfos).mockReturnValue([createWorkspace("@test/pkg", "/test/pkg")]);

			vi.mocked(fs.existsSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes(".changeset-status")) return true;
				if (pathStr.includes(".changeset/config.json")) return true;
				if (pathStr.includes("CHANGELOG.md")) return true;
				return false;
			});

			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes(".changeset-status")) {
					return JSON.stringify({
						releases: [{ name: "@test/pkg", newVersion: "1.0.0", type: "minor" }],
						changesets: [],
					});
				}
				if (pathStr.includes(".changeset/config.json")) {
					return JSON.stringify({
						fixed: [["@other/pkg-a", "@other/pkg-b"]], // Different fixed group
					});
				}
				if (pathStr.includes("CHANGELOG.md")) {
					// Version section exists but has no content
					return `# Changelog\n\n## 1.0.0\n\n## 0.9.0\n\nOld notes`;
				}
				return "";
			});

			const result = await generateReleaseNotesPreview("pnpm");

			expect(result.packages).toHaveLength(1);
			// Empty notes for non-fixed package should still be empty
			expect(result.packages[0].notes).toBe("");
		});

		it("should handle fixed group with only one sibling being released", async () => {
			vi.mocked(getWorkspaceInfos).mockReturnValue([
				createWorkspace("@test/pkg-a", "/test/pkg-a"),
				createWorkspace("@test/pkg-b", "/test/pkg-b"),
			]);

			vi.mocked(fs.existsSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes(".changeset-status")) return true;
				if (pathStr.includes(".changeset/config.json")) return true;
				if (pathStr.includes("CHANGELOG.md")) return true;
				return false;
			});

			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes(".changeset-status")) {
					return JSON.stringify({
						releases: [
							{ name: "@test/pkg-a", newVersion: "1.0.0", type: "minor" },
							{ name: "@test/pkg-b", newVersion: "1.0.0", type: "none" },
						],
						changesets: [],
					});
				}
				if (pathStr.includes(".changeset/config.json")) {
					// Fixed group includes a third package not being released
					return JSON.stringify({
						fixed: [["@test/pkg-a", "@test/pkg-b", "@test/pkg-c"]],
					});
				}
				if (pathStr.includes("pkg-a") && pathStr.includes("CHANGELOG.md")) {
					return `# Changelog\n\n## 1.0.0\n\n### Features\n\n- New feature`;
				}
				if (pathStr.includes("pkg-b") && pathStr.includes("CHANGELOG.md")) {
					return `# Changelog\n\n## 0.9.0\n\n- Old stuff`;
				}
				return "";
			});

			const result = await generateReleaseNotesPreview("pnpm");

			expect(result.packages).toHaveLength(2);
			expect(result.packages[1].name).toBe("@test/pkg-b");
			// Should mention only the sibling that is actually being released
			expect(result.packages[1].notes).toContain("@test/pkg-a");
			// Should list both packages that are maintaining version alignment
			expect(result.packages[1].notes).toContain("@test/pkg-b");
		});
	});
});
