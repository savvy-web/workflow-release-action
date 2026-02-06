import { readFile, unlink } from "node:fs/promises";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { context, getOctokit } from "@actions/github";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findProjectRoot, getWorkspaces } from "workspace-tools";
import { detectPublishableChanges } from "../src/utils/detect-publishable-changes.js";
import { cleanupTestEnvironment, createMockOctokit, setupTestEnvironment } from "./utils/github-mocks.js";
import type { MockOctokit } from "./utils/test-types.js";

// Mock modules
vi.mock("@actions/core");
vi.mock("@actions/exec");
vi.mock("@actions/github");
vi.mock("node:fs/promises");
vi.mock("workspace-tools");

describe("detect-publishable-changes", () => {
	let mockOctokit: MockOctokit;

	// Track what the changeset status file should contain
	let changesetStatusContent: string;

	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });

		// Default: empty changeset status
		changesetStatusContent = JSON.stringify({ releases: [], changesets: [] });

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

		// Setup core mocks
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "token") return "test-token";
			return "";
		});
		vi.mocked(core.getState).mockReturnValue("test-token");

		// Setup octokit mock
		mockOctokit = createMockOctokit();
		vi.mocked(getOctokit).mockReturnValue(mockOctokit as unknown as ReturnType<typeof getOctokit>);
		Object.defineProperty(vi.mocked(context), "repo", {
			value: { owner: "test-owner", repo: "test-repo" },
			writable: true,
		});
		Object.defineProperty(vi.mocked(context), "sha", { value: "abc123", writable: true });

		// Mock workspace-tools - default to empty workspace
		vi.mocked(findProjectRoot).mockReturnValue("/test/workspace");
		vi.mocked(getWorkspaces).mockReturnValue([]);

		// Mock readFile - handles both changeset status file and root package.json
		vi.mocked(readFile).mockImplementation(async (path: Parameters<typeof readFile>[0]) => {
			const pathStr = String(path);
			if (pathStr.includes("changeset-status")) {
				return changesetStatusContent;
			}
			// Root package.json fallback
			return '{"name": "@test/pkg"}';
		});

		// Mock unlink for cleanup
		vi.mocked(unlink).mockResolvedValue(undefined);

		// Mock exec - just returns success, output is via file
		vi.mocked(exec.exec).mockResolvedValue(0);
	});

	afterEach(() => {
		cleanupTestEnvironment();
	});

	it("should detect no changes when changeset has no releases", async () => {
		// Default changesetStatusContent is already { releases: [], changesets: [] }

		const result = await detectPublishableChanges("pnpm", false);

		expect(result.hasChanges).toBe(false);
		expect(result.packages).toEqual([]);
		expect(result.versionOnlyPackages).toEqual([]);
		expect(result.checkId).toBe(12345);
		expect(mockOctokit.rest.checks.create).toHaveBeenCalled();
	});

	it("should detect changes for packages with publishConfig.access", async () => {
		changesetStatusContent = JSON.stringify({
			releases: [
				{ name: "@test/pkg-a", newVersion: "1.0.0", type: "minor" },
				{ name: "@test/pkg-b", newVersion: "2.0.0", type: "major" },
			],
			changesets: [{ id: "change-1", summary: "Test change", releases: [] }],
		});

		// Mock workspace-tools to return packages
		vi.mocked(getWorkspaces).mockReturnValue([
			{
				name: "@test/pkg-a",
				path: "/test/workspace/packages/pkg-a",
				packageJson: {
					name: "@test/pkg-a",
					version: "0.0.0",
					packageJsonPath: "/test/workspace/packages/pkg-a/package.json",
					publishConfig: { access: "public" },
				},
			},
			{
				name: "@test/pkg-b",
				path: "/test/workspace/packages/pkg-b",
				packageJson: {
					name: "@test/pkg-b",
					version: "0.0.0",
					packageJsonPath: "/test/workspace/packages/pkg-b/package.json",
					publishConfig: { access: "public" },
				},
			},
		]);

		const result = await detectPublishableChanges("pnpm", false);

		expect(result.hasChanges).toBe(true);
		expect(result.packages.length).toBe(2);
		expect(result.packages[0].name).toBe("@test/pkg-a");
		expect(result.packages[1].name).toBe("@test/pkg-b");
	});

	it("should skip packages with type 'none'", async () => {
		changesetStatusContent = JSON.stringify({
			releases: [
				{ name: "@test/pkg-a", newVersion: "1.0.0", type: "none" },
				{ name: "@test/pkg-b", newVersion: "2.0.0", type: "patch" },
			],
			changesets: [],
		});

		vi.mocked(getWorkspaces).mockReturnValue([
			{
				name: "@test/pkg-a",
				path: "/test/workspace/packages/pkg-a",
				packageJson: {
					name: "@test/pkg-a",
					version: "0.0.0",
					packageJsonPath: "/test/workspace/packages/pkg-a/package.json",
					publishConfig: { access: "public" },
				},
			},
			{
				name: "@test/pkg-b",
				path: "/test/workspace/packages/pkg-b",
				packageJson: {
					name: "@test/pkg-b",
					version: "0.0.0",
					packageJsonPath: "/test/workspace/packages/pkg-b/package.json",
					publishConfig: { access: "public" },
				},
			},
		]);

		const result = await detectPublishableChanges("pnpm", false);

		expect(result.packages.length).toBe(1);
		expect(result.packages[0].name).toBe("@test/pkg-b");
	});

	it("should use correct changeset command for different package managers", async () => {
		// Default changesetStatusContent is already set

		await detectPublishableChanges("pnpm", false);
		expect(exec.exec).toHaveBeenCalledWith(
			"pnpm",
			["exec", "changeset", "status", "--output", expect.stringContaining("changeset-status")],
			expect.any(Object),
		);

		await detectPublishableChanges("yarn", false);
		expect(exec.exec).toHaveBeenCalledWith(
			"yarn",
			["changeset", "status", "--output", expect.stringContaining("changeset-status")],
			expect.any(Object),
		);

		await detectPublishableChanges("npm", false);
		expect(exec.exec).toHaveBeenCalledWith(
			"npx",
			["changeset", "status", "--output", expect.stringContaining("changeset-status")],
			expect.any(Object),
		);
	});

	it("should handle empty status file (no changesets)", async () => {
		changesetStatusContent = "";

		const result = await detectPublishableChanges("pnpm", false);

		expect(result.hasChanges).toBe(false);
		expect(result.packages).toEqual([]);
		// Should use info for expected empty output
		expect(core.info).toHaveBeenCalledWith("Changeset status file is empty (no changesets present)");
		expect(core.warning).not.toHaveBeenCalled();
	});

	it("should handle file not created (no changesets or command failed)", async () => {
		// Simulate file not found
		vi.mocked(readFile).mockImplementation(async (path: Parameters<typeof readFile>[0]) => {
			const pathStr = String(path);
			if (pathStr.includes("changeset-status")) {
				const error = new Error("ENOENT: no such file or directory") as NodeJS.ErrnoException;
				error.code = "ENOENT";
				throw error;
			}
			return '{"name": "@test/pkg"}';
		});

		const result = await detectPublishableChanges("pnpm", false);

		expect(result.hasChanges).toBe(false);
		expect(result.packages).toEqual([]);
		expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Changeset status file not created"));
		expect(core.warning).not.toHaveBeenCalled();
	});

	it("should warn on malformed JSON from changeset status file", async () => {
		changesetStatusContent = '{"releases": [malformed';

		const result = await detectPublishableChanges("pnpm", false);

		expect(result.hasChanges).toBe(false);
		expect(result.packages).toEqual([]);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Failed to read/parse changeset status"));
	});

	it("should classify packages without publishConfig.access as version-only", async () => {
		changesetStatusContent = JSON.stringify({
			releases: [{ name: "@test/no-access", newVersion: "1.0.0", type: "minor" }],
			changesets: [],
		});

		vi.mocked(getWorkspaces).mockReturnValue([
			{
				name: "@test/no-access",
				path: "/test/workspace/packages/no-access",
				packageJson: {
					name: "@test/no-access",
					version: "0.0.0",
					packageJsonPath: "/test/workspace/packages/no-access/package.json",
				}, // No publishConfig
			},
		]);

		const result = await detectPublishableChanges("pnpm", false);

		expect(result.hasChanges).toBe(true);
		expect(result.packages).toEqual([]);
		expect(result.versionOnlyPackages.length).toBe(1);
		expect(result.versionOnlyPackages[0].name).toBe("@test/no-access");
	});

	it("should warn when package.json is not found", async () => {
		changesetStatusContent = JSON.stringify({
			releases: [{ name: "@test/not-found", newVersion: "1.0.0", type: "minor" }],
			changesets: [],
		});

		// Return empty workspaces - package not found
		vi.mocked(getWorkspaces).mockReturnValue([]);

		const result = await detectPublishableChanges("pnpm", false);

		expect(result.hasChanges).toBe(false);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Could not find package.json"));
	});

	it("should include dry-run mode in output", async () => {
		// Default changesetStatusContent is already set

		const result = await detectPublishableChanges("pnpm", true);

		expect(result.checkId).toBe(12345);
		expect(mockOctokit.rest.checks.create).toHaveBeenCalledWith(
			expect.objectContaining({
				name: expect.stringContaining("Dry Run"),
			}),
		);
	});

	it("should handle packages with changesets in output", async () => {
		changesetStatusContent = JSON.stringify({
			releases: [{ name: "@test/pkg-a", newVersion: "1.0.0", type: "minor" }],
			changesets: [
				{ id: "change-1", summary: "Add feature", releases: [{ name: "@test/pkg-a", type: "minor" }] },
				{ id: "change-2", summary: "Fix bug", releases: [{ name: "@test/pkg-a", type: "patch" }] },
			],
		});

		vi.mocked(getWorkspaces).mockReturnValue([
			{
				name: "@test/pkg-a",
				path: "/test/workspace/packages/pkg-a",
				packageJson: {
					name: "@test/pkg-a",
					version: "0.0.0",
					packageJsonPath: "/test/workspace/packages/pkg-a/package.json",
					publishConfig: { access: "public" },
				},
			},
		]);

		const result = await detectPublishableChanges("pnpm", false);

		expect(result.hasChanges).toBe(true);
		expect(result.packages.length).toBe(1);
	});

	it("should handle package not in workspace", async () => {
		changesetStatusContent = JSON.stringify({
			releases: [{ name: "@test/error-pkg", newVersion: "1.0.0", type: "minor" }],
			changesets: [],
		});

		// Package not in workspaces
		vi.mocked(getWorkspaces).mockReturnValue([]);

		const result = await detectPublishableChanges("pnpm", false);

		expect(result.hasChanges).toBe(false);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Could not find package.json"));
	});

	it("should capture stderr output from changeset command", async () => {
		// Default changesetStatusContent is already set
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			if (options?.listeners?.stderr) {
				options.listeners.stderr(Buffer.from("Warning: Some changeset issue\n"));
			}
			return 0;
		});

		const result = await detectPublishableChanges("pnpm", false);

		expect(result.hasChanges).toBe(false);
	});

	it("should capture stdout output from changeset command", async () => {
		// Default changesetStatusContent is already set
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			if (options?.listeners?.stdout) {
				options.listeners.stdout(Buffer.from("Some stdout output\n"));
			}
			return 0;
		});

		const result = await detectPublishableChanges("pnpm", false);

		expect(result.hasChanges).toBe(false);
		expect(core.info).toHaveBeenCalledWith("Changeset stdout: Some stdout output");
	});

	it("should throw on changeset ValidationError", async () => {
		const validationError = `🦋  error The package "@test/pkg-a" depends on the ignored package "@test/builder", but "@test/pkg-a" is not being ignored.
🦋  error     at parse (/node_modules/@changesets/config/dist/changesets-config.cjs.js:317:11)
🦋  error     at Object.read (/node_modules/@changesets/config/dist/changesets-config.cjs.js:143:10)
🦋  error   _error: Error
🦋  error       at new ValidationError (/node_modules/@changesets/errors/dist/changesets-errors.cjs.js:18:1)`;

		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			if (options?.listeners?.stderr) {
				options.listeners.stderr(Buffer.from(validationError));
			}
			return 1;
		});

		await expect(detectPublishableChanges("pnpm", false)).rejects.toThrow("Changeset configuration is invalid");
		expect(core.error).toHaveBeenCalledWith(expect.stringContaining("depends on the ignored package"));
	});

	it("should not throw on non-validation changeset errors", async () => {
		// Some other error that's not a ValidationError
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			if (options?.listeners?.stderr) {
				options.listeners.stderr(Buffer.from("Some other error\n"));
			}
			return 1;
		});

		// Should not throw, just return no changes
		const result = await detectPublishableChanges("pnpm", false);
		expect(result.hasChanges).toBe(false);
	});

	it("should find package from root package.json when not in workspaces", async () => {
		changesetStatusContent = JSON.stringify({
			releases: [{ name: "@test/root-pkg", newVersion: "1.0.0", type: "minor" }],
			changesets: [],
		});

		// No workspaces, but root package.json matches
		vi.mocked(getWorkspaces).mockReturnValue([]);
		vi.mocked(readFile).mockImplementation(async (path: Parameters<typeof readFile>[0]) => {
			const pathStr = String(path);
			if (pathStr.includes("changeset-status")) {
				return changesetStatusContent;
			}
			// Root package.json with publishConfig
			return JSON.stringify({ name: "@test/root-pkg", publishConfig: { access: "public" } });
		});

		const result = await detectPublishableChanges("pnpm", false);

		expect(result.hasChanges).toBe(true);
		expect(result.packages.length).toBe(1);
		expect(result.packages[0].name).toBe("@test/root-pkg");
	});

	it("should use bun x for bun package manager", async () => {
		await detectPublishableChanges("bun", false);
		expect(exec.exec).toHaveBeenCalledWith(
			"bun",
			["x", "changeset", "status", "--output", expect.stringContaining("changeset-status")],
			expect.any(Object),
		);
	});

	it("should handle findProjectRoot returning undefined", async () => {
		// Simulate workspace-tools not finding a project root
		vi.mocked(findProjectRoot).mockReturnValue(undefined as unknown as string);
		vi.mocked(getWorkspaces).mockReturnValue([]);

		const result = await detectPublishableChanges("pnpm", false);

		expect(result.hasChanges).toBe(false);
		expect(core.debug).toHaveBeenCalledWith("workspace-tools findProjectRoot: null");
	});

	it("should handle getWorkspaces throwing an error", async () => {
		vi.mocked(findProjectRoot).mockReturnValue("/test/workspace");
		vi.mocked(getWorkspaces).mockImplementation(() => {
			throw new Error("workspace-tools error: unsupported lock file");
		});

		const result = await detectPublishableChanges("pnpm", false);

		expect(result.hasChanges).toBe(false);
		expect(core.debug).toHaveBeenCalledWith(expect.stringContaining("workspace-tools failed:"));
	});

	it("should warn when root package.json has no name field", async () => {
		vi.mocked(getWorkspaces).mockReturnValue([]);
		vi.mocked(readFile).mockImplementation(async (path: Parameters<typeof readFile>[0]) => {
			const pathStr = String(path);
			if (pathStr.includes("changeset-status")) {
				return changesetStatusContent;
			}
			// Root package.json without name field
			return JSON.stringify({ version: "1.0.0", publishConfig: { access: "public" } });
		});

		const result = await detectPublishableChanges("pnpm", false);

		expect(result.hasChanges).toBe(false);
		expect(core.warning).toHaveBeenCalledWith(
			"Root package.json has no 'name' field - cannot detect package for release",
		);
	});

	it("should warn when root package.json read fails", async () => {
		vi.mocked(getWorkspaces).mockReturnValue([]);
		vi.mocked(readFile).mockImplementation(async (path: Parameters<typeof readFile>[0]) => {
			const pathStr = String(path);
			if (pathStr.includes("changeset-status")) {
				return changesetStatusContent;
			}
			// Simulate read error for root package.json
			throw new Error("EACCES: permission denied");
		});

		const result = await detectPublishableChanges("pnpm", false);

		expect(result.hasChanges).toBe(false);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Failed to read root package.json"));
	});

	it("should skip adding root package when already in workspaces map", async () => {
		changesetStatusContent = JSON.stringify({
			releases: [{ name: "@test/pkg-a", newVersion: "1.0.0", type: "minor" }],
			changesets: [],
		});

		// Workspace already contains the package
		vi.mocked(getWorkspaces).mockReturnValue([
			{
				name: "@test/pkg-a",
				path: "/test/workspace/packages/pkg-a",
				packageJson: {
					name: "@test/pkg-a",
					version: "0.0.0",
					packageJsonPath: "/test/workspace/packages/pkg-a/package.json",
					publishConfig: { access: "public" },
				},
			},
		]);

		// Root package.json has the same name
		vi.mocked(readFile).mockImplementation(async (path: Parameters<typeof readFile>[0]) => {
			const pathStr = String(path);
			if (pathStr.includes("changeset-status")) {
				return changesetStatusContent;
			}
			return JSON.stringify({ name: "@test/pkg-a", publishConfig: { access: "public" } });
		});

		const result = await detectPublishableChanges("pnpm", false);

		expect(result.hasChanges).toBe(true);
		expect(result.packages.length).toBe(1);
		expect(core.debug).toHaveBeenCalledWith('Root package "@test/pkg-a" already in package map from workspaces');
	});

	it("should aggregate releases from changesets when top-level releases is empty", async () => {
		// This happens with private packages where changesets doesn't populate top-level releases
		// but the releases are nested in changesets[].releases
		changesetStatusContent = JSON.stringify({
			releases: [], // Empty top-level releases (private package behavior)
			changesets: [
				{
					id: "feature-change",
					summary: "Add new feature",
					releases: [{ name: "@test/private-pkg", type: "minor" }],
				},
			],
		});

		vi.mocked(getWorkspaces).mockReturnValue([
			{
				name: "@test/private-pkg",
				path: "/test/workspace",
				packageJson: {
					name: "@test/private-pkg",
					version: "1.0.0",
					private: true,
					packageJsonPath: "/test/workspace/package.json",
					publishConfig: { access: "public", targets: [{ protocol: "npm" }] },
				},
			},
		]);

		const result = await detectPublishableChanges("pnpm", false);

		expect(core.info).toHaveBeenCalledWith("Aggregated 1 release(s) from changesets");
		expect(result.hasChanges).toBe(true);
		expect(result.packages.length).toBe(1);
		expect(result.packages[0].name).toBe("@test/private-pkg");
	});

	it("should not aggregate when top-level releases already has packages", async () => {
		changesetStatusContent = JSON.stringify({
			releases: [{ name: "@test/public-pkg", newVersion: "2.0.0", type: "major" }],
			changesets: [
				{
					id: "breaking-change",
					summary: "Breaking change",
					releases: [{ name: "@test/public-pkg", type: "major" }],
				},
			],
		});

		vi.mocked(getWorkspaces).mockReturnValue([
			{
				name: "@test/public-pkg",
				path: "/test/workspace/packages/public",
				packageJson: {
					name: "@test/public-pkg",
					version: "1.0.0",
					packageJsonPath: "/test/workspace/packages/public/package.json",
					publishConfig: { access: "public" },
				},
			},
		]);

		const result = await detectPublishableChanges("pnpm", false);

		// Should NOT have called aggregation
		expect(core.info).not.toHaveBeenCalledWith(expect.stringContaining("Aggregated"));
		expect(result.hasChanges).toBe(true);
		expect(result.packages.length).toBe(1);
	});

	it("should separate publishable and version-only packages in mixed scenario", async () => {
		changesetStatusContent = JSON.stringify({
			releases: [
				{ name: "@test/publishable", newVersion: "1.0.0", type: "minor" },
				{ name: "@test/private-only", newVersion: "2.0.0", type: "patch" },
			],
			changesets: [{ id: "change-1", summary: "Test", releases: [] }],
		});

		vi.mocked(getWorkspaces).mockReturnValue([
			{
				name: "@test/publishable",
				path: "/test/workspace/packages/publishable",
				packageJson: {
					name: "@test/publishable",
					version: "0.0.0",
					packageJsonPath: "/test/workspace/packages/publishable/package.json",
					publishConfig: { access: "public" },
				},
			},
			{
				name: "@test/private-only",
				path: "/test/workspace/packages/private-only",
				packageJson: {
					name: "@test/private-only",
					version: "0.0.0",
					private: true,
					packageJsonPath: "/test/workspace/packages/private-only/package.json",
				}, // No publishConfig
			},
		]);

		const result = await detectPublishableChanges("pnpm", false);

		expect(result.hasChanges).toBe(true);
		expect(result.packages.length).toBe(1);
		expect(result.packages[0].name).toBe("@test/publishable");
		expect(result.versionOnlyPackages.length).toBe(1);
		expect(result.versionOnlyPackages[0].name).toBe("@test/private-only");
	});

	it("should deduplicate packages when aggregating from multiple changesets", async () => {
		changesetStatusContent = JSON.stringify({
			releases: [],
			changesets: [
				{
					id: "change-1",
					summary: "Feature 1",
					releases: [{ name: "@test/pkg", type: "minor" }],
				},
				{
					id: "change-2",
					summary: "Feature 2",
					releases: [{ name: "@test/pkg", type: "patch" }], // Same package, different type
				},
			],
		});

		vi.mocked(getWorkspaces).mockReturnValue([
			{
				name: "@test/pkg",
				path: "/test/workspace",
				packageJson: {
					name: "@test/pkg",
					version: "1.0.0",
					private: true,
					packageJsonPath: "/test/workspace/package.json",
					publishConfig: { access: "public" },
				},
			},
		]);

		const result = await detectPublishableChanges("pnpm", false);

		// Should only aggregate once (first occurrence wins)
		expect(core.info).toHaveBeenCalledWith("Aggregated 1 release(s) from changesets");
		expect(result.hasChanges).toBe(true);
		expect(result.packages.length).toBe(1);
	});
});
