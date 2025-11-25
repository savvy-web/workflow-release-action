import { existsSync } from "node:fs";
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

		it("should return false when no workspaces exist", () => {
			vi.mocked(getWorkspaces).mockReturnValue([]);

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
