import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedTarget } from "../src/types/publish-config.js";
import { dryRunPublish } from "../src/utils/dry-run-publish.js";
import { cleanupTestEnvironment, setupTestEnvironment } from "./utils/github-mocks.js";

// Mock modules
vi.mock("@actions/core");
vi.mock("@actions/exec");

describe("dry-run-publish", () => {
	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });
	});

	afterEach(() => {
		cleanupTestEnvironment();
	});

	describe("dryRunPublish with npm protocol", () => {
		it("runs npm publish --dry-run successfully", async () => {
			vi.mocked(exec.exec).mockResolvedValue(0);

			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: true,
				tag: "latest",
				tokenEnv: "NPM_TOKEN",
			};

			const result = await dryRunPublish(target, "pnpm");

			expect(result.success).toBe(true);
			expect(result.versionConflict).toBe(false);
			expect(result.provenanceReady).toBe(true);
			expect(exec.exec).toHaveBeenCalledWith(
				"npm",
				expect.arrayContaining([
					"publish",
					"--dry-run",
					"--registry",
					"https://registry.npmjs.org/",
					"--provenance",
					"--access",
					"public",
				]),
				expect.objectContaining({
					cwd: "/test/dist",
				}),
			);
		});

		it("detects version conflict from stderr", async () => {
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(
						Buffer.from("npm ERR! 403 - You cannot publish over the previously published versions: 1.0.0"),
					);
				}
				return 1;
			});

			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: false,
				tag: "latest",
				tokenEnv: "NPM_TOKEN",
			};

			const result = await dryRunPublish(target, "pnpm");

			expect(result.success).toBe(false);
			expect(result.versionConflict).toBe(true);
		});

		it("detects version conflict from stdout", async () => {
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("cannot publish over previously published version"));
				}
				return 1;
			});

			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: false,
				tag: "latest",
				tokenEnv: "NPM_TOKEN",
			};

			const result = await dryRunPublish(target, "pnpm");

			expect(result.versionConflict).toBe(true);
		});

		it("extracts existing version from error message", async () => {
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(
						Buffer.from("cannot publish over previously published version: version 2.3.4 already exists"),
					);
				}
				return 1;
			});

			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: false,
				tag: "latest",
				tokenEnv: "NPM_TOKEN",
			};

			const result = await dryRunPublish(target, "pnpm");

			expect(result.versionConflict).toBe(true);
			expect(result.existingVersion).toBe("2.3.4");
		});

		it("handles non-latest tag", async () => {
			vi.mocked(exec.exec).mockResolvedValue(0);

			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: false,
				tag: "beta",
				tokenEnv: "NPM_TOKEN",
			};

			await dryRunPublish(target, "pnpm");

			expect(exec.exec).toHaveBeenCalledWith("npm", expect.arrayContaining(["--tag", "beta"]), expect.anything());
		});

		it("does not add tag flag for latest", async () => {
			vi.mocked(exec.exec).mockResolvedValue(0);

			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: false,
				tag: "latest",
				tokenEnv: "NPM_TOKEN",
			};

			await dryRunPublish(target, "pnpm");

			const call = vi.mocked(exec.exec).mock.calls[0];
			const args = call[1] as string[];
			expect(args).not.toContain("--tag");
		});

		it("handles exec throwing an error", async () => {
			vi.mocked(exec.exec).mockRejectedValue(new Error("Command failed"));

			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: false,
				tag: "latest",
				tokenEnv: "NPM_TOKEN",
			};

			const result = await dryRunPublish(target, "pnpm");

			expect(result.success).toBe(false);
			expect(result.error).toContain("Command failed");
		});

		it("handles non-Error throw", async () => {
			vi.mocked(exec.exec).mockRejectedValue("string error");

			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: false,
				tag: "latest",
				tokenEnv: "NPM_TOKEN",
			};

			const result = await dryRunPublish(target, "pnpm");

			expect(result.success).toBe(false);
			expect(result.error).toBe("string error");
		});

		it("detects provenance issues", async () => {
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from("provenance attestation failed"));
				}
				return 1;
			});

			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: true,
				tag: "latest",
				tokenEnv: "NPM_TOKEN",
			};

			const result = await dryRunPublish(target, "pnpm");

			expect(result.provenanceReady).toBe(false);
		});

		it("handles GitHub Packages registry", async () => {
			vi.mocked(exec.exec).mockResolvedValue(0);

			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://npm.pkg.github.com/",
				directory: "/test/dist",
				access: "restricted",
				provenance: false,
				tag: "latest",
				tokenEnv: "GITHUB_TOKEN",
			};

			const result = await dryRunPublish(target, "pnpm");

			expect(result.success).toBe(true);
			expect(core.info).toHaveBeenCalledWith(expect.stringContaining("GitHub Packages"));
		});

		it("handles custom registry", async () => {
			vi.mocked(exec.exec).mockResolvedValue(0);

			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://custom.registry.example.com/",
				directory: "/test/dist",
				access: "public",
				provenance: false,
				tag: "latest",
				tokenEnv: "CUSTOM_TOKEN",
			};

			const result = await dryRunPublish(target, "pnpm");

			expect(result.success).toBe(true);
			expect(core.info).toHaveBeenCalledWith(expect.stringContaining("custom.registry.example.com"));
		});

		it("handles null registry", async () => {
			vi.mocked(exec.exec).mockResolvedValue(0);

			const target: ResolvedTarget = {
				protocol: "npm",
				registry: null,
				directory: "/test/dist",
				access: "public",
				provenance: false,
				tag: "latest",
				tokenEnv: "NPM_TOKEN",
			};

			await dryRunPublish(target, "pnpm");

			// Should not include --registry flag
			const call = vi.mocked(exec.exec).mock.calls[0];
			const args = call[1] as string[];
			expect(args).not.toContain("--registry");
		});

		it("captures stdout output", async () => {
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("Publishing to npm..."));
				}
				return 0;
			});

			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: false,
				tag: "latest",
				tokenEnv: "NPM_TOKEN",
			};

			const result = await dryRunPublish(target, "pnpm");

			expect(result.output).toContain("Publishing to npm...");
		});
	});

	describe("dryRunPublish with jsr protocol", () => {
		it("runs npx jsr publish --dry-run successfully", async () => {
			vi.mocked(exec.exec).mockResolvedValue(0);

			const target: ResolvedTarget = {
				protocol: "jsr",
				registry: null,
				directory: "/test/dist/jsr",
				access: "public",
				provenance: false,
				tag: "latest",
				tokenEnv: "JSR_TOKEN",
			};

			const result = await dryRunPublish(target, "pnpm");

			expect(result.success).toBe(true);
			expect(result.provenanceReady).toBe(true); // JSR always true
			expect(exec.exec).toHaveBeenCalledWith(
				"npx",
				["jsr", "publish", "--dry-run"],
				expect.objectContaining({
					cwd: "/test/dist/jsr",
				}),
			);
		});

		it("detects JSR version conflict from stdout", async () => {
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("Version already exists"));
				}
				return 1;
			});

			const target: ResolvedTarget = {
				protocol: "jsr",
				registry: null,
				directory: "/test/dist/jsr",
				access: "public",
				provenance: false,
				tag: "latest",
				tokenEnv: "JSR_TOKEN",
			};

			const result = await dryRunPublish(target, "pnpm");

			expect(result.success).toBe(false);
			expect(result.versionConflict).toBe(true);
		});

		it("detects JSR version conflict from stderr", async () => {
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from("Version 1.0.0 already published"));
				}
				return 1;
			});

			const target: ResolvedTarget = {
				protocol: "jsr",
				registry: null,
				directory: "/test/dist/jsr",
				access: "public",
				provenance: false,
				tag: "latest",
				tokenEnv: "JSR_TOKEN",
			};

			const result = await dryRunPublish(target, "pnpm");

			expect(result.versionConflict).toBe(true);
		});

		it("handles JSR exec error", async () => {
			vi.mocked(exec.exec).mockRejectedValue(new Error("JSR command failed"));

			const target: ResolvedTarget = {
				protocol: "jsr",
				registry: null,
				directory: "/test/dist/jsr",
				access: "public",
				provenance: false,
				tag: "latest",
				tokenEnv: "JSR_TOKEN",
			};

			const result = await dryRunPublish(target, "pnpm");

			expect(result.success).toBe(false);
			expect(result.error).toContain("JSR command failed");
		});
	});

	describe("dryRunPublish with unknown protocol", () => {
		it("throws error for unknown protocol", async () => {
			const target = {
				protocol: "unknown",
				registry: null,
				directory: "/test/dist",
				access: "public",
				provenance: false,
				tag: "latest",
				tokenEnv: null,
			} as unknown as ResolvedTarget;

			await expect(dryRunPublish(target, "pnpm")).rejects.toThrow("Unknown protocol: unknown");
		});
	});
});
