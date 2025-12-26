import * as fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishPackages } from "../src/utils/publish-packages.js";

// Mock modules
vi.mock("node:fs");
vi.mock("@actions/core", () => ({
	info: vi.fn(),
	warning: vi.fn(),
	error: vi.fn(),
	debug: vi.fn(),
	startGroup: vi.fn(),
	endGroup: vi.fn(),
	getInput: vi.fn(),
}));

vi.mock("@actions/exec", () => ({
	exec: vi.fn(),
}));

vi.mock("../src/utils/get-changeset-status.js", () => ({
	getChangesetStatus: vi.fn(),
}));

vi.mock("../src/utils/find-package-path.js", () => ({
	findPackagePath: vi.fn(),
}));

vi.mock("../src/utils/registry-auth.js", () => ({
	setupRegistryAuth: vi.fn(),
}));

vi.mock("../src/utils/publish-target.js", () => ({
	publishToTarget: vi.fn(),
	checkVersionExists: vi.fn(),
	getLocalTarballIntegrity: vi.fn(),
	packAndComputeDigest: vi.fn(),
}));

vi.mock("../src/utils/create-attestation.js", () => ({
	createPackageAttestation: vi.fn(),
}));

import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { createPackageAttestation } from "../src/utils/create-attestation.js";
import { findPackagePath } from "../src/utils/find-package-path.js";
import { getChangesetStatus } from "../src/utils/get-changeset-status.js";
import {
	checkVersionExists,
	getLocalTarballIntegrity,
	packAndComputeDigest,
	publishToTarget,
} from "../src/utils/publish-target.js";
import { setupRegistryAuth } from "../src/utils/registry-auth.js";

describe("publish-packages", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(core.getInput).mockReturnValue("");
		vi.mocked(setupRegistryAuth).mockResolvedValue({
			success: true,
			configuredRegistries: [],
			missingTokens: [],
			unreachableRegistries: [],
		});
		// Default: version doesn't exist (ready to publish)
		vi.mocked(checkVersionExists).mockResolvedValue({
			success: true,
			versionExists: false,
		});
		// Default: return a shasum for local tarball
		vi.mocked(getLocalTarballIntegrity).mockResolvedValue("abc123def456");
		// Default: pack succeeds with tarball info
		vi.mocked(packAndComputeDigest).mockResolvedValue({
			path: "/path/to/pkg-a/org-pkg-a-1.0.0.tgz",
			digest: "sha256:abc123def456789",
			filename: "org-pkg-a-1.0.0.tgz",
		});
		// Default: attestation succeeds but no URL
		vi.mocked(createPackageAttestation).mockResolvedValue({
			success: true,
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns success with empty packages when no releases found", async () => {
		vi.mocked(getChangesetStatus).mockResolvedValue({
			releases: [],
			changesets: [],
		});

		const result = await publishPackages("pnpm", "main", false);

		expect(result.success).toBe(true);
		expect(result.packages).toHaveLength(0);
		expect(result.totalPackages).toBe(0);
	});

	it("skips packages that cannot be found in workspace", async () => {
		vi.mocked(getChangesetStatus).mockResolvedValue({
			releases: [{ name: "@org/pkg-a", newVersion: "1.0.0", type: "patch" }],
			changesets: [],
		});
		vi.mocked(findPackagePath).mockReturnValue(null);

		const result = await publishPackages("pnpm", "main", false);

		expect(core.error).toHaveBeenCalledWith("Could not find workspace path for package @org/pkg-a");
		expect(result.totalPackages).toBe(0);
	});

	it("skips packages without package.json", async () => {
		vi.mocked(getChangesetStatus).mockResolvedValue({
			releases: [{ name: "@org/pkg-a", newVersion: "1.0.0", type: "patch" }],
			changesets: [],
		});
		vi.mocked(findPackagePath).mockReturnValue("/path/to/pkg-a");
		vi.mocked(fs.existsSync).mockReturnValue(false);

		const result = await publishPackages("pnpm", "main", false);

		expect(core.error).toHaveBeenCalled();
		expect(result.totalPackages).toBe(0);
	});

	it("skips private packages without publishConfig", async () => {
		vi.mocked(getChangesetStatus).mockResolvedValue({
			releases: [{ name: "@org/pkg-a", newVersion: "1.0.0", type: "patch" }],
			changesets: [],
		});
		vi.mocked(findPackagePath).mockReturnValue("/path/to/pkg-a");
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(
			JSON.stringify({
				name: "@org/pkg-a",
				version: "1.0.0",
				private: true,
			}),
		);

		const result = await publishPackages("pnpm", "main", false);

		expect(core.info).toHaveBeenCalledWith("Package @org/pkg-a has no publish targets (private or no publishConfig)");
		expect(result.totalPackages).toBe(0);
	});

	it("fails if build fails with non-zero exit code", async () => {
		vi.mocked(getChangesetStatus).mockResolvedValue({
			releases: [{ name: "@org/pkg-a", newVersion: "1.0.0", type: "patch" }],
			changesets: [],
		});
		vi.mocked(findPackagePath).mockReturnValue("/path/to/pkg-a");
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(
			JSON.stringify({
				name: "@org/pkg-a",
				version: "1.0.0",
				publishConfig: { access: "public" },
			}),
		);
		vi.mocked(setupRegistryAuth).mockResolvedValue({
			success: true,
			configuredRegistries: [],
			missingTokens: [],
			unreachableRegistries: [],
		});
		// Mock exec to call listeners and return non-zero exit code
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			if (options?.listeners?.stdout) {
				options.listeners.stdout(Buffer.from("Building...\n"));
			}
			if (options?.listeners?.stderr) {
				options.listeners.stderr(Buffer.from("Error: TypeScript compilation failed\n"));
			}
			return 1; // Build fails
		});

		const result = await publishPackages("pnpm", "main", false);

		expect(result.success).toBe(false);
		expect(result.buildError).toContain("TypeScript compilation failed");
		expect(result.buildOutput).toContain("Building...");
		expect(core.error).toHaveBeenCalledWith("Build failed, aborting publish");
	});

	it("fails if build throws an error", async () => {
		vi.mocked(getChangesetStatus).mockResolvedValue({
			releases: [{ name: "@org/pkg-a", newVersion: "1.0.0", type: "patch" }],
			changesets: [],
		});
		vi.mocked(findPackagePath).mockReturnValue("/path/to/pkg-a");
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(
			JSON.stringify({
				name: "@org/pkg-a",
				version: "1.0.0",
				publishConfig: { access: "public" },
			}),
		);
		vi.mocked(setupRegistryAuth).mockResolvedValue({
			success: true,
			configuredRegistries: [],
			missingTokens: [],
			unreachableRegistries: [],
		});
		vi.mocked(exec.exec).mockRejectedValue(new Error("Command not found"));

		const result = await publishPackages("pnpm", "main", false);

		expect(result.success).toBe(false);
		expect(core.error).toHaveBeenCalledWith("Build failed: Command not found");
		expect(core.error).toHaveBeenCalledWith("Build failed, aborting publish");
	});

	it("publishes packages successfully", async () => {
		vi.mocked(getChangesetStatus).mockResolvedValue({
			releases: [{ name: "@org/pkg-a", newVersion: "1.0.0", type: "patch" }],
			changesets: [],
		});
		vi.mocked(findPackagePath).mockReturnValue("/path/to/pkg-a");
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(
			JSON.stringify({
				name: "@org/pkg-a",
				version: "1.0.0",
				publishConfig: { access: "public" },
			}),
		);
		vi.mocked(setupRegistryAuth).mockResolvedValue({
			success: true,
			configuredRegistries: [],
			missingTokens: [],
			unreachableRegistries: [],
		});
		vi.mocked(exec.exec).mockResolvedValue(0); // Build succeeds
		vi.mocked(publishToTarget).mockResolvedValue({
			success: true,
			output: "Published successfully",
			error: "",
			registryUrl: "https://www.npmjs.com/package/@org/pkg-a",
		});

		const result = await publishPackages("pnpm", "main", false);

		expect(result.success).toBe(true);
		expect(result.packages).toHaveLength(1);
		expect(result.packages[0].name).toBe("@org/pkg-a");
		expect(result.successfulPackages).toBe(1);
		expect(result.successfulTargets).toBe(1);
	});

	it("publishes packages with provenance attestation", async () => {
		vi.mocked(getChangesetStatus).mockResolvedValue({
			releases: [{ name: "@org/pkg-a", newVersion: "1.0.0", type: "patch" }],
			changesets: [],
		});
		vi.mocked(findPackagePath).mockReturnValue("/path/to/pkg-a");
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(
			JSON.stringify({
				name: "@org/pkg-a",
				version: "1.0.0",
				publishConfig: { access: "public" },
			}),
		);
		vi.mocked(setupRegistryAuth).mockResolvedValue({
			success: true,
			configuredRegistries: [],
			missingTokens: [],
			unreachableRegistries: [],
		});
		vi.mocked(exec.exec).mockResolvedValue(0);
		vi.mocked(publishToTarget).mockResolvedValue({
			success: true,
			output: "Published with provenance",
			error: "",
			registryUrl: "https://www.npmjs.com/package/@org/pkg-a",
			attestationUrl: "https://search.sigstore.dev/?logIndex=123456",
		});

		const result = await publishPackages("pnpm", "main", false);

		expect(result.success).toBe(true);
		expect(result.packages[0].targets[0].attestationUrl).toBe("https://search.sigstore.dev/?logIndex=123456");
		expect(core.info).toHaveBeenCalledWith("  Provenance: https://search.sigstore.dev/?logIndex=123456");
	});

	it("handles partial publish failure", async () => {
		vi.mocked(getChangesetStatus).mockResolvedValue({
			releases: [{ name: "@org/pkg-a", newVersion: "1.0.0", type: "patch" }],
			changesets: [],
		});
		vi.mocked(findPackagePath).mockReturnValue("/path/to/pkg-a");
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(
			JSON.stringify({
				name: "@org/pkg-a",
				version: "1.0.0",
				publishConfig: {
					access: "public",
					targets: ["npm", "github"],
				},
			}),
		);
		vi.mocked(setupRegistryAuth).mockResolvedValue({
			success: true,
			configuredRegistries: [],
			missingTokens: [],
			unreachableRegistries: [],
		});
		vi.mocked(exec.exec).mockResolvedValue(0);
		vi.mocked(publishToTarget)
			.mockResolvedValueOnce({
				success: true,
				output: "Published to npm",
				error: "",
			})
			.mockResolvedValueOnce({
				success: false,
				output: "",
				error: "Auth failed",
			});

		const result = await publishPackages("pnpm", "main", false);

		expect(result.success).toBe(false);
		expect(result.successfulTargets).toBe(1);
		expect(result.totalTargets).toBe(2);
	});

	it("uses npm command for npm package manager", async () => {
		vi.mocked(getChangesetStatus).mockResolvedValue({
			releases: [],
			changesets: [],
		});
		vi.mocked(exec.exec).mockResolvedValue(0);

		await publishPackages("npm", "main", false);

		// No packages so build won't run, but we can verify the function handles npm
		expect(getChangesetStatus).toHaveBeenCalledWith("npm", "main");
	});

	it("logs warning for missing registry tokens", async () => {
		vi.mocked(getChangesetStatus).mockResolvedValue({
			releases: [{ name: "@org/pkg-a", newVersion: "1.0.0", type: "patch" }],
			changesets: [],
		});
		vi.mocked(findPackagePath).mockReturnValue("/path/to/pkg-a");
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(
			JSON.stringify({
				name: "@org/pkg-a",
				version: "1.0.0",
				publishConfig: { access: "public" },
			}),
		);
		vi.mocked(setupRegistryAuth).mockResolvedValue({
			success: false,
			configuredRegistries: [],
			missingTokens: [{ registry: "https://registry.npmjs.org/", tokenEnv: "NPM_TOKEN" }],
			unreachableRegistries: [],
		});
		vi.mocked(exec.exec).mockResolvedValue(0);
		vi.mocked(publishToTarget).mockResolvedValue({
			success: true,
			output: "",
			error: "",
		});

		await publishPackages("pnpm", "main", false);

		expect(core.warning).toHaveBeenCalledWith("Some registry tokens are missing:");
		expect(core.warning).toHaveBeenCalledWith("  - https://registry.npmjs.org/: NPM_TOKEN not set");
	});

	it("fails pre-validation when registry is unreachable", async () => {
		vi.mocked(getChangesetStatus).mockResolvedValue({
			releases: [{ name: "@org/pkg-a", newVersion: "1.0.0", type: "patch" }],
			changesets: [],
		});
		vi.mocked(findPackagePath).mockReturnValue("/path/to/pkg-a");
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(
			JSON.stringify({
				name: "@org/pkg-a",
				version: "1.0.0",
				publishConfig: { access: "public" },
			}),
		);
		vi.mocked(exec.exec).mockResolvedValue(0); // Build succeeds
		// Pre-validation fails due to auth/network error
		vi.mocked(checkVersionExists).mockResolvedValue({
			success: false,
			versionExists: false,
			error: "npm error code E401\nnpm error Unable to authenticate",
		});

		const result = await publishPackages("pnpm", "main", false);

		// Should fail during pre-validation
		expect(result.success).toBe(false);
		expect(result.buildError).toContain("Pre-validation failed");
		// publishToTarget should NOT be called - we fail early
		expect(publishToTarget).not.toHaveBeenCalled();
	});

	it("handles publish target throwing an error", async () => {
		vi.mocked(getChangesetStatus).mockResolvedValue({
			releases: [{ name: "@org/pkg-a", newVersion: "1.0.0", type: "patch" }],
			changesets: [],
		});
		vi.mocked(findPackagePath).mockReturnValue("/path/to/pkg-a");
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(
			JSON.stringify({
				name: "@org/pkg-a",
				version: "1.0.0",
				publishConfig: { access: "public" },
			}),
		);
		vi.mocked(setupRegistryAuth).mockResolvedValue({
			success: true,
			configuredRegistries: [],
			missingTokens: [],
			unreachableRegistries: [],
		});
		vi.mocked(exec.exec).mockResolvedValue(0);
		vi.mocked(publishToTarget).mockRejectedValue(new Error("Network error"));

		const result = await publishPackages("pnpm", "main", false);

		expect(result.success).toBe(false);
		expect(result.packages[0].targets[0].success).toBe(false);
		expect(result.packages[0].targets[0].error).toBe("Network error");
	});

	it("treats already-published versions as successful with warning", async () => {
		vi.mocked(getChangesetStatus).mockResolvedValue({
			releases: [{ name: "@org/pkg-a", newVersion: "1.0.0", type: "patch" }],
			changesets: [],
		});
		vi.mocked(findPackagePath).mockReturnValue("/path/to/pkg-a");
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(
			JSON.stringify({
				name: "@org/pkg-a",
				version: "1.0.0",
				publishConfig: { access: "public" },
			}),
		);
		vi.mocked(setupRegistryAuth).mockResolvedValue({
			success: true,
			configuredRegistries: [],
			missingTokens: [],
			unreachableRegistries: [],
		});
		vi.mocked(exec.exec).mockResolvedValue(0);
		// Simulate already-published response
		vi.mocked(publishToTarget).mockResolvedValue({
			success: false,
			output: "",
			error: "You cannot publish over the previously published versions: 1.0.0",
			exitCode: 1,
			alreadyPublished: true,
		});

		const result = await publishPackages("pnpm", "main", false);

		// Overall success because already-published is not an error
		expect(result.success).toBe(true);
		expect(result.packages[0].targets[0].success).toBe(true);
		expect(result.packages[0].targets[0].alreadyPublished).toBe(true);
		// Should emit warning, not error
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("already published"));
		expect(core.error).not.toHaveBeenCalledWith(expect.stringContaining("Failed to publish"));
	});

	it("skips already-published versions with identical content", async () => {
		vi.mocked(getChangesetStatus).mockResolvedValue({
			releases: [{ name: "@org/pkg-a", newVersion: "1.0.0", type: "patch" }],
			changesets: [],
		});
		vi.mocked(findPackagePath).mockReturnValue("/path/to/pkg-a");
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(
			JSON.stringify({
				name: "@org/pkg-a",
				version: "1.0.0",
				publishConfig: { access: "public" },
			}),
		);
		vi.mocked(exec.exec).mockResolvedValue(0);
		// Pre-validation detects version already exists with identical content
		vi.mocked(checkVersionExists).mockResolvedValue({
			success: true,
			versionExists: true,
			versionInfo: {
				name: "@org/pkg-a",
				version: "1.0.0",
				versions: ["1.0.0"],
				distTags: { latest: "1.0.0" },
				dist: { shasum: "abc123def456" }, // Matches getLocalTarballIntegrity default
			},
		});

		const result = await publishPackages("pnpm", "main", false);

		// Should succeed because version already published with identical content
		expect(result.success).toBe(true);
		expect(result.successfulTargets).toBe(1);
		expect(result.packages[0].targets[0].success).toBe(true);
		expect(result.packages[0].targets[0].alreadyPublished).toBe(true);
		// publishToTarget should NOT be called - we skip during pre-validation
		expect(publishToTarget).not.toHaveBeenCalled();
	});

	it("fails pre-validation when version exists with different content", async () => {
		vi.mocked(getChangesetStatus).mockResolvedValue({
			releases: [{ name: "@org/pkg-a", newVersion: "1.0.0", type: "patch" }],
			changesets: [],
		});
		vi.mocked(findPackagePath).mockReturnValue("/path/to/pkg-a");
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(
			JSON.stringify({
				name: "@org/pkg-a",
				version: "1.0.0",
				publishConfig: { access: "public" },
			}),
		);
		vi.mocked(exec.exec).mockResolvedValue(0);
		// Pre-validation detects version exists with DIFFERENT content
		vi.mocked(checkVersionExists).mockResolvedValue({
			success: true,
			versionExists: true,
			versionInfo: {
				name: "@org/pkg-a",
				version: "1.0.0",
				versions: ["1.0.0"],
				distTags: { latest: "1.0.0" },
				dist: { shasum: "different_shasum_xyz" }, // Different from getLocalTarballIntegrity default
			},
		});

		const result = await publishPackages("pnpm", "main", false);

		// Should fail because content mismatch
		expect(result.success).toBe(false);
		expect(result.buildError).toContain("Pre-validation failed");
		// publishToTarget should NOT be called - we fail early
		expect(publishToTarget).not.toHaveBeenCalled();
	});

	it("skips version check when local integrity unavailable but treats as skip", async () => {
		vi.mocked(getChangesetStatus).mockResolvedValue({
			releases: [{ name: "@org/pkg-a", newVersion: "1.0.0", type: "patch" }],
			changesets: [],
		});
		vi.mocked(findPackagePath).mockReturnValue("/path/to/pkg-a");
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(
			JSON.stringify({
				name: "@org/pkg-a",
				version: "1.0.0",
				publishConfig: { access: "public" },
			}),
		);
		vi.mocked(exec.exec).mockResolvedValue(0);
		// Version exists but we can't get local integrity
		vi.mocked(checkVersionExists).mockResolvedValue({
			success: true,
			versionExists: true,
			versionInfo: {
				name: "@org/pkg-a",
				version: "1.0.0",
				versions: ["1.0.0"],
				distTags: { latest: "1.0.0" },
				dist: { shasum: "remote_shasum" },
			},
		});
		vi.mocked(getLocalTarballIntegrity).mockResolvedValue(undefined); // Can't get local integrity

		const result = await publishPackages("pnpm", "main", false);

		// Should succeed (skip with warning) since we can't compare
		expect(result.success).toBe(true);
		expect(result.packages[0].targets[0].alreadyPublished).toBe(true);
		expect(publishToTarget).not.toHaveBeenCalled();
	});

	describe("pre-detected releases", () => {
		it("uses pre-detected releases instead of changeset status", async () => {
			// Don't set up getChangesetStatus - it shouldn't be called
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(
				JSON.stringify({
					name: "@org/pkg-a",
					version: "2.0.0",
					publishConfig: { access: "public" },
				}),
			);
			vi.mocked(setupRegistryAuth).mockResolvedValue({
				success: true,
				configuredRegistries: [],
				missingTokens: [],
				unreachableRegistries: [],
			});
			vi.mocked(exec.exec).mockResolvedValue(0);
			vi.mocked(publishToTarget).mockResolvedValue({
				success: true,
				output: "Published successfully",
				error: "",
				registryUrl: "https://www.npmjs.com/package/@org/pkg-a",
			});

			const preDetectedReleases = [
				{
					name: "@org/pkg-a",
					version: "2.0.0",
					path: "/path/to/pkg-a",
				},
			];

			const result = await publishPackages("pnpm", "main", false, preDetectedReleases);

			expect(result.success).toBe(true);
			expect(result.packages).toHaveLength(1);
			expect(result.packages[0].name).toBe("@org/pkg-a");
			expect(result.packages[0].version).toBe("2.0.0");
			// getChangesetStatus should not have been called when pre-detected releases provided
			expect(getChangesetStatus).not.toHaveBeenCalled();
		});

		it("falls back to changeset status when pre-detected releases is empty", async () => {
			vi.mocked(getChangesetStatus).mockResolvedValue({
				releases: [{ name: "@org/pkg-b", newVersion: "1.0.0", type: "minor" }],
				changesets: [],
			});
			vi.mocked(findPackagePath).mockReturnValue("/path/to/pkg-b");
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(
				JSON.stringify({
					name: "@org/pkg-b",
					version: "1.0.0",
					publishConfig: { access: "public" },
				}),
			);
			vi.mocked(setupRegistryAuth).mockResolvedValue({
				success: true,
				configuredRegistries: [],
				missingTokens: [],
				unreachableRegistries: [],
			});
			vi.mocked(exec.exec).mockResolvedValue(0);
			vi.mocked(publishToTarget).mockResolvedValue({
				success: true,
				output: "Published",
				error: "",
			});

			const result = await publishPackages("pnpm", "main", false, []);

			expect(result.success).toBe(true);
			expect(getChangesetStatus).toHaveBeenCalled();
		});

		it("uses pre-detected path instead of findPackagePath", async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(
				JSON.stringify({
					name: "@org/pkg-c",
					version: "3.0.0",
					publishConfig: { access: "public" },
				}),
			);
			vi.mocked(setupRegistryAuth).mockResolvedValue({
				success: true,
				configuredRegistries: [],
				missingTokens: [],
				unreachableRegistries: [],
			});
			vi.mocked(exec.exec).mockResolvedValue(0);
			vi.mocked(publishToTarget).mockResolvedValue({
				success: true,
				output: "Published",
				error: "",
			});

			const preDetectedReleases = [
				{
					name: "@org/pkg-c",
					version: "3.0.0",
					path: "/custom/path/to/pkg-c",
				},
			];

			await publishPackages("pnpm", "main", false, preDetectedReleases);

			// findPackagePath should not be called because path is pre-detected
			expect(findPackagePath).not.toHaveBeenCalled();
			// fs.existsSync should be called with the pre-detected path
			expect(fs.existsSync).toHaveBeenCalledWith("/custom/path/to/pkg-c/package.json");
		});

		it("returns empty when pre-detected releases is undefined", async () => {
			vi.mocked(getChangesetStatus).mockResolvedValue({
				releases: [],
				changesets: [],
			});

			const result = await publishPackages("pnpm", "main", false, undefined);

			expect(result.success).toBe(true);
			expect(result.packages).toHaveLength(0);
			expect(getChangesetStatus).toHaveBeenCalled();
		});
	});

	describe("post-publish result handling", () => {
		it("handles publish returning alreadyPublished with identical content", async () => {
			vi.mocked(getChangesetStatus).mockResolvedValue({
				releases: [{ name: "@org/pkg-a", newVersion: "1.0.0", type: "patch" }],
				changesets: [],
			});
			vi.mocked(findPackagePath).mockReturnValue("/path/to/pkg-a");
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(
				JSON.stringify({
					name: "@org/pkg-a",
					version: "1.0.0",
					publishConfig: { access: "public" },
				}),
			);
			vi.mocked(exec.exec).mockResolvedValue(0);
			// Pre-validation passes (version doesn't exist)
			vi.mocked(checkVersionExists).mockResolvedValue({
				success: true,
				versionExists: false,
			});
			// But publish returns already published with identical content (race condition)
			vi.mocked(publishToTarget).mockResolvedValue({
				success: false,
				output: "",
				error: "You cannot publish over the previously published versions",
				exitCode: 1,
				alreadyPublished: true,
				alreadyPublishedReason: "identical",
				localIntegrity: "abc123",
				remoteIntegrity: "abc123",
			});

			const result = await publishPackages("pnpm", "main", false);

			expect(result.success).toBe(true);
			expect(result.successfulTargets).toBe(1);
			expect(core.info).toHaveBeenCalledWith(expect.stringContaining("already published"));
			expect(core.info).toHaveBeenCalledWith(expect.stringContaining("identical content"));
		});

		it("handles publish returning alreadyPublished with different content as error", async () => {
			vi.mocked(getChangesetStatus).mockResolvedValue({
				releases: [{ name: "@org/pkg-a", newVersion: "1.0.0", type: "patch" }],
				changesets: [],
			});
			vi.mocked(findPackagePath).mockReturnValue("/path/to/pkg-a");
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(
				JSON.stringify({
					name: "@org/pkg-a",
					version: "1.0.0",
					publishConfig: { access: "public" },
				}),
			);
			vi.mocked(exec.exec).mockResolvedValue(0);
			// Pre-validation passes (version doesn't exist)
			vi.mocked(checkVersionExists).mockResolvedValue({
				success: true,
				versionExists: false,
			});
			// But publish returns already published with DIFFERENT content (content mismatch)
			vi.mocked(publishToTarget).mockResolvedValue({
				success: false,
				output: "",
				error: "You cannot publish over the previously published versions",
				exitCode: 1,
				alreadyPublished: true,
				alreadyPublishedReason: "different",
				localIntegrity: "abc123",
				remoteIntegrity: "xyz789",
			});

			const result = await publishPackages("pnpm", "main", false);

			expect(result.success).toBe(false);
			expect(core.error).toHaveBeenCalledWith(expect.stringContaining("DIFFERENT content"));
			expect(core.error).toHaveBeenCalledWith(expect.stringContaining("Local shasum"));
			expect(core.error).toHaveBeenCalledWith(expect.stringContaining("Remote shasum"));
		});

		it("includes GitHub attestation URL when attestation succeeds", async () => {
			vi.mocked(getChangesetStatus).mockResolvedValue({
				releases: [{ name: "@org/pkg-a", newVersion: "1.0.0", type: "patch" }],
				changesets: [],
			});
			vi.mocked(findPackagePath).mockReturnValue("/path/to/pkg-a");
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(
				JSON.stringify({
					name: "@org/pkg-a",
					version: "1.0.0",
					publishConfig: { access: "public" },
				}),
			);
			vi.mocked(exec.exec).mockResolvedValue(0);
			// Mock packAndComputeDigest to return specific tarball info
			vi.mocked(packAndComputeDigest).mockResolvedValue({
				path: "/path/to/pkg-a/org-pkg-a-1.0.0.tgz",
				digest: "sha256:abc123def456",
				filename: "org-pkg-a-1.0.0.tgz",
			});
			vi.mocked(publishToTarget).mockResolvedValue({
				success: true,
				output: "Published successfully",
				error: "",
				registryUrl: "https://www.npmjs.com/package/@org/pkg-a",
				tarballPath: "/path/to/pkg-a/org-pkg-a-1.0.0.tgz",
				tarballDigest: "sha256:abc123def456",
			});
			// Mock attestation to return a URL
			vi.mocked(createPackageAttestation).mockResolvedValue({
				success: true,
				attestationUrl: "https://github.com/attestations/12345",
			});

			const result = await publishPackages("pnpm", "main", false);

			expect(result.success).toBe(true);
			expect(result.packages[0].githubAttestationUrl).toBe("https://github.com/attestations/12345");
			// Attestation uses digest from pre-packed tarball, not from publishToTarget
			expect(createPackageAttestation).toHaveBeenCalledWith(
				expect.objectContaining({
					packageName: "@org/pkg-a",
					version: "1.0.0",
					directory: "/path/to/pkg-a",
					dryRun: false,
					packageManager: "pnpm",
					tarballDigest: "sha256:abc123def456",
				}),
			);
		});
	});
});
