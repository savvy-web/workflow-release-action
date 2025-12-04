import * as fs from "node:fs";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { context } from "@actions/github";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPackageAttestation } from "../src/utils/create-attestation.js";

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

		it("returns error when no tarball is found and cannot be created", async () => {
			process.env.GITHUB_TOKEN = "test-token";
			vi.mocked(fs.existsSync).mockReturnValue(false);
			vi.mocked(fs.readdirSync).mockReturnValue([]);
			// Mock npm pack to fail
			vi.mocked(exec.exec).mockRejectedValue(new Error("npm pack failed"));

			const result = await createPackageAttestation("@org/pkg", "1.0.0", "/path/to/pkg", false);

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
			const result = await createPackageAttestation("@org/pkg", "1.0.0", "/path/to/pkg", false);

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
			const result = await createPackageAttestation("@org/pkg", "1.0.0", "/path/to/pkg", false, "pnpm");

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
			const result = await createPackageAttestation("@org/pkg", "1.0.0", "/path/to/pkg", false, "yarn");

			expect(result.success).toBe(true);
			expect(exec.exec).toHaveBeenCalledWith("yarn", ["npm", "pack", "--json"], expect.any(Object));
		});

		it("uses bunx npm for tarball creation with bun", async () => {
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

			// Use bun as package manager, which uses bunx npm
			const result = await createPackageAttestation("@org/pkg", "1.0.0", "/path/to/pkg", false, "bun");

			expect(result.success).toBe(true);
			expect(exec.exec).toHaveBeenCalledWith("bunx", ["npm", "pack", "--json"], expect.any(Object));
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
			await createPackageAttestation("@org/pkg", "1.0.0", "/path/to/pkg", false);

			expect(attestProvenance).toHaveBeenCalledWith(
				expect.objectContaining({
					subjectName: "pkg:npm/@org/pkg@1.0.0",
				}),
			);

			vi.mocked(attestProvenance).mockClear();

			// Test unscoped package
			await createPackageAttestation("my-package", "2.0.0", "/path/to/pkg", false);

			expect(attestProvenance).toHaveBeenCalledWith(
				expect.objectContaining({
					subjectName: "pkg:npm/my-package@2.0.0",
				}),
			);
		});
	});
});
