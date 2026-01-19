import * as fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock modules before imports
vi.mock("node:fs");
vi.mock("@actions/core", () => ({
	info: vi.fn(),
	warning: vi.fn(),
	error: vi.fn(),
	debug: vi.fn(),
	startGroup: vi.fn(),
	endGroup: vi.fn(),
	getInput: vi.fn().mockReturnValue("mock-token"),
	getState: vi.fn().mockReturnValue("mock-token"),
}));

vi.mock("@actions/exec", () => ({
	exec: vi.fn(),
}));

vi.mock("@actions/github", () => ({
	context: {
		repo: {
			owner: "test-owner",
			repo: "test-repo",
		},
	},
	getOctokit: vi.fn(),
}));

vi.mock("../src/utils/find-package-path.js", () => ({
	findPackagePath: vi.fn(),
}));

vi.mock("../src/utils/create-attestation.js", () => ({
	createReleaseAssetAttestation: vi.fn(),
}));

import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as github from "@actions/github";
import { createReleaseAssetAttestation } from "../src/utils/create-attestation.js";
import { createGitHubReleases } from "../src/utils/create-github-releases.js";
import type { TagInfo } from "../src/utils/determine-tag-strategy.js";
import { findPackagePath } from "../src/utils/find-package-path.js";
import type { PackagePublishResult } from "../src/utils/generate-publish-summary.js";

describe("create-github-releases", () => {
	const mockOctokit = {
		rest: {
			repos: {
				createRelease: vi.fn(),
				uploadReleaseAsset: vi.fn(),
				updateRelease: vi.fn(),
			},
			git: {
				createTag: vi.fn(),
				createRef: vi.fn(),
			},
		},
	};

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(github.getOctokit).mockReturnValue(mockOctokit as never);
		vi.mocked(fs.existsSync).mockReturnValue(false);
		vi.mocked(fs.readdirSync).mockReturnValue([]);
		// Default: findPackagePath returns a mock path for any package
		vi.mocked(findPackagePath).mockImplementation((name: string) => `/mock/packages/${name.replace(/^@[^/]+\//, "")}`);
		// Default: createReleaseAssetAttestation returns success result
		vi.mocked(createReleaseAssetAttestation).mockResolvedValue({ success: true, attestationUrl: undefined });
		// Default: git API calls succeed
		mockOctokit.rest.git.createTag.mockResolvedValue({ data: { sha: "tag-sha-123" } });
		mockOctokit.rest.git.createRef.mockResolvedValue({ data: {} });
		// Default: exec returns HEAD sha for rev-parse
		vi.mocked(exec.exec).mockImplementation(
			async (_cmd: string, args?: string[], options?: { listeners?: { stdout?: (data: Buffer) => void } }) => {
				if (args?.includes("rev-parse")) {
					options?.listeners?.stdout?.(Buffer.from("abc123def456\n"));
				}
				return 0;
			},
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("extractReleaseNotes via createGitHubReleases", () => {
		it("extracts release notes from CHANGELOG.md", async () => {
			const tags: TagInfo[] = [
				{
					name: "v1.0.0",
					packageName: "@org/pkg-a",
					version: "1.0.0",
				},
			];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [{ target: { registry: "https://registry.npmjs.org/" } as never, success: true }],
				},
			];

			const changelog = `# Changelog

## 1.0.0

### Features

- Added new feature
- Improved performance

## 0.9.0

- Previous version
`;

			vi.mocked(exec.exec).mockResolvedValue(0);
			vi.mocked(fs.existsSync).mockImplementation((p) => {
				if (typeof p === "string" && p.includes("CHANGELOG")) return true;
				return false;
			});
			vi.mocked(fs.readFileSync).mockReturnValue(changelog);
			mockOctokit.rest.repos.createRelease.mockResolvedValue({
				data: {
					id: 123,
					html_url: "https://github.com/test-owner/test-repo/releases/tag/v1.0.0",
				},
			});

			await createGitHubReleases(tags, publishResults, "pnpm", false);

			const createReleaseCall = mockOctokit.rest.repos.createRelease.mock.calls[0][0];
			expect(createReleaseCall.body).toContain("Added new feature");
			expect(createReleaseCall.body).toContain("Improved performance");
			expect(createReleaseCall.body).not.toContain("Previous version");
		});

		it("handles scoped package version format in CHANGELOG", async () => {
			const tags: TagInfo[] = [
				{
					name: "@org/pkg-a@2.0.0",
					packageName: "@org/pkg-a",
					version: "2.0.0",
				},
			];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "2.0.0",
					targets: [{ target: { registry: "https://registry.npmjs.org/" } as never, success: true }],
				},
			];

			const changelog = `# Changelog

## @org/pkg-a@2.0.0

### Breaking Changes

- Removed deprecated API

## 1.0.0

- Initial release
`;

			vi.mocked(exec.exec).mockResolvedValue(0);
			vi.mocked(fs.existsSync).mockImplementation((p) => {
				if (typeof p === "string" && p.includes("CHANGELOG")) return true;
				return false;
			});
			vi.mocked(fs.readFileSync).mockReturnValue(changelog);
			mockOctokit.rest.repos.createRelease.mockResolvedValue({
				data: {
					id: 123,
					html_url: "https://github.com/test-owner/test-repo/releases/tag/@org/pkg-a@2.0.0",
				},
			});

			await createGitHubReleases(tags, publishResults, "pnpm", false);

			const createReleaseCall = mockOctokit.rest.repos.createRelease.mock.calls[0][0];
			expect(createReleaseCall.body).toContain("Removed deprecated API");
			expect(createReleaseCall.body).not.toContain("Initial release");
		});

		it("uses fallback when version not found in CHANGELOG", async () => {
			const tags: TagInfo[] = [
				{
					name: "v3.0.0",
					packageName: "@org/pkg-a",
					version: "3.0.0",
				},
			];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "3.0.0",
					targets: [{ target: { registry: "https://registry.npmjs.org/" } as never, success: true }],
				},
			];

			const changelog = `# Changelog

## 1.0.0

- Initial release
`;

			vi.mocked(exec.exec).mockResolvedValue(0);
			vi.mocked(fs.existsSync).mockImplementation((p) => {
				if (typeof p === "string" && p.includes("CHANGELOG")) return true;
				return false;
			});
			vi.mocked(fs.readFileSync).mockReturnValue(changelog);
			mockOctokit.rest.repos.createRelease.mockResolvedValue({
				data: {
					id: 123,
					html_url: "https://github.com/test-owner/test-repo/releases/tag/v3.0.0",
				},
			});

			await createGitHubReleases(tags, publishResults, "pnpm", false);

			const createReleaseCall = mockOctokit.rest.repos.createRelease.mock.calls[0][0];
			expect(createReleaseCall.body).toContain("Released version 3.0.0");
		});

		it("trims empty lines from extracted notes", async () => {
			const tags: TagInfo[] = [
				{
					name: "v1.0.0",
					packageName: "@org/pkg-a",
					version: "1.0.0",
				},
			];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [{ target: { registry: "https://registry.npmjs.org/" } as never, success: true }],
				},
			];

			const changelog = `# Changelog

## 1.0.0


- Feature with leading/trailing empty lines


## 0.9.0

- Previous
`;

			vi.mocked(exec.exec).mockResolvedValue(0);
			vi.mocked(fs.existsSync).mockImplementation((p) => {
				if (typeof p === "string" && p.includes("CHANGELOG")) return true;
				return false;
			});
			vi.mocked(fs.readFileSync).mockReturnValue(changelog);
			mockOctokit.rest.repos.createRelease.mockResolvedValue({
				data: {
					id: 123,
					html_url: "https://github.com/test-owner/test-repo/releases/tag/v1.0.0",
				},
			});

			await createGitHubReleases(tags, publishResults, "pnpm", false);

			const createReleaseCall = mockOctokit.rest.repos.createRelease.mock.calls[0][0];
			// Should trim leading empty lines but preserve content
			expect(createReleaseCall.body).toContain("Feature with leading/trailing empty lines");
		});
	});

	describe("createGitHubReleases", () => {
		it("returns success with no releases when tags are empty", async () => {
			const tags: TagInfo[] = [];
			const publishResults: PackagePublishResult[] = [];

			const result = await createGitHubReleases(tags, publishResults, "pnpm", false);

			expect(result.success).toBe(true);
			expect(result.releases).toHaveLength(0);
			expect(result.createdTags).toHaveLength(0);
		});

		it("skips releases when no matching packages found", async () => {
			const tags: TagInfo[] = [
				{
					name: "v1.0.0",
					packageName: "@org/pkg-missing",
					version: "1.0.0",
				},
			];
			const publishResults: PackagePublishResult[] = [];

			const result = await createGitHubReleases(tags, publishResults, "pnpm", false);

			expect(core.warning).toHaveBeenCalledWith("No packages found for tag v1.0.0");
			expect(result.releases).toHaveLength(0);
		});

		it("creates tags and releases in dry run mode without calling APIs", async () => {
			const tags: TagInfo[] = [
				{
					name: "v1.0.0",
					packageName: "@org/pkg-a",
					version: "1.0.0",
				},
			];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [
						{
							target: {
								protocol: "npm",
								registry: "https://registry.npmjs.org/",
								directory: "/path/to/pkg-a",
								access: "public",
								provenance: true,
								tag: "latest",
								tokenEnv: "NPM_TOKEN",
							},
							success: true,
							registryUrl: "https://www.npmjs.com/package/@org/pkg-a",
						},
					],
				},
			];

			vi.mocked(exec.exec).mockResolvedValue(0);

			const result = await createGitHubReleases(tags, publishResults, "pnpm", true);

			expect(result.success).toBe(true);
			expect(result.createdTags).toContain("v1.0.0");
			expect(result.releases).toHaveLength(1);
			expect(result.releases[0].url).toContain("v1.0.0");
			expect(core.info).toHaveBeenCalledWith("[DRY RUN] Would create tag: v1.0.0");
			expect(core.info).toHaveBeenCalledWith("[DRY RUN] Would create GitHub release for v1.0.0");
			// Should not call actual API
			expect(mockOctokit.rest.repos.createRelease).not.toHaveBeenCalled();
		});

		it("creates git tag and GitHub release", async () => {
			const tags: TagInfo[] = [
				{
					name: "v2.0.0",
					packageName: "@org/pkg-a",
					version: "2.0.0",
				},
			];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "2.0.0",
					targets: [
						{
							target: {
								protocol: "npm",
								registry: "https://registry.npmjs.org/",
								directory: "/path/to/pkg-a",
								access: "public",
								provenance: true,
								tag: "latest",
								tokenEnv: "NPM_TOKEN",
							},
							success: true,
							registryUrl: "https://www.npmjs.com/package/@org/pkg-a",
						},
					],
				},
			];

			mockOctokit.rest.repos.createRelease.mockResolvedValue({
				data: {
					id: 123,
					html_url: "https://github.com/test-owner/test-repo/releases/tag/v2.0.0",
				},
			});

			const result = await createGitHubReleases(tags, publishResults, "pnpm", false);

			expect(result.success).toBe(true);
			expect(result.createdTags).toContain("v2.0.0");
			expect(result.releases[0].id).toBe(123);
			expect(result.releases[0].url).toBe("https://github.com/test-owner/test-repo/releases/tag/v2.0.0");

			// Verify git API was called to create signed tag
			expect(mockOctokit.rest.git.createTag).toHaveBeenCalledWith({
				owner: "test-owner",
				repo: "test-repo",
				tag: "v2.0.0",
				message: "Release v2.0.0",
				object: "abc123def456",
				type: "commit",
			});
			expect(mockOctokit.rest.git.createRef).toHaveBeenCalledWith({
				owner: "test-owner",
				repo: "test-repo",
				ref: "refs/tags/v2.0.0",
				sha: "tag-sha-123",
			});
		});

		it("handles git tag creation failure", async () => {
			const tags: TagInfo[] = [
				{
					name: "v1.0.0",
					packageName: "@org/pkg-a",
					version: "1.0.0",
				},
			];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [{ target: {} as never, success: true }],
				},
			];

			// Fail the git API tag creation
			mockOctokit.rest.git.createTag.mockRejectedValue(new Error("API tag creation failed"));

			const result = await createGitHubReleases(tags, publishResults, "pnpm", false);

			expect(result.success).toBe(false);
			expect(result.errors).toContain("Failed to create tag v1.0.0");
		});

		it("handles GitHub release creation failure", async () => {
			const tags: TagInfo[] = [
				{
					name: "v1.0.0",
					packageName: "@org/pkg-a",
					version: "1.0.0",
				},
			];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [{ target: {} as never, success: true }],
				},
			];

			vi.mocked(exec.exec).mockResolvedValue(0);
			mockOctokit.rest.repos.createRelease.mockRejectedValue(new Error("API error"));

			const result = await createGitHubReleases(tags, publishResults, "pnpm", false);

			expect(result.success).toBe(false);
			expect(result.errors[0]).toContain("Failed to create release for v1.0.0");
		});

		it("includes registry URLs in release notes", async () => {
			const tags: TagInfo[] = [
				{
					name: "v1.0.0",
					packageName: "@org/pkg-a",
					version: "1.0.0",
				},
			];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [
						{
							target: {
								protocol: "npm",
								registry: "https://registry.npmjs.org/",
								directory: "/path/to/pkg-a",
								access: "public",
								provenance: true,
								tag: "latest",
								tokenEnv: "NPM_TOKEN",
							},
							success: true,
							registryUrl: "https://www.npmjs.com/package/@org/pkg-a",
							attestationUrl: "https://sigstore.dev/attestation/123",
						},
					],
				},
			];

			vi.mocked(exec.exec).mockResolvedValue(0);
			mockOctokit.rest.repos.createRelease.mockResolvedValue({
				data: {
					id: 123,
					html_url: "https://github.com/test-owner/test-repo/releases/tag/v1.0.0",
				},
			});

			await createGitHubReleases(tags, publishResults, "pnpm", false);

			const createReleaseCall = mockOctokit.rest.repos.createRelease.mock.calls[0][0];
			expect(createReleaseCall.body).toContain("Publish Summary");
			expect(createReleaseCall.body).toContain("| npm |");
			expect(createReleaseCall.body).toContain("https://www.npmjs.com/package/@org/pkg-a/v/1.0.0");
			expect(createReleaseCall.body).toContain("[Sigstore]");
		});

		it("includes all attestation URLs in release notes", async () => {
			const tags: TagInfo[] = [
				{
					name: "v1.0.0",
					packageName: "@org/pkg-a",
					version: "1.0.0",
				},
			];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [
						{
							target: {
								protocol: "npm",
								registry: "https://registry.npmjs.org/",
								directory: "/path/to/pkg-a",
								access: "public",
								provenance: true,
								tag: "latest",
								tokenEnv: "NPM_TOKEN",
							},
							success: true,
							registryUrl: "https://www.npmjs.com/package/@org/pkg-a",
							sbomAttestationUrl: "https://github.com/test-owner/test-repo/attestations/sbom-456",
						},
					],
					githubAttestationUrl: "https://github.com/test-owner/test-repo/attestations/12345",
				},
			];

			vi.mocked(exec.exec).mockResolvedValue(0);
			mockOctokit.rest.repos.createRelease.mockResolvedValue({
				data: {
					id: 123,
					html_url: "https://github.com/test-owner/test-repo/releases/tag/v1.0.0",
				},
			});

			await createGitHubReleases(tags, publishResults, "pnpm", false);

			const createReleaseCall = mockOctokit.rest.repos.createRelease.mock.calls[0][0];
			expect(createReleaseCall.body).toContain("Publish Summary");
			// Check for GitHub attestation link
			expect(createReleaseCall.body).toContain("[GitHub]");
			expect(createReleaseCall.body).toContain("https://github.com/test-owner/test-repo/attestations/12345");
			// Check for SBOM attestation link
			expect(createReleaseCall.body).toContain("[SBOM]");
			expect(createReleaseCall.body).toContain("https://github.com/test-owner/test-repo/attestations/sbom-456");
		});

		it("marks prerelease for versions with hyphen", async () => {
			const tags: TagInfo[] = [
				{
					name: "v1.0.0-beta.1",
					packageName: "@org/pkg-a",
					version: "1.0.0-beta.1",
				},
			];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0-beta.1",
					targets: [{ target: {} as never, success: true }],
				},
			];

			vi.mocked(exec.exec).mockResolvedValue(0);
			mockOctokit.rest.repos.createRelease.mockResolvedValue({
				data: {
					id: 123,
					html_url: "https://github.com/test-owner/test-repo/releases/tag/v1.0.0-beta.1",
				},
			});

			await createGitHubReleases(tags, publishResults, "pnpm", false);

			const createReleaseCall = mockOctokit.rest.repos.createRelease.mock.calls[0][0];
			expect(createReleaseCall.prerelease).toBe(true);
		});

		it("handles fixed versioning with multiple packages", async () => {
			const tags: TagInfo[] = [
				{
					name: "v1.0.0",
					packageName: "@org/pkg-a, @org/pkg-b",
					version: "1.0.0",
				},
			];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [{ target: { registry: "https://registry.npmjs.org/" } as never, success: true }],
				},
				{
					name: "@org/pkg-b",
					version: "1.0.0",
					targets: [{ target: { registry: "https://registry.npmjs.org/" } as never, success: true }],
				},
			];

			vi.mocked(exec.exec).mockResolvedValue(0);
			mockOctokit.rest.repos.createRelease.mockResolvedValue({
				data: {
					id: 123,
					html_url: "https://github.com/test-owner/test-repo/releases/tag/v1.0.0",
				},
			});

			const result = await createGitHubReleases(tags, publishResults, "pnpm", false);

			expect(result.success).toBe(true);
			const createReleaseCall = mockOctokit.rest.repos.createRelease.mock.calls[0][0];
			expect(createReleaseCall.body).toContain("@org/pkg-a");
			expect(createReleaseCall.body).toContain("@org/pkg-b");
		});

		it("uploads artifacts when found", async () => {
			const tags: TagInfo[] = [
				{
					name: "v1.0.0",
					packageName: "@org/pkg-a",
					version: "1.0.0",
				},
			];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [{ target: {} as never, success: true }],
				},
			];

			vi.mocked(exec.exec).mockImplementation(async (_cmd, args, options) => {
				if (args?.includes("pack")) {
					const jsonOutput = JSON.stringify([
						{ filename: "org-pkg-a-1.0.0.tgz", name: "@org/pkg-a", version: "1.0.0" },
					]);
					options?.listeners?.stdout?.(Buffer.from(jsonOutput));
				}
				return 0;
			});

			vi.mocked(fs.existsSync).mockImplementation((p) => {
				if (typeof p === "string" && p.includes("packages")) return false;
				if (typeof p === "string" && p.includes("CHANGELOG")) return false;
				return true;
			});
			vi.mocked(fs.readdirSync).mockReturnValue(["org-pkg-a-1.0.0.tgz"] as never);
			vi.mocked(fs.readFileSync).mockImplementation((p) => {
				if (typeof p === "string" && p.endsWith(".tgz")) {
					return Buffer.from("mock tarball content");
				}
				return Buffer.from("mock tarball content");
			});

			mockOctokit.rest.repos.createRelease.mockResolvedValue({
				data: {
					id: 123,
					html_url: "https://github.com/test-owner/test-repo/releases/tag/v1.0.0",
				},
			});
			mockOctokit.rest.repos.uploadReleaseAsset.mockResolvedValue({
				data: {
					name: "org-pkg-a-1.0.0.tgz",
					browser_download_url: "https://github.com/test-owner/test-repo/releases/download/v1.0.0/org-pkg-a-1.0.0.tgz",
					size: 1234,
				},
			});

			const result = await createGitHubReleases(tags, publishResults, "pnpm", false);

			expect(result.releases[0].assets).toHaveLength(1);
			expect(result.releases[0].assets[0].name).toBe("org-pkg-a-1.0.0.tgz");
		});

		it("creates tarball via npm pack when none exists", async () => {
			const tags: TagInfo[] = [
				{
					name: "v1.0.0",
					packageName: "@org/pkg-a",
					version: "1.0.0",
				},
			];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [{ target: {} as never, success: true }],
				},
			];

			let packCalled = false;
			vi.mocked(exec.exec).mockImplementation(async (_cmd, args, options) => {
				// Default package manager is pnpm, so check for dlx npm pack --json
				if (args?.includes("pack")) {
					packCalled = true;
					// npm pack --json returns array of results
					const jsonOutput = JSON.stringify([
						{ filename: "org-pkg-a-1.0.0.tgz", name: "@org/pkg-a", version: "1.0.0" },
					]);
					options?.listeners?.stdout?.(Buffer.from(jsonOutput));
				}
				return 0;
			});

			vi.mocked(fs.existsSync).mockImplementation((p) => {
				if (typeof p === "string" && p.includes("CHANGELOG")) return false;
				if (typeof p === "string" && p.includes("packages")) return false;
				return true;
			});
			// Return empty array first (no .tgz files), simulating npm pack creating one
			vi.mocked(fs.readdirSync).mockReturnValue([]);
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("tarball content"));

			mockOctokit.rest.repos.createRelease.mockResolvedValue({
				data: {
					id: 123,
					html_url: "https://github.com/test-owner/test-repo/releases/tag/v1.0.0",
				},
			});
			mockOctokit.rest.repos.uploadReleaseAsset.mockResolvedValue({
				data: {
					name: "org-pkg-a-1.0.0.tgz",
					browser_download_url: "https://github.com/test-owner/test-repo/releases/download/v1.0.0/org-pkg-a-1.0.0.tgz",
					size: 1234,
				},
			});

			const result = await createGitHubReleases(tags, publishResults, "pnpm", false);

			expect(packCalled).toBe(true);
			expect(result.releases[0].assets).toHaveLength(1);
		});

		it("handles npm pack failure gracefully", async () => {
			const tags: TagInfo[] = [
				{
					name: "v1.0.0",
					packageName: "@org/pkg-a",
					version: "1.0.0",
				},
			];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [{ target: {} as never, success: true }],
				},
			];

			vi.mocked(exec.exec).mockImplementation(async (_cmd, args) => {
				if (args?.includes("pack")) {
					throw new Error("pack failed");
				}
				return 0;
			});

			vi.mocked(fs.existsSync).mockImplementation((p) => {
				if (typeof p === "string" && p.includes("CHANGELOG")) return false;
				if (typeof p === "string" && p.includes("packages")) return false;
				return true;
			});
			vi.mocked(fs.readdirSync).mockReturnValue([]);

			mockOctokit.rest.repos.createRelease.mockResolvedValue({
				data: {
					id: 123,
					html_url: "https://github.com/test-owner/test-repo/releases/tag/v1.0.0",
				},
			});

			const result = await createGitHubReleases(tags, publishResults, "pnpm", false);

			// Should still create release even if npm pack fails
			expect(result.success).toBe(true);
			expect(result.releases[0].assets).toHaveLength(0);
			expect(core.debug).toHaveBeenCalledWith(expect.stringContaining("Failed to create package tarball"));
		});

		it("uses pnpm dlx npm pack when package manager is pnpm", async () => {
			vi.mocked(core.getState).mockImplementation((key: string) => {
				if (key === "packageManager") return "pnpm";
				return "mock-token";
			});

			const tags: TagInfo[] = [
				{
					name: "v1.0.0",
					packageName: "@org/pkg-a",
					version: "1.0.0",
				},
			];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [{ target: {} as never, success: true }],
				},
			];

			let packCmd = "";
			let packArgs: string[] = [];
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options) => {
				if (args?.includes("pack")) {
					packCmd = cmd;
					packArgs = args || [];
					const jsonOutput = JSON.stringify([
						{ filename: "org-pkg-a-1.0.0.tgz", name: "@org/pkg-a", version: "1.0.0" },
					]);
					options?.listeners?.stdout?.(Buffer.from(jsonOutput));
				}
				return 0;
			});

			vi.mocked(fs.existsSync).mockImplementation((p) => {
				if (typeof p === "string" && p.includes("CHANGELOG")) return false;
				return true;
			});
			vi.mocked(fs.readdirSync).mockReturnValue([]);
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("tarball content"));

			mockOctokit.rest.repos.createRelease.mockResolvedValue({
				data: {
					id: 123,
					html_url: "https://github.com/test-owner/test-repo/releases/tag/v1.0.0",
				},
			});
			mockOctokit.rest.repos.uploadReleaseAsset.mockResolvedValue({
				data: {
					name: "org-pkg-a-1.0.0.tgz",
					browser_download_url: "https://example.com/asset.tgz",
					size: 1234,
				},
			});

			await createGitHubReleases(tags, publishResults, "pnpm", false);

			expect(packCmd).toBe("pnpm");
			expect(packArgs).toEqual(["dlx", "npm", "pack", "--json"]);
		});

		it("uses yarn dlx npm pack when package manager is yarn", async () => {
			vi.mocked(core.getState).mockImplementation((key: string) => {
				if (key === "packageManager") return "yarn";
				return "mock-token";
			});

			const tags: TagInfo[] = [
				{
					name: "v1.0.0",
					packageName: "@org/pkg-a",
					version: "1.0.0",
				},
			];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [{ target: {} as never, success: true }],
				},
			];

			let packCmd = "";
			let packArgs: string[] = [];
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options) => {
				if (args?.includes("pack")) {
					packCmd = cmd;
					packArgs = args || [];
					const jsonOutput = JSON.stringify([
						{ filename: "org-pkg-a-1.0.0.tgz", name: "@org/pkg-a", version: "1.0.0" },
					]);
					options?.listeners?.stdout?.(Buffer.from(jsonOutput));
				}
				return 0;
			});

			vi.mocked(fs.existsSync).mockImplementation((p) => {
				if (typeof p === "string" && p.includes("CHANGELOG")) return false;
				return true;
			});
			vi.mocked(fs.readdirSync).mockReturnValue([]);
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("tarball content"));

			mockOctokit.rest.repos.createRelease.mockResolvedValue({
				data: {
					id: 123,
					html_url: "https://github.com/test-owner/test-repo/releases/tag/v1.0.0",
				},
			});
			mockOctokit.rest.repos.uploadReleaseAsset.mockResolvedValue({
				data: {
					name: "org-pkg-a-1.0.0.tgz",
					browser_download_url: "https://example.com/asset.tgz",
					size: 1234,
				},
			});

			await createGitHubReleases(tags, publishResults, "yarn", false);

			expect(packCmd).toBe("yarn");
			expect(packArgs).toEqual(["dlx", "npm", "pack", "--json"]);
		});

		it("uses bun x npm pack when package manager is bun", async () => {
			vi.mocked(core.getState).mockImplementation((key: string) => {
				if (key === "packageManager") return "bun";
				return "mock-token";
			});

			const tags: TagInfo[] = [
				{
					name: "v1.0.0",
					packageName: "@org/pkg-a",
					version: "1.0.0",
				},
			];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [{ target: {} as never, success: true }],
				},
			];

			let packCmd = "";
			let packArgs: string[] = [];
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options) => {
				if (args?.includes("pack") || args?.includes("npm")) {
					packCmd = cmd;
					packArgs = args || [];
					const jsonOutput = JSON.stringify([
						{ filename: "org-pkg-a-1.0.0.tgz", name: "@org/pkg-a", version: "1.0.0" },
					]);
					options?.listeners?.stdout?.(Buffer.from(jsonOutput));
				}
				return 0;
			});

			vi.mocked(fs.existsSync).mockImplementation((p) => {
				if (typeof p === "string" && p.includes("CHANGELOG")) return false;
				return true;
			});
			vi.mocked(fs.readdirSync).mockReturnValue([]);
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("tarball content"));

			mockOctokit.rest.repos.createRelease.mockResolvedValue({
				data: {
					id: 123,
					html_url: "https://github.com/test-owner/test-repo/releases/tag/v1.0.0",
				},
			});
			mockOctokit.rest.repos.uploadReleaseAsset.mockResolvedValue({
				data: {
					name: "org-pkg-a-1.0.0.tgz",
					browser_download_url: "https://example.com/asset.tgz",
					size: 1234,
				},
			});

			await createGitHubReleases(tags, publishResults, "bun", false);

			expect(packCmd).toBe("bun");
			expect(packArgs).toEqual(["x", "npm", "pack", "--json"]);
		});

		it("uses npx npm pack when package manager is npm", async () => {
			vi.mocked(core.getState).mockImplementation((key: string) => {
				if (key === "packageManager") return "npm";
				return "mock-token";
			});

			const tags: TagInfo[] = [
				{
					name: "v1.0.0",
					packageName: "@org/pkg-a",
					version: "1.0.0",
				},
			];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [{ target: {} as never, success: true }],
				},
			];

			let packCmd = "";
			let packArgs: string[] = [];
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options) => {
				if (args?.includes("pack")) {
					packCmd = cmd;
					packArgs = args || [];
					const jsonOutput = JSON.stringify([
						{ filename: "org-pkg-a-1.0.0.tgz", name: "@org/pkg-a", version: "1.0.0" },
					]);
					options?.listeners?.stdout?.(Buffer.from(jsonOutput));
				}
				return 0;
			});

			vi.mocked(fs.existsSync).mockImplementation((p) => {
				if (typeof p === "string" && p.includes("CHANGELOG")) return false;
				return true;
			});
			vi.mocked(fs.readdirSync).mockReturnValue([]);
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("tarball content"));

			mockOctokit.rest.repos.createRelease.mockResolvedValue({
				data: {
					id: 123,
					html_url: "https://github.com/test-owner/test-repo/releases/tag/v1.0.0",
				},
			});
			mockOctokit.rest.repos.uploadReleaseAsset.mockResolvedValue({
				data: {
					name: "org-pkg-a-1.0.0.tgz",
					browser_download_url: "https://example.com/asset.tgz",
					size: 1234,
				},
			});

			await createGitHubReleases(tags, publishResults, "npm", false);

			expect(packCmd).toBe("npx");
			expect(packArgs).toEqual(["npm", "pack", "--json"]);
		});

		it("handles asset upload failure gracefully", async () => {
			const tags: TagInfo[] = [
				{
					name: "v1.0.0",
					packageName: "@org/pkg-a",
					version: "1.0.0",
				},
			];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [{ target: {} as never, success: true }],
				},
			];

			vi.mocked(exec.exec).mockResolvedValue(0);
			vi.mocked(fs.existsSync).mockImplementation((p) => {
				if (typeof p === "string" && p.includes("CHANGELOG")) return false;
				return true;
			});
			vi.mocked(fs.readdirSync).mockReturnValue(["pkg.tgz"] as never);
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("content"));

			mockOctokit.rest.repos.createRelease.mockResolvedValue({
				data: {
					id: 123,
					html_url: "https://github.com/test-owner/test-repo/releases/tag/v1.0.0",
				},
			});
			mockOctokit.rest.repos.uploadReleaseAsset.mockRejectedValue(new Error("Upload failed"));

			const result = await createGitHubReleases(tags, publishResults, "pnpm", false);

			// Release should still succeed even if asset upload fails
			expect(result.success).toBe(true);
			expect(core.warning).toHaveBeenCalled();
		});

		it("skips artifact upload when package path not found", async () => {
			const tags: TagInfo[] = [
				{
					name: "v1.0.0",
					packageName: "@org/pkg-a",
					version: "1.0.0",
				},
			];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [{ target: { registry: "https://registry.npmjs.org/" } as never, success: true }],
				},
			];

			// Mock findPackagePath to return null (package not found)
			vi.mocked(findPackagePath).mockReturnValue(null);

			vi.mocked(exec.exec).mockResolvedValue(0);
			vi.mocked(fs.existsSync).mockImplementation((p) => {
				if (typeof p === "string" && p.includes("CHANGELOG")) return false;
				return false;
			});

			mockOctokit.rest.repos.createRelease.mockResolvedValue({
				data: {
					id: 123,
					html_url: "https://github.com/test-owner/test-repo/releases/tag/v1.0.0",
				},
			});

			const result = await createGitHubReleases(tags, publishResults, "pnpm", false);

			// Release should still succeed, but with no assets
			expect(result.success).toBe(true);
			expect(result.releases[0].assets).toHaveLength(0);
			expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Could not find path for package @org/pkg-a"));
		});

		it("throws error when no token is available from state", async () => {
			// Override getState to return empty string for token
			vi.mocked(core.getState).mockImplementation((key: string) => {
				if (key === "token") return "";
				return "mock-value";
			});

			const tags: TagInfo[] = [
				{
					name: "v1.0.0",
					packageName: "@org/pkg-a",
					version: "1.0.0",
				},
			];
			const publishResults: PackagePublishResult[] = [];

			await expect(createGitHubReleases(tags, publishResults, "pnpm", false)).rejects.toThrow(
				"No token available from state - ensure pre.ts ran successfully",
			);
		});

		it("logs attestation URL when asset attestation succeeds", async () => {
			// Reset getState mock to return token
			vi.mocked(core.getState).mockReturnValue("mock-token");

			const tags: TagInfo[] = [
				{
					name: "v1.0.0",
					packageName: "@org/pkg-a",
					version: "1.0.0",
				},
			];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [{ target: {} as never, success: true }],
				},
			];

			vi.mocked(exec.exec).mockResolvedValue(0);
			vi.mocked(fs.existsSync).mockImplementation((p) => {
				if (typeof p === "string" && p.includes("CHANGELOG")) return false;
				return true;
			});
			vi.mocked(fs.readdirSync).mockReturnValue(["pkg.tgz"] as never);
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("content"));

			mockOctokit.rest.repos.createRelease.mockResolvedValue({
				data: {
					id: 123,
					html_url: "https://github.com/test-owner/test-repo/releases/tag/v1.0.0",
				},
			});
			mockOctokit.rest.repos.uploadReleaseAsset.mockResolvedValue({
				data: {
					name: "pkg.tgz",
					browser_download_url: "https://example.com/pkg.tgz",
					size: 1234,
				},
			});
			mockOctokit.rest.repos.updateRelease.mockResolvedValue({ data: {} });

			// Mock attestation to return success with URL
			vi.mocked(createReleaseAssetAttestation).mockResolvedValue({
				success: true,
				attestationUrl: "https://github.com/test-owner/test-repo/attestations/asset-123",
			});

			await createGitHubReleases(tags, publishResults, "pnpm", false);

			expect(core.info).toHaveBeenCalledWith(
				"  ✓ Created attestation: https://github.com/test-owner/test-repo/attestations/asset-123",
			);
		});

		it("handles attestation failure gracefully", async () => {
			// Reset getState mock to return token
			vi.mocked(core.getState).mockReturnValue("mock-token");

			const tags: TagInfo[] = [
				{
					name: "v1.0.0",
					packageName: "@org/pkg-a",
					version: "1.0.0",
				},
			];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [
						{
							target: {
								protocol: "npm",
								registry: "https://registry.npmjs.org/",
								directory: "/path/to/pkg-a",
								access: "public",
								provenance: true,
								tag: "latest",
								tokenEnv: "NPM_TOKEN",
							},
							success: true,
							tarballPath: "/path/to/pkg-a/pkg-a-1.0.0.tgz",
						},
					],
				},
			];

			vi.mocked(exec.exec).mockResolvedValue(0);
			vi.mocked(fs.existsSync).mockImplementation((p) => {
				if (typeof p === "string" && p.includes("CHANGELOG")) return false;
				return true;
			});
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("content"));

			mockOctokit.rest.repos.createRelease.mockResolvedValue({
				data: {
					id: 123,
					html_url: "https://github.com/test-owner/test-repo/releases/tag/v1.0.0",
				},
			});
			mockOctokit.rest.repos.uploadReleaseAsset.mockResolvedValue({
				data: {
					name: "pkg-a-1.0.0.tgz",
					browser_download_url: "https://example.com/pkg-a-1.0.0.tgz",
					size: 1234,
				},
			});

			// Mock attestation to fail
			vi.mocked(createReleaseAssetAttestation).mockResolvedValue({
				success: false,
			});

			const result = await createGitHubReleases(tags, publishResults, "pnpm", false);

			// Release should still succeed even if attestation fails
			expect(result.success).toBe(true);
			// The attestation log message should NOT be called
			expect(core.info).not.toHaveBeenCalledWith(expect.stringContaining("Created attestation"));
		});

		it("updates release notes with SBOM links", async () => {
			// Reset getState mock to return token
			vi.mocked(core.getState).mockReturnValue("mock-token");

			const tags: TagInfo[] = [
				{
					name: "v1.0.0",
					packageName: "@org/pkg-a",
					version: "1.0.0",
				},
			];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [
						{
							target: {
								protocol: "npm",
								registry: "https://registry.npmjs.org/",
								directory: "/path/to/pkg-a",
								access: "public",
								provenance: true,
								tag: "latest",
								tokenEnv: "NPM_TOKEN",
							},
							success: true,
							tarballPath: "/path/to/pkg-a/pkg-a-1.0.0.tgz",
							sbomPath: "/path/to/pkg-a/pkg-a-1.0.0-npm.sbom.json",
						},
					],
				},
			];

			vi.mocked(exec.exec).mockResolvedValue(0);
			vi.mocked(fs.existsSync).mockImplementation((p) => {
				if (typeof p === "string" && p.includes("CHANGELOG")) return false;
				if (typeof p === "string" && p.includes(".api.json")) return false; // No API doc in this test
				return true;
			});
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("content"));

			let uploadCallCount = 0;
			mockOctokit.rest.repos.createRelease.mockResolvedValue({
				data: {
					id: 123,
					html_url: "https://github.com/test-owner/test-repo/releases/tag/v1.0.0",
				},
			});
			mockOctokit.rest.repos.uploadReleaseAsset.mockImplementation(async () => {
				uploadCallCount++;
				if (uploadCallCount === 1) {
					// First call is tarball
					return {
						data: {
							name: "pkg-a-1.0.0.tgz",
							browser_download_url: "https://example.com/pkg-a-1.0.0.tgz",
							size: 1234,
						},
					};
				}
				// Second call is SBOM
				return {
					data: {
						name: "pkg-a-1.0.0-npm.sbom.json",
						browser_download_url: "https://example.com/pkg-a-1.0.0-npm.sbom.json",
						size: 500,
					},
				};
			});
			mockOctokit.rest.repos.updateRelease.mockResolvedValue({ data: {} });

			vi.mocked(createReleaseAssetAttestation).mockResolvedValue({
				success: true,
				attestationUrl: "https://github.com/test-owner/test-repo/attestations/asset-123",
			});

			await createGitHubReleases(tags, publishResults, "pnpm", false);

			// Verify SBOM was uploaded (tarball + SBOM = 2 uploads)
			expect(mockOctokit.rest.repos.uploadReleaseAsset).toHaveBeenCalledTimes(2);
			expect(core.info).toHaveBeenCalledWith("Uploading SBOM: pkg-a-1.0.0-npm.sbom.json");

			// Verify updateRelease was called to update SBOM links
			expect(mockOctokit.rest.repos.updateRelease).toHaveBeenCalledWith(
				expect.objectContaining({
					owner: "test-owner",
					repo: "test-repo",
					release_id: 123,
				}),
			);
			expect(core.info).toHaveBeenCalledWith("Updated release notes with asset links");
		});

		it("handles SBOM upload failure gracefully", async () => {
			// Reset getState mock to return token
			vi.mocked(core.getState).mockReturnValue("mock-token");

			const tags: TagInfo[] = [
				{
					name: "v1.0.0",
					packageName: "@org/pkg-a",
					version: "1.0.0",
				},
			];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [
						{
							target: {
								protocol: "npm",
								registry: "https://registry.npmjs.org/",
								directory: "/path/to/pkg-a",
								access: "public",
								provenance: true,
								tag: "latest",
								tokenEnv: "NPM_TOKEN",
							},
							success: true,
							tarballPath: "/path/to/pkg-a/pkg-a-1.0.0.tgz",
							sbomPath: "/path/to/pkg-a/pkg-a-1.0.0-npm.sbom.json",
						},
					],
				},
			];

			vi.mocked(exec.exec).mockResolvedValue(0);
			vi.mocked(fs.existsSync).mockImplementation((p) => {
				if (typeof p === "string" && p.includes("CHANGELOG")) return false;
				return true;
			});
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("content"));

			let uploadCallCount = 0;
			mockOctokit.rest.repos.createRelease.mockResolvedValue({
				data: {
					id: 123,
					html_url: "https://github.com/test-owner/test-repo/releases/tag/v1.0.0",
				},
			});
			mockOctokit.rest.repos.uploadReleaseAsset.mockImplementation(async () => {
				uploadCallCount++;
				if (uploadCallCount === 1) {
					// First call is tarball - succeeds
					return {
						data: {
							name: "pkg-a-1.0.0.tgz",
							browser_download_url: "https://example.com/pkg-a-1.0.0.tgz",
							size: 1234,
						},
					};
				}
				// Second call is SBOM - fails
				throw new Error("SBOM upload failed");
			});

			vi.mocked(createReleaseAssetAttestation).mockResolvedValue({
				success: true,
				attestationUrl: "https://github.com/test-owner/test-repo/attestations/asset-123",
			});

			const result = await createGitHubReleases(tags, publishResults, "pnpm", false);

			// Should still succeed even if SBOM upload fails
			expect(result.success).toBe(true);
			expect(core.warning).toHaveBeenCalledWith(
				expect.stringContaining("Failed to upload SBOM /path/to/pkg-a/pkg-a-1.0.0-npm.sbom.json"),
			);
		});

		it("uploads API doc file when available", async () => {
			// Reset getState mock to return token
			vi.mocked(core.getState).mockReturnValue("mock-token");

			const tags: TagInfo[] = [
				{
					name: "v1.0.0",
					packageName: "@org/pkg-a",
					version: "1.0.0",
				},
			];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [
						{
							target: {
								protocol: "npm",
								registry: "https://registry.npmjs.org/",
								directory: "/path/to/pkg-a",
								access: "public",
								provenance: true,
								tag: "latest",
								tokenEnv: "NPM_TOKEN",
							},
							success: true,
							tarballPath: "/path/to/pkg-a/pkg-a-1.0.0.tgz",
						},
					],
				},
			];

			vi.mocked(exec.exec).mockResolvedValue(0);
			vi.mocked(fs.existsSync).mockImplementation((p) => {
				if (typeof p === "string" && p.includes("CHANGELOG")) return false;
				if (typeof p === "string" && p.includes("pkg-a.api.json")) return true; // API doc exists
				return true;
			});
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("content"));

			mockOctokit.rest.repos.createRelease.mockResolvedValue({
				data: {
					id: 123,
					html_url: "https://github.com/test-owner/test-repo/releases/tag/v1.0.0",
				},
			});
			mockOctokit.rest.repos.uploadReleaseAsset.mockImplementation(async (params) => {
				const name = params?.name as string;
				if (name.endsWith(".tgz")) {
					return {
						data: {
							name: "pkg-a-1.0.0.tgz",
							browser_download_url: "https://example.com/pkg-a-1.0.0.tgz",
							size: 1234,
						},
					};
				}
				if (name.endsWith(".api.json")) {
					return {
						data: {
							name: "pkg-a.api.json",
							browser_download_url: "https://example.com/pkg-a.api.json",
							size: 5000,
						},
					};
				}
				return {
					data: {
						name,
						browser_download_url: `https://example.com/${name}`,
						size: 500,
					},
				};
			});
			mockOctokit.rest.repos.updateRelease.mockResolvedValue({ data: {} });

			vi.mocked(createReleaseAssetAttestation).mockResolvedValue({
				success: true,
				attestationUrl: "https://github.com/test-owner/test-repo/attestations/asset-123",
			});

			await createGitHubReleases(tags, publishResults, "pnpm", false);

			// Verify API doc was uploaded (tarball + API doc = 2 uploads)
			expect(mockOctokit.rest.repos.uploadReleaseAsset).toHaveBeenCalledTimes(2);
			expect(core.info).toHaveBeenCalledWith("Uploading API doc: pkg-a.api.json");
			expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Uploaded API doc:"));
		});

		it("handles API doc upload failure gracefully", async () => {
			// Reset getState mock to return token
			vi.mocked(core.getState).mockReturnValue("mock-token");

			const tags: TagInfo[] = [
				{
					name: "v1.0.0",
					packageName: "@org/pkg-a",
					version: "1.0.0",
				},
			];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [
						{
							target: {
								protocol: "npm",
								registry: "https://registry.npmjs.org/",
								directory: "/path/to/pkg-a",
								access: "public",
								provenance: true,
								tag: "latest",
								tokenEnv: "NPM_TOKEN",
							},
							success: true,
							tarballPath: "/path/to/pkg-a/pkg-a-1.0.0.tgz",
						},
					],
				},
			];

			vi.mocked(exec.exec).mockResolvedValue(0);
			vi.mocked(fs.existsSync).mockImplementation((p) => {
				if (typeof p === "string" && p.includes("CHANGELOG")) return false;
				if (typeof p === "string" && p.includes("pkg-a.api.json")) return true;
				return true;
			});
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("content"));

			mockOctokit.rest.repos.createRelease.mockResolvedValue({
				data: {
					id: 123,
					html_url: "https://github.com/test-owner/test-repo/releases/tag/v1.0.0",
				},
			});
			mockOctokit.rest.repos.uploadReleaseAsset.mockImplementation(async (params) => {
				const name = params?.name as string;
				if (name.endsWith(".tgz")) {
					return {
						data: {
							name: "pkg-a-1.0.0.tgz",
							browser_download_url: "https://example.com/pkg-a-1.0.0.tgz",
							size: 1234,
						},
					};
				}
				// API doc upload fails
				throw new Error("API doc upload failed");
			});

			vi.mocked(createReleaseAssetAttestation).mockResolvedValue({
				success: true,
				attestationUrl: "https://github.com/test-owner/test-repo/attestations/asset-123",
			});

			const result = await createGitHubReleases(tags, publishResults, "pnpm", false);

			// Should still succeed even if API doc upload fails
			expect(result.success).toBe(true);
			expect(core.warning).toHaveBeenCalledWith(
				expect.stringContaining("Failed to upload API doc /path/to/pkg-a/pkg-a.api.json"),
			);
		});

		it("uploads API doc file for unscoped package names", async () => {
			// Reset getState mock to return token
			vi.mocked(core.getState).mockReturnValue("mock-token");

			const tags: TagInfo[] = [
				{
					name: "v1.0.0",
					packageName: "my-package", // Unscoped package name
					version: "1.0.0",
				},
			];
			const publishResults: PackagePublishResult[] = [
				{
					name: "my-package",
					version: "1.0.0",
					targets: [
						{
							target: {
								protocol: "npm",
								registry: "https://registry.npmjs.org/",
								directory: "/path/to/my-package",
								access: "public",
								provenance: true,
								tag: "latest",
								tokenEnv: "NPM_TOKEN",
							},
							success: true,
							tarballPath: "/path/to/my-package/my-package-1.0.0.tgz",
						},
					],
				},
			];

			vi.mocked(exec.exec).mockResolvedValue(0);
			vi.mocked(fs.existsSync).mockImplementation((p) => {
				if (typeof p === "string" && p.includes("CHANGELOG")) return false;
				if (typeof p === "string" && p.includes("my-package.api.json")) return true;
				return true;
			});
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("content"));

			mockOctokit.rest.repos.createRelease.mockResolvedValue({
				data: {
					id: 123,
					html_url: "https://github.com/test-owner/test-repo/releases/tag/v1.0.0",
				},
			});
			mockOctokit.rest.repos.uploadReleaseAsset.mockImplementation(async (params) => {
				const name = params?.name as string;
				return {
					data: {
						name,
						browser_download_url: `https://example.com/${name}`,
						size: 1234,
					},
				};
			});
			mockOctokit.rest.repos.updateRelease.mockResolvedValue({ data: {} });

			vi.mocked(createReleaseAssetAttestation).mockResolvedValue({
				success: true,
				attestationUrl: "https://github.com/test-owner/test-repo/attestations/asset-123",
			});

			await createGitHubReleases(tags, publishResults, "pnpm", false);

			// Verify API doc was uploaded with unscoped package name
			expect(mockOctokit.rest.repos.uploadReleaseAsset).toHaveBeenCalledTimes(2);
			expect(core.info).toHaveBeenCalledWith("Uploading API doc: my-package.api.json");
		});

		it("handles release notes update failure gracefully", async () => {
			// Reset getState mock to return token
			vi.mocked(core.getState).mockReturnValue("mock-token");

			const tags: TagInfo[] = [
				{
					name: "v1.0.0",
					packageName: "@org/pkg-a",
					version: "1.0.0",
				},
			];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [
						{
							target: {
								protocol: "npm",
								registry: "https://registry.npmjs.org/",
								directory: "/path/to/pkg-a",
								access: "public",
								provenance: true,
								tag: "latest",
								tokenEnv: "NPM_TOKEN",
							},
							success: true,
							tarballPath: "/path/to/pkg-a/pkg-a-1.0.0.tgz",
							sbomPath: "/path/to/pkg-a/pkg-a-1.0.0-npm.sbom.json",
						},
					],
				},
			];

			vi.mocked(exec.exec).mockResolvedValue(0);
			vi.mocked(fs.existsSync).mockImplementation((p) => {
				if (typeof p === "string" && p.includes("CHANGELOG")) return false;
				return true;
			});
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("content"));

			let uploadCallCount = 0;
			mockOctokit.rest.repos.createRelease.mockResolvedValue({
				data: {
					id: 123,
					html_url: "https://github.com/test-owner/test-repo/releases/tag/v1.0.0",
				},
			});
			mockOctokit.rest.repos.uploadReleaseAsset.mockImplementation(async () => {
				uploadCallCount++;
				if (uploadCallCount === 1) {
					// First call is tarball
					return {
						data: {
							name: "pkg-a-1.0.0.tgz",
							browser_download_url: "https://example.com/pkg-a-1.0.0.tgz",
							size: 1234,
						},
					};
				}
				// Second call is SBOM
				return {
					data: {
						name: "pkg-a-1.0.0-npm.sbom.json",
						browser_download_url: "https://example.com/pkg-a-1.0.0-npm.sbom.json",
						size: 500,
					},
				};
			});
			// Make updateRelease fail
			mockOctokit.rest.repos.updateRelease.mockRejectedValue(new Error("Update failed"));

			vi.mocked(createReleaseAssetAttestation).mockResolvedValue({
				success: true,
				attestationUrl: "https://github.com/test-owner/test-repo/attestations/asset-123",
			});

			const result = await createGitHubReleases(tags, publishResults, "pnpm", false);

			// Should still succeed even if update fails
			expect(result.success).toBe(true);
			expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Failed to update release notes"));
		});
	});

	describe("multi-directory asset uploads", () => {
		it("uploads assets with directory prefix when multiple directories exist", async () => {
			const tags: TagInfo[] = [{ name: "v1.0.0", packageName: "@org/pkg-a", version: "1.0.0" }];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [
						{
							target: {
								registry: "https://registry.npmjs.org/",
								directory: "/path/to/pkg-a/dist/npm",
							} as never,
							success: true,
							tarballPath: "/path/to/pkg-a/dist/npm/org-pkg-a-1.0.0.tgz",
						},
						{
							target: {
								registry: "https://npm.pkg.github.com/",
								directory: "/path/to/pkg-a/dist/github",
							} as never,
							success: true,
							tarballPath: "/path/to/pkg-a/dist/github/org-pkg-a-1.0.0.tgz",
						},
					],
				},
			];

			vi.mocked(exec.exec).mockResolvedValue(0);
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("tarball content"));
			mockOctokit.rest.repos.createRelease.mockResolvedValue({
				data: { id: 123, html_url: "https://github.com/test/releases/1" },
			});
			mockOctokit.rest.repos.uploadReleaseAsset.mockResolvedValue({
				data: { browser_download_url: "https://download/asset", size: 1234 },
			});
			mockOctokit.rest.repos.updateRelease.mockResolvedValue({ data: {} });
			// Mock attestation with URL to cover line 513
			vi.mocked(createReleaseAssetAttestation).mockResolvedValue({
				success: true,
				attestationUrl: "https://github.com/test-owner/test-repo/attestations/multi-dir-123",
			});

			const result = await createGitHubReleases(tags, publishResults, "pnpm", false);

			expect(result.success).toBe(true);
			// Should upload both tarballs with directory prefix
			expect(mockOctokit.rest.repos.uploadReleaseAsset).toHaveBeenCalledTimes(2);
			expect(mockOctokit.rest.repos.uploadReleaseAsset).toHaveBeenCalledWith(
				expect.objectContaining({ name: "npm-org-pkg-a-1.0.0.tgz" }),
			);
			expect(mockOctokit.rest.repos.uploadReleaseAsset).toHaveBeenCalledWith(
				expect.objectContaining({ name: "github-org-pkg-a-1.0.0.tgz" }),
			);
			// Verify attestation success message was logged
			expect(core.info).toHaveBeenCalledWith(
				"  ✓ Created attestation: https://github.com/test-owner/test-repo/attestations/multi-dir-123",
			);
		});

		it("uploads single asset without prefix when all targets share directory", async () => {
			const tags: TagInfo[] = [{ name: "v1.0.0", packageName: "@org/pkg-a", version: "1.0.0" }];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [
						{
							target: {
								registry: "https://registry.npmjs.org/",
								directory: "/path/to/pkg-a/dist",
							} as never,
							success: true,
							tarballPath: "/path/to/pkg-a/dist/org-pkg-a-1.0.0.tgz",
						},
						{
							target: {
								registry: "https://npm.pkg.github.com/",
								directory: "/path/to/pkg-a/dist",
							} as never,
							success: true,
							tarballPath: "/path/to/pkg-a/dist/org-pkg-a-1.0.0.tgz",
						},
					],
				},
			];

			vi.mocked(exec.exec).mockResolvedValue(0);
			vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("tarball content"));
			mockOctokit.rest.repos.createRelease.mockResolvedValue({
				data: { id: 123, html_url: "https://github.com/test/releases/1" },
			});
			mockOctokit.rest.repos.uploadReleaseAsset.mockResolvedValue({
				data: { browser_download_url: "https://download/asset", size: 1234 },
			});

			const result = await createGitHubReleases(tags, publishResults, "pnpm", false);

			expect(result.success).toBe(true);
			// Should upload only once (de-duplicated) without prefix
			expect(mockOctokit.rest.repos.uploadReleaseAsset).toHaveBeenCalledTimes(1);
			expect(mockOctokit.rest.repos.uploadReleaseAsset).toHaveBeenCalledWith(
				expect.objectContaining({ name: "org-pkg-a-1.0.0.tgz" }),
			);
		});

		it("falls back to old behavior when no tarballPath in results", async () => {
			const tags: TagInfo[] = [{ name: "v1.0.0", packageName: "@org/pkg-a", version: "1.0.0" }];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [
						{
							target: { registry: "https://registry.npmjs.org/" } as never,
							success: true,
							// No tarballPath
						},
					],
				},
			];

			vi.mocked(exec.exec).mockResolvedValue(0);
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readdirSync).mockReturnValue(["org-pkg-a-1.0.0.tgz"] as never);
			// Mock readFileSync to return appropriate types based on the path
			vi.mocked(fs.readFileSync).mockImplementation((path: fs.PathOrFileDescriptor) => {
				const pathStr = String(path);
				if (pathStr.includes("CHANGELOG")) {
					return "# Changelog\n\n## 1.0.0\n\nRelease notes";
				}
				return Buffer.from("tarball content");
			});
			mockOctokit.rest.repos.createRelease.mockResolvedValue({
				data: { id: 123, html_url: "https://github.com/test/releases/1" },
			});
			mockOctokit.rest.repos.uploadReleaseAsset.mockResolvedValue({
				data: { browser_download_url: "https://download/asset", size: 1234 },
			});

			const result = await createGitHubReleases(tags, publishResults, "pnpm", false);

			expect(result.success).toBe(true);
			// Should upload via fallback path (found tgz in package dir)
			expect(mockOctokit.rest.repos.uploadReleaseAsset).toHaveBeenCalledTimes(1);
		});

		it("handles upload failure gracefully in tarballPath code path", async () => {
			const tags: TagInfo[] = [{ name: "v1.0.0", packageName: "@org/pkg-a", version: "1.0.0" }];
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [
						{
							target: {
								registry: "https://registry.npmjs.org/",
								directory: "/path/to/pkg-a/dist/npm",
							} as never,
							success: true,
							tarballPath: "/path/to/pkg-a/dist/npm/org-pkg-a-1.0.0.tgz",
						},
					],
				},
			];

			vi.mocked(exec.exec).mockResolvedValue(0);
			vi.mocked(fs.readFileSync).mockImplementation(() => {
				throw new Error("ENOENT: no such file or directory");
			});
			mockOctokit.rest.repos.createRelease.mockResolvedValue({
				data: { id: 123, html_url: "https://github.com/test/releases/1" },
			});

			const result = await createGitHubReleases(tags, publishResults, "pnpm", false);

			expect(result.success).toBe(true); // Release still succeeds
			expect(core.warning).toHaveBeenCalledWith(
				expect.stringContaining("Failed to upload artifact /path/to/pkg-a/dist/npm/org-pkg-a-1.0.0.tgz"),
			);
		});
	});
});
