import { existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import setupNode from "../.github/actions/node/detect-node-config.js";
import type { AsyncFunctionArguments } from "../.github/actions/shared/types.js";
import type { MockCore } from "./utils/github-mocks.js";
import { createMockAsyncFunctionArguments, createMockCore } from "./utils/github-mocks.js";

// Mock node:fs
vi.mock("node:fs", () => ({
	existsSync: vi.fn(),
}));

describe("setupNode", () => {
	let mockCore: MockCore;
	let mockArgs: AsyncFunctionArguments;

	/**
	 * Helper to set INPUT_* environment variables for composite action inputs
	 */
	function mockInputs(packageManager: string, nodeVersion: string = "20.x"): void {
		// GitHub Actions sets INPUT_* env vars for composite action inputs
		// package-manager → INPUT_PACKAGE_MANAGER (uppercase, hyphens to underscores)
		process.env.INPUT_PACKAGE_MANAGER = packageManager;
		process.env.INPUT_NODE_VERSION = nodeVersion;
	}

	beforeEach(() => {
		vi.clearAllMocks();
		mockCore = createMockCore();
		mockArgs = createMockAsyncFunctionArguments({
			core: mockCore as never,
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		// Clean up environment variables
		delete process.env.INPUT_PACKAGE_MANAGER;
		delete process.env.INPUT_NODE_VERSION;
	});

	describe("package manager validation", () => {
		it("should validate pnpm as valid package manager", async () => {
			vi.mocked(existsSync).mockReturnValue(false);
			mockInputs("pnpm");

			await setupNode(mockArgs);

			expect(mockCore.info).toHaveBeenCalledWith("✓ Package manager validated: pnpm");
			expect(mockCore.setOutput).toHaveBeenCalledWith("package-manager", "pnpm");
		});

		it("should validate yarn as valid package manager", async () => {
			vi.mocked(existsSync).mockReturnValue(false);
			mockInputs("yarn");

			await setupNode(mockArgs);

			expect(mockCore.info).toHaveBeenCalledWith("✓ Package manager validated: yarn");
			expect(mockCore.setOutput).toHaveBeenCalledWith("package-manager", "yarn");
		});

		it("should validate npm as valid package manager", async () => {
			vi.mocked(existsSync).mockReturnValue(false);
			mockInputs("npm");

			await setupNode(mockArgs);

			expect(mockCore.info).toHaveBeenCalledWith("✓ Package manager validated: npm");
			expect(mockCore.setOutput).toHaveBeenCalledWith("package-manager", "npm");
		});

		it("should reject invalid package manager", async () => {
			mockInputs("bun");

			await setupNode(mockArgs);

			expect(mockCore.setFailed).toHaveBeenCalledWith(
				"Failed to setup Node.js: Invalid package_manager 'bun'. Must be one of: npm | pnpm | yarn",
			);
		});

		it("should allow empty package manager and skip validation", async () => {
			vi.mocked(existsSync).mockReturnValue(false);
			mockInputs("");

			await setupNode(mockArgs);

			expect(mockCore.info).toHaveBeenCalledWith("No package manager specified, skipping validation");
			expect(mockCore.setOutput).toHaveBeenCalledWith("package-manager", "");
			expect(mockCore.setOutput).toHaveBeenCalledWith("setup-required", "");
			expect(mockCore.setOutput).toHaveBeenCalledWith("cache-type", "");
		});
	});

	describe("Node.js version detection", () => {
		it("should detect .nvmrc file", async () => {
			vi.mocked(existsSync).mockImplementation((path) => path === ".nvmrc");
			mockInputs("pnpm");

			await setupNode(mockArgs);

			expect(mockCore.info).toHaveBeenCalledWith("Detected Node.js version file: .nvmrc");
			expect(mockCore.setOutput).toHaveBeenCalledWith("node-version", "");
			expect(mockCore.setOutput).toHaveBeenCalledWith("node-version-file", ".nvmrc");
			expect(mockCore.setOutput).toHaveBeenCalledWith("node-version-source", "nvmrc");
		});

		it("should detect .node-version file", async () => {
			vi.mocked(existsSync).mockImplementation((path) => path === ".node-version");
			mockInputs("pnpm");

			await setupNode(mockArgs);

			expect(mockCore.info).toHaveBeenCalledWith("Detected Node.js version file: .node-version");
			expect(mockCore.setOutput).toHaveBeenCalledWith("node-version", "");
			expect(mockCore.setOutput).toHaveBeenCalledWith("node-version-file", ".node-version");
			expect(mockCore.setOutput).toHaveBeenCalledWith("node-version-source", "node-version");
		});

		it("should prioritize .nvmrc over .node-version", async () => {
			vi.mocked(existsSync).mockImplementation((path) => path === ".nvmrc" || path === ".node-version");
			mockInputs("pnpm");

			await setupNode(mockArgs);

			expect(mockCore.info).toHaveBeenCalledWith("Detected Node.js version file: .nvmrc");
			expect(mockCore.setOutput).toHaveBeenCalledWith("node-version-file", ".nvmrc");
			expect(mockCore.setOutput).toHaveBeenCalledWith("node-version-source", "nvmrc");
		});

		it("should use input when no version file exists", async () => {
			vi.mocked(existsSync).mockReturnValue(false);
			mockInputs("pnpm", "18.x");

			await setupNode(mockArgs);

			expect(mockCore.info).toHaveBeenCalledWith("No version file found, using node-version input: 18.x");
			expect(mockCore.setOutput).toHaveBeenCalledWith("node-version", "18.x");
			expect(mockCore.setOutput).toHaveBeenCalledWith("node-version-file", "");
			expect(mockCore.setOutput).toHaveBeenCalledWith("node-version-source", "input");
		});

		it("should support lts/* version spec", async () => {
			vi.mocked(existsSync).mockReturnValue(false);
			mockInputs("npm", "lts/*");

			await setupNode(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("node-version", "lts/*");
		});
	});

	describe("package manager configuration", () => {
		describe("pnpm", () => {
			it("should configure pnpm correctly", async () => {
				vi.mocked(existsSync).mockReturnValue(false);
				mockInputs("pnpm");

				await setupNode(mockArgs);

				expect(mockCore.setOutput).toHaveBeenCalledWith("package-manager", "pnpm");
				expect(mockCore.setOutput).toHaveBeenCalledWith("setup-required", "true");
				expect(mockCore.setOutput).toHaveBeenCalledWith("cache-type", "pnpm");
				expect(mockCore.setOutput).toHaveBeenCalledWith("install-command", "pnpm install --frozen-lockfile");
				expect(mockCore.setOutput).toHaveBeenCalledWith(
					"cache-dependency-paths",
					JSON.stringify(["pnpm-lock.yaml", "pnpm-workspace.yaml", ".pnpmfile.cjs"]),
				);
			});
		});

		describe("yarn", () => {
			it("should configure yarn correctly", async () => {
				vi.mocked(existsSync).mockReturnValue(false);
				mockInputs("yarn");

				await setupNode(mockArgs);

				expect(mockCore.setOutput).toHaveBeenCalledWith("package-manager", "yarn");
				expect(mockCore.setOutput).toHaveBeenCalledWith("setup-required", "true");
				expect(mockCore.setOutput).toHaveBeenCalledWith("cache-type", "yarn");
				expect(mockCore.setOutput).toHaveBeenCalledWith(
					"install-command",
					"yarn install --frozen-lockfile --immutable",
				);
				expect(mockCore.setOutput).toHaveBeenCalledWith("cache-dependency-paths", JSON.stringify(["yarn.lock"]));
			});
		});

		describe("npm", () => {
			it("should configure npm correctly", async () => {
				vi.mocked(existsSync).mockReturnValue(false);
				mockInputs("npm");

				await setupNode(mockArgs);

				expect(mockCore.setOutput).toHaveBeenCalledWith("package-manager", "npm");
				expect(mockCore.setOutput).toHaveBeenCalledWith("setup-required", "false");
				expect(mockCore.setOutput).toHaveBeenCalledWith("cache-type", "npm");
				expect(mockCore.setOutput).toHaveBeenCalledWith("install-command", "npm ci");
				expect(mockCore.setOutput).toHaveBeenCalledWith(
					"cache-dependency-paths",
					JSON.stringify(["package-lock.json"]),
				);
			});
		});
	});

	describe("output verification", () => {
		it("should set all outputs correctly with version file", async () => {
			vi.mocked(existsSync).mockImplementation((path) => path === ".nvmrc");
			mockInputs("pnpm");

			await setupNode(mockArgs);

			// Node version outputs
			expect(mockCore.setOutput).toHaveBeenCalledWith("node-version", "");
			expect(mockCore.setOutput).toHaveBeenCalledWith("node-version-file", ".nvmrc");
			expect(mockCore.setOutput).toHaveBeenCalledWith("node-version-source", "nvmrc");

			// Package manager outputs
			expect(mockCore.setOutput).toHaveBeenCalledWith("package-manager", "pnpm");
			expect(mockCore.setOutput).toHaveBeenCalledWith("setup-required", "true");
			expect(mockCore.setOutput).toHaveBeenCalledWith("cache-type", "pnpm");
			expect(mockCore.setOutput).toHaveBeenCalledWith("install-command", "pnpm install --frozen-lockfile");
			expect(mockCore.setOutput).toHaveBeenCalledWith(
				"cache-dependency-paths",
				JSON.stringify(["pnpm-lock.yaml", "pnpm-workspace.yaml", ".pnpmfile.cjs"]),
			);
		});

		it("should set all outputs correctly with input version", async () => {
			vi.mocked(existsSync).mockReturnValue(false);
			mockInputs("npm", "18.x");

			await setupNode(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith("node-version", "18.x");
			expect(mockCore.setOutput).toHaveBeenCalledWith("node-version-file", "");
			expect(mockCore.setOutput).toHaveBeenCalledWith("node-version-source", "input");
		});

		it("should set debug outputs", async () => {
			vi.mocked(existsSync).mockReturnValue(false);
			mockInputs("pnpm");

			await setupNode(mockArgs);

			expect(mockCore.debug).toHaveBeenCalledWith("Node version: 20.x");
			expect(mockCore.debug).toHaveBeenCalledWith("Node version file: none");
			expect(mockCore.debug).toHaveBeenCalledWith("Package manager: pnpm");
			expect(mockCore.debug).toHaveBeenCalledWith("Setup required: true");
		});

		it("should set debug outputs when using version file", async () => {
			vi.mocked(existsSync).mockImplementation((path) => path === ".nvmrc");
			mockInputs("npm");

			await setupNode(mockArgs);

			expect(mockCore.debug).toHaveBeenCalledWith("Node version: from file");
			expect(mockCore.debug).toHaveBeenCalledWith("Node version file: .nvmrc");
		});
	});

	describe("error handling", () => {
		it("should handle filesystem errors", async () => {
			vi.mocked(existsSync).mockImplementation(() => {
				throw new Error("Filesystem error");
			});
			mockInputs("pnpm");

			await setupNode(mockArgs);

			expect(mockCore.setFailed).toHaveBeenCalledWith("Failed to setup Node.js: Filesystem error");
		});

		it("should handle non-Error exceptions", async () => {
			vi.mocked(existsSync).mockImplementation(() => {
				throw "string error";
			});
			mockInputs("yarn");

			await setupNode(mockArgs);

			expect(mockCore.setFailed).toHaveBeenCalledWith("Failed to setup Node.js: string error");
		});
	});
});
