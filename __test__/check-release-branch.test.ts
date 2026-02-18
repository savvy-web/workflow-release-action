import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkReleaseBranch } from "../src/utils/check-release-branch.js";
import { cleanupTestEnvironment, createMockOctokit, setupTestEnvironment } from "./utils/github-mocks.js";
import type { MockOctokit } from "./utils/test-types.js";

// Mock modules
vi.mock("@actions/core");
vi.mock("@actions/github");

describe("check-release-branch", () => {
	let mockOctokit: MockOctokit;

	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });

		// Setup core.getState to return token
		vi.mocked(core.getState).mockReturnValue("test-token");

		// Mock core.summary
		const mockSummary = {
			addHeading: vi.fn().mockReturnThis(),
			addEOL: vi.fn().mockReturnThis(),
			addTable: vi.fn().mockReturnThis(),
			addRaw: vi.fn().mockReturnThis(),
			addCodeBlock: vi.fn().mockReturnThis(),
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

	it("should detect when release branch does not exist", async () => {
		mockOctokit.rest.repos.getBranch.mockRejectedValue(new Error("Not Found"));

		const result = await checkReleaseBranch("changeset-release/main", "main", false);

		expect(result.exists).toBe(false);
		expect(result.hasOpenPr).toBe(false);
		expect(result.prNumber).toBeNull();
		expect(result.checkId).toBe(12345);
	});

	it("should detect when release branch exists with no open PR", async () => {
		mockOctokit.rest.repos.getBranch.mockResolvedValue({
			data: { name: "changeset-release/main", commit: { sha: "abc123" } },
		});
		mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });

		const result = await checkReleaseBranch("changeset-release/main", "main", false);

		expect(result.exists).toBe(true);
		expect(result.hasOpenPr).toBe(false);
		expect(result.prNumber).toBeNull();
	});

	it("should detect when release branch exists with open PR", async () => {
		mockOctokit.rest.repos.getBranch.mockResolvedValue({
			data: { name: "changeset-release/main", commit: { sha: "abc123" } },
		});
		mockOctokit.rest.pulls.list.mockResolvedValue({
			data: [{ number: 123, title: "Release PR", state: "open" }],
		});

		const result = await checkReleaseBranch("changeset-release/main", "main", false);

		expect(result.exists).toBe(true);
		expect(result.hasOpenPr).toBe(true);
		expect(result.prNumber).toBe(123);
	});

	it("should use custom branch names", async () => {
		mockOctokit.rest.repos.getBranch.mockResolvedValue({
			data: { name: "release/v2", commit: { sha: "abc123" } },
		});
		mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });

		const result = await checkReleaseBranch("release/v2", "develop", false);

		expect(result.exists).toBe(true);
		expect(mockOctokit.rest.repos.getBranch).toHaveBeenCalledWith({
			owner: "test-owner",
			repo: "test-repo",
			branch: "release/v2",
		});
	});

	it("should handle 404 error when branch does not exist", async () => {
		const notFoundError = new Error("Not Found") as Error & { status: number };
		notFoundError.status = 404;
		mockOctokit.rest.repos.getBranch.mockRejectedValue(notFoundError);

		const result = await checkReleaseBranch("changeset-release/main", "main", false);

		expect(result.exists).toBe(false);
		expect(core.info).toHaveBeenCalledWith(expect.stringContaining("does not exist"));
	});

	it("should handle non-404 errors when checking branch", async () => {
		const serverError = new Error("Server Error") as Error & { status: number };
		serverError.status = 500;
		mockOctokit.rest.repos.getBranch.mockRejectedValue(serverError);

		const result = await checkReleaseBranch("changeset-release/main", "main", false);

		expect(result.exists).toBe(false);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Failed to check if branch"));
	});

	it("should handle errors when checking for open PRs", async () => {
		mockOctokit.rest.repos.getBranch.mockResolvedValue({
			data: { name: "changeset-release/main", commit: { sha: "abc123" } },
		});
		mockOctokit.rest.pulls.list.mockRejectedValue(new Error("API Error"));

		const result = await checkReleaseBranch("changeset-release/main", "main", false);

		expect(result.exists).toBe(true);
		expect(result.hasOpenPr).toBe(false);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Failed to check for open PRs"));
	});

	it("should include dry-run mode in check output", async () => {
		mockOctokit.rest.repos.getBranch.mockRejectedValue(new Error("Not Found"));

		const result = await checkReleaseBranch("changeset-release/main", "main", true);

		expect(result.checkId).toBe(12345);
		expect(mockOctokit.rest.checks.create).toHaveBeenCalledWith(
			expect.objectContaining({
				name: expect.stringContaining("Dry Run"),
			}),
		);
	});

	it("should handle non-Error throw when checking branch", async () => {
		mockOctokit.rest.repos.getBranch.mockRejectedValue("String error from API"); // Non-Error throw

		const result = await checkReleaseBranch("changeset-release/main", "main", false);

		expect(result.exists).toBe(false);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("String error from API"));
	});

	it("should handle non-Error throw when checking for open PRs", async () => {
		mockOctokit.rest.repos.getBranch.mockResolvedValue({
			data: { name: "changeset-release/main", commit: { sha: "abc123" } },
		});
		mockOctokit.rest.pulls.list.mockRejectedValue("String error from PR list"); // Non-Error throw

		const result = await checkReleaseBranch("changeset-release/main", "main", false);

		expect(result.exists).toBe(true);
		expect(result.hasOpenPr).toBe(false);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("String error from PR list"));
	});
});
