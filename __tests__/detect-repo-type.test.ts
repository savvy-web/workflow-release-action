import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import detectRepoType, { isSinglePackage } from "../.github/actions/setup-release/detect-repo-type.js";
import type { MockCore } from "./utils/github-mocks.js";
import { createMockCore } from "./utils/github-mocks.js";

// Mock node:fs and node:fs/promises
vi.mock("node:fs", () => ({
	existsSync: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(),
}));

// Mock workspace-tools
vi.mock("workspace-tools", () => ({
	getWorkspaces: vi.fn(),
}));

import * as workspaceTools from "workspace-tools";

describe("isSinglePackage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should return true for single workspace", () => {
		vi.mocked(workspaceTools.getWorkspaces).mockReturnValueOnce({ "package-a": {} } as never);
		expect(isSinglePackage(workspaceTools)).toBe(true);
	});

	it("should return false for multiple workspaces", () => {
		vi.mocked(workspaceTools.getWorkspaces).mockReturnValueOnce({ "package-a": {}, "package-b": {} } as never);
		expect(isSinglePackage(workspaceTools)).toBe(false);
	});

	it("should return false for empty workspaces", () => {
		vi.mocked(workspaceTools.getWorkspaces).mockReturnValueOnce({} as never);
		expect(isSinglePackage(workspaceTools)).toBe(false);
	});
});

describe("detectRepoType", () => {
	let mockCore: MockCore;

	beforeEach(() => {
		vi.clearAllMocks();
		mockCore = createMockCore();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("package manager detection", () => {
		it("should detect pnpm from packageManager field", async () => {
			vi.mocked(readFile).mockResolvedValueOnce(
				JSON.stringify({
					private: false,
					packageManager: "pnpm@10.20.0",
				}),
			);
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(workspaceTools.getWorkspaces).mockReturnValueOnce({ root: {} } as never);

			await detectRepoType({ core: mockCore as never, workspaceTools });

			expect(mockCore.setOutput).toHaveBeenCalledWith("packageManager", "pnpm");
		});

		it("should detect npm from packageManager field", async () => {
			vi.mocked(readFile).mockResolvedValueOnce(
				JSON.stringify({
					private: false,
					packageManager: "npm@10.0.0",
				}),
			);
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(workspaceTools.getWorkspaces).mockReturnValueOnce({ root: {} } as never);

			await detectRepoType({ core: mockCore as never, workspaceTools });

			expect(mockCore.setOutput).toHaveBeenCalledWith("packageManager", "npm");
		});

		it("should detect yarn from packageManager field", async () => {
			vi.mocked(readFile).mockResolvedValueOnce(
				JSON.stringify({
					private: false,
					packageManager: "yarn@4.0.0",
				}),
			);
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(workspaceTools.getWorkspaces).mockReturnValueOnce({ root: {} } as never);

			await detectRepoType({ core: mockCore as never, workspaceTools });

			expect(mockCore.setOutput).toHaveBeenCalledWith("packageManager", "yarn");
		});

		it("should detect bun from packageManager field", async () => {
			vi.mocked(readFile).mockResolvedValueOnce(
				JSON.stringify({
					private: false,
					packageManager: "bun@1.0.0",
				}),
			);
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(workspaceTools.getWorkspaces).mockReturnValueOnce({ root: {} } as never);

			await detectRepoType({ core: mockCore as never, workspaceTools });

			expect(mockCore.setOutput).toHaveBeenCalledWith("packageManager", "bun");
		});

		it("should default to pnpm when packageManager field is missing", async () => {
			vi.mocked(readFile).mockResolvedValueOnce(
				JSON.stringify({
					private: false,
				}),
			);
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(workspaceTools.getWorkspaces).mockReturnValueOnce({ root: {} } as never);

			await detectRepoType({ core: mockCore as never, workspaceTools });

			expect(mockCore.setOutput).toHaveBeenCalledWith("packageManager", "pnpm");
		});

		it("should default to pnpm for invalid package manager", async () => {
			vi.mocked(readFile).mockResolvedValueOnce(
				JSON.stringify({
					private: false,
					packageManager: "invalid@1.0.0",
				}),
			);
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(workspaceTools.getWorkspaces).mockReturnValueOnce({ root: {} } as never);

			await detectRepoType({ core: mockCore as never, workspaceTools });

			expect(mockCore.setOutput).toHaveBeenCalledWith("packageManager", "pnpm");
		});
	});

	describe("workspace detection", () => {
		it("should detect workspaces when multiple packages exist", async () => {
			vi.mocked(readFile).mockResolvedValueOnce(
				JSON.stringify({
					private: false,
					packageManager: "pnpm@10.20.0",
				}),
			);
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(workspaceTools.getWorkspaces).mockReturnValueOnce({
				root: {},
				"packages/a": {},
				"packages/b": {},
			} as never);

			await detectRepoType({ core: mockCore as never, workspaceTools });

			expect(mockCore.info).toHaveBeenCalledWith("  - Has workspaces: true");
		});

		it("should return false for single package (only root)", async () => {
			vi.mocked(readFile).mockResolvedValueOnce(
				JSON.stringify({
					private: false,
					packageManager: "pnpm@10.20.0",
				}),
			);
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(workspaceTools.getWorkspaces).mockReturnValueOnce({ root: {} } as never);

			await detectRepoType({ core: mockCore as never, workspaceTools });

			expect(mockCore.info).toHaveBeenCalledWith("  - Has workspaces: false");
		});

		it("should handle getWorkspaces errors gracefully", async () => {
			vi.mocked(readFile).mockResolvedValueOnce(
				JSON.stringify({
					private: false,
					packageManager: "pnpm@10.20.0",
				}),
			);
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(workspaceTools.getWorkspaces).mockImplementation(() => {
				throw new Error("Workspace detection failed");
			});

			await detectRepoType({ core: mockCore as never, workspaceTools });

			expect(mockCore.info).toHaveBeenCalledWith("  - Has workspaces: false");
		});
	});

	describe("private packages tag detection", () => {
		it("should detect privatePackages.tag when true", async () => {
			vi.mocked(readFile)
				.mockResolvedValueOnce(
					JSON.stringify({
						private: true,
						packageManager: "pnpm@10.20.0",
					}),
				)
				.mockResolvedValueOnce(
					JSON.stringify({
						privatePackages: { tag: true },
					}),
				);
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(workspaceTools.getWorkspaces).mockReturnValueOnce({ root: {} } as never);

			await detectRepoType({ core: mockCore as never, workspaceTools });

			expect(mockCore.info).toHaveBeenCalledWith("  - Private packages tagging enabled: true");
		});

		it("should return false when privatePackages.tag is false", async () => {
			vi.mocked(readFile)
				.mockResolvedValueOnce(
					JSON.stringify({
						private: true,
						packageManager: "pnpm@10.20.0",
					}),
				)
				.mockResolvedValueOnce(
					JSON.stringify({
						privatePackages: { tag: false },
					}),
				);
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(workspaceTools.getWorkspaces).mockReturnValueOnce({ root: {} } as never);

			await detectRepoType({ core: mockCore as never, workspaceTools });

			expect(mockCore.info).toHaveBeenCalledWith("  - Private packages tagging enabled: false");
		});

		it("should return false when changeset config does not exist", async () => {
			vi.mocked(readFile).mockResolvedValueOnce(
				JSON.stringify({
					private: true,
					packageManager: "pnpm@10.20.0",
				}),
			);
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(workspaceTools.getWorkspaces).mockReturnValueOnce({ root: {} } as never);

			await detectRepoType({ core: mockCore as never, workspaceTools });

			expect(mockCore.info).toHaveBeenCalledWith("  - Private packages tagging enabled: false");
		});

		it("should return false when changeset config is invalid JSON", async () => {
			vi.mocked(readFile)
				.mockResolvedValueOnce(
					JSON.stringify({
						private: true,
						packageManager: "pnpm@10.20.0",
					}),
				)
				.mockResolvedValueOnce("invalid json");
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(workspaceTools.getWorkspaces).mockReturnValueOnce({ root: {} } as never);

			await detectRepoType({ core: mockCore as never, workspaceTools });

			expect(mockCore.info).toHaveBeenCalledWith("  - Private packages tagging enabled: false");
		});
	});

	describe("single private package detection", () => {
		it("should detect single private package when all conditions are met", async () => {
			vi.mocked(readFile)
				.mockResolvedValueOnce(
					JSON.stringify({
						private: true,
						packageManager: "pnpm@10.20.0",
					}),
				)
				.mockResolvedValueOnce(
					JSON.stringify({
						privatePackages: { tag: true },
					}),
				);
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(workspaceTools.getWorkspaces).mockReturnValueOnce({ root: {} } as never);

			await detectRepoType({ core: mockCore as never, workspaceTools });

			expect(mockCore.setOutput).toHaveBeenCalledWith("isSinglePrivatePackage", "true");
			expect(mockCore.notice).toHaveBeenCalledWith(
				"✓ Detected single-package private repo (manual tag creation required)",
			);
		});

		it("should return false when package is not private", async () => {
			vi.mocked(readFile)
				.mockResolvedValueOnce(
					JSON.stringify({
						private: false,
						packageManager: "pnpm@10.20.0",
					}),
				)
				.mockResolvedValueOnce(
					JSON.stringify({
						privatePackages: { tag: true },
					}),
				);
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(workspaceTools.getWorkspaces).mockReturnValueOnce({ root: {} } as never);

			await detectRepoType({ core: mockCore as never, workspaceTools });

			expect(mockCore.setOutput).toHaveBeenCalledWith("isSinglePrivatePackage", "false");
			expect(mockCore.notice).toHaveBeenCalledWith("✓ Detected multi-package or public repo (changesets handles tags)");
		});

		it("should return false when repository has workspaces", async () => {
			vi.mocked(readFile)
				.mockResolvedValueOnce(
					JSON.stringify({
						private: true,
						packageManager: "pnpm@10.20.0",
					}),
				)
				.mockResolvedValueOnce(
					JSON.stringify({
						privatePackages: { tag: true },
					}),
				);
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(workspaceTools.getWorkspaces).mockReturnValueOnce({
				root: {},
				"packages/a": {},
				"packages/b": {},
			} as never);

			await detectRepoType({ core: mockCore as never, workspaceTools });

			expect(mockCore.setOutput).toHaveBeenCalledWith("isSinglePrivatePackage", "false");
		});

		it("should return false when privatePackages.tag is not enabled", async () => {
			vi.mocked(readFile)
				.mockResolvedValueOnce(
					JSON.stringify({
						private: true,
						packageManager: "pnpm@10.20.0",
					}),
				)
				.mockResolvedValueOnce(
					JSON.stringify({
						privatePackages: { tag: false },
					}),
				);
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(workspaceTools.getWorkspaces).mockReturnValueOnce({ root: {} } as never);

			await detectRepoType({ core: mockCore as never, workspaceTools });

			expect(mockCore.setOutput).toHaveBeenCalledWith("isSinglePrivatePackage", "false");
		});
	});

	describe("error handling", () => {
		it("should handle package.json read errors", async () => {
			vi.mocked(readFile).mockRejectedValueOnce(new Error("File not found"));

			await detectRepoType({ core: mockCore as never, workspaceTools });

			expect(mockCore.setFailed).toHaveBeenCalledWith("Failed to detect repository type: File not found");
		});

		it("should handle non-Error exceptions", async () => {
			vi.mocked(readFile).mockRejectedValueOnce("string error");

			await detectRepoType({ core: mockCore as never, workspaceTools });

			expect(mockCore.setFailed).toHaveBeenCalledWith("Failed to detect repository type: string error");
		});
	});

	describe("output verification", () => {
		it("should set debug outputs", async () => {
			vi.mocked(readFile).mockResolvedValueOnce(
				JSON.stringify({
					private: false,
					packageManager: "pnpm@10.20.0",
				}),
			);
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(workspaceTools.getWorkspaces).mockReturnValueOnce({ root: {} } as never);

			await detectRepoType({ core: mockCore as never, workspaceTools });

			expect(mockCore.debug).toHaveBeenCalledWith("Set output 'isSinglePrivatePackage' to: false");
			expect(mockCore.debug).toHaveBeenCalledWith("Set output 'packageManager' to: pnpm");
		});

		it("should log all repository details", async () => {
			vi.mocked(readFile).mockResolvedValueOnce(
				JSON.stringify({
					private: true,
					packageManager: "yarn@4.0.0",
				}),
			);
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(workspaceTools.getWorkspaces).mockReturnValueOnce({ root: {} } as never);

			await detectRepoType({ core: mockCore as never, workspaceTools });

			expect(mockCore.info).toHaveBeenCalledWith("  - Package manager: yarn");
			expect(mockCore.info).toHaveBeenCalledWith("  - Root package private: true");
			expect(mockCore.info).toHaveBeenCalledWith("  - Has workspaces: false");
			expect(mockCore.info).toHaveBeenCalledWith("  - Private packages tagging enabled: false");
		});
	});
});
