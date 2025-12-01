import * as fs from "node:fs";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { context, getOctokit } from "@actions/github";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateReleaseNotesPreview } from "../src/utils/generate-release-notes-preview.js";
import { cleanupTestEnvironment, createMockOctokit, setupTestEnvironment } from "./utils/github-mocks.js";
import type { ExecOptionsWithListeners, MockOctokit } from "./utils/test-types.js";

// Mock modules
vi.mock("@actions/core");
vi.mock("@actions/exec");
vi.mock("@actions/github");
vi.mock("node:fs");

describe("generate-release-notes-preview", () => {
	let mockOctokit: MockOctokit;

	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });

		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "token") return "test-token";
			if (name === "package-manager") return "pnpm";
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

		// Default exec mock
		vi.mocked(exec.exec).mockResolvedValue(0);

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
		cleanupTestEnvironment();
	});

	it("should handle no packages to release", async () => {
		const result = await generateReleaseNotesPreview();

		expect(result.packages).toEqual([]);
		expect(result.checkId).toBe(12345);
	});

	it("should extract release notes from CHANGELOG", async () => {
		vi.mocked(fs.existsSync).mockImplementation((path) => {
			const pathStr = String(path);
			return (
				pathStr.includes(".changeset-status") || pathStr.includes("package.json") || pathStr.includes("CHANGELOG.md")
			);
		});

		vi.mocked(fs.readFileSync).mockImplementation((path) => {
			const pathStr = String(path);
			if (pathStr.includes(".changeset-status")) {
				return JSON.stringify({
					releases: [{ name: "@test/pkg", newVersion: "1.0.0", type: "minor" }],
					changesets: [],
				});
			}
			if (pathStr.includes("package.json")) {
				return JSON.stringify({ name: "@test/pkg" });
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

		const result = await generateReleaseNotesPreview();

		expect(result.packages).toHaveLength(1);
		expect(result.packages[0].hasChangelog).toBe(true);
		expect(result.packages[0].notes).toContain("Added new feature");
	});

	it("should handle missing CHANGELOG", async () => {
		vi.mocked(fs.existsSync).mockImplementation((path) => {
			const pathStr = String(path);
			// Changeset temp file exists, package.json exists, but CHANGELOG does not
			return (
				pathStr.includes(".changeset-status") || (pathStr.includes("package.json") && !pathStr.includes("CHANGELOG"))
			);
		});

		vi.mocked(fs.readFileSync).mockImplementation((path) => {
			const pathStr = String(path);
			if (pathStr.includes(".changeset-status")) {
				return JSON.stringify({
					releases: [{ name: "@test/pkg", newVersion: "1.0.0", type: "minor" }],
					changesets: [],
				});
			}
			if (pathStr.includes("package.json")) {
				return JSON.stringify({ name: "@test/pkg" });
			}
			return "";
		});

		const result = await generateReleaseNotesPreview();

		expect(result.packages).toHaveLength(1);
		expect(result.packages[0].hasChangelog).toBe(false);
		expect(result.packages[0].error).toBe("CHANGELOG.md not found");
	});

	it("should handle package directory not found", async () => {
		vi.mocked(fs.existsSync).mockImplementation((path) => {
			const pathStr = String(path);
			// Only changeset temp file exists, package.json does not exist
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

		const result = await generateReleaseNotesPreview();

		expect(result.packages).toHaveLength(1);
		expect(result.packages[0].error).toBe("Package directory not found");
	});

	it("should include dry-run mode in check output", async () => {
		vi.mocked(core.getBooleanInput).mockImplementation((name: string) => {
			if (name === "dry-run") return true;
			return false;
		});

		await generateReleaseNotesPreview();

		expect(mockOctokit.rest.checks.create).toHaveBeenCalledWith(
			expect.objectContaining({
				name: expect.stringContaining("Dry Run"),
			}),
		);
	});

	it("should handle version section not found in CHANGELOG", async () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockImplementation((path) => {
			const pathStr = String(path);
			if (pathStr.includes(".changeset-status")) {
				return JSON.stringify({
					releases: [{ name: "@test/pkg", newVersion: "2.0.0", type: "major" }],
					changesets: [],
				});
			}
			if (pathStr.includes("package.json")) {
				return JSON.stringify({ name: "@test/pkg" });
			}
			if (pathStr.includes("CHANGELOG.md")) {
				return `# Changelog

## 1.0.0

### Features

- Old feature`;
			}
			return "";
		});

		const result = await generateReleaseNotesPreview();

		expect(result.packages).toHaveLength(1);
		expect(result.packages[0].error).toContain("Could not find version section");
	});

	it("should handle multiple packages", async () => {
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
			if (pathStr.includes("package.json")) {
				if (pathStr.includes("pkg-a")) {
					return JSON.stringify({ name: "@test/pkg-a" });
				}
				if (pathStr.includes("pkg-b")) {
					return JSON.stringify({ name: "@test/pkg-b" });
				}
			}
			if (pathStr.includes("CHANGELOG.md")) {
				return `# Changelog\n\n## 1.0.0\n\nNotes for 1.0.0\n\n## 2.0.0\n\nNotes for 2.0.0`;
			}
			return "";
		});

		const result = await generateReleaseNotesPreview();

		expect(result.packages).toHaveLength(2);
	});

	it("should use correct changeset command for yarn", async () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "token") return "test-token";
			if (name === "package-manager") return "yarn";
			return "";
		});

		await generateReleaseNotesPreview();

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
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "token") return "test-token";
			if (name === "package-manager") return "npm";
			return "";
		});

		await generateReleaseNotesPreview();

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
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockImplementation((path) => {
			const pathStr = String(path);
			if (pathStr.includes(".changeset-status")) {
				return JSON.stringify({
					releases: [{ name: "@test/pkg", newVersion: "1.0.0", type: "minor" }],
					changesets: [],
				});
			}
			if (pathStr.includes("package.json")) {
				return JSON.stringify({ name: "@test/pkg" });
			}
			if (pathStr.includes("CHANGELOG.md")) {
				throw new Error("Permission denied");
			}
			return "";
		});

		const result = await generateReleaseNotesPreview();

		expect(result.packages).toHaveLength(1);
		expect(result.packages[0].hasChangelog).toBe(false);
		expect(result.packages[0].error).toBe("Permission denied");
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Permission denied"));
	});

	it("should handle non-Error throw when reading CHANGELOG", async () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockImplementation((path) => {
			const pathStr = String(path);
			if (pathStr.includes(".changeset-status")) {
				return JSON.stringify({
					releases: [{ name: "@test/pkg", newVersion: "1.0.0", type: "minor" }],
					changesets: [],
				});
			}
			if (pathStr.includes("package.json")) {
				return JSON.stringify({ name: "@test/pkg" });
			}
			if (pathStr.includes("CHANGELOG.md")) {
				throw "String error"; // Non-Error throw
			}
			return "";
		});

		const result = await generateReleaseNotesPreview();

		expect(result.packages).toHaveLength(1);
		expect(result.packages[0].error).toBe("String error");
	});

	it("should show 'no release notes' when notes are empty", async () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockImplementation((path) => {
			const pathStr = String(path);
			if (pathStr.includes(".changeset-status")) {
				return JSON.stringify({
					releases: [{ name: "@test/pkg", newVersion: "1.0.0", type: "minor" }],
					changesets: [],
				});
			}
			if (pathStr.includes("package.json")) {
				return JSON.stringify({ name: "@test/pkg" });
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

		const result = await generateReleaseNotesPreview();

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

		const result = await generateReleaseNotesPreview();

		expect(result.packages).toEqual([]);
		expect(core.debug).toHaveBeenCalledWith(expect.stringContaining("changeset config issue"));
	});
});
