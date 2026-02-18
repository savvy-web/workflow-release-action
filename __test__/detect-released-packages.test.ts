import { existsSync, readFileSync } from "node:fs";
import { context, getOctokit } from "@actions/github";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	detectReleasedPackagesFromCommit,
	detectReleasedPackagesFromPR,
} from "../src/utils/detect-released-packages.js";
import { cleanupTestEnvironment, createMockOctokit, setupTestEnvironment } from "./utils/github-mocks.js";
import type { MockOctokit } from "./utils/test-types.js";

vi.mock("@actions/core");
vi.mock("@actions/github");

vi.mock("node:fs", () => ({
	existsSync: vi.fn(),
	readFileSync: vi.fn(),
}));

describe("detectReleasedPackagesFromPR", () => {
	let mockOctokit: MockOctokit;

	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });
		mockOctokit = createMockOctokit();

		Object.defineProperty(vi.mocked(context), "repo", {
			value: { owner: "test-owner", repo: "test-repo" },
			writable: true,
		});
		vi.mocked(getOctokit).mockReturnValue(mockOctokit as unknown as ReturnType<typeof getOctokit>);
	});

	afterEach(() => {
		cleanupTestEnvironment();
	});

	it("should detect packages with version bumps from PR files", async () => {
		// Mock pulls.listFiles to return modified package.json files
		(mockOctokit.rest.pulls as Record<string, ReturnType<typeof vi.fn>>).listFiles = vi.fn().mockResolvedValue({
			data: [
				{ filename: "packages/core/package.json", status: "modified" },
				{ filename: "packages/utils/package.json", status: "modified" },
				{ filename: "packages/core/src/index.ts", status: "modified" },
			],
		});

		// Mock pulls.get for base SHA
		mockOctokit.rest.pulls.get.mockResolvedValue({
			data: { base: { sha: "base-sha-123" } },
		});

		// Mock readFileSync for current package.json
		vi.mocked(readFileSync).mockImplementation((p) => {
			const path = String(p);
			if (path.includes("packages/core/package.json")) {
				return JSON.stringify({ name: "@test/core", version: "2.0.0" });
			}
			if (path.includes("packages/utils/package.json")) {
				return JSON.stringify({ name: "@test/utils", version: "1.1.0" });
			}
			return "{}";
		});

		// Mock repos.getContent for old versions
		(mockOctokit.rest.repos as Record<string, ReturnType<typeof vi.fn>>).getContent = vi
			.fn()
			.mockImplementation(async ({ path }: { path: string }) => {
				if (path.includes("core")) {
					return {
						data: {
							content: Buffer.from(JSON.stringify({ name: "@test/core", version: "1.0.0" })).toString("base64"),
						},
					};
				}
				if (path.includes("utils")) {
					return {
						data: {
							content: Buffer.from(JSON.stringify({ name: "@test/utils", version: "1.0.0" })).toString("base64"),
						},
					};
				}
				return { data: {} };
			});

		const result = await detectReleasedPackagesFromPR("test-token", 42);

		expect(result.success).toBe(true);
		expect(result.packages).toHaveLength(2);
		expect(result.packages[0].name).toBe("@test/core");
		expect(result.packages[0].version).toBe("2.0.0");
		expect(result.packages[0].bumpType).toBe("major");
		expect(result.packages[1].name).toBe("@test/utils");
		expect(result.packages[1].version).toBe("1.1.0");
		expect(result.packages[1].bumpType).toBe("minor");
	});

	it("should include root package.json for single-package repos", async () => {
		(mockOctokit.rest.pulls as Record<string, ReturnType<typeof vi.fn>>).listFiles = vi.fn().mockResolvedValue({
			data: [{ filename: "package.json", status: "modified" }],
		});

		mockOctokit.rest.pulls.get.mockResolvedValue({
			data: { base: { sha: "base-sha-123" } },
		});

		vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ name: "my-app", version: "1.0.1" }));

		(mockOctokit.rest.repos as Record<string, ReturnType<typeof vi.fn>>).getContent = vi.fn().mockResolvedValue({
			data: {
				content: Buffer.from(JSON.stringify({ name: "my-app", version: "1.0.0" })).toString("base64"),
			},
		});

		const result = await detectReleasedPackagesFromPR("test-token", 42);

		expect(result.success).toBe(true);
		expect(result.packages).toHaveLength(1);
		expect(result.packages[0].bumpType).toBe("patch");
	});

	it("should skip files where version did not change", async () => {
		(mockOctokit.rest.pulls as Record<string, ReturnType<typeof vi.fn>>).listFiles = vi.fn().mockResolvedValue({
			data: [{ filename: "packages/core/package.json", status: "modified" }],
		});

		mockOctokit.rest.pulls.get.mockResolvedValue({
			data: { base: { sha: "base-sha-123" } },
		});

		vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ name: "@test/core", version: "1.0.0" }));

		(mockOctokit.rest.repos as Record<string, ReturnType<typeof vi.fn>>).getContent = vi.fn().mockResolvedValue({
			data: {
				content: Buffer.from(JSON.stringify({ name: "@test/core", version: "1.0.0" })).toString("base64"),
			},
		});

		const result = await detectReleasedPackagesFromPR("test-token", 42);

		expect(result.success).toBe(true);
		expect(result.packages).toHaveLength(0);
	});

	it("should handle new packages (no old version)", async () => {
		(mockOctokit.rest.pulls as Record<string, ReturnType<typeof vi.fn>>).listFiles = vi.fn().mockResolvedValue({
			data: [{ filename: "packages/new-pkg/package.json", status: "modified" }],
		});

		mockOctokit.rest.pulls.get.mockResolvedValue({
			data: { base: { sha: "base-sha-123" } },
		});

		vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ name: "@test/new-pkg", version: "1.0.0" }));

		// getContent throws for new package (file doesn't exist in base)
		(mockOctokit.rest.repos as Record<string, ReturnType<typeof vi.fn>>).getContent = vi
			.fn()
			.mockRejectedValue(new Error("Not Found"));

		const result = await detectReleasedPackagesFromPR("test-token", 42);

		expect(result.success).toBe(true);
		expect(result.packages).toHaveLength(1);
		expect(result.packages[0].version).toBe("1.0.0");
	});

	it("should handle API errors gracefully", async () => {
		(mockOctokit.rest.pulls as Record<string, ReturnType<typeof vi.fn>>).listFiles = vi
			.fn()
			.mockRejectedValue(new Error("API rate limit exceeded"));

		const result = await detectReleasedPackagesFromPR("test-token", 42);

		expect(result.success).toBe(false);
		expect(result.packages).toHaveLength(0);
		expect(result.error).toContain("API rate limit exceeded");
	});

	it("should handle file processing errors gracefully", async () => {
		(mockOctokit.rest.pulls as Record<string, ReturnType<typeof vi.fn>>).listFiles = vi.fn().mockResolvedValue({
			data: [{ filename: "packages/bad/package.json", status: "modified" }],
		});

		mockOctokit.rest.pulls.get.mockResolvedValue({
			data: { base: { sha: "base-sha-123" } },
		});

		// readFileSync throws
		vi.mocked(readFileSync).mockImplementation(() => {
			throw new Error("ENOENT");
		});

		const result = await detectReleasedPackagesFromPR("test-token", 42);

		// Should succeed overall but with 0 packages (the error is caught per-file)
		expect(result.success).toBe(true);
		expect(result.packages).toHaveLength(0);
	});
});

describe("detectReleasedPackagesFromCommit", () => {
	let mockOctokit: MockOctokit;

	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });
		mockOctokit = createMockOctokit();

		Object.defineProperty(vi.mocked(context), "repo", {
			value: { owner: "test-owner", repo: "test-repo" },
			writable: true,
		});
		Object.defineProperty(vi.mocked(context), "sha", { value: "head-sha-123", writable: true });
		vi.mocked(getOctokit).mockReturnValue(mockOctokit as unknown as ReturnType<typeof getOctokit>);
	});

	afterEach(() => {
		cleanupTestEnvironment();
	});

	it("should detect packages from commit comparison", async () => {
		// Mock repos.getCommit to return parent SHA
		(mockOctokit.rest.repos as Record<string, ReturnType<typeof vi.fn>>).getCommit = vi.fn().mockResolvedValue({
			data: {
				parents: [{ sha: "parent-sha-123" }],
			},
		});

		// Mock repos.compareCommits to return changed files
		mockOctokit.rest.repos.compareCommits.mockResolvedValue({
			data: {
				files: [
					{ filename: "packages/core/package.json", status: "modified" },
					{ filename: "packages/core/src/index.ts", status: "modified" },
				],
			},
		});

		vi.mocked(existsSync).mockReturnValue(true);
		vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ name: "@test/core", version: "2.0.0" }));

		(mockOctokit.rest.repos as Record<string, ReturnType<typeof vi.fn>>).getContent = vi.fn().mockResolvedValue({
			data: {
				content: Buffer.from(JSON.stringify({ name: "@test/core", version: "1.0.0" })).toString("base64"),
			},
		});

		const result = await detectReleasedPackagesFromCommit("test-token");

		expect(result.success).toBe(true);
		expect(result.packages).toHaveLength(1);
		expect(result.packages[0].name).toBe("@test/core");
		expect(result.packages[0].bumpType).toBe("major");
	});

	it("should return error when no parent commits found", async () => {
		(mockOctokit.rest.repos as Record<string, ReturnType<typeof vi.fn>>).getCommit = vi.fn().mockResolvedValue({
			data: { parents: [] },
		});

		const result = await detectReleasedPackagesFromCommit("test-token");

		expect(result.success).toBe(false);
		expect(result.error).toContain("No parent commits found");
	});

	it("should skip files that do not exist on disk", async () => {
		(mockOctokit.rest.repos as Record<string, ReturnType<typeof vi.fn>>).getCommit = vi.fn().mockResolvedValue({
			data: { parents: [{ sha: "parent-sha" }] },
		});

		mockOctokit.rest.repos.compareCommits.mockResolvedValue({
			data: {
				files: [{ filename: "packages/deleted/package.json", status: "modified" }],
			},
		});

		vi.mocked(existsSync).mockReturnValue(false);

		const result = await detectReleasedPackagesFromCommit("test-token");

		expect(result.success).toBe(true);
		expect(result.packages).toHaveLength(0);
	});

	it("should handle API errors gracefully", async () => {
		(mockOctokit.rest.repos as Record<string, ReturnType<typeof vi.fn>>).getCommit = vi
			.fn()
			.mockRejectedValue(new Error("Network error"));

		const result = await detectReleasedPackagesFromCommit("test-token");

		expect(result.success).toBe(false);
		expect(result.error).toContain("Network error");
	});

	it("should handle comparison with no files", async () => {
		(mockOctokit.rest.repos as Record<string, ReturnType<typeof vi.fn>>).getCommit = vi.fn().mockResolvedValue({
			data: { parents: [{ sha: "parent-sha" }] },
		});

		mockOctokit.rest.repos.compareCommits.mockResolvedValue({
			data: { files: undefined },
		});

		const result = await detectReleasedPackagesFromCommit("test-token");

		expect(result.success).toBe(true);
		expect(result.packages).toHaveLength(0);
	});

	it("should handle file processing errors gracefully", async () => {
		(mockOctokit.rest.repos as Record<string, ReturnType<typeof vi.fn>>).getCommit = vi.fn().mockResolvedValue({
			data: { parents: [{ sha: "parent-sha" }] },
		});

		mockOctokit.rest.repos.compareCommits.mockResolvedValue({
			data: {
				files: [{ filename: "packages/bad/package.json", status: "modified" }],
			},
		});

		vi.mocked(existsSync).mockReturnValue(true);
		vi.mocked(readFileSync).mockImplementation(() => {
			throw new Error("ENOENT");
		});

		const result = await detectReleasedPackagesFromCommit("test-token");

		expect(result.success).toBe(true);
		expect(result.packages).toHaveLength(0);
	});

	it("should infer minor bump type correctly", async () => {
		(mockOctokit.rest.repos as Record<string, ReturnType<typeof vi.fn>>).getCommit = vi.fn().mockResolvedValue({
			data: { parents: [{ sha: "parent-sha" }] },
		});

		mockOctokit.rest.repos.compareCommits.mockResolvedValue({
			data: {
				files: [{ filename: "packages/core/package.json", status: "modified" }],
			},
		});

		vi.mocked(existsSync).mockReturnValue(true);
		vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ name: "@test/core", version: "1.2.0" }));

		(mockOctokit.rest.repos as Record<string, ReturnType<typeof vi.fn>>).getContent = vi.fn().mockResolvedValue({
			data: {
				content: Buffer.from(JSON.stringify({ name: "@test/core", version: "1.1.0" })).toString("base64"),
			},
		});

		const result = await detectReleasedPackagesFromCommit("test-token");

		expect(result.packages[0].bumpType).toBe("minor");
	});

	it("should infer patch bump type correctly", async () => {
		(mockOctokit.rest.repos as Record<string, ReturnType<typeof vi.fn>>).getCommit = vi.fn().mockResolvedValue({
			data: { parents: [{ sha: "parent-sha" }] },
		});

		mockOctokit.rest.repos.compareCommits.mockResolvedValue({
			data: {
				files: [{ filename: "packages/core/package.json", status: "modified" }],
			},
		});

		vi.mocked(existsSync).mockReturnValue(true);
		vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ name: "@test/core", version: "1.0.2" }));

		(mockOctokit.rest.repos as Record<string, ReturnType<typeof vi.fn>>).getContent = vi.fn().mockResolvedValue({
			data: {
				content: Buffer.from(JSON.stringify({ name: "@test/core", version: "1.0.1" })).toString("base64"),
			},
		});

		const result = await detectReleasedPackagesFromCommit("test-token");

		expect(result.packages[0].bumpType).toBe("patch");
	});
});
