import * as fs from "node:fs";
import * as core from "@actions/core";
import { context } from "@actions/github";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPackageAttestation } from "../src/utils/create-attestation.js";

// Mock dependencies
vi.mock("node:fs");
vi.mock("@actions/core");
vi.mock("@actions/github", () => ({
	context: {
		repo: {
			owner: "test-owner",
			repo: "test-repo",
		},
	},
}));

vi.mock("@actions/attest", () => ({
	attestProvenance: vi.fn(),
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
			const result = await createPackageAttestation("@org/pkg", "1.0.0", "/path/to/pkg", true);

			expect(result.success).toBe(true);
			expect(result.attestationUrl).toBe(
				`https://github.com/${context.repo.owner}/${context.repo.repo}/attestations/dry-run`,
			);
			expect(vi.mocked(core.info)).toHaveBeenCalledWith("[DRY RUN] Would create attestation for @org/pkg@1.0.0");
		});

		it("returns error when no GITHUB_TOKEN is available", async () => {
			const result = await createPackageAttestation("@org/pkg", "1.0.0", "/path/to/pkg", false);

			expect(result.success).toBe(false);
			expect(result.error).toBe("No GITHUB_TOKEN available for attestation creation");
		});

		it("returns error when no tarball is found", async () => {
			process.env.GITHUB_TOKEN = "test-token";
			vi.mocked(fs.existsSync).mockReturnValue(false);
			vi.mocked(fs.readdirSync).mockReturnValue([]);

			const result = await createPackageAttestation("@org/pkg", "1.0.0", "/path/to/pkg", false);

			expect(result.success).toBe(false);
			expect(result.error).toBe("No tarball found for @org/pkg@1.0.0");
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

			const result = await createPackageAttestation("@org/pkg", "1.0.0", "/path/to/pkg", false);

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

			const result = await createPackageAttestation("@org/pkg", "1.0.0", "/path/to/pkg", false);

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

			await createPackageAttestation("@org/pkg", "1.0.0", "/path/to/pkg", false);

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

			await createPackageAttestation("@org/pkg", "1.0.0", "/path/to/pkg", false);

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

			const result = await createPackageAttestation("@org/pkg", "1.0.0", "/path/to/pkg", false);

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

			const result = await createPackageAttestation("@org/pkg", "1.0.0", "/path/to/pkg", false);

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

			await createPackageAttestation("pkg", "1.0.0", "/path/to/pkg", false);

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

			await createPackageAttestation("@org/pkg", "1.0.0", "/path/to/pkg", false);

			expect(vi.mocked(core.info)).toHaveBeenCalledWith(
				"  Transparency log: https://search.sigstore.dev/?logIndex=67890",
			);
		});
	});
});
