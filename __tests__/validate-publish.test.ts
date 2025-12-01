import * as fs from "node:fs";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PackageJson } from "../src/types/publish-config.js";
import { validatePublish } from "../src/utils/validate-publish.js";
import { cleanupTestEnvironment, setupTestEnvironment } from "./utils/github-mocks.js";

/** Changeset status shape for testing (matches what changeset status --output writes) */
interface ChangesetStatus {
	changesets: Array<{ id: string; summary: string; releases: unknown[] }>;
	releases: Array<{ name: string; type: string; oldVersion: string; newVersion: string }>;
}

// Mock modules
vi.mock("@actions/core");
vi.mock("@actions/exec");
vi.mock("node:fs");

// Mock findPackagePath to return expected paths
vi.mock("../src/utils/find-package-path.js", () => ({
	findPackagePath: vi.fn().mockImplementation((name: string) => {
		if (name === "@test/package") return "/test/packages/test-package";
		if (name === "@test/private") return "/test/packages/private";
		if (name === "@test/multi") return "/test/packages/multi";
		if (name === "@test/jsr-pkg") return "/test/packages/jsr-pkg";
		return null;
	}),
}));

describe("validate-publish", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });
		process.env = {
			...originalEnv,
			HOME: "/home/testuser",
			NPM_TOKEN: "test-npm-token",
			GITHUB_TOKEN: "test-gh-token",
		};

		// Default mock implementations
		vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
		vi.mocked(fs.unlinkSync).mockImplementation(() => undefined);
	});

	afterEach(() => {
		process.env = originalEnv;
		cleanupTestEnvironment();
	});

	describe("validatePublish", () => {
		it("returns success with empty validations when no releases found", async () => {
			const emptyStatus: ChangesetStatus = {
				changesets: [],
				releases: [],
			};

			vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(emptyStatus));
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(exec.exec).mockResolvedValue(0);

			const result = await validatePublish("pnpm", "main", false);

			expect(result.success).toBe(true);
			expect(result.validations).toHaveLength(0);
			expect(result.totalTargets).toBe(0);
			expect(result.readyTargets).toBe(0);
			expect(result.npmReady).toBe(true);
			expect(result.githubPackagesReady).toBe(true);
			expect(result.summary).toBe("No changesets found or changesets already versioned");
		});

		it("validates packages with npm targets successfully", async () => {
			const changesetStatus: ChangesetStatus = {
				changesets: [{ id: "test-changeset", summary: "Test changes", releases: [] }],
				releases: [{ name: "@test/package", type: "minor", oldVersion: "1.0.0", newVersion: "1.1.0" }],
			};

			const workspacePackageJson: PackageJson = {
				name: "@test/package",
				version: "1.1.0",
				publishConfig: {
					targets: ["npm"],
					directory: "dist",
				},
			};

			const distPackageJson: PackageJson = {
				name: "@test/package",
				version: "1.1.0",
			};

			vi.mocked(fs.existsSync).mockImplementation((filePath) => {
				const p = String(filePath);
				if (p.includes(".npmrc")) return false;
				return true;
			});

			vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
				const p = String(filePath);
				if (p.includes("changeset-status")) return JSON.stringify(changesetStatus);
				if (p.includes("test-package") && p.endsWith("package.json") && !p.includes("dist")) {
					return JSON.stringify(workspacePackageJson);
				}
				if (p.includes("dist") && p.endsWith("package.json")) {
					return JSON.stringify(distPackageJson);
				}
				return JSON.stringify({});
			});

			vi.mocked(exec.exec).mockImplementation(async (cmd, args) => {
				if (cmd === "pnpm" && args?.includes("changeset")) return 0;
				if (cmd === "npm" && args?.includes("publish")) return 0;
				return 0;
			});

			const result = await validatePublish("pnpm", "main", false);

			expect(result).toBeDefined();
			expect(result.validations).toHaveLength(1);
			expect(result.validations[0].name).toBe("@test/package");
			expect(result.summary).toContain("Publish Validation");
		});

		it("handles packages with no publish targets (private)", async () => {
			const changesetStatus: ChangesetStatus = {
				changesets: [{ id: "test-changeset", summary: "Test", releases: [] }],
				releases: [{ name: "@test/private", type: "patch", oldVersion: "1.0.0", newVersion: "1.0.1" }],
			};

			const privatePackageJson: PackageJson = {
				name: "@test/private",
				version: "1.0.1",
				private: true,
			};

			vi.mocked(fs.existsSync).mockImplementation((filePath) => {
				const p = String(filePath);
				if (p.includes(".npmrc")) return false;
				return true;
			});

			vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
				const p = String(filePath);
				if (p.includes("changeset-status")) return JSON.stringify(changesetStatus);
				return JSON.stringify(privatePackageJson);
			});

			vi.mocked(exec.exec).mockResolvedValue(0);

			const result = await validatePublish("pnpm", "main", false);

			expect(result.success).toBe(true);
			expect(result.validations).toHaveLength(1);
			expect(result.validations[0].hasPublishableTargets).toBe(false);
		});

		it("handles packages with multiple targets (npm + github packages)", async () => {
			const changesetStatus: ChangesetStatus = {
				changesets: [{ id: "test", summary: "Test", releases: [] }],
				releases: [{ name: "@test/multi", type: "minor", oldVersion: "1.0.0", newVersion: "1.1.0" }],
			};

			const workspacePackageJson: PackageJson = {
				name: "@test/multi",
				version: "1.1.0",
				publishConfig: {
					targets: ["npm", "github"],
					directory: "dist",
				},
			};

			const distPackageJson: PackageJson = {
				name: "@test/multi",
				version: "1.1.0",
			};

			vi.mocked(fs.existsSync).mockImplementation((filePath) => {
				const p = String(filePath);
				if (p.includes(".npmrc")) return false;
				return true;
			});

			vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
				const p = String(filePath);
				if (p.includes("changeset-status")) return JSON.stringify(changesetStatus);
				if (p.includes("multi") && p.endsWith("package.json") && !p.includes("dist")) {
					return JSON.stringify(workspacePackageJson);
				}
				if (p.includes("dist") && p.endsWith("package.json")) {
					return JSON.stringify(distPackageJson);
				}
				return JSON.stringify({});
			});

			vi.mocked(exec.exec).mockResolvedValue(0);

			const result = await validatePublish("pnpm", "main", false);

			expect(result).toBeDefined();
			expect(result.validations).toHaveLength(1);
			expect(result.validations[0].targets.length).toBeGreaterThanOrEqual(1);
		});

		it("handles pre-validation failure", async () => {
			const changesetStatus: ChangesetStatus = {
				changesets: [{ id: "test", summary: "Test", releases: [] }],
				releases: [{ name: "@test/package", type: "patch", oldVersion: "1.0.0", newVersion: "1.0.1" }],
			};

			const workspacePackageJson: PackageJson = {
				name: "@test/package",
				version: "1.0.1",
				publishConfig: {
					targets: ["npm"],
					directory: "dist",
				},
			};

			vi.mocked(fs.existsSync).mockImplementation((filePath) => {
				const p = String(filePath);
				if (p.includes("dist")) return false; // dist directory doesn't exist
				if (p.includes(".npmrc")) return false;
				return true;
			});

			vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
				const p = String(filePath);
				if (p.includes("changeset-status")) return JSON.stringify(changesetStatus);
				return JSON.stringify(workspacePackageJson);
			});

			vi.mocked(exec.exec).mockResolvedValue(0);

			const result = await validatePublish("pnpm", "main", false);

			expect(result.success).toBe(false);
			expect(result.validations[0].allTargetsValid).toBe(false);
		});

		it("handles dry-run publish failure", async () => {
			const changesetStatus: ChangesetStatus = {
				changesets: [{ id: "test", summary: "Test", releases: [] }],
				releases: [{ name: "@test/package", type: "patch", oldVersion: "1.0.0", newVersion: "1.0.1" }],
			};

			const workspacePackageJson: PackageJson = {
				name: "@test/package",
				version: "1.0.1",
				publishConfig: {
					targets: ["npm"],
					directory: "dist",
				},
			};

			const distPackageJson: PackageJson = {
				name: "@test/package",
				version: "1.0.1",
			};

			vi.mocked(fs.existsSync).mockImplementation((filePath) => {
				const p = String(filePath);
				if (p.includes(".npmrc")) return false;
				return true;
			});

			vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
				const p = String(filePath);
				if (p.includes("changeset-status")) return JSON.stringify(changesetStatus);
				if (p.includes("test-package") && p.endsWith("package.json") && !p.includes("dist")) {
					return JSON.stringify(workspacePackageJson);
				}
				if (p.includes("dist") && p.endsWith("package.json")) {
					return JSON.stringify(distPackageJson);
				}
				return JSON.stringify({});
			});

			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options) => {
				if (cmd === "npm" && args?.includes("publish")) {
					if (options?.listeners?.stderr) {
						options.listeners.stderr(Buffer.from("Version conflict"));
					}
					return 1;
				}
				return 0;
			});

			const result = await validatePublish("pnpm", "main", false);

			expect(result.success).toBe(false);
			expect(result.validations[0].allTargetsValid).toBe(false);
		});

		it("logs warning when workspace path cannot be found", async () => {
			const changesetStatus: ChangesetStatus = {
				changesets: [{ id: "test", summary: "Test", releases: [] }],
				releases: [{ name: "@unknown/package", type: "patch", oldVersion: "1.0.0", newVersion: "1.0.1" }],
			};

			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(changesetStatus));
			vi.mocked(exec.exec).mockResolvedValue(0);

			const result = await validatePublish("pnpm", "main", false);

			// Package with unknown path should be skipped with warning
			expect(result.success).toBe(true);
			expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Could not find workspace path"));
		});

		it("logs warning when package.json is not found", async () => {
			const changesetStatus: ChangesetStatus = {
				changesets: [{ id: "test", summary: "Test", releases: [] }],
				releases: [{ name: "@test/package", type: "patch", oldVersion: "1.0.0", newVersion: "1.0.1" }],
			};

			vi.mocked(fs.existsSync).mockImplementation((filePath) => {
				const p = String(filePath);
				// Package.json doesn't exist in workspace
				if (p.includes("test-package") && p.endsWith("package.json")) return false;
				return true;
			});

			vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(changesetStatus));
			vi.mocked(exec.exec).mockResolvedValue(0);

			const result = await validatePublish("pnpm", "main", false);

			expect(result.success).toBe(true);
			expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("package.json not found"));
		});

		it("reports missing auth tokens", async () => {
			// Remove tokens
			delete process.env.NPM_TOKEN;
			delete process.env.GITHUB_TOKEN;

			const changesetStatus: ChangesetStatus = {
				changesets: [{ id: "test", summary: "Test", releases: [] }],
				releases: [{ name: "@test/package", type: "patch", oldVersion: "1.0.0", newVersion: "1.0.1" }],
			};

			const workspacePackageJson: PackageJson = {
				name: "@test/package",
				version: "1.0.1",
				publishConfig: {
					targets: ["npm"],
					directory: "dist",
				},
			};

			const distPackageJson: PackageJson = {
				name: "@test/package",
				version: "1.0.1",
			};

			vi.mocked(fs.existsSync).mockImplementation((filePath) => {
				const p = String(filePath);
				if (p.includes(".npmrc")) return false;
				return true;
			});

			vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
				const p = String(filePath);
				if (p.includes("changeset-status")) return JSON.stringify(changesetStatus);
				if (p.includes("test-package") && p.endsWith("package.json") && !p.includes("dist")) {
					return JSON.stringify(workspacePackageJson);
				}
				if (p.includes("dist") && p.endsWith("package.json")) {
					return JSON.stringify(distPackageJson);
				}
				return JSON.stringify({});
			});

			vi.mocked(exec.exec).mockResolvedValue(0);

			const result = await validatePublish("pnpm", "main", false);

			expect(result).toBeDefined();
			expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Some registry tokens are missing"));
		});

		it("calculates npmReady based on npm targets", async () => {
			const changesetStatus: ChangesetStatus = {
				changesets: [],
				releases: [],
			};

			vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(changesetStatus));
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(exec.exec).mockResolvedValue(0);

			const result = await validatePublish("pnpm", "main", true);

			expect(result.npmReady).toBe(true);
			expect(result.githubPackagesReady).toBe(true);
		});

		it("generates summary markdown", async () => {
			const changesetStatus: ChangesetStatus = {
				changesets: [],
				releases: [],
			};

			vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(changesetStatus));
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(exec.exec).mockResolvedValue(0);

			const result = await validatePublish("pnpm", "main", false);

			expect(result.summary).toBeDefined();
			expect(typeof result.summary).toBe("string");
		});

		it("logs pre-validation warnings", async () => {
			const changesetStatus: ChangesetStatus = {
				changesets: [{ id: "test-changeset", summary: "Test changes", releases: [] }],
				releases: [{ name: "@test/package", type: "minor", oldVersion: "1.0.0", newVersion: "1.1.0" }],
			};

			const workspacePackageJson: PackageJson = {
				name: "@test/package",
				version: "1.1.0",
				publishConfig: {
					targets: ["npm"],
					directory: "dist",
				},
			};

			// Dist package.json has a DIFFERENT name to trigger warning
			const distPackageJson: PackageJson = {
				name: "@test/different-name",
				version: "1.1.0",
			};

			vi.mocked(fs.existsSync).mockImplementation((filePath) => {
				const p = String(filePath);
				if (p.includes(".npmrc")) return false;
				return true;
			});

			vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
				const p = String(filePath);
				if (p.includes("changeset-status")) return JSON.stringify(changesetStatus);
				if (p.includes("test-package") && p.endsWith("package.json") && !p.includes("dist")) {
					return JSON.stringify(workspacePackageJson);
				}
				if (p.includes("dist") && p.endsWith("package.json")) {
					return JSON.stringify(distPackageJson);
				}
				return JSON.stringify({});
			});

			vi.mocked(exec.exec).mockResolvedValue(0);

			const result = await validatePublish("pnpm", "main", false);

			// Should log the warning about package name mismatch
			expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Package name mismatch"));
			expect(result).toBeDefined();
		});

		it("handles version conflict without existingVersion set", async () => {
			const changesetStatus: ChangesetStatus = {
				changesets: [{ id: "test-changeset", summary: "Test changes", releases: [] }],
				releases: [{ name: "@test/package", type: "minor", oldVersion: "1.0.0", newVersion: "1.1.0" }],
			};

			const workspacePackageJson: PackageJson = {
				name: "@test/package",
				version: "1.1.0",
				publishConfig: {
					targets: ["npm"],
					directory: "dist",
				},
			};

			const distPackageJson: PackageJson = {
				name: "@test/package",
				version: "1.1.0",
			};

			vi.mocked(fs.existsSync).mockImplementation((filePath) => {
				const p = String(filePath);
				if (p.includes(".npmrc")) return false;
				return true;
			});

			vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
				const p = String(filePath);
				if (p.includes("changeset-status")) return JSON.stringify(changesetStatus);
				if (p.includes("test-package") && p.endsWith("package.json") && !p.includes("dist")) {
					return JSON.stringify(workspacePackageJson);
				}
				if (p.includes("dist") && p.endsWith("package.json")) {
					return JSON.stringify(distPackageJson);
				}
				return JSON.stringify({});
			});

			// Simulate version conflict error without existingVersion
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options) => {
				if (cmd === "npm" && args?.includes("publish")) {
					if (options?.listeners?.stderr) {
						options.listeners.stderr(Buffer.from("cannot publish over previously published version"));
					}
					return 1;
				}
				return 0;
			});

			const result = await validatePublish("pnpm", "main", false);

			expect(result.success).toBe(false);
			expect(result.validations[0].targets[0].versionConflict).toBe(true);
			// Message should use release.newVersion as fallback
			expect(result.validations[0].targets[0].message).toContain("1.1.0");
		});

		it("handles dry-run failure with empty error string", async () => {
			const changesetStatus: ChangesetStatus = {
				changesets: [{ id: "test-changeset", summary: "Test changes", releases: [] }],
				releases: [{ name: "@test/package", type: "minor", oldVersion: "1.0.0", newVersion: "1.1.0" }],
			};

			const workspacePackageJson: PackageJson = {
				name: "@test/package",
				version: "1.1.0",
				publishConfig: {
					targets: ["npm"],
					directory: "dist",
				},
			};

			const distPackageJson: PackageJson = {
				name: "@test/package",
				version: "1.1.0",
			};

			vi.mocked(fs.existsSync).mockImplementation((filePath) => {
				const p = String(filePath);
				if (p.includes(".npmrc")) return false;
				return true;
			});

			vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
				const p = String(filePath);
				if (p.includes("changeset-status")) return JSON.stringify(changesetStatus);
				if (p.includes("test-package") && p.endsWith("package.json") && !p.includes("dist")) {
					return JSON.stringify(workspacePackageJson);
				}
				if (p.includes("dist") && p.endsWith("package.json")) {
					return JSON.stringify(distPackageJson);
				}
				return JSON.stringify({});
			});

			// Simulate failure with empty error message (no stderr output)
			vi.mocked(exec.exec).mockImplementation(async (cmd, args) => {
				if (cmd === "npm" && args?.includes("publish")) {
					return 1; // Fail without providing stderr
				}
				return 0;
			});

			const result = await validatePublish("pnpm", "main", false);

			expect(result.success).toBe(false);
			expect(result.validations[0].targets[0].dryRunPassed).toBe(false);
			// Should fall back to "Dry-run failed" when error is empty
			expect(result.validations[0].targets[0].message).toBe("Dry-run failed");
		});
	});
});
