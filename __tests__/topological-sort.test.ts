import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PackageInfos } from "workspace-tools";
import { createDependencyMap, getPackageInfos } from "workspace-tools";
import { sortPackageMapTopologically, sortPackagesTopologically } from "../src/utils/topological-sort.js";

// Mock workspace-tools
vi.mock("workspace-tools", () => ({
	getPackageInfos: vi.fn(),
	createDependencyMap: vi.fn(),
}));

// Mock @actions/core
vi.mock("@actions/core", () => ({
	debug: vi.fn(),
	info: vi.fn(),
}));

describe("topological-sort", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe("sortPackagesTopologically", () => {
		it("should return empty array for empty input", () => {
			const result = sortPackagesTopologically([]);

			expect(result.sorted).toEqual([]);
			expect(result.success).toBe(true);
		});

		it("should return single package as-is", () => {
			const result = sortPackagesTopologically(["pkg-a"]);

			expect(result.sorted).toEqual(["pkg-a"]);
			expect(result.success).toBe(true);
		});

		it("should handle packages with no dependencies", () => {
			const mockPackageInfos = {
				"pkg-a": { name: "pkg-a", packageJsonPath: "/path/a/package.json", version: "1.0.0" },
				"pkg-b": { name: "pkg-b", packageJsonPath: "/path/b/package.json", version: "1.0.0" },
				"pkg-c": { name: "pkg-c", packageJsonPath: "/path/c/package.json", version: "1.0.0" },
			} as unknown as PackageInfos;

			vi.mocked(getPackageInfos).mockReturnValue(mockPackageInfos);
			vi.mocked(createDependencyMap).mockReturnValue({
				dependencies: new Map([
					["pkg-a", new Set<string>()],
					["pkg-b", new Set<string>()],
					["pkg-c", new Set<string>()],
				]),
				dependents: new Map(),
			});

			const result = sortPackagesTopologically(["pkg-a", "pkg-b", "pkg-c"]);

			expect(result.success).toBe(true);
			// All packages should be present (order may vary since no dependencies)
			expect(result.sorted).toHaveLength(3);
			expect(result.sorted).toContain("pkg-a");
			expect(result.sorted).toContain("pkg-b");
			expect(result.sorted).toContain("pkg-c");
		});

		it("should sort packages with linear dependencies", () => {
			// pkg-c depends on pkg-b, pkg-b depends on pkg-a
			const mockPackageInfos = {
				"pkg-a": { name: "pkg-a", packageJsonPath: "/path/a/package.json", version: "1.0.0" },
				"pkg-b": { name: "pkg-b", packageJsonPath: "/path/b/package.json", version: "1.0.0" },
				"pkg-c": { name: "pkg-c", packageJsonPath: "/path/c/package.json", version: "1.0.0" },
			} as unknown as PackageInfos;

			vi.mocked(getPackageInfos).mockReturnValue(mockPackageInfos);
			vi.mocked(createDependencyMap).mockReturnValue({
				dependencies: new Map([
					["pkg-a", new Set<string>()],
					["pkg-b", new Set(["pkg-a"])],
					["pkg-c", new Set(["pkg-b"])],
				]),
				dependents: new Map(),
			});

			const result = sortPackagesTopologically(["pkg-c", "pkg-b", "pkg-a"]);

			expect(result.success).toBe(true);
			expect(result.sorted).toEqual(["pkg-a", "pkg-b", "pkg-c"]);
		});

		it("should sort packages with diamond dependencies", () => {
			// pkg-d depends on pkg-b and pkg-c, both depend on pkg-a
			const mockPackageInfos = {
				"pkg-a": { name: "pkg-a", packageJsonPath: "/path/a/package.json", version: "1.0.0" },
				"pkg-b": { name: "pkg-b", packageJsonPath: "/path/b/package.json", version: "1.0.0" },
				"pkg-c": { name: "pkg-c", packageJsonPath: "/path/c/package.json", version: "1.0.0" },
				"pkg-d": { name: "pkg-d", packageJsonPath: "/path/d/package.json", version: "1.0.0" },
			} as unknown as PackageInfos;

			vi.mocked(getPackageInfos).mockReturnValue(mockPackageInfos);
			vi.mocked(createDependencyMap).mockReturnValue({
				dependencies: new Map([
					["pkg-a", new Set<string>()],
					["pkg-b", new Set(["pkg-a"])],
					["pkg-c", new Set(["pkg-a"])],
					["pkg-d", new Set(["pkg-b", "pkg-c"])],
				]),
				dependents: new Map(),
			});

			const result = sortPackagesTopologically(["pkg-d", "pkg-c", "pkg-b", "pkg-a"]);

			expect(result.success).toBe(true);
			// pkg-a must come first, pkg-d must come last
			expect(result.sorted[0]).toBe("pkg-a");
			expect(result.sorted[3]).toBe("pkg-d");
			// pkg-b and pkg-c can be in either order
			expect(result.sorted.slice(1, 3).sort()).toEqual(["pkg-b", "pkg-c"]);
		});

		it("should filter out dependencies not in package set", () => {
			// pkg-b depends on pkg-a and external-pkg (not in our set)
			const mockPackageInfos = {
				"pkg-a": { name: "pkg-a", packageJsonPath: "/path/a/package.json", version: "1.0.0" },
				"pkg-b": { name: "pkg-b", packageJsonPath: "/path/b/package.json", version: "1.0.0" },
				"external-pkg": { name: "external-pkg", packageJsonPath: "/path/ext/package.json", version: "1.0.0" },
			} as unknown as PackageInfos;

			vi.mocked(getPackageInfos).mockReturnValue(mockPackageInfos);
			vi.mocked(createDependencyMap).mockReturnValue({
				dependencies: new Map([
					["pkg-a", new Set<string>()],
					["pkg-b", new Set(["pkg-a", "external-pkg"])],
				]),
				dependents: new Map(),
			});

			// Only sorting pkg-a and pkg-b, external-pkg not included
			const result = sortPackagesTopologically(["pkg-b", "pkg-a"]);

			expect(result.success).toBe(true);
			expect(result.sorted).toEqual(["pkg-a", "pkg-b"]);
		});

		it("should detect circular dependencies", () => {
			// pkg-a depends on pkg-b, pkg-b depends on pkg-a
			const mockPackageInfos = {
				"pkg-a": { name: "pkg-a", packageJsonPath: "/path/a/package.json", version: "1.0.0" },
				"pkg-b": { name: "pkg-b", packageJsonPath: "/path/b/package.json", version: "1.0.0" },
			} as unknown as PackageInfos;

			vi.mocked(getPackageInfos).mockReturnValue(mockPackageInfos);
			vi.mocked(createDependencyMap).mockReturnValue({
				dependencies: new Map([
					["pkg-a", new Set(["pkg-b"])],
					["pkg-b", new Set(["pkg-a"])],
				]),
				dependents: new Map(),
			});

			const result = sortPackagesTopologically(["pkg-a", "pkg-b"]);

			expect(result.success).toBe(false);
			expect(result.error).toContain("Circular dependency detected");
			// Should fall back to original order
			expect(result.sorted).toEqual(["pkg-a", "pkg-b"]);
		});

		it("should handle getPackageInfos throwing error", () => {
			vi.mocked(getPackageInfos).mockImplementation(() => {
				throw new Error("Failed to get package infos");
			});

			const result = sortPackagesTopologically(["pkg-a", "pkg-b"]);

			expect(result.success).toBe(false);
			expect(result.error).toBe("Failed to get package infos");
			// Should fall back to original order
			expect(result.sorted).toEqual(["pkg-a", "pkg-b"]);
		});

		it("should handle createDependencyMap throwing error", () => {
			const mockPackageInfos = {
				"pkg-a": { name: "pkg-a", packageJsonPath: "/path/a/package.json", version: "1.0.0" },
			} as unknown as PackageInfos;

			vi.mocked(getPackageInfos).mockReturnValue(mockPackageInfos);
			vi.mocked(createDependencyMap).mockImplementation(() => {
				throw new Error("Failed to create dependency map");
			});

			const result = sortPackagesTopologically(["pkg-a", "pkg-b"]);

			expect(result.success).toBe(false);
			expect(result.error).toBe("Failed to create dependency map");
			expect(result.sorted).toEqual(["pkg-a", "pkg-b"]);
		});

		it("should handle non-Error throws", () => {
			vi.mocked(getPackageInfos).mockImplementation(() => {
				throw "string error";
			});

			const result = sortPackagesTopologically(["pkg-a", "pkg-b"]);

			expect(result.success).toBe(false);
			expect(result.error).toBe("string error");
		});

		it("should use custom cwd parameter", () => {
			const mockPackageInfos = {
				"pkg-a": { name: "pkg-a", packageJsonPath: "/custom/path/a/package.json", version: "1.0.0" },
				"pkg-b": { name: "pkg-b", packageJsonPath: "/custom/path/b/package.json", version: "1.0.0" },
			} as unknown as PackageInfos;

			vi.mocked(getPackageInfos).mockReturnValue(mockPackageInfos);
			vi.mocked(createDependencyMap).mockReturnValue({
				dependencies: new Map([
					["pkg-a", new Set<string>()],
					["pkg-b", new Set<string>()],
				]),
				dependents: new Map(),
			});

			// Need 2+ packages to trigger actual sorting (single package short-circuits)
			sortPackagesTopologically(["pkg-a", "pkg-b"], "/custom/path");

			expect(getPackageInfos).toHaveBeenCalledWith("/custom/path");
		});

		it("should handle packages with missing dependency info", () => {
			const mockPackageInfos = {
				"pkg-a": { name: "pkg-a", packageJsonPath: "/path/a/package.json", version: "1.0.0" },
				"pkg-b": { name: "pkg-b", packageJsonPath: "/path/b/package.json", version: "1.0.0" },
			} as unknown as PackageInfos;

			vi.mocked(getPackageInfos).mockReturnValue(mockPackageInfos);
			// Return empty map - no dependency info for any package
			vi.mocked(createDependencyMap).mockReturnValue({
				dependencies: new Map(),
				dependents: new Map(),
			});

			const result = sortPackagesTopologically(["pkg-a", "pkg-b"]);

			expect(result.success).toBe(true);
			expect(result.sorted).toHaveLength(2);
		});
	});

	describe("sortPackageMapTopologically", () => {
		it("should sort map entries in dependency order", () => {
			const mockPackageInfos = {
				"pkg-a": { name: "pkg-a", packageJsonPath: "/path/a/package.json", version: "1.0.0" },
				"pkg-b": { name: "pkg-b", packageJsonPath: "/path/b/package.json", version: "1.0.0" },
			} as unknown as PackageInfos;

			vi.mocked(getPackageInfos).mockReturnValue(mockPackageInfos);
			vi.mocked(createDependencyMap).mockReturnValue({
				dependencies: new Map([
					["pkg-a", new Set<string>()],
					["pkg-b", new Set(["pkg-a"])],
				]),
				dependents: new Map(),
			});

			const packageMap = new Map<string, { version: string }>([
				["pkg-b", { version: "2.0.0" }],
				["pkg-a", { version: "1.0.0" }],
			]);

			const result = sortPackageMapTopologically(packageMap);

			expect(result).toEqual([
				["pkg-a", { version: "1.0.0" }],
				["pkg-b", { version: "2.0.0" }],
			]);
		});

		it("should preserve package info in tuples", () => {
			const mockPackageInfos = {
				"pkg-a": { name: "pkg-a", packageJsonPath: "/path/a/package.json", version: "1.0.0" },
			} as unknown as PackageInfos;

			vi.mocked(getPackageInfos).mockReturnValue(mockPackageInfos);
			vi.mocked(createDependencyMap).mockReturnValue({
				dependencies: new Map([["pkg-a", new Set<string>()]]),
				dependents: new Map(),
			});

			const complexInfo = {
				version: "1.0.0",
				targets: ["npm", "jsr"],
				metadata: { foo: "bar" },
			};
			const packageMap = new Map([["pkg-a", complexInfo]]);

			const result = sortPackageMapTopologically(packageMap);

			expect(result[0][1]).toBe(complexInfo);
		});

		it("should handle empty map", () => {
			const packageMap = new Map<string, { version: string }>();

			const result = sortPackageMapTopologically(packageMap);

			expect(result).toEqual([]);
		});

		it("should log warning on circular dependency", async () => {
			const { info } = await import("@actions/core");

			const mockPackageInfos = {
				"pkg-a": { name: "pkg-a", packageJsonPath: "/path/a/package.json", version: "1.0.0" },
				"pkg-b": { name: "pkg-b", packageJsonPath: "/path/b/package.json", version: "1.0.0" },
			} as unknown as PackageInfos;

			vi.mocked(getPackageInfos).mockReturnValue(mockPackageInfos);
			vi.mocked(createDependencyMap).mockReturnValue({
				dependencies: new Map([
					["pkg-a", new Set(["pkg-b"])],
					["pkg-b", new Set(["pkg-a"])],
				]),
				dependents: new Map(),
			});

			const packageMap = new Map([
				["pkg-a", { version: "1.0.0" }],
				["pkg-b", { version: "2.0.0" }],
			]);

			sortPackageMapTopologically(packageMap);

			expect(info).toHaveBeenCalledWith(expect.stringContaining("Circular dependency detected"));
			expect(info).toHaveBeenCalledWith(expect.stringContaining("publishing in original order"));
		});

		it("should filter out packages not found in map", () => {
			// This tests when sortPackagesTopologically returns a package name
			// that somehow isn't in our map (edge case)
			const mockPackageInfos = {
				"pkg-a": { name: "pkg-a", packageJsonPath: "/path/a/package.json", version: "1.0.0" },
			} as unknown as PackageInfos;

			vi.mocked(getPackageInfos).mockReturnValue(mockPackageInfos);
			vi.mocked(createDependencyMap).mockReturnValue({
				dependencies: new Map([["pkg-a", new Set<string>()]]),
				dependents: new Map(),
			});

			const packageMap = new Map([["pkg-a", { version: "1.0.0" }]]);

			const result = sortPackageMapTopologically(packageMap);

			expect(result).toEqual([["pkg-a", { version: "1.0.0" }]]);
		});

		it("should use custom cwd parameter", () => {
			const mockPackageInfos = {
				"pkg-a": { name: "pkg-a", packageJsonPath: "/custom/path/a/package.json", version: "1.0.0" },
				"pkg-b": { name: "pkg-b", packageJsonPath: "/custom/path/b/package.json", version: "1.0.0" },
			} as unknown as PackageInfos;

			vi.mocked(getPackageInfos).mockReturnValue(mockPackageInfos);
			vi.mocked(createDependencyMap).mockReturnValue({
				dependencies: new Map([
					["pkg-a", new Set<string>()],
					["pkg-b", new Set<string>()],
				]),
				dependents: new Map(),
			});

			// Need 2+ packages to trigger actual sorting (single package short-circuits)
			const packageMap = new Map([
				["pkg-a", { version: "1.0.0" }],
				["pkg-b", { version: "2.0.0" }],
			]);

			sortPackageMapTopologically(packageMap, "/custom/path");

			expect(getPackageInfos).toHaveBeenCalledWith("/custom/path");
		});
	});
});
