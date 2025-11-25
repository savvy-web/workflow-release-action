import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { linkIssuesFromCommits } from "../src/utils/link-issues-from-commits.js";
import { cleanupTestEnvironment, createMockOctokit, setupTestEnvironment } from "./utils/github-mocks.js";
import type { MockOctokit } from "./utils/test-types.js";

// Mock modules
vi.mock("@actions/core");
vi.mock("@actions/github");

describe("link-issues-from-commits", () => {
	let mockOctokit: MockOctokit;

	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });

		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "token") return "test-token";
			if (name === "release-branch") return "changeset-release/main";
			if (name === "target-branch") return "main";
			return "";
		});
		vi.mocked(core.getBooleanInput).mockImplementation((name: string) => {
			if (name === "dry-run") return false;
			return false;
		});

		// Mock core.summary
		const mockSummary = {
			addHeading: vi.fn().mockReturnThis(),
			addEOL: vi.fn().mockReturnThis(),
			addTable: vi.fn().mockReturnThis(),
			addRaw: vi.fn().mockReturnThis(),
			write: vi.fn().mockResolvedValue(undefined),
			stringify: vi.fn().mockReturnValue(""),
		};
		Object.defineProperty(core, "summary", { value: mockSummary, writable: true });

		mockOctokit = createMockOctokit();
		vi.mocked(getOctokit).mockReturnValue(mockOctokit as unknown as ReturnType<typeof getOctokit>);
		Object.defineProperty(vi.mocked(context), "repo", {
			value: { owner: "test-owner", repo: "test-repo" },
			writable: true,
		});
		Object.defineProperty(vi.mocked(context), "sha", { value: "abc123", writable: true });
	});

	afterEach(() => {
		cleanupTestEnvironment();
	});

	it("should find no issues when commits have no references", async () => {
		mockOctokit.rest.repos.compareCommits.mockResolvedValue({
			data: {
				commits: [
					{ sha: "abc123", commit: { message: "feat: add new feature", author: { name: "Test User" } } },
					{ sha: "def456", commit: { message: "fix: bug fix", author: { name: "Test User" } } },
				],
			},
		});

		const result = await linkIssuesFromCommits();

		expect(result.linkedIssues).toEqual([]);
		expect(result.commits).toHaveLength(2);
		expect(result.checkId).toBe(12345);
	});

	it("should extract issue references from commits", async () => {
		mockOctokit.rest.repos.compareCommits.mockResolvedValue({
			data: {
				commits: [
					{ sha: "abc123", commit: { message: "feat: add feature\n\nCloses #42", author: { name: "Test User" } } },
					{ sha: "def456", commit: { message: "fix: bug fix\n\nFixes #123", author: { name: "Test User" } } },
				],
			},
		});
		mockOctokit.rest.issues.get
			.mockResolvedValueOnce({
				data: { number: 42, title: "Feature request", state: "open", html_url: "https://github.com/test/issues/42" },
			})
			.mockResolvedValueOnce({
				data: { number: 123, title: "Bug report", state: "closed", html_url: "https://github.com/test/issues/123" },
			});

		const result = await linkIssuesFromCommits();

		expect(result.linkedIssues).toHaveLength(2);
		expect(result.linkedIssues[0].number).toBe(42);
		expect(result.linkedIssues[0].title).toBe("Feature request");
		expect(result.linkedIssues[1].number).toBe(123);
	});

	it("should handle multiple issue patterns (closes, fixes, resolves)", async () => {
		mockOctokit.rest.repos.compareCommits.mockResolvedValue({
			data: {
				commits: [
					{ sha: "aaa111", commit: { message: "Close #1", author: { name: "Test" } } },
					{ sha: "bbb222", commit: { message: "Fixes #2", author: { name: "Test" } } },
					{ sha: "ccc333", commit: { message: "Resolves #3", author: { name: "Test" } } },
					{ sha: "ddd444", commit: { message: "fixed #4", author: { name: "Test" } } },
				],
			},
		});
		mockOctokit.rest.issues.get.mockResolvedValue({
			data: { number: 1, title: "Issue", state: "open", html_url: "https://github.com/test/issues/1" },
		});

		const result = await linkIssuesFromCommits();

		expect(result.linkedIssues).toHaveLength(4);
		expect(mockOctokit.rest.issues.get).toHaveBeenCalledTimes(4);
	});

	it("should deduplicate issues referenced in multiple commits", async () => {
		mockOctokit.rest.repos.compareCommits.mockResolvedValue({
			data: {
				commits: [
					{ sha: "abc123", commit: { message: "part 1\n\nFixes #42", author: { name: "Test" } } },
					{ sha: "def456", commit: { message: "part 2\n\nCloses #42", author: { name: "Test" } } },
				],
			},
		});
		mockOctokit.rest.issues.get.mockResolvedValue({
			data: { number: 42, title: "Issue", state: "open", html_url: "https://github.com/test/issues/42" },
		});

		const result = await linkIssuesFromCommits();

		expect(result.linkedIssues).toHaveLength(1);
		expect(result.linkedIssues[0].commits).toContain("abc123");
		expect(result.linkedIssues[0].commits).toContain("def456");
		expect(mockOctokit.rest.issues.get).toHaveBeenCalledTimes(1);
	});

	it("should handle failed issue fetch gracefully", async () => {
		mockOctokit.rest.repos.compareCommits.mockResolvedValue({
			data: {
				commits: [{ sha: "abc123", commit: { message: "Fixes #999", author: { name: "Test" } } }],
			},
		});
		mockOctokit.rest.issues.get.mockRejectedValue(new Error("Issue not found"));

		const result = await linkIssuesFromCommits();

		expect(result.linkedIssues).toEqual([]);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Failed to fetch issue #999"));
	});

	it("should include dry-run mode in check output", async () => {
		vi.mocked(core.getBooleanInput).mockImplementation((name: string) => {
			if (name === "dry-run") return true;
			return false;
		});
		mockOctokit.rest.repos.compareCommits.mockResolvedValue({
			data: { commits: [] },
		});

		const result = await linkIssuesFromCommits();

		expect(result.checkId).toBe(12345);
		expect(mockOctokit.rest.checks.create).toHaveBeenCalledWith(
			expect.objectContaining({
				name: expect.stringContaining("Dry Run"),
			}),
		);
	});

	it("should track commits that reference each issue", async () => {
		mockOctokit.rest.repos.compareCommits.mockResolvedValue({
			data: {
				commits: [
					{ sha: "commit1", commit: { message: "start work fixes #10", author: { name: "Test" } } },
					{ sha: "commit2", commit: { message: "more work closes #10", author: { name: "Test" } } },
				],
			},
		});
		mockOctokit.rest.issues.get.mockResolvedValue({
			data: { number: 10, title: "Work", state: "open", html_url: "https://github.com/test/issues/10" },
		});

		const result = await linkIssuesFromCommits();

		expect(result.linkedIssues[0].commits).toHaveLength(2);
		expect(result.linkedIssues[0].commits).toContain("commit1");
		expect(result.linkedIssues[0].commits).toContain("commit2");
	});

	it("should use 'Unknown' when commit author is missing", async () => {
		mockOctokit.rest.repos.compareCommits.mockResolvedValue({
			data: {
				commits: [{ sha: "abc123", commit: { message: "Fixes #42", author: null } }],
			},
		});
		mockOctokit.rest.issues.get.mockResolvedValue({
			data: { number: 42, title: "Issue", state: "open", html_url: "https://github.com/test/issues/42" },
		});

		const result = await linkIssuesFromCommits();

		expect(result.linkedIssues).toHaveLength(1);
		expect(result.commits).toHaveLength(1);
	});

	it("should handle commit author without name property", async () => {
		mockOctokit.rest.repos.compareCommits.mockResolvedValue({
			data: {
				commits: [{ sha: "abc123", commit: { message: "Closes #5", author: {} } }],
			},
		});
		mockOctokit.rest.issues.get.mockResolvedValue({
			data: { number: 5, title: "Issue", state: "open", html_url: "https://github.com/test/issues/5" },
		});

		const result = await linkIssuesFromCommits();

		expect(result.linkedIssues).toHaveLength(1);
	});

	it("should use default branch names when inputs are empty", async () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "token") return "test-token";
			if (name === "release-branch") return ""; // Empty to trigger default
			if (name === "target-branch") return ""; // Empty to trigger default
			return "";
		});
		mockOctokit.rest.repos.compareCommits.mockResolvedValue({
			data: { commits: [] },
		});

		await linkIssuesFromCommits();

		// Verify the default branch names were used
		expect(mockOctokit.rest.repos.compareCommits).toHaveBeenCalledWith(
			expect.objectContaining({
				base: "main", // Default target-branch
				head: "changeset-release/main", // Default release-branch
			}),
		);
	});

	it("should handle non-Error throw from issues.get", async () => {
		mockOctokit.rest.repos.compareCommits.mockResolvedValue({
			data: {
				commits: [{ sha: "abc123", commit: { message: "Fixes #42", author: { name: "Test" } } }],
			},
		});
		// Throw a non-Error value to hit the String(error) path
		mockOctokit.rest.issues.get.mockRejectedValue("String error");

		const result = await linkIssuesFromCommits();

		expect(result.linkedIssues).toEqual([]);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("String error"));
	});
});
