import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfos } from "workspace-tools";
import { getWorkspaces } from "workspace-tools";
import { detectRepoType, isSinglePackage } from "../src/utils/detect-repo-type.js";

// Helper to create mock workspace info with minimal required data
const createMockWorkspace = (name: string, path: string): WorkspaceInfos[number] =>
	({ name, path, packageJson: {} }) as WorkspaceInfos[number];

// Mock modules
vi.mock("node:fs", () => ({
	existsSync: vi.fn(),
	readFileSync: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(),
}));

vi.mock("workspace-tools", () => ({
	getWorkspaces: vi.fn(),
}));

describe("detect-repo-type", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe("isSinglePackage", () => {
		it("should return true when only one workspace exists", () => {
			vi.mocked(getWorkspaces).mockReturnValue([createMockWorkspace("my-package", "/path/to/pkg")]);

			expect(isSinglePackage()).toBe(true);
		});

		it("should return false when multiple workspaces exist", () => {
			vi.mocked(getWorkspaces).mockReturnValue([
				createMockWorkspace("pkg-a", "/path/to/a"),
				createMockWorkspace("pkg-b", "/path/to/b"),
			]);

			expect(isSinglePackage()).toBe(false);
		});

		it("should return true when no workspaces exist (single-package repo)", () => {
			vi.mocked(getWorkspaces).mockReturnValue([]);

			// A repo with no workspace config is a single-package repo
			expect(isSinglePackage()).toBe(true);
		});

		it("should return true when getWorkspaces throws", () => {
			vi.mocked(getWorkspaces).mockImplementation(() => {
				throw new Error("Failed to detect workspaces");
			});

			// If workspace detection fails, assume single-package
			expect(isSinglePackage()).toBe(true);
		});

		it("should return true when all non-root packages are in changeset ignore list", () => {
			// Multiple workspaces exist, but all non-root packages are ignored by changesets
			vi.mocked(getWorkspaces).mockReturnValue([
				createMockWorkspace("@savvy-web/rslib-builder", "/root"),
				createMockWorkspace("@fixtures/multi-entry", "/test/fixtures/multi-entry"),
				createMockWorkspace("@fixtures/single-entry", "/test/fixtures/single-entry"),
			]);
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr === ".changeset/config.json") {
					return JSON.stringify({
						ignore: ["@fixtures/*"],
					});
				}
				if (pathStr === "package.json") {
					return JSON.stringify({
						name: "@savvy-web/rslib-builder",
					});
				}
				throw new Error("File not found");
			});

			expect(isSinglePackage()).toBe(true);
		});

		it("should return false when non-root packages are not in ignore list", () => {
			vi.mocked(getWorkspaces).mockReturnValue([
				createMockWorkspace("root-pkg", "/root"),
				createMockWorkspace("pkg-a", "/packages/a"),
				createMockWorkspace("pkg-b", "/packages/b"),
			]);
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr === ".changeset/config.json") {
					return JSON.stringify({
						ignore: ["@other/*"],
					});
				}
				if (pathStr === "package.json") {
					return JSON.stringify({
						name: "root-pkg",
					});
				}
				throw new Error("File not found");
			});

			expect(isSinglePackage()).toBe(false);
		});

		it("should handle exact match ignore patterns", () => {
			vi.mocked(getWorkspaces).mockReturnValue([
				createMockWorkspace("main-pkg", "/root"),
				createMockWorkspace("ignored-pkg", "/packages/ignored"),
			]);
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr === ".changeset/config.json") {
					return JSON.stringify({
						ignore: ["ignored-pkg"],
					});
				}
				if (pathStr === "package.json") {
					return JSON.stringify({
						name: "main-pkg",
					});
				}
				throw new Error("File not found");
			});

			expect(isSinglePackage()).toBe(true);
		});

		it("should return false when no ignore patterns and multiple packages", () => {
			vi.mocked(getWorkspaces).mockReturnValue([
				createMockWorkspace("root", "/"),
				createMockWorkspace("pkg-a", "/packages/a"),
			]);
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr === ".changeset/config.json") {
					return JSON.stringify({});
				}
				if (pathStr === "package.json") {
					return JSON.stringify({ name: "root" });
				}
				throw new Error("File not found");
			});

			expect(isSinglePackage()).toBe(false);
		});

		it("should return false when changeset config does not exist and multiple packages", () => {
			vi.mocked(getWorkspaces).mockReturnValue([
				createMockWorkspace("root", "/"),
				createMockWorkspace("pkg-a", "/packages/a"),
			]);
			vi.mocked(existsSync).mockReturnValue(false);

			expect(isSinglePackage()).toBe(false);
		});

		it("should return false when package.json read fails", () => {
			vi.mocked(getWorkspaces).mockReturnValue([
				createMockWorkspace("root", "/"),
				createMockWorkspace("@fixtures/test", "/test/fixtures"),
			]);
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr === ".changeset/config.json") {
					return JSON.stringify({
						ignore: ["@fixtures/*"],
					});
				}
				// package.json read fails
				throw new Error("File not found");
			});

			expect(isSinglePackage()).toBe(false);
		});

		it("should handle changeset config with invalid JSON gracefully", () => {
			vi.mocked(getWorkspaces).mockReturnValue([
				createMockWorkspace("root", "/"),
				createMockWorkspace("pkg-a", "/packages/a"),
			]);
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr === ".changeset/config.json") {
					return "invalid json {{{";
				}
				if (pathStr === "package.json") {
					return JSON.stringify({ name: "root" });
				}
				throw new Error("File not found");
			});

			// Invalid JSON = no ignore patterns = multiple packages = not single
			expect(isSinglePackage()).toBe(false);
		});

		it("should handle mixed ignored and non-ignored packages", () => {
			vi.mocked(getWorkspaces).mockReturnValue([
				createMockWorkspace("root-pkg", "/"),
				createMockWorkspace("@fixtures/test", "/test/fixtures"),
				createMockWorkspace("pkg-publishable", "/packages/pub"),
			]);
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr === ".changeset/config.json") {
					return JSON.stringify({
						ignore: ["@fixtures/*"],
					});
				}
				if (pathStr === "package.json") {
					return JSON.stringify({ name: "root-pkg" });
				}
				throw new Error("File not found");
			});

			// pkg-publishable is not ignored, so this is not a single package
			expect(isSinglePackage()).toBe(false);
		});
	});

	describe("detectRepoType", () => {
		it("should detect single private package repo", async () => {
			// Private root, no workspaces, privatePackages.tag enabled
			vi.mocked(readFile).mockImplementation(async (path) => {
				if (String(path) === "package.json") {
					return JSON.stringify({
						private: true,
						packageManager: "pnpm@10.20.0",
					});
				}
				if (String(path) === ".changeset/config.json") {
					return JSON.stringify({
						privatePackages: { tag: true },
					});
				}
				throw new Error("File not found");
			});
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(getWorkspaces).mockReturnValue([createMockWorkspace("my-package", "/path")]);

			const result = await detectRepoType();

			expect(result.isSinglePrivatePackage).toBe(true);
			expect(result.packageManager).toBe("pnpm");
			expect(result.isPrivate).toBe(true);
			expect(result.hasWorkspaces).toBe(false);
			expect(result.privatePackagesTag).toBe(true);
		});

		it("should detect monorepo with workspaces", async () => {
			vi.mocked(readFile).mockImplementation(async (path) => {
				if (String(path) === "package.json") {
					return JSON.stringify({
						private: true,
						packageManager: "pnpm@10.20.0",
						workspaces: ["packages/*"],
					});
				}
				if (String(path) === ".changeset/config.json") {
					return JSON.stringify({});
				}
				throw new Error("File not found");
			});
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(getWorkspaces).mockReturnValue([
				createMockWorkspace("root", "/"),
				createMockWorkspace("pkg-a", "/packages/a"),
				createMockWorkspace("pkg-b", "/packages/b"),
			]);

			const result = await detectRepoType();

			expect(result.isSinglePrivatePackage).toBe(false);
			expect(result.hasWorkspaces).toBe(true);
			expect(result.isPrivate).toBe(true);
		});

		it("should detect npm package manager", async () => {
			vi.mocked(readFile).mockImplementation(async (path) => {
				if (String(path) === "package.json") {
					return JSON.stringify({
						packageManager: "npm@10.0.0",
					});
				}
				throw new Error("File not found");
			});
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(getWorkspaces).mockReturnValue([]);

			const result = await detectRepoType();

			expect(result.packageManager).toBe("npm");
		});

		it("should detect yarn package manager", async () => {
			vi.mocked(readFile).mockImplementation(async (path) => {
				if (String(path) === "package.json") {
					return JSON.stringify({
						packageManager: "yarn@4.0.0",
					});
				}
				throw new Error("File not found");
			});
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(getWorkspaces).mockReturnValue([]);

			const result = await detectRepoType();

			expect(result.packageManager).toBe("yarn");
		});

		it("should detect bun package manager", async () => {
			vi.mocked(readFile).mockImplementation(async (path) => {
				if (String(path) === "package.json") {
					return JSON.stringify({
						packageManager: "bun@1.0.0",
					});
				}
				throw new Error("File not found");
			});
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(getWorkspaces).mockReturnValue([]);

			const result = await detectRepoType();

			expect(result.packageManager).toBe("bun");
		});

		it("should default to pnpm when packageManager field is missing", async () => {
			vi.mocked(readFile).mockImplementation(async (path) => {
				if (String(path) === "package.json") {
					return JSON.stringify({});
				}
				throw new Error("File not found");
			});
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(getWorkspaces).mockReturnValue([]);

			const result = await detectRepoType();

			expect(result.packageManager).toBe("pnpm");
		});

		it("should default to pnpm when packageManager field is invalid", async () => {
			vi.mocked(readFile).mockImplementation(async (path) => {
				if (String(path) === "package.json") {
					return JSON.stringify({
						packageManager: "invalid-pm@1.0.0",
					});
				}
				throw new Error("File not found");
			});
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(getWorkspaces).mockReturnValue([]);

			const result = await detectRepoType();

			expect(result.packageManager).toBe("pnpm");
		});

		it("should return false for privatePackagesTag when config doesn't exist", async () => {
			vi.mocked(readFile).mockImplementation(async (path) => {
				if (String(path) === "package.json") {
					return JSON.stringify({ private: true });
				}
				throw new Error("File not found");
			});
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(getWorkspaces).mockReturnValue([]);

			const result = await detectRepoType();

			expect(result.privatePackagesTag).toBe(false);
		});

		it("should return false for privatePackagesTag when config parse fails", async () => {
			vi.mocked(readFile).mockImplementation(async (path) => {
				if (String(path) === "package.json") {
					return JSON.stringify({ private: true });
				}
				if (String(path) === ".changeset/config.json") {
					return "invalid json {{{";
				}
				throw new Error("File not found");
			});
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(getWorkspaces).mockReturnValue([]);

			const result = await detectRepoType();

			expect(result.privatePackagesTag).toBe(false);
		});

		it("should return false for privatePackagesTag when tag is not set", async () => {
			vi.mocked(readFile).mockImplementation(async (path) => {
				if (String(path) === "package.json") {
					return JSON.stringify({ private: true });
				}
				if (String(path) === ".changeset/config.json") {
					return JSON.stringify({
						privatePackages: { version: true },
					});
				}
				throw new Error("File not found");
			});
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(getWorkspaces).mockReturnValue([]);

			const result = await detectRepoType();

			expect(result.privatePackagesTag).toBe(false);
		});

		it("should return false for privatePackagesTag when tag is false", async () => {
			vi.mocked(readFile).mockImplementation(async (path) => {
				if (String(path) === "package.json") {
					return JSON.stringify({ private: true });
				}
				if (String(path) === ".changeset/config.json") {
					return JSON.stringify({
						privatePackages: { tag: false },
					});
				}
				throw new Error("File not found");
			});
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(getWorkspaces).mockReturnValue([]);

			const result = await detectRepoType();

			expect(result.privatePackagesTag).toBe(false);
		});

		it("should handle workspace detection errors gracefully", async () => {
			vi.mocked(readFile).mockImplementation(async (path) => {
				if (String(path) === "package.json") {
					return JSON.stringify({ private: true });
				}
				throw new Error("File not found");
			});
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(getWorkspaces).mockImplementation(() => {
				throw new Error("Workspace detection failed");
			});

			const result = await detectRepoType();

			expect(result.hasWorkspaces).toBe(false);
		});

		it("should detect non-private public package", async () => {
			vi.mocked(readFile).mockImplementation(async (path) => {
				if (String(path) === "package.json") {
					return JSON.stringify({
						name: "my-public-package",
						packageManager: "npm@10.0.0",
					});
				}
				throw new Error("File not found");
			});
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(getWorkspaces).mockReturnValue([]);

			const result = await detectRepoType();

			expect(result.isPrivate).toBe(false);
			expect(result.isSinglePrivatePackage).toBe(false);
		});

		it("should not be single private package when has workspaces", async () => {
			vi.mocked(readFile).mockImplementation(async (path) => {
				if (String(path) === "package.json") {
					return JSON.stringify({
						private: true,
						packageManager: "pnpm@10.0.0",
					});
				}
				if (String(path) === ".changeset/config.json") {
					return JSON.stringify({
						privatePackages: { tag: true },
					});
				}
				throw new Error("File not found");
			});
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(getWorkspaces).mockReturnValue([
				createMockWorkspace("root", "/"),
				createMockWorkspace("pkg-a", "/packages/a"),
			]);

			const result = await detectRepoType();

			// Even with private:true and privatePackages.tag:true, workspaces means not single private
			expect(result.isSinglePrivatePackage).toBe(false);
			expect(result.hasWorkspaces).toBe(true);
		});

		it("should not be single private package when not private", async () => {
			vi.mocked(readFile).mockImplementation(async (path) => {
				if (String(path) === "package.json") {
					return JSON.stringify({
						name: "public-package",
						packageManager: "pnpm@10.0.0",
					});
				}
				if (String(path) === ".changeset/config.json") {
					return JSON.stringify({
						privatePackages: { tag: true },
					});
				}
				throw new Error("File not found");
			});
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(getWorkspaces).mockReturnValue([createMockWorkspace("my-package", "/")]);

			const result = await detectRepoType();

			expect(result.isSinglePrivatePackage).toBe(false);
			expect(result.isPrivate).toBe(false);
		});
	});
});
