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

		// Default exec mock for changeset status
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
			if (options?.listeners?.stdout) {
				options.listeners.stdout(Buffer.from(JSON.stringify({ releases: [], changesets: [] })));
			}
			return 0;
		});

		// Default fs mocks
		vi.mocked(fs.existsSync).mockReturnValue(false);
		vi.mocked(fs.readFileSync).mockReturnValue("");
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
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
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
		});

		vi.mocked(fs.existsSync).mockImplementation((path) => {
			const pathStr = String(path);
			return pathStr.includes("package.json") || pathStr.includes("CHANGELOG.md");
		});

		vi.mocked(fs.readFileSync).mockImplementation((path) => {
			const pathStr = String(path);
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
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
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
		});

		vi.mocked(fs.existsSync).mockImplementation((path) => {
			const pathStr = String(path);
			return pathStr.includes("package.json") && !pathStr.includes("CHANGELOG");
		});

		vi.mocked(fs.readFileSync).mockImplementation((path) => {
			const pathStr = String(path);
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
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
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
		});

		vi.mocked(fs.existsSync).mockReturnValue(false);

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
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
			if (options?.listeners?.stdout) {
				options.listeners.stdout(
					Buffer.from(
						JSON.stringify({
							releases: [{ name: "@test/pkg", newVersion: "2.0.0", type: "major" }],
							changesets: [],
						}),
					),
				);
			}
			return 0;
		});

		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockImplementation((path) => {
			const pathStr = String(path);
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
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
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
		});

		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockImplementation((path) => {
			const pathStr = String(path);
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

		expect(exec.exec).toHaveBeenCalledWith("yarn", ["changeset", "status", "--output=json"], expect.any(Object));
	});

	it("should use correct changeset command for npm", async () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "token") return "test-token";
			if (name === "package-manager") return "npm";
			return "";
		});

		await generateReleaseNotesPreview();

		expect(exec.exec).toHaveBeenCalledWith("npm", ["run", "changeset", "status", "--output=json"], expect.any(Object));
	});
});
