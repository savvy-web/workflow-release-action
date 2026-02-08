import * as core from "@actions/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfos } from "workspace-tools";
import { getWorkspaceInfos } from "workspace-tools";
import { clearWorkspaceCache, findPackagePath, findPublishablePath } from "../src/utils/find-package-path.js";
import { cleanupTestEnvironment, setupTestEnvironment } from "./utils/github-mocks.js";

// Mock modules
vi.mock("@actions/core");
vi.mock("workspace-tools");

describe("find-package-path", () => {
	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });
	});

	afterEach(() => {
		clearWorkspaceCache();
		cleanupTestEnvironment();
	});

	// Helper to create minimal workspace info
	const createWorkspace = (name: string, path: string): WorkspaceInfos[number] => ({
		name,
		path,
		packageJson: { packageJsonPath: `${path}/package.json`, name, version: "1.0.0" },
	});

	describe("findPackagePath", () => {
		it("should find package path from workspace-tools", () => {
			vi.mocked(getWorkspaceInfos).mockReturnValue([createWorkspace("@test/pkg", "/workspace/pkgs/my-package")]);

			const result = findPackagePath("@test/pkg");

			expect(result).toBe("/workspace/pkgs/my-package");
			expect(core.debug).toHaveBeenCalledWith(expect.stringContaining("@test/pkg"));
		});

		it("should return null for unknown package", () => {
			vi.mocked(getWorkspaceInfos).mockReturnValue([createWorkspace("@test/other", "/workspace/pkgs/other")]);

			const result = findPackagePath("@test/unknown");

			expect(result).toBeNull();
			expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("@test/unknown"));
		});

		it("should cache workspace data between calls", () => {
			vi.mocked(getWorkspaceInfos).mockReturnValue([createWorkspace("@test/pkg", "/workspace/pkgs/pkg")]);

			// First call
			findPackagePath("@test/pkg");
			// Second call
			findPackagePath("@test/pkg");

			// getWorkspaceInfos should only be called once due to caching
			expect(getWorkspaceInfos).toHaveBeenCalledTimes(1);
		});

		it("should append publishSubdir to path when provided", () => {
			vi.mocked(getWorkspaceInfos).mockReturnValue([createWorkspace("@test/pkg", "/workspace/pkgs/my-package")]);

			const result = findPackagePath("@test/pkg", "dist/npm");

			expect(result).toBe("/workspace/pkgs/my-package/dist/npm");
			expect(core.debug).toHaveBeenCalledWith(expect.stringContaining("publish path"));
		});

		it("should handle multiple packages in workspace", () => {
			vi.mocked(getWorkspaceInfos).mockReturnValue([
				createWorkspace("@test/pkg-a", "/workspace/pkgs/a"),
				createWorkspace("@test/pkg-b", "/workspace/pkgs/b"),
				createWorkspace("@test/pkg-c", "/workspace/pkgs/c"),
			]);

			expect(findPackagePath("@test/pkg-a")).toBe("/workspace/pkgs/a");
			expect(findPackagePath("@test/pkg-b")).toBe("/workspace/pkgs/b");
			expect(findPackagePath("@test/pkg-c")).toBe("/workspace/pkgs/c");
		});

		it("should log workspace discovery info", () => {
			vi.mocked(getWorkspaceInfos).mockReturnValue([createWorkspace("@test/pkg", "/workspace/pkgs/pkg")]);

			findPackagePath("@test/pkg");

			expect(core.info).toHaveBeenCalledWith(expect.stringContaining("1 workspace"));
		});
	});

	describe("findPublishablePath", () => {
		it("should return dist/npm path for package", () => {
			vi.mocked(getWorkspaceInfos).mockReturnValue([createWorkspace("@test/pkg", "/workspace/pkgs/my-package")]);

			const result = findPublishablePath("@test/pkg");

			expect(result).toBe("/workspace/pkgs/my-package/dist/npm");
		});

		it("should return null for unknown package", () => {
			vi.mocked(getWorkspaceInfos).mockReturnValue([]);

			const result = findPublishablePath("@test/unknown");

			expect(result).toBeNull();
		});
	});

	describe("clearWorkspaceCache", () => {
		it("should clear cache and allow fresh workspace discovery", () => {
			vi.mocked(getWorkspaceInfos).mockReturnValue([createWorkspace("@test/pkg", "/workspace/pkgs/pkg")]);

			// First call
			findPackagePath("@test/pkg");
			expect(getWorkspaceInfos).toHaveBeenCalledTimes(1);

			// Clear cache
			clearWorkspaceCache();

			// Second call should invoke getWorkspaceInfos again
			findPackagePath("@test/pkg");
			expect(getWorkspaceInfos).toHaveBeenCalledTimes(2);
		});
	});
});
