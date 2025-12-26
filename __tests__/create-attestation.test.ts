import * as fs from "node:fs";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { context } from "@actions/github";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPackageAttestation, createReleaseAssetAttestation } from "../src/utils/create-attestation.js";

// Mock dependencies
vi.mock("node:fs");
vi.mock("@actions/core");
vi.mock("@actions/exec");
vi.mock("@actions/github", () => ({
	context: {
		repo: {
			owner: "test-owner",
			repo: "test-repo",
		},
	},
	getOctokit: vi.fn(() => ({
		request: vi.fn().mockResolvedValue({ status: 200 }),
	})),
}));

vi.mock("@actions/attest", () => ({
	attestProvenance: vi.fn(),
	createStorageRecord: vi.fn(),
}));

describe("create-attestation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset environment
		delete process.env.GITHUB_TOKEN;
		vi.mocked(core.getState).mockReturnValue("");
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe("createPackageAttestation", () => {
		it("returns dry-run result when dryRun is true", async () => {
			const result = await createPackageAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: true,
			});

			expect(result.success).toBe(true);
			expect(result.attestationUrl).toBe(
				`https://github.com/${context.repo.owner}/${context.repo.repo}/attestations/dry-run`,
			);
			expect(vi.mocked(core.info)).toHaveBeenCalledWith("[DRY RUN] Would create attestation for @org/pkg@1.0.0");
		});

		it("returns error when no GITHUB_TOKEN is available", async () => {
			const result = await createPackageAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
			});

			expect(result.success).toBe(false);
			expect(result.error).toBe("No GITHUB_TOKEN available for attestation creation");
		});

		it("returns error when no tarball is found and cannot be created", async () => {
			process.env.GITHUB_TOKEN = "test-token";
			vi.mocked(fs.existsSync).mockReturnValue(false);
			vi.mocked(fs.readdirSync).mockReturnValue([]);
			// Mock npm pack to fail
			vi.mocked(exec.exec).mockRejectedValue(new Error("npm pack failed"));

			const result = await createPackageAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
			});

			expect(result.success).toBe(false);
			expect(result.error).toBe("No tarball found and could not create one for @org/pkg@1.0.0");
		});

		it("creates tarball via npm pack when not found", async () => {
			process.env.GITHUB_TOKEN = "test-token";
			let existsCallCount = 0;
			vi.mocked(fs.existsSync).mockImplementation((path) => {
				existsCallCount++;
				// First call (findTarball's expected name check) returns false
				// Second call (createTarball's check after npm pack) returns true
				if (existsCallCount <= 1) return false;
				return String(path).endsWith("org-pkg-1.0.0.tgz");
			});
			vi.mocked(fs.readdirSync).mockReturnValue([]);
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("test content"));

			// Mock npm pack to succeed with JSON output
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from(JSON.stringify([{ filename: "org-pkg-1.0.0.tgz" }])));
				}
				return 0;
			});

			const { attestProvenance } = await import("@actions/attest");
			vi.mocked(attestProvenance).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				attestationID: "12345",
				tlogID: "67890",
			});

			// Default package manager is npm, which uses npx npm
			const result = await createPackageAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
			});

			expect(result.success).toBe(true);
			expect(exec.exec).toHaveBeenCalledWith("npx", ["npm", "pack", "--json"], expect.any(Object));
		});

		it("uses specified package manager for tarball creation", async () => {
			process.env.GITHUB_TOKEN = "test-token";
			let existsCallCount = 0;
			vi.mocked(fs.existsSync).mockImplementation((path) => {
				existsCallCount++;
				if (existsCallCount <= 1) return false;
				return String(path).endsWith("org-pkg-1.0.0.tgz");
			});
			vi.mocked(fs.readdirSync).mockReturnValue([]);
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("test content"));

			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from(JSON.stringify([{ filename: "org-pkg-1.0.0.tgz" }])));
				}
				return 0;
			});

			const { attestProvenance } = await import("@actions/attest");
			vi.mocked(attestProvenance).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				attestationID: "12345",
				tlogID: "67890",
			});

			// Use pnpm as package manager, which uses pnpm dlx npm
			const result = await createPackageAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
				packageManager: "pnpm",
			});

			expect(result.success).toBe(true);
			expect(exec.exec).toHaveBeenCalledWith("pnpm", ["dlx", "npm", "pack", "--json"], expect.any(Object));
		});

		it("uses yarn npm for tarball creation with yarn", async () => {
			process.env.GITHUB_TOKEN = "test-token";
			let existsCallCount = 0;
			vi.mocked(fs.existsSync).mockImplementation((path) => {
				existsCallCount++;
				if (existsCallCount <= 1) return false;
				return String(path).endsWith("org-pkg-1.0.0.tgz");
			});
			vi.mocked(fs.readdirSync).mockReturnValue([]);
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("test content"));

			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from(JSON.stringify([{ filename: "org-pkg-1.0.0.tgz" }])));
				}
				return 0;
			});

			const { attestProvenance } = await import("@actions/attest");
			vi.mocked(attestProvenance).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				attestationID: "12345",
				tlogID: "67890",
			});

			// Use yarn as package manager, which uses yarn npm
			const result = await createPackageAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
				packageManager: "yarn",
			});

			expect(result.success).toBe(true);
			expect(exec.exec).toHaveBeenCalledWith("yarn", ["npm", "pack", "--json"], expect.any(Object));
		});

		it("uses bun x npm for tarball creation with bun", async () => {
			process.env.GITHUB_TOKEN = "test-token";
			let existsCallCount = 0;
			vi.mocked(fs.existsSync).mockImplementation((path) => {
				existsCallCount++;
				if (existsCallCount <= 1) return false;
				return String(path).endsWith("org-pkg-1.0.0.tgz");
			});
			vi.mocked(fs.readdirSync).mockReturnValue([]);
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("test content"));

			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from(JSON.stringify([{ filename: "org-pkg-1.0.0.tgz" }])));
				}
				return 0;
			});

			const { attestProvenance } = await import("@actions/attest");
			vi.mocked(attestProvenance).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				attestationID: "12345",
				tlogID: "67890",
			});

			// Use bun as package manager, which uses bun x npm
			const result = await createPackageAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
				packageManager: "bun",
			});

			expect(result.success).toBe(true);
			expect(exec.exec).toHaveBeenCalledWith("bun", ["x", "npm", "pack", "--json"], expect.any(Object));
		});

		it("finds tarball with scoped package name", async () => {
			process.env.GITHUB_TOKEN = "test-token";
			vi.mocked(fs.existsSync).mockImplementation((path) => {
				return String(path).endsWith("org-pkg-1.0.0.tgz");
			});
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("test content"));

			const { attestProvenance } = await import("@actions/attest");
			vi.mocked(attestProvenance).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				attestationID: "12345",
				tlogID: "67890",
			});

			const result = await createPackageAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
			});

			expect(result.success).toBe(true);
			expect(result.attestationUrl).toBe("https://github.com/test-owner/test-repo/attestations/12345");
			expect(result.attestationId).toBe("12345");
			expect(result.tlogId).toBe("67890");
		});

		it("finds tarball by scanning directory when expected name not found", async () => {
			process.env.GITHUB_TOKEN = "test-token";
			vi.mocked(fs.existsSync).mockReturnValue(false);
			vi.mocked(fs.readdirSync).mockReturnValue(["some-other-1.0.0.tgz"] as never);
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("test content"));

			const { attestProvenance } = await import("@actions/attest");
			vi.mocked(attestProvenance).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				attestationID: "12345",
			});

			const result = await createPackageAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
			});

			expect(result.success).toBe(true);
			expect(result.attestationUrl).toBe("https://github.com/test-owner/test-repo/attestations/12345");
		});

		it("uses GITHUB_TOKEN from environment", async () => {
			process.env.GITHUB_TOKEN = "env-token";
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("test content"));

			const { attestProvenance } = await import("@actions/attest");
			vi.mocked(attestProvenance).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				attestationID: "12345",
			});

			await createPackageAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
			});

			expect(attestProvenance).toHaveBeenCalledWith(
				expect.objectContaining({
					token: "env-token",
				}),
			);
		});

		it("falls back to githubToken from state", async () => {
			vi.mocked(core.getState).mockReturnValue("state-token");
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("test content"));

			const { attestProvenance } = await import("@actions/attest");
			vi.mocked(attestProvenance).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				attestationID: "12345",
			});

			await createPackageAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
			});

			expect(attestProvenance).toHaveBeenCalledWith(
				expect.objectContaining({
					token: "state-token",
				}),
			);
		});

		it("handles attestProvenance errors gracefully", async () => {
			process.env.GITHUB_TOKEN = "test-token";
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("test content"));

			const { attestProvenance } = await import("@actions/attest");
			vi.mocked(attestProvenance).mockRejectedValue(new Error("Attestation API error"));

			const result = await createPackageAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
			});

			expect(result.success).toBe(false);
			expect(result.error).toBe("Attestation API error");
			expect(vi.mocked(core.warning)).toHaveBeenCalledWith(
				"Failed to create attestation for @org/pkg@1.0.0: Attestation API error",
			);
		});

		it("returns undefined attestationUrl when attestationID is not returned", async () => {
			process.env.GITHUB_TOKEN = "test-token";
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("test content"));

			const { attestProvenance } = await import("@actions/attest");
			vi.mocked(attestProvenance).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				// No attestationID
			});

			const result = await createPackageAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
			});

			expect(result.success).toBe(true);
			expect(result.attestationUrl).toBeUndefined();
		});

		it("computes correct SHA256 digest for tarball", async () => {
			process.env.GITHUB_TOKEN = "test-token";
			vi.mocked(fs.existsSync).mockReturnValue(true);
			// Known content with known hash
			const content = Buffer.from("test content for hashing");
			vi.mocked(fs.readFileSync).mockReturnValue(content);

			const { attestProvenance } = await import("@actions/attest");
			vi.mocked(attestProvenance).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				attestationID: "12345",
			});

			await createPackageAttestation({
				packageName: "pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
			});

			expect(attestProvenance).toHaveBeenCalledWith(
				expect.objectContaining({
					subjectDigest: expect.objectContaining({
						sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
					}),
				}),
			);
		});

		it("logs transparency log URL when tlogID is returned", async () => {
			process.env.GITHUB_TOKEN = "test-token";
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("test content"));

			const { attestProvenance } = await import("@actions/attest");
			vi.mocked(attestProvenance).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				attestationID: "12345",
				tlogID: "67890",
			});

			await createPackageAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
			});

			expect(vi.mocked(core.info)).toHaveBeenCalledWith(
				"  Transparency log: https://search.sigstore.dev/?logIndex=67890",
			);
		});

		it("uses PURL format for subject name to link with GitHub Packages", async () => {
			process.env.GITHUB_TOKEN = "test-token";
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("test content"));

			const { attestProvenance } = await import("@actions/attest");
			vi.mocked(attestProvenance).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				attestationID: "12345",
			});

			// Test scoped package
			await createPackageAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
			});

			expect(attestProvenance).toHaveBeenCalledWith(
				expect.objectContaining({
					subjectName: "pkg:npm/@org/pkg@1.0.0",
				}),
			);

			vi.mocked(attestProvenance).mockClear();

			// Test unscoped package
			await createPackageAttestation({
				packageName: "my-package",
				version: "2.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
			});

			expect(attestProvenance).toHaveBeenCalledWith(
				expect.objectContaining({
					subjectName: "pkg:npm/my-package@2.0.0",
				}),
			);
		});

		it("handles artifact metadata API errors gracefully", async () => {
			process.env.GITHUB_TOKEN = "test-token";
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("test content"));

			const { attestProvenance, createStorageRecord } = await import("@actions/attest");
			vi.mocked(attestProvenance).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				attestationID: "12345",
			});

			// Mock createStorageRecord to throw an error
			vi.mocked(createStorageRecord).mockRejectedValue(new Error("Storage record API error"));

			// Should still succeed even if metadata linking fails
			const result = await createPackageAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
				registry: "https://npm.pkg.github.com",
			});

			expect(result.success).toBe(true);
			expect(result.attestationId).toBe("12345");
			// Should log a warning about the storage record failure
			expect(vi.mocked(core.warning)).toHaveBeenCalledWith(
				expect.stringContaining("Failed to create artifact metadata storage record"),
			);
		});

		it("uses provided tarballDigest instead of computing from local file", async () => {
			process.env.GITHUB_TOKEN = "test-token";

			const { attestProvenance } = await import("@actions/attest");
			vi.mocked(attestProvenance).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				attestationID: "12345",
			});

			// Should NOT call fs operations when tarballDigest is provided
			const result = await createPackageAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
				tarballDigest: "sha256:abc123def456",
			});

			expect(result.success).toBe(true);
			// Should use the provided digest directly
			expect(attestProvenance).toHaveBeenCalledWith(
				expect.objectContaining({
					subjectDigest: { sha256: "abc123def456" },
				}),
			);
			// fs.existsSync should not be called for finding/creating tarball
			expect(vi.mocked(fs.existsSync)).not.toHaveBeenCalled();
		});

		it("links attestation to GitHub Packages when registry is npm.pkg.github.com", async () => {
			process.env.GITHUB_TOKEN = "test-token";

			const { attestProvenance, createStorageRecord } = await import("@actions/attest");
			vi.mocked(attestProvenance).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				attestationID: "12345",
			});

			// Mock createStorageRecord to return storage record IDs
			vi.mocked(createStorageRecord).mockResolvedValue([123, 456]);

			const result = await createPackageAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
				tarballDigest: "sha256:abc123def456",
				registry: "https://npm.pkg.github.com",
			});

			expect(result.success).toBe(true);
			// Should call createStorageRecord with correct parameters
			expect(createStorageRecord).toHaveBeenCalledWith(
				{
					name: "pkg:npm/@org/pkg@1.0.0",
					digest: "sha256:abc123def456",
				},
				{
					registryUrl: "https://npm.pkg.github.com/",
				},
				"test-token",
			);
			expect(vi.mocked(core.info)).toHaveBeenCalledWith(
				"  ✓ Linked attestation to GitHub Packages artifact (storage record IDs: 123,456)",
			);
		});

		it("does not link to GitHub Packages for non-GitHub registries", async () => {
			process.env.GITHUB_TOKEN = "test-token";

			const { attestProvenance, createStorageRecord } = await import("@actions/attest");
			vi.mocked(attestProvenance).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				attestationID: "12345",
			});

			const result = await createPackageAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
				tarballDigest: "sha256:abc123def456",
				registry: "https://registry.npmjs.org",
			});

			expect(result.success).toBe(true);
			// Should NOT call createStorageRecord for non-GitHub registry
			expect(createStorageRecord).not.toHaveBeenCalled();
		});
	});

	describe("createReleaseAssetAttestation", () => {
		it("returns dry-run result when dryRun is true", async () => {
			const result = await createReleaseAssetAttestation("/path/to/asset.tgz", "@org/pkg", "1.0.0", true);

			expect(result.success).toBe(true);
			expect(result.attestationUrl).toBe(
				`https://github.com/${context.repo.owner}/${context.repo.repo}/attestations/dry-run`,
			);
			expect(vi.mocked(core.info)).toHaveBeenCalledWith(
				"[DRY RUN] Would create attestation for release asset asset.tgz",
			);
		});

		it("returns error when no GITHUB_TOKEN is available", async () => {
			const result = await createReleaseAssetAttestation("/path/to/asset.tgz", "@org/pkg", "1.0.0", false);

			expect(result.success).toBe(false);
			expect(result.error).toBe("No GITHUB_TOKEN available for attestation creation");
		});

		it("returns error when artifact is not found", async () => {
			process.env.GITHUB_TOKEN = "test-token";
			vi.mocked(fs.existsSync).mockReturnValue(false);

			const result = await createReleaseAssetAttestation("/path/to/missing.tgz", "@org/pkg", "1.0.0", false);

			expect(result.success).toBe(false);
			expect(result.error).toBe("Artifact not found: /path/to/missing.tgz");
		});

		it("creates attestation successfully with attestationID", async () => {
			process.env.GITHUB_TOKEN = "test-token";
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("test artifact content"));

			const { attestProvenance } = await import("@actions/attest");
			vi.mocked(attestProvenance).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				attestationID: "release-attest-123",
				tlogID: "tlog-456",
			});

			const result = await createReleaseAssetAttestation("/path/to/asset.tgz", "@org/pkg", "1.0.0", false);

			expect(result.success).toBe(true);
			expect(result.attestationUrl).toBe("https://github.com/test-owner/test-repo/attestations/release-attest-123");
			expect(result.attestationId).toBe("release-attest-123");
			expect(result.tlogId).toBe("tlog-456");
		});

		it("logs transparency log URL when tlogID is returned", async () => {
			process.env.GITHUB_TOKEN = "test-token";
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("test content"));

			const { attestProvenance } = await import("@actions/attest");
			vi.mocked(attestProvenance).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				attestationID: "12345",
				tlogID: "67890",
			});

			await createReleaseAssetAttestation("/path/to/asset.tgz", "@org/pkg", "1.0.0", false);

			expect(vi.mocked(core.info)).toHaveBeenCalledWith(
				"  Transparency log: https://search.sigstore.dev/?logIndex=67890",
			);
		});

		it("returns undefined attestationUrl when attestationID is not returned", async () => {
			process.env.GITHUB_TOKEN = "test-token";
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("test content"));

			const { attestProvenance } = await import("@actions/attest");
			vi.mocked(attestProvenance).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				// No attestationID
			});

			const result = await createReleaseAssetAttestation("/path/to/asset.tgz", "@org/pkg", "1.0.0", false);

			expect(result.success).toBe(true);
			expect(result.attestationUrl).toBeUndefined();
		});

		it("handles attestProvenance errors gracefully", async () => {
			process.env.GITHUB_TOKEN = "test-token";
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("test content"));

			const { attestProvenance } = await import("@actions/attest");
			vi.mocked(attestProvenance).mockRejectedValue(new Error("Release attestation API error"));

			const result = await createReleaseAssetAttestation("/path/to/asset.tgz", "@org/pkg", "1.0.0", false);

			expect(result.success).toBe(false);
			expect(result.error).toBe("Release attestation API error");
			expect(vi.mocked(core.warning)).toHaveBeenCalledWith(
				"Failed to create attestation for asset.tgz: Release attestation API error",
			);
		});

		it("uses PURL format for subject name", async () => {
			process.env.GITHUB_TOKEN = "test-token";
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("test content"));

			const { attestProvenance } = await import("@actions/attest");
			vi.mocked(attestProvenance).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				attestationID: "12345",
			});

			await createReleaseAssetAttestation("/path/to/asset.tgz", "@org/pkg", "1.0.0", false);

			expect(attestProvenance).toHaveBeenCalledWith(
				expect.objectContaining({
					subjectName: "pkg:npm/@org/pkg@1.0.0",
				}),
			);
		});

		it("falls back to githubToken from state", async () => {
			vi.mocked(core.getState).mockReturnValue("state-token");
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("test content"));

			const { attestProvenance } = await import("@actions/attest");
			vi.mocked(attestProvenance).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				attestationID: "12345",
			});

			await createReleaseAssetAttestation("/path/to/asset.tgz", "@org/pkg", "1.0.0", false);

			expect(attestProvenance).toHaveBeenCalledWith(
				expect.objectContaining({
					token: "state-token",
				}),
			);
		});
	});
});
