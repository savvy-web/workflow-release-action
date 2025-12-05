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

			await createGitHubReleases(tags, publishResults, false);

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

			await createGitHubReleases(tags, publishResults, false);

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

			await createGitHubReleases(tags, publishResults, false);

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

			await createGitHubReleases(tags, publishResults, false);

			const createReleaseCall = mockOctokit.rest.repos.createRelease.mock.calls[0][0];
			// Should trim leading empty lines but preserve content
			expect(createReleaseCall.body).toContain("Feature with leading/trailing empty lines");
		});
	});

	describe("createGitHubReleases", () => {
		it("returns success with no releases when tags are empty", async () => {
			const tags: TagInfo[] = [];
			const publishResults: PackagePublishResult[] = [];

			const result = await createGitHubReleases(tags, publishResults, false);

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

			const result = await createGitHubReleases(tags, publishResults, false);

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

			const result = await createGitHubReleases(tags, publishResults, true);

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

			vi.mocked(exec.exec).mockResolvedValue(0);
			mockOctokit.rest.repos.createRelease.mockResolvedValue({
				data: {
					id: 123,
					html_url: "https://github.com/test-owner/test-repo/releases/tag/v2.0.0",
				},
			});

			const result = await createGitHubReleases(tags, publishResults, false);

			expect(result.success).toBe(true);
			expect(result.createdTags).toContain("v2.0.0");
			expect(result.releases[0].id).toBe(123);
			expect(result.releases[0].url).toBe("https://github.com/test-owner/test-repo/releases/tag/v2.0.0");

			// Verify git tag command was called
			expect(exec.exec).toHaveBeenCalledWith("git", ["tag", "-a", "v2.0.0", "-m", "Release v2.0.0"]);
			expect(exec.exec).toHaveBeenCalledWith("git", ["push", "origin", "v2.0.0"]);
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

			// Allow git config calls (for identity setup) but fail the git tag command
			vi.mocked(exec.exec).mockImplementation(async (_cmd: string, args?: string[]) => {
				if (args?.includes("tag")) {
					throw new Error("Git tag failed");
				}
				return 0;
			});

			const result = await createGitHubReleases(tags, publishResults, false);

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

			const result = await createGitHubReleases(tags, publishResults, false);

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

			await createGitHubReleases(tags, publishResults, false);

			const createReleaseCall = mockOctokit.rest.repos.createRelease.mock.calls[0][0];
			expect(createReleaseCall.body).toContain("Published to:");
			expect(createReleaseCall.body).toContain("npm");
			expect(createReleaseCall.body).toContain("https://www.npmjs.com/package/@org/pkg-a");
			expect(createReleaseCall.body).toContain("Sigstore provenance");
		});

		it("includes GitHub attestation URL in release notes", async () => {
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

			await createGitHubReleases(tags, publishResults, false);

			const createReleaseCall = mockOctokit.rest.repos.createRelease.mock.calls[0][0];
			expect(createReleaseCall.body).toContain("GitHub attestation");
			expect(createReleaseCall.body).toContain("https://github.com/test-owner/test-repo/attestations/12345");
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

			await createGitHubReleases(tags, publishResults, false);

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

			const result = await createGitHubReleases(tags, publishResults, false);

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

			const result = await createGitHubReleases(tags, publishResults, false);

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

			const result = await createGitHubReleases(tags, publishResults, false);

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

			const result = await createGitHubReleases(tags, publishResults, false);

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

			await createGitHubReleases(tags, publishResults, false);

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

			await createGitHubReleases(tags, publishResults, false);

			expect(packCmd).toBe("yarn");
			expect(packArgs).toEqual(["dlx", "npm", "pack", "--json"]);
		});

		it("uses bunx npm pack when package manager is bun", async () => {
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

			await createGitHubReleases(tags, publishResults, false);

			expect(packCmd).toBe("bunx");
			expect(packArgs).toEqual(["npm", "pack", "--json"]);
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

			await createGitHubReleases(tags, publishResults, false);

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

			const result = await createGitHubReleases(tags, publishResults, false);

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

			const result = await createGitHubReleases(tags, publishResults, false);

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

			await expect(createGitHubReleases(tags, publishResults, false)).rejects.toThrow(
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

			await createGitHubReleases(tags, publishResults, false);

			expect(core.info).toHaveBeenCalledWith(
				"  ✓ Created attestation: https://github.com/test-owner/test-repo/attestations/asset-123",
			);
		});

		it("updates release notes with asset attestations", async () => {
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

			vi.mocked(createReleaseAssetAttestation).mockResolvedValue({
				success: true,
				attestationUrl: "https://github.com/test-owner/test-repo/attestations/asset-123",
			});

			await createGitHubReleases(tags, publishResults, false);

			// Verify updateRelease was called with attestation info
			expect(mockOctokit.rest.repos.updateRelease).toHaveBeenCalledWith(
				expect.objectContaining({
					owner: "test-owner",
					repo: "test-repo",
					release_id: 123,
					body: expect.stringContaining("Release Asset Attestations"),
				}),
			);
			expect(core.info).toHaveBeenCalledWith("Updated release notes with asset attestations");
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
			// Make updateRelease fail
			mockOctokit.rest.repos.updateRelease.mockRejectedValue(new Error("Update failed"));

			vi.mocked(createReleaseAssetAttestation).mockResolvedValue({
				success: true,
				attestationUrl: "https://github.com/test-owner/test-repo/attestations/asset-123",
			});

			const result = await createGitHubReleases(tags, publishResults, false);

			// Should still succeed even if update fails
			expect(result.success).toBe(true);
			expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Failed to update release notes"));
		});
	});
});
