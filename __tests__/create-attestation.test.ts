import * as fs from "node:fs";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { context } from "@actions/github";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createPackageAttestation,
	createReleaseAssetAttestation,
	createSBOMAttestation,
} from "../src/utils/create-attestation.js";

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
	attest: vi.fn(),
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

			// npm is used directly for tarball creation
			const result = await createPackageAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
			});

			expect(result.success).toBe(true);
			expect(exec.exec).toHaveBeenCalledWith("npm", ["pack", "--json"], expect.any(Object));
		});

		it("uses npm directly for tarball creation regardless of package manager", async () => {
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

			// npm is used directly regardless of packageManager setting
			const result = await createPackageAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
				packageManager: "pnpm",
			});

			expect(result.success).toBe(true);
			expect(exec.exec).toHaveBeenCalledWith("npm", ["pack", "--json"], expect.any(Object));
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
			// - repository: the package name in the npm registry (for "Artifact repository")
			// - github_repository: the source repo (for "Source repository")
			expect(createStorageRecord).toHaveBeenCalledWith(
				{
					name: "pkg:npm/@org/pkg@1.0.0",
					digest: "sha256:abc123def456",
					version: "1.0.0",
				},
				{
					registryUrl: "https://npm.pkg.github.com/",
					artifactUrl: "https://github.com/test-owner/test-repo/pkgs/npm/pkg",
					repository: "pkg",
					github_repository: "test-repo",
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

	describe("createSBOMAttestation", () => {
		it("returns dry-run result when dryRun is true", async () => {
			const result = await createSBOMAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: true,
			});

			expect(result.success).toBe(true);
			expect(result.attestationUrl).toBe(
				`https://github.com/${context.repo.owner}/${context.repo.repo}/attestations/dry-run-sbom`,
			);
			expect(vi.mocked(core.info)).toHaveBeenCalledWith("[DRY RUN] Would create SBOM attestation for @org/pkg@1.0.0");
		});

		it("returns error when no GITHUB_TOKEN is available", async () => {
			const result = await createSBOMAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
			});

			expect(result.success).toBe(false);
			expect(result.error).toBe("No GITHUB_TOKEN available for SBOM attestation creation");
		});

		it("returns error when SBOM generation fails with exception", async () => {
			process.env.GITHUB_TOKEN = "test-token";
			// Mock cdxgen to throw an exception
			vi.mocked(exec.exec).mockRejectedValue(new Error("cdxgen failed"));

			const result = await createSBOMAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
			});

			expect(result.success).toBe(false);
			expect(result.error).toBe("Failed to generate SBOM for @org/pkg@1.0.0");
		});

		it("returns error when cdxgen exits with non-zero code and logs stderr", async () => {
			process.env.GITHUB_TOKEN = "test-token";

			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				// Simulate cdxgen exiting with code 1 and stderr message
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from("cdxgen error: Failed to parse lockfile"));
				}
				return 1; // Non-zero exit code
			});

			vi.mocked(fs.existsSync).mockReturnValue(true); // node_modules exists

			const result = await createSBOMAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
				tarballDigest: "sha256:abc123",
			});

			expect(result.success).toBe(false);
			expect(result.error).toBe("Failed to generate SBOM for @org/pkg@1.0.0");
			expect(core.warning).toHaveBeenCalledWith(
				expect.stringContaining("cdxgen failed for /path/to/pkg: cdxgen error: Failed to parse lockfile"),
			);
		});

		it("shows exit code when cdxgen fails without stderr", async () => {
			process.env.GITHUB_TOKEN = "test-token";

			vi.mocked(exec.exec).mockImplementation(async () => {
				// Simulate cdxgen exiting with code 1 but no stderr (cdxgen writes to file, not stdout)
				return 1; // Non-zero exit code, no stderr
			});

			vi.mocked(fs.existsSync).mockReturnValue(true); // node_modules exists

			const result = await createSBOMAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
				tarballDigest: "sha256:abc123",
			});

			expect(result.success).toBe(false);
			expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("cdxgen failed for /path/to/pkg: exit code 1"));
		});

		it("includes stderr in exception handling when available", async () => {
			process.env.GITHUB_TOKEN = "test-token";

			let stderrCaptured = false;
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				// First capture stderr, then throw
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from("npm error: network failure"));
					stderrCaptured = true;
				}
				if (stderrCaptured) {
					throw new Error("Command failed");
				}
				return 0;
			});

			vi.mocked(fs.existsSync).mockReturnValue(true); // node_modules exists

			const result = await createSBOMAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
				tarballDigest: "sha256:abc123",
			});

			expect(result.success).toBe(false);
			expect(core.warning).toHaveBeenCalledWith(
				expect.stringContaining("Failed to generate SBOM for /path/to/pkg: Command failed"),
			);
			expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Stderr: npm error: network failure"));
		});

		it("generates SBOM and creates attestation successfully", async () => {
			process.env.GITHUB_TOKEN = "test-token";

			// Mock CycloneDX SBOM generation
			const mockSBOM = {
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {
					timestamp: "2024-01-01T00:00:00Z",
					component: { name: "@org/pkg", version: "1.0.0" },
				},
				components: [{ type: "library", name: "@org/pkg", version: "1.0.0" }],
			};

			vi.mocked(exec.exec).mockImplementation(async () => {
				// cdxgen writes to file, not stdout
				return 0;
			});

			// Mock tarball finding and cdxgen output file
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				if (String(path).includes(".cdxgen-sbom.json")) {
					return JSON.stringify(mockSBOM);
				}
				return Buffer.from("test content");
			});

			const { attest } = await import("@actions/attest");
			vi.mocked(attest).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				attestationID: "sbom-12345",
				tlogID: "sbom-67890",
			});

			const result = await createSBOMAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
			});

			expect(result.success).toBe(true);
			expect(result.attestationId).toBe("sbom-12345");
			expect(result.tlogId).toBe("sbom-67890");
			expect(result.attestationUrl).toBe("https://github.com/test-owner/test-repo/attestations/sbom-12345");
		});

		it("uses correct predicate type for CycloneDX SBOM", async () => {
			process.env.GITHUB_TOKEN = "test-token";

			const mockSBOM = {
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {
					timestamp: "2024-01-01T00:00:00Z",
					component: { name: "@org/pkg", version: "1.0.0" },
				},
				components: [],
			};

			vi.mocked(exec.exec).mockImplementation(async () => {
				return 0;
			});

			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				if (String(path).includes(".cdxgen-sbom.json")) {
					return JSON.stringify(mockSBOM);
				}
				return Buffer.from("test content");
			});

			const { attest } = await import("@actions/attest");
			vi.mocked(attest).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				attestationID: "12345",
			});

			await createSBOMAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
			});

			expect(attest).toHaveBeenCalledWith(
				expect.objectContaining({
					predicateType: "https://cyclonedx.org/bom",
					predicate: mockSBOM,
				}),
			);
		});

		it("uses provided tarballDigest for subject", async () => {
			process.env.GITHUB_TOKEN = "test-token";

			const mockSBOM = {
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {
					timestamp: "2024-01-01T00:00:00Z",
					component: { name: "@org/pkg", version: "1.0.0" },
				},
				components: [],
			};

			vi.mocked(exec.exec).mockImplementation(async () => {
				return 0;
			});

			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				if (String(path).includes(".cdxgen-sbom.json")) {
					return JSON.stringify(mockSBOM);
				}
				return Buffer.from("test content");
			});

			const { attest } = await import("@actions/attest");
			vi.mocked(attest).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				attestationID: "12345",
			});

			await createSBOMAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
				tarballDigest: "sha256:abc123def456",
			});

			expect(attest).toHaveBeenCalledWith(
				expect.objectContaining({
					subjects: [
						{
							name: "pkg:npm/@org/pkg@1.0.0",
							digest: { sha256: "abc123def456" },
						},
					],
				}),
			);
			// existsSync is called to check for node_modules, but when tarballDigest is provided
			// we should NOT search for tarball files (findTarball/createTarball)
			// Verify only node_modules check was made
			expect(vi.mocked(fs.existsSync)).toHaveBeenCalledWith("/path/to/pkg/node_modules");
			expect(vi.mocked(fs.readdirSync)).not.toHaveBeenCalled();
		});

		it("uses cdxgen for SBOM generation regardless of package manager", async () => {
			process.env.GITHUB_TOKEN = "test-token";

			const mockSBOM = {
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {
					timestamp: "2024-01-01T00:00:00Z",
					component: { name: "@org/pkg", version: "1.0.0" },
				},
				components: [],
			};

			vi.mocked(exec.exec).mockImplementation(async () => {
				return 0;
			});

			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				if (String(path).includes(".cdxgen-sbom.json")) {
					return JSON.stringify(mockSBOM);
				}
				return Buffer.from("test content");
			});

			const { attest } = await import("@actions/attest");
			vi.mocked(attest).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				attestationID: "12345",
			});

			await createSBOMAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
				packageManager: "pnpm",
			});

			// cdxgen is called via npx regardless of package manager (works with npm, pnpm, yarn, etc.)
			expect(exec.exec).toHaveBeenCalledWith("npx", expect.arrayContaining(["@cyclonedx/cdxgen"]), expect.any(Object));
		});

		it("handles attest errors gracefully", async () => {
			process.env.GITHUB_TOKEN = "test-token";

			const mockSBOM = {
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {
					timestamp: "2024-01-01T00:00:00Z",
					component: { name: "@org/pkg", version: "1.0.0" },
				},
				components: [],
			};

			vi.mocked(exec.exec).mockImplementation(async () => {
				return 0;
			});

			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				if (String(path).includes(".cdxgen-sbom.json")) {
					return JSON.stringify(mockSBOM);
				}
				return Buffer.from("test content");
			});

			const { attest } = await import("@actions/attest");
			vi.mocked(attest).mockRejectedValue(new Error("SBOM attestation API error"));

			const result = await createSBOMAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
			});

			expect(result.success).toBe(false);
			expect(result.error).toBe("SBOM attestation API error");
			expect(vi.mocked(core.warning)).toHaveBeenCalledWith(
				"Failed to create SBOM attestation for @org/pkg@1.0.0: SBOM attestation API error",
			);
		});

		it("installs dependencies when node_modules does not exist", async () => {
			process.env.GITHUB_TOKEN = "test-token";

			const mockSBOM = {
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {
					timestamp: "2024-01-01T00:00:00Z",
					component: { name: "@org/pkg", version: "1.0.0" },
				},
				components: [],
			};

			const execCalls: string[][] = [];
			vi.mocked(exec.exec).mockImplementation(async (_cmd, args) => {
				execCalls.push(args || []);
				return 0;
			});

			// First call for node_modules check returns false (doesn't exist)
			// After install, cdxgen output file exists
			vi.mocked(fs.existsSync).mockImplementation((path) => {
				if (String(path).includes("node_modules")) return false;
				return true; // cdxgen output and tarball exist
			});
			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				if (String(path).includes(".cdxgen-sbom.json")) {
					return JSON.stringify(mockSBOM);
				}
				return Buffer.from("test content");
			});

			const { attest } = await import("@actions/attest");
			vi.mocked(attest).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				attestationID: "12345",
			});

			await createSBOMAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
				tarballDigest: "sha256:abc123",
			});

			// Should have called npm install first
			expect(execCalls[0]).toContain("install");
			expect(execCalls[0]).toContain("--omit=dev");
			expect(execCalls[0]).toContain("--ignore-scripts");
			// Then cdxgen
			expect(execCalls[1]).toContain("@cyclonedx/cdxgen");
		});

		it("does not overwrite existing .npmignore when installing dependencies", async () => {
			process.env.GITHUB_TOKEN = "test-token";

			const mockSBOM = {
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {
					timestamp: "2024-01-01T00:00:00Z",
					component: { name: "@org/pkg", version: "1.0.0" },
				},
				components: [],
			};

			vi.mocked(exec.exec).mockImplementation(async () => {
				return 0;
			});

			// .npmignore already exists, node_modules doesn't
			vi.mocked(fs.existsSync).mockImplementation((path) => {
				if (String(path).includes(".npmignore")) return true;
				if (String(path).includes("node_modules")) return false;
				return true;
			});
			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				if (String(path).includes(".cdxgen-sbom.json")) {
					return JSON.stringify(mockSBOM);
				}
				return Buffer.from("test content");
			});

			const { attest } = await import("@actions/attest");
			vi.mocked(attest).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				attestationID: "12345",
			});

			await createSBOMAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
				tarballDigest: "sha256:abc123",
			});

			// Should NOT have written to .npmignore since it already exists
			expect(vi.mocked(fs.writeFileSync)).not.toHaveBeenCalledWith(
				expect.stringContaining(".npmignore"),
				expect.any(String),
			);
		});

		it("returns error when dependency installation fails with exception", async () => {
			process.env.GITHUB_TOKEN = "test-token";

			vi.mocked(exec.exec).mockRejectedValue(new Error("npm install failed"));

			// node_modules doesn't exist
			vi.mocked(fs.existsSync).mockReturnValue(false);

			const result = await createSBOMAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
				tarballDigest: "sha256:abc123",
			});

			expect(result.success).toBe(false);
			expect(result.error).toBe("Failed to generate SBOM for @org/pkg@1.0.0");
		});

		it("logs stdout and stderr when npm install exits with non-zero code", async () => {
			process.env.GITHUB_TOKEN = "test-token";

			vi.mocked(exec.exec).mockImplementation(async (_cmd, args, options) => {
				if (args?.includes("install")) {
					// Simulate npm install failing with output
					if (options?.listeners?.stdout) {
						options.listeners.stdout(Buffer.from("npm installing...\n"));
					}
					if (options?.listeners?.stderr) {
						options.listeners.stderr(Buffer.from("npm ERR! peer dep error\n"));
					}
					return 1; // Non-zero exit code
				}
				return 0;
			});

			// node_modules doesn't exist, so install will be attempted
			vi.mocked(fs.existsSync).mockReturnValue(false);

			const result = await createSBOMAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
				tarballDigest: "sha256:abc123",
			});

			expect(result.success).toBe(false);
			expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Failed to install dependencies"));
			expect(core.debug).toHaveBeenCalledWith(expect.stringContaining("npm install failed with exit code 1"));
			expect(core.debug).toHaveBeenCalledWith(expect.stringContaining("npm install stdout:"));
			expect(core.debug).toHaveBeenCalledWith(expect.stringContaining("npm install stderr:"));
		});

		it("returns error when cdxgen does not produce output file", async () => {
			process.env.GITHUB_TOKEN = "test-token";

			vi.mocked(exec.exec).mockImplementation(async () => {
				// cdxgen succeeds but doesn't create output file
				return 0;
			});

			// node_modules exists but cdxgen output file doesn't exist
			vi.mocked(fs.existsSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes("node_modules")) return true;
				if (pathStr.includes(".cdxgen-sbom.json")) return false;
				return true;
			});

			const result = await createSBOMAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
				tarballDigest: "sha256:abc123",
			});

			expect(result.success).toBe(false);
			expect(result.error).toBe("Failed to generate SBOM for @org/pkg@1.0.0");
		});

		it("returns error when cdxgen produces empty SBOM file", async () => {
			process.env.GITHUB_TOKEN = "test-token";

			vi.mocked(exec.exec).mockImplementation(async () => {
				// cdxgen succeeds
				return 0;
			});

			// node_modules and output file exist
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes(".cdxgen-sbom.json")) {
					return ""; // Empty SBOM content
				}
				return "{}";
			});

			const result = await createSBOMAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
				tarballDigest: "sha256:abc123",
			});

			expect(result.success).toBe(false);
			expect(result.error).toBe("Failed to generate SBOM for @org/pkg@1.0.0");
			expect(vi.mocked(core.warning)).toHaveBeenCalledWith(expect.stringContaining("cdxgen produced empty SBOM"));
		});

		it("returns error when no tarball found and cannot be created", async () => {
			process.env.GITHUB_TOKEN = "test-token";

			const mockSBOM = {
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {
					timestamp: "2024-01-01T00:00:00Z",
					component: { name: "@org/pkg", version: "1.0.0" },
				},
				components: [],
			};

			vi.mocked(exec.exec).mockImplementation(async (_cmd, args) => {
				// npm pack call - fail it
				if (args?.includes("pack")) {
					throw new Error("npm pack failed");
				}
				return 0;
			});

			// node_modules and cdxgen output exist, but no tarball
			vi.mocked(fs.existsSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes("node_modules")) return true;
				if (pathStr.includes(".cdxgen-sbom.json")) return true;
				// No tarball exists
				return false;
			});
			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				if (String(path).includes(".cdxgen-sbom.json")) {
					return JSON.stringify(mockSBOM);
				}
				return Buffer.from("test content");
			});
			vi.mocked(fs.readdirSync).mockReturnValue([]);

			const result = await createSBOMAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
			});

			expect(result.success).toBe(false);
			expect(result.error).toBe("No tarball found for SBOM attestation of @org/pkg@1.0.0");
		});

		it("logs transparency log URL when tlogID is returned", async () => {
			process.env.GITHUB_TOKEN = "test-token";

			const mockSBOM = {
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {
					timestamp: "2024-01-01T00:00:00Z",
					component: { name: "@org/pkg", version: "1.0.0" },
				},
				components: [],
			};

			vi.mocked(exec.exec).mockImplementation(async () => {
				return 0;
			});

			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				if (String(path).includes(".cdxgen-sbom.json")) {
					return JSON.stringify(mockSBOM);
				}
				return Buffer.from("test content");
			});

			const { attest } = await import("@actions/attest");
			vi.mocked(attest).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				attestationID: "12345",
				tlogID: "67890",
			});

			await createSBOMAttestation({
				packageName: "@org/pkg",
				version: "1.0.0",
				directory: "/path/to/pkg",
				dryRun: false,
			});

			expect(vi.mocked(core.info)).toHaveBeenCalledWith(
				"  Transparency log: https://search.sigstore.dev/?logIndex=67890",
			);
		});

		it("rewrites workspace dependencies to file: references when workspacePackages provided", async () => {
			process.env.GITHUB_TOKEN = "test-token";

			const mockSBOM = {
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {
					timestamp: "2024-01-01T00:00:00Z",
					component: { name: "@org/pkg-b", version: "1.0.0" },
				},
				components: [],
			};

			const originalPkgJson = JSON.stringify({
				name: "@org/pkg-b",
				version: "1.0.0",
				dependencies: {
					"@org/pkg-a": "^1.0.0",
					lodash: "^4.17.21",
				},
			});

			let packageJsonContent = "";
			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes(".cdxgen-sbom.json")) {
					return JSON.stringify(mockSBOM);
				}
				if (pathStr.endsWith("package.json")) {
					return originalPkgJson;
				}
				return Buffer.from("test content");
			});
			vi.mocked(fs.writeFileSync).mockImplementation((path, content) => {
				// Capture only the package.json write (not the backup or SBOM)
				if (String(path).endsWith("package.json") && !String(path).includes(".backup")) {
					packageJsonContent = String(content);
				}
			});
			vi.mocked(fs.existsSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes("node_modules")) return false;
				if (pathStr.includes(".npmignore")) return false;
				if (pathStr.includes(".backup")) return false;
				return true; // cdxgen output file exists
			});
			vi.mocked(fs.unlinkSync).mockImplementation(() => {});

			vi.mocked(exec.exec).mockImplementation(async () => {
				return 0;
			});

			const { attest } = await import("@actions/attest");
			vi.mocked(attest).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				attestationID: "12345",
			});

			const workspacePackages = new Map([["@org/pkg-a", { directory: "/path/to/pkg-a/dist", version: "1.0.0" }]]);

			await createSBOMAttestation({
				packageName: "@org/pkg-b",
				version: "1.0.0",
				directory: "/path/to/pkg-b",
				dryRun: false,
				tarballDigest: "sha256:abc123",
				workspacePackages,
			});

			// Should have rewritten the package.json with file: reference
			expect(packageJsonContent).toContain("file:/path/to/pkg-a/dist");
			// Should still have lodash unchanged
			expect(packageJsonContent).toContain("lodash");
		});

		it("restores package.json backup after dependency installation", async () => {
			process.env.GITHUB_TOKEN = "test-token";

			const mockSBOM = {
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {},
				components: [],
			};

			const originalPkgJson = JSON.stringify({
				name: "@org/pkg-b",
				version: "1.0.0",
				dependencies: {
					"@org/pkg-a": "^1.0.0",
				},
			});

			const writeFileCalls: Array<{ path: string; content: string }> = [];
			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes(".cdxgen-sbom.json")) {
					return JSON.stringify(mockSBOM);
				}
				if (pathStr.endsWith("package.json.backup")) {
					return originalPkgJson; // Return original content from backup
				}
				if (pathStr.endsWith("package.json")) {
					return originalPkgJson;
				}
				return Buffer.from("test content");
			});
			vi.mocked(fs.writeFileSync).mockImplementation((path, content) => {
				writeFileCalls.push({ path: String(path), content: String(content) });
			});
			vi.mocked(fs.existsSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes("node_modules")) return false;
				if (pathStr.includes(".npmignore")) return false;
				if (pathStr.includes(".backup")) return true; // Backup exists for restore
				return true; // cdxgen output file exists
			});
			vi.mocked(fs.unlinkSync).mockImplementation(() => {});

			vi.mocked(exec.exec).mockImplementation(async () => {
				return 0;
			});

			const { attest } = await import("@actions/attest");
			vi.mocked(attest).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				attestationID: "12345",
			});

			const workspacePackages = new Map([["@org/pkg-a", { directory: "/path/to/pkg-a/dist", version: "1.0.0" }]]);

			await createSBOMAttestation({
				packageName: "@org/pkg-b",
				version: "1.0.0",
				directory: "/path/to/pkg-b",
				dryRun: false,
				tarballDigest: "sha256:abc123",
				workspacePackages,
			});

			// Should have called unlinkSync to remove backup
			expect(vi.mocked(fs.unlinkSync)).toHaveBeenCalledWith(expect.stringContaining(".backup"));
		});

		it("does not rewrite dependencies when no workspace packages match", async () => {
			process.env.GITHUB_TOKEN = "test-token";

			const mockSBOM = {
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {},
				components: [],
			};

			const originalPkgJson = JSON.stringify({
				name: "@org/pkg-b",
				version: "1.0.0",
				dependencies: {
					lodash: "^4.17.21",
				},
			});

			let backupWritten = false;
			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes(".cdxgen-sbom.json")) {
					return JSON.stringify(mockSBOM);
				}
				if (pathStr.endsWith("package.json")) {
					return originalPkgJson;
				}
				return Buffer.from("test content");
			});
			vi.mocked(fs.writeFileSync).mockImplementation((path) => {
				if (String(path).includes(".backup")) {
					backupWritten = true;
				}
			});
			vi.mocked(fs.existsSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes("node_modules")) return false;
				if (pathStr.includes(".npmignore")) return false;
				return true; // cdxgen output file exists
			});

			vi.mocked(exec.exec).mockImplementation(async () => {
				return 0;
			});

			const { attest } = await import("@actions/attest");
			vi.mocked(attest).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				attestationID: "12345",
			});

			// Workspace packages don't include any dependencies of pkg-b
			const workspacePackages = new Map([["@org/pkg-c", { directory: "/path/to/pkg-c/dist", version: "1.0.0" }]]);

			await createSBOMAttestation({
				packageName: "@org/pkg-b",
				version: "1.0.0",
				directory: "/path/to/pkg-b",
				dryRun: false,
				tarballDigest: "sha256:abc123",
				workspacePackages,
			});

			// Should NOT have written backup since no deps were rewritten
			expect(backupWritten).toBe(false);
		});

		it("handles missing package.json gracefully when rewriting deps", async () => {
			process.env.GITHUB_TOKEN = "test-token";

			const mockSBOM = {
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {},
				components: [],
			};

			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes(".cdxgen-sbom.json")) {
					return JSON.stringify(mockSBOM);
				}
				return Buffer.from("test content");
			});
			vi.mocked(fs.existsSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes("node_modules")) return false;
				if (pathStr.includes(".npmignore")) return false;
				if (pathStr.endsWith("package.json")) return false; // No package.json
				return true; // cdxgen output file exists
			});

			vi.mocked(exec.exec).mockImplementation(async () => {
				return 0;
			});

			const { attest } = await import("@actions/attest");
			vi.mocked(attest).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				attestationID: "12345",
			});

			const workspacePackages = new Map([["@org/pkg-a", { directory: "/path/to/pkg-a/dist", version: "1.0.0" }]]);

			// Should not throw, should proceed without rewriting
			const result = await createSBOMAttestation({
				packageName: "@org/pkg-b",
				version: "1.0.0",
				directory: "/path/to/pkg-b",
				dryRun: false,
				tarballDigest: "sha256:abc123",
				workspacePackages,
			});

			expect(result.success).toBe(true);
		});

		it("rewrites peerDependencies and optionalDependencies for workspace packages", async () => {
			process.env.GITHUB_TOKEN = "test-token";

			const mockSBOM = {
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {},
				components: [],
			};

			const originalPkgJson = JSON.stringify({
				name: "@org/pkg-c",
				version: "1.0.0",
				dependencies: {
					"@org/pkg-a": "^1.0.0",
				},
				peerDependencies: {
					"@org/pkg-b": "^2.0.0",
				},
				optionalDependencies: {
					"@org/pkg-d": "^3.0.0",
				},
			});

			let packageJsonContent = "";
			vi.mocked(fs.readFileSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes(".cdxgen-sbom.json")) {
					return JSON.stringify(mockSBOM);
				}
				if (pathStr.endsWith("package.json")) {
					return originalPkgJson;
				}
				return Buffer.from("test content");
			});
			vi.mocked(fs.writeFileSync).mockImplementation((path, content) => {
				// Capture only the package.json write (not the backup or SBOM)
				if (String(path).endsWith("package.json") && !String(path).includes(".backup")) {
					packageJsonContent = String(content);
				}
			});
			vi.mocked(fs.existsSync).mockImplementation((path) => {
				const pathStr = String(path);
				if (pathStr.includes("node_modules")) return false;
				if (pathStr.includes(".npmignore")) return false;
				if (pathStr.includes(".backup")) return false;
				return true; // cdxgen output file exists
			});
			vi.mocked(fs.unlinkSync).mockImplementation(() => {});

			vi.mocked(exec.exec).mockImplementation(async () => {
				return 0;
			});

			const { attest } = await import("@actions/attest");
			vi.mocked(attest).mockResolvedValue({
				bundle: {} as never,
				certificate: "cert",
				attestationID: "12345",
			});

			const workspacePackages = new Map([
				["@org/pkg-a", { directory: "/path/to/pkg-a/dist", version: "1.0.0" }],
				["@org/pkg-b", { directory: "/path/to/pkg-b/dist", version: "2.0.0" }],
				["@org/pkg-d", { directory: "/path/to/pkg-d/dist", version: "3.0.0" }],
			]);

			await createSBOMAttestation({
				packageName: "@org/pkg-c",
				version: "1.0.0",
				directory: "/path/to/pkg-c",
				dryRun: false,
				tarballDigest: "sha256:abc123",
				workspacePackages,
			});

			// Should have rewritten all three dependency types
			expect(packageJsonContent).toContain("file:/path/to/pkg-a/dist");
			expect(packageJsonContent).toContain("file:/path/to/pkg-b/dist");
			expect(packageJsonContent).toContain("file:/path/to/pkg-d/dist");
		});
	});

	describe("validateSBOMGeneration", () => {
		it("returns error when package.json does not exist", async () => {
			vi.mocked(fs.existsSync).mockReturnValue(false);

			const { validateSBOMGeneration } = await import("../src/utils/create-attestation.js");
			const result = await validateSBOMGeneration("/path/to/pkg");

			expect(result.valid).toBe(false);
			expect(result.hasDependencies).toBe(false);
			expect(result.error).toContain("package.json not found");
		});

		it("returns error when package.json is invalid JSON", async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue("invalid json {");

			const { validateSBOMGeneration } = await import("../src/utils/create-attestation.js");
			const result = await validateSBOMGeneration("/path/to/pkg");

			expect(result.valid).toBe(false);
			expect(result.error).toContain("Failed to parse package.json");
		});

		it("returns warning when package has no dependencies", async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: "test-pkg" }));

			const { validateSBOMGeneration } = await import("../src/utils/create-attestation.js");
			const result = await validateSBOMGeneration("/path/to/pkg");

			expect(result.valid).toBe(true);
			expect(result.hasDependencies).toBe(false);
			expect(result.dependencyCount).toBe(0);
			expect(result.warning).toContain("no production dependencies");
		});

		it("validates successfully when package has dependencies and npm is available", async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(
				JSON.stringify({
					name: "test-pkg",
					dependencies: {
						lodash: "^4.0.0",
						express: "^4.0.0",
					},
				}),
			);
			vi.mocked(exec.exec).mockImplementation(async (_cmd, args, options) => {
				// npm --version check
				if (args?.[0] === "--version") {
					return 0;
				}
				// npm help sbom check
				if (args?.[0] === "help" && args?.[1] === "sbom") {
					if (options?.listeners?.stdout) {
						options.listeners.stdout(Buffer.from("npm sbom - generate SBOM"));
					}
					return 0;
				}
				return 0;
			});

			const { validateSBOMGeneration } = await import("../src/utils/create-attestation.js");
			const result = await validateSBOMGeneration("/path/to/pkg");

			expect(result.valid).toBe(true);
			expect(result.hasDependencies).toBe(true);
			expect(result.dependencyCount).toBe(2);
			expect(result.error).toBeUndefined();
		});

		it("returns error when npx is not available", async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(
				JSON.stringify({
					name: "test-pkg",
					dependencies: { lodash: "^4.0.0" },
				}),
			);
			vi.mocked(exec.exec).mockImplementation(async (_cmd, args) => {
				// npx --version check fails
				if (args?.[0] === "--version") {
					return 1;
				}
				return 0;
			});

			const { validateSBOMGeneration } = await import("../src/utils/create-attestation.js");
			const result = await validateSBOMGeneration("/path/to/pkg");

			expect(result.valid).toBe(false);
			expect(result.error).toContain("npx is not available");
		});
	});
});
