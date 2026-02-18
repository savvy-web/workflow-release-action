import { readFile, stat } from "node:fs/promises";
import * as exec from "@actions/exec";
import { context, getOctokit } from "@actions/github";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiCommit, updateBranchToRef } from "../src/utils/create-api-commit.js";
import { cleanupTestEnvironment, createMockOctokit, setupTestEnvironment } from "./utils/github-mocks.js";
import type { MockOctokit } from "./utils/test-types.js";

vi.mock("@actions/core");
vi.mock("@actions/github");
vi.mock("@actions/exec");

vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(),
	stat: vi.fn(),
}));

describe("createApiCommit", () => {
	let mockOctokit: MockOctokit;

	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });
		mockOctokit = createMockOctokit();

		// Add git API methods to mock
		mockOctokit.rest.git = {
			getRef: vi.fn(),
			getCommit: vi.fn(),
			createBlob: vi.fn(),
			createTree: vi.fn(),
			createCommit: vi.fn(),
			updateRef: vi.fn(),
			createRef: vi.fn(),
		};

		Object.defineProperty(vi.mocked(context), "repo", {
			value: { owner: "test-owner", repo: "test-repo" },
			writable: true,
		});
		vi.mocked(getOctokit).mockReturnValue(mockOctokit as unknown as ReturnType<typeof getOctokit>);
	});

	afterEach(() => {
		cleanupTestEnvironment();
	});

	it("should return created=false when no changes to commit", async () => {
		// git status returns empty
		vi.mocked(exec.exec).mockResolvedValue(0);

		const result = await createApiCommit("test-token", "main", "chore: release");

		expect(result.created).toBe(false);
		expect(result.sha).toBe("");
	});

	it("should create a commit with changed files", async () => {
		// Mock git status to return changed files
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			options?.listeners?.stdout?.(Buffer.from("M  package.json\0A  new-file.ts\0"));
			return 0;
		});

		// Mock getRef for parent branch
		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).getRef.mockResolvedValue({
			data: { object: { sha: "parent-sha-123" } },
		});

		// Mock getCommit for base tree
		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).getCommit.mockResolvedValue({
			data: { tree: { sha: "base-tree-sha" } },
		});

		// Mock readFile for blob creation
		vi.mocked(readFile).mockResolvedValue(Buffer.from("file content"));

		// Mock stat for file mode
		vi.mocked(stat).mockResolvedValue({ mode: 0o100644 } as Awaited<ReturnType<typeof stat>>);

		// Mock createBlob
		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createBlob.mockResolvedValue({
			data: { sha: "blob-sha-123" },
		});

		// Mock createTree
		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createTree.mockResolvedValue({
			data: { sha: "new-tree-sha" },
		});

		// Mock createCommit
		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createCommit.mockResolvedValue({
			data: { sha: "new-commit-sha" },
		});

		// Mock updateRef
		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).updateRef.mockResolvedValue({});

		const result = await createApiCommit("test-token", "main", "chore: release");

		expect(result.created).toBe(true);
		expect(result.sha).toBe("new-commit-sha");
		expect((mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createBlob).toHaveBeenCalledTimes(2);
		expect((mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createTree).toHaveBeenCalled();
		expect((mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createCommit).toHaveBeenCalled();
	});

	it("should handle deleted files", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			options?.listeners?.stdout?.(Buffer.from("D  deleted-file.ts\0"));
			return 0;
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).getRef.mockResolvedValue({
			data: { object: { sha: "parent-sha" } },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).getCommit.mockResolvedValue({
			data: { tree: { sha: "base-tree-sha" } },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createTree.mockResolvedValue({
			data: { sha: "new-tree-sha" },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createCommit.mockResolvedValue({
			data: { sha: "new-commit-sha" },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).updateRef.mockResolvedValue({});

		const result = await createApiCommit("test-token", "main", "chore: delete files");

		expect(result.created).toBe(true);
		// Deleted files should have null SHA in tree
		expect((mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createTree).toHaveBeenCalledWith(
			expect.objectContaining({
				tree: expect.arrayContaining([
					expect.objectContaining({
						path: "deleted-file.ts",
						sha: null,
					}),
				]),
			}),
		);
		// createBlob should not be called for deleted files
		expect((mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createBlob).not.toHaveBeenCalled();
	});

	it("should handle renames by using the new path", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			options?.listeners?.stdout?.(Buffer.from("R  old-name.ts -> new-name.ts\0"));
			return 0;
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).getRef.mockResolvedValue({
			data: { object: { sha: "parent-sha" } },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).getCommit.mockResolvedValue({
			data: { tree: { sha: "base-tree-sha" } },
		});

		vi.mocked(readFile).mockResolvedValue(Buffer.from("content"));
		vi.mocked(stat).mockResolvedValue({ mode: 0o100644 } as Awaited<ReturnType<typeof stat>>);

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createBlob.mockResolvedValue({
			data: { sha: "blob-sha" },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createTree.mockResolvedValue({
			data: { sha: "new-tree-sha" },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createCommit.mockResolvedValue({
			data: { sha: "new-commit-sha" },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).updateRef.mockResolvedValue({});

		const result = await createApiCommit("test-token", "main", "chore: rename");

		expect(result.created).toBe(true);
		// Should use the new file path
		expect((mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createTree).toHaveBeenCalledWith(
			expect.objectContaining({
				tree: expect.arrayContaining([
					expect.objectContaining({
						path: "new-name.ts",
					}),
				]),
			}),
		);
	});

	it("should use provided parentCommitSha", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			options?.listeners?.stdout?.(Buffer.from("M  file.ts\0"));
			return 0;
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).getCommit.mockResolvedValue({
			data: { tree: { sha: "base-tree-sha" } },
		});

		vi.mocked(readFile).mockResolvedValue(Buffer.from("content"));
		vi.mocked(stat).mockResolvedValue({ mode: 0o100644 } as Awaited<ReturnType<typeof stat>>);

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createBlob.mockResolvedValue({
			data: { sha: "blob-sha" },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createTree.mockResolvedValue({
			data: { sha: "new-tree-sha" },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createCommit.mockResolvedValue({
			data: { sha: "new-commit-sha" },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).updateRef.mockResolvedValue({});

		await createApiCommit("test-token", "main", "chore: release", {
			parentCommitSha: "provided-sha",
		});

		// Should not call getRef since parentCommitSha is provided
		expect((mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).getRef).not.toHaveBeenCalled();
		// Should use provided SHA for getCommit
		expect((mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).getCommit).toHaveBeenCalledWith(
			expect.objectContaining({ commit_sha: "provided-sha" }),
		);
	});

	it("should create ref when updateRef fails with 422", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			options?.listeners?.stdout?.(Buffer.from("M  file.ts\0"));
			return 0;
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).getRef.mockResolvedValue({
			data: { object: { sha: "parent-sha" } },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).getCommit.mockResolvedValue({
			data: { tree: { sha: "base-tree-sha" } },
		});

		vi.mocked(readFile).mockResolvedValue(Buffer.from("content"));
		vi.mocked(stat).mockResolvedValue({ mode: 0o100644 } as Awaited<ReturnType<typeof stat>>);

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createBlob.mockResolvedValue({
			data: { sha: "blob-sha" },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createTree.mockResolvedValue({
			data: { sha: "new-tree-sha" },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createCommit.mockResolvedValue({
			data: { sha: "new-commit-sha" },
		});

		// updateRef fails with 422 (ref doesn't exist)
		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).updateRef.mockRejectedValue({
			status: 422,
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createRef.mockResolvedValue({});

		const result = await createApiCommit("test-token", "new-branch", "chore: init");

		expect(result.created).toBe(true);
		expect((mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createRef).toHaveBeenCalledWith(
			expect.objectContaining({
				ref: "refs/heads/new-branch",
				sha: "new-commit-sha",
			}),
		);
	});

	it("should create ref when updateRef fails with 404", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			options?.listeners?.stdout?.(Buffer.from("M  file.ts\0"));
			return 0;
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).getRef.mockResolvedValue({
			data: { object: { sha: "parent-sha" } },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).getCommit.mockResolvedValue({
			data: { tree: { sha: "base-tree-sha" } },
		});

		vi.mocked(readFile).mockResolvedValue(Buffer.from("content"));
		vi.mocked(stat).mockResolvedValue({ mode: 0o100644 } as Awaited<ReturnType<typeof stat>>);

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createBlob.mockResolvedValue({
			data: { sha: "blob-sha" },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createTree.mockResolvedValue({
			data: { sha: "new-tree-sha" },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createCommit.mockResolvedValue({
			data: { sha: "new-commit-sha" },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).updateRef.mockRejectedValue({
			status: 404,
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createRef.mockResolvedValue({});

		const result = await createApiCommit("test-token", "new-branch", "chore: init");

		expect(result.created).toBe(true);
		expect((mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createRef).toHaveBeenCalled();
	});

	it("should rethrow non-422/404 errors from updateRef", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			options?.listeners?.stdout?.(Buffer.from("M  file.ts\0"));
			return 0;
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).getRef.mockResolvedValue({
			data: { object: { sha: "parent-sha" } },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).getCommit.mockResolvedValue({
			data: { tree: { sha: "base-tree-sha" } },
		});

		vi.mocked(readFile).mockResolvedValue(Buffer.from("content"));
		vi.mocked(stat).mockResolvedValue({ mode: 0o100644 } as Awaited<ReturnType<typeof stat>>);

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createBlob.mockResolvedValue({
			data: { sha: "blob-sha" },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createTree.mockResolvedValue({
			data: { sha: "new-tree-sha" },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createCommit.mockResolvedValue({
			data: { sha: "new-commit-sha" },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).updateRef.mockRejectedValue({
			status: 500,
		});

		await expect(createApiCommit("test-token", "main", "chore: release")).rejects.toEqual({ status: 500 });
	});

	it("should detect executable file mode", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			options?.listeners?.stdout?.(Buffer.from("M  script.sh\0"));
			return 0;
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).getRef.mockResolvedValue({
			data: { object: { sha: "parent-sha" } },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).getCommit.mockResolvedValue({
			data: { tree: { sha: "base-tree-sha" } },
		});

		vi.mocked(readFile).mockResolvedValue(Buffer.from("#!/bin/bash"));
		// Executable file mode (0o100755)
		vi.mocked(stat).mockResolvedValue({ mode: 0o100755 } as Awaited<ReturnType<typeof stat>>);

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createBlob.mockResolvedValue({
			data: { sha: "blob-sha" },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createTree.mockResolvedValue({
			data: { sha: "new-tree-sha" },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createCommit.mockResolvedValue({
			data: { sha: "new-commit-sha" },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).updateRef.mockResolvedValue({});

		await createApiCommit("test-token", "main", "chore: add script");

		expect((mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createTree).toHaveBeenCalledWith(
			expect.objectContaining({
				tree: expect.arrayContaining([
					expect.objectContaining({
						mode: "100755",
					}),
				]),
			}),
		);
	});

	it("should use force=true when parentBranch differs from branch", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			options?.listeners?.stdout?.(Buffer.from("M  file.ts\0"));
			return 0;
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).getRef.mockResolvedValue({
			data: { object: { sha: "parent-sha" } },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).getCommit.mockResolvedValue({
			data: { tree: { sha: "base-tree-sha" } },
		});

		vi.mocked(readFile).mockResolvedValue(Buffer.from("content"));
		vi.mocked(stat).mockResolvedValue({ mode: 0o100644 } as Awaited<ReturnType<typeof stat>>);

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createBlob.mockResolvedValue({
			data: { sha: "blob-sha" },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createTree.mockResolvedValue({
			data: { sha: "new-tree-sha" },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createCommit.mockResolvedValue({
			data: { sha: "new-commit-sha" },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).updateRef.mockResolvedValue({});

		await createApiCommit("test-token", "release-branch", "chore: release", {
			parentBranch: "main",
		});

		expect((mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).updateRef).toHaveBeenCalledWith(
			expect.objectContaining({
				force: true,
			}),
		);
	});

	it("should use force=false when parentBranch equals branch", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			options?.listeners?.stdout?.(Buffer.from("M  file.ts\0"));
			return 0;
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).getRef.mockResolvedValue({
			data: { object: { sha: "parent-sha" } },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).getCommit.mockResolvedValue({
			data: { tree: { sha: "base-tree-sha" } },
		});

		vi.mocked(readFile).mockResolvedValue(Buffer.from("content"));
		vi.mocked(stat).mockResolvedValue({ mode: 0o100644 } as Awaited<ReturnType<typeof stat>>);

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createBlob.mockResolvedValue({
			data: { sha: "blob-sha" },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createTree.mockResolvedValue({
			data: { sha: "new-tree-sha" },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).createCommit.mockResolvedValue({
			data: { sha: "new-commit-sha" },
		});

		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).updateRef.mockResolvedValue({});

		await createApiCommit("test-token", "main", "chore: release");

		expect((mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).updateRef).toHaveBeenCalledWith(
			expect.objectContaining({
				force: false,
			}),
		);
	});
});

describe("updateBranchToRef", () => {
	let mockOctokit: MockOctokit;

	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });
		mockOctokit = createMockOctokit();

		mockOctokit.rest.git = {
			getRef: vi.fn(),
			updateRef: vi.fn(),
		};

		Object.defineProperty(vi.mocked(context), "repo", {
			value: { owner: "test-owner", repo: "test-repo" },
			writable: true,
		});
		vi.mocked(getOctokit).mockReturnValue(mockOctokit as unknown as ReturnType<typeof getOctokit>);
	});

	afterEach(() => {
		cleanupTestEnvironment();
	});

	it("should update target branch to source branch SHA", async () => {
		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).getRef.mockResolvedValue({
			data: { object: { sha: "source-sha-123" } },
		});
		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).updateRef.mockResolvedValue({});

		const result = await updateBranchToRef("test-token", "release", "main");

		expect(result).toBe("source-sha-123");
		expect((mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).getRef).toHaveBeenCalledWith(
			expect.objectContaining({ ref: "heads/main" }),
		);
		expect((mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).updateRef).toHaveBeenCalledWith(
			expect.objectContaining({
				ref: "heads/release",
				sha: "source-sha-123",
				force: true,
			}),
		);
	});

	it("should support non-force update", async () => {
		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).getRef.mockResolvedValue({
			data: { object: { sha: "source-sha" } },
		});
		(mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).updateRef.mockResolvedValue({});

		await updateBranchToRef("test-token", "release", "main", false);

		expect((mockOctokit.rest.git as Record<string, ReturnType<typeof vi.fn>>).updateRef).toHaveBeenCalledWith(
			expect.objectContaining({ force: false }),
		);
	});
});
