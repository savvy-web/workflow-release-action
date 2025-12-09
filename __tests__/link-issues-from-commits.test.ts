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

		// Setup core.getState to return token
		vi.mocked(core.getState).mockReturnValue("test-token");

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
		// Mock tags to use compareCommits path
		mockOctokit.rest.repos.listTags.mockResolvedValue({
			data: [{ name: "v1.0.0", commit: { sha: "tag-sha" } }],
		});
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
		// Mock tags to use compareCommits path
		mockOctokit.rest.repos.listTags.mockResolvedValue({
			data: [{ name: "v1.0.0", commit: { sha: "tag-sha" } }],
		});
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
		// Mock tags to use compareCommits path
		mockOctokit.rest.repos.listTags.mockResolvedValue({
			data: [{ name: "v1.0.0", commit: { sha: "tag-sha" } }],
		});
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
		// Mock tags to use compareCommits path
		mockOctokit.rest.repos.listTags.mockResolvedValue({
			data: [{ name: "v1.0.0", commit: { sha: "tag-sha" } }],
		});
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
		// Mock tags to use compareCommits path
		mockOctokit.rest.repos.listTags.mockResolvedValue({
			data: [{ name: "v1.0.0", commit: { sha: "tag-sha" } }],
		});
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
		// Mock tags to use compareCommits path
		mockOctokit.rest.repos.listTags.mockResolvedValue({
			data: [{ name: "v1.0.0", commit: { sha: "tag-sha" } }],
		});
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
		// Mock tags to use compareCommits path
		mockOctokit.rest.repos.listTags.mockResolvedValue({
			data: [{ name: "v1.0.0", commit: { sha: "tag-sha" } }],
		});
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
		// Mock tags to use compareCommits path
		mockOctokit.rest.repos.listTags.mockResolvedValue({
			data: [{ name: "v1.0.0", commit: { sha: "tag-sha" } }],
		});
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

	it("should use default target branch and look back from latest tag", async () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "token") return "test-token";
			if (name === "release-branch") return ""; // Empty to trigger default
			if (name === "target-branch") return ""; // Empty to trigger default
			return "";
		});

		// Mock tags API to return a tag
		mockOctokit.rest.repos.listTags.mockResolvedValue({
			data: [{ name: "v1.0.0", commit: { sha: "tag-sha-123" } }],
		});

		mockOctokit.rest.repos.compareCommits.mockResolvedValue({
			data: { commits: [] },
		});

		await linkIssuesFromCommits();

		// Verify it compares from latest tag to target branch
		expect(mockOctokit.rest.repos.compareCommits).toHaveBeenCalledWith(
			expect.objectContaining({
				base: "tag-sha-123", // Latest tag SHA
				head: "main", // Default target-branch
			}),
		);
	});

	it("should handle non-Error throw from issues.get", async () => {
		// Mock tags to use compareCommits path
		mockOctokit.rest.repos.listTags.mockResolvedValue({
			data: [{ name: "v1.0.0", commit: { sha: "tag-sha" } }],
		});
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

	it("should extract PR number from merge commit and query linked issues", async () => {
		// Mock tags to use compareCommits path
		mockOctokit.rest.repos.listTags.mockResolvedValue({
			data: [{ name: "v1.0.0", commit: { sha: "tag-sha" } }],
		});
		// Mock a merge commit with PR number in message
		mockOctokit.rest.repos.compareCommits.mockResolvedValue({
			data: {
				commits: [
					{
						sha: "merge123",
						commit: {
							message: "feat: add new feature (#108)",
							author: { name: "GitHub" },
						},
					},
				],
			},
		});

		// Mock GraphQL response with linked issues
		mockOctokit.graphql.mockResolvedValue({
			repository: {
				pullRequest: {
					closingIssuesReferences: {
						nodes: [
							{
								number: 42,
								title: "Feature request",
								state: "OPEN",
								url: "https://github.com/test-owner/test-repo/issues/42",
							},
						],
					},
				},
			},
		});

		const result = await linkIssuesFromCommits();

		// Verify GraphQL was called for PR #108
		expect(mockOctokit.graphql).toHaveBeenCalledWith(
			expect.stringContaining("closingIssuesReferences"),
			expect.objectContaining({
				owner: "test-owner",
				repo: "test-repo",
				prNumber: 108,
			}),
		);

		// Verify linked issue was found
		expect(result.linkedIssues).toHaveLength(1);
		expect(result.linkedIssues[0]).toMatchObject({
			number: 42,
			title: "Feature request",
			state: "open",
		});
	});

	it("should paginate through all commits when no tags exist", async () => {
		// Mock listTags to return empty array
		mockOctokit.rest.repos.listTags.mockResolvedValue({
			data: [],
		});

		// Mock listCommits to return paginated results
		mockOctokit.rest.repos.listCommits
			.mockResolvedValueOnce({
				data: Array(100)
					.fill(null)
					.map((_, i) => ({
						sha: `commit${i}`,
						commit: { message: `Commit ${i}`, author: { name: "Dev" } },
					})),
			})
			.mockResolvedValueOnce({
				data: Array(50)
					.fill(null)
					.map((_, i) => ({
						sha: `commit${i + 100}`,
						commit: { message: `Commit ${i + 100}`, author: { name: "Dev" } },
					})),
			});

		const result = await linkIssuesFromCommits();

		// Verify it fetched all commits via pagination
		expect(mockOctokit.rest.repos.listCommits).toHaveBeenCalledTimes(2);
		expect(mockOctokit.rest.repos.listCommits).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				owner: "test-owner",
				repo: "test-repo",
				sha: "main",
				per_page: 100,
				page: 1,
			}),
		);
		expect(mockOctokit.rest.repos.listCommits).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				page: 2,
			}),
		);
		expect(result.commits).toHaveLength(150);
	});

	it("should handle GraphQL errors gracefully when fetching PR linked issues", async () => {
		mockOctokit.rest.repos.compareCommits.mockResolvedValue({
			data: {
				commits: [
					{
						sha: "merge123",
						commit: {
							message: "feat: add feature (#99)",
							author: { name: "GitHub" },
						},
					},
				],
			},
		});

		// Mock GraphQL to throw error
		mockOctokit.graphql.mockRejectedValue(new Error("GraphQL API error"));

		const result = await linkIssuesFromCommits();

		// Should not throw, but return empty linked issues
		expect(result.linkedIssues).toEqual([]);
	});

	it("should combine issues from both commit messages and PR GraphQL queries", async () => {
		// Mock tags to use compareCommits path
		mockOctokit.rest.repos.listTags.mockResolvedValue({
			data: [{ name: "v1.0.0", commit: { sha: "tag-sha" } }],
		});
		mockOctokit.rest.repos.compareCommits.mockResolvedValue({
			data: {
				commits: [
					{
						sha: "commit1",
						commit: {
							message: "fix: resolve bug\n\nCloses #10",
							author: { name: "Dev" },
						},
					},
					{
						sha: "merge2",
						commit: {
							message: "feat: new feature (#20)",
							author: { name: "GitHub" },
						},
					},
				],
			},
		});

		// Mock GraphQL for PR #20
		mockOctokit.graphql.mockResolvedValue({
			repository: {
				pullRequest: {
					closingIssuesReferences: {
						nodes: [
							{
								number: 30,
								title: "Feature request",
								state: "OPEN",
								url: "https://github.com/test-owner/test-repo/issues/30",
							},
						],
					},
				},
			},
		});

		// Mock REST API for issue #10 (from commit message)
		mockOctokit.rest.issues.get.mockResolvedValue({
			data: {
				title: "Bug report",
				state: "open",
				html_url: "https://github.com/test-owner/test-repo/issues/10",
			},
		});

		const result = await linkIssuesFromCommits();

		// Should have both issues
		expect(result.linkedIssues).toHaveLength(2);
		expect(result.linkedIssues.map((i) => i.number).sort()).toEqual([10, 30]);
	});

	it("should add comments to issues to create cross-references", async () => {
		// Mock tags to use compareCommits path
		mockOctokit.rest.repos.listTags.mockResolvedValue({
			data: [{ name: "v1.0.0", commit: { sha: "tag-sha" } }],
		});
		mockOctokit.rest.repos.compareCommits.mockResolvedValue({
			data: {
				commits: [{ sha: "abc123", commit: { message: "Closes #42", author: { name: "Test" } } }],
			},
		});
		mockOctokit.rest.issues.get.mockResolvedValue({
			data: {
				number: 42,
				title: "Issue",
				state: "open",
				html_url: "https://github.com/test/issues/42",
				node_id: "I_42",
			},
		});

		// Mock PR associated with commit
		mockOctokit.rest.repos.listPullRequestsAssociatedWithCommit.mockResolvedValue({
			data: [{ number: 109, title: "Release PR" }],
		});

		// Mock GraphQL timeline query (no existing cross-reference)
		mockOctokit.graphql
			.mockResolvedValueOnce({
				repository: {
					issue: {
						timelineItems: {
							nodes: [],
						},
					},
				},
			})
			// Mock GraphQL addComment mutation
			.mockResolvedValueOnce({
				addComment: {
					commentEdge: {
						node: { id: "IC_123" },
					},
				},
			});

		await linkIssuesFromCommits();

		// Verify timeline was queried (first call)
		expect(mockOctokit.graphql).toHaveBeenNthCalledWith(
			1,
			expect.stringContaining("timelineItems"),
			expect.objectContaining({
				issueNumber: 42,
				prNumber: 109,
			}),
		);

		// Verify comment was added (second call)
		expect(mockOctokit.graphql).toHaveBeenNthCalledWith(
			2,
			expect.stringContaining("addComment"),
			expect.objectContaining({
				subjectId: "I_42",
				body: expect.stringContaining("#109"),
			}),
		);

		expect(core.info).toHaveBeenCalledWith("  ✓ Added cross-reference comment to issue #42");
		expect(core.info).toHaveBeenCalledWith("✓ Successfully linked 1 issue(s) to PR #109");
	});

	it("should not duplicate cross-references if already linked", async () => {
		// Mock tags
		mockOctokit.rest.repos.listTags.mockResolvedValue({
			data: [{ name: "v1.0.0", commit: { sha: "tag-sha" } }],
		});
		mockOctokit.rest.repos.compareCommits.mockResolvedValue({
			data: {
				commits: [{ sha: "abc123", commit: { message: "Closes #42", author: { name: "Test" } } }],
			},
		});
		mockOctokit.rest.issues.get.mockResolvedValue({
			data: {
				number: 42,
				title: "Issue",
				state: "open",
				html_url: "https://github.com/test/issues/42",
				node_id: "I_42",
			},
		});

		// Mock PR associated with commit
		mockOctokit.rest.repos.listPullRequestsAssociatedWithCommit.mockResolvedValue({
			data: [{ number: 109, title: "Release PR" }],
		});

		// Mock GraphQL timeline query (existing cross-reference found)
		mockOctokit.graphql.mockResolvedValueOnce({
			repository: {
				issue: {
					timelineItems: {
						nodes: [
							{
								__typename: "CrossReferencedEvent",
								source: {
									__typename: "PullRequest",
									number: 109,
								},
							},
						],
					},
				},
			},
		});

		await linkIssuesFromCommits();

		// Verify timeline was queried
		expect(mockOctokit.graphql).toHaveBeenCalledWith(
			expect.stringContaining("timelineItems"),
			expect.objectContaining({
				issueNumber: 42,
				prNumber: 109,
			}),
		);

		// Verify addComment was NOT called since already linked
		expect(mockOctokit.graphql).not.toHaveBeenCalledWith(expect.stringContaining("addComment"), expect.anything());
		expect(core.info).toHaveBeenCalledWith("  Issue #42 already linked to PR #109");
		expect(core.info).toHaveBeenCalledWith("All issues already linked to PR");
	});

	it("should skip linking in dry-run mode", async () => {
		vi.mocked(core.getBooleanInput).mockImplementation((name: string) => {
			if (name === "dry-run") return true;
			return false;
		});

		// Mock tags
		mockOctokit.rest.repos.listTags.mockResolvedValue({
			data: [{ name: "v1.0.0", commit: { sha: "tag-sha" } }],
		});
		mockOctokit.rest.repos.compareCommits.mockResolvedValue({
			data: {
				commits: [{ sha: "abc123", commit: { message: "Closes #42", author: { name: "Test" } } }],
			},
		});
		mockOctokit.rest.issues.get.mockResolvedValue({
			data: {
				number: 42,
				title: "Issue",
				state: "open",
				html_url: "https://github.com/test/issues/42",
				node_id: "I_42",
			},
		});

		await linkIssuesFromCommits();

		// Verify PR lookup was NOT called in dry-run mode
		expect(mockOctokit.rest.repos.listPullRequestsAssociatedWithCommit).not.toHaveBeenCalled();
		// Verify GraphQL timeline query was NOT called
		expect(mockOctokit.graphql).not.toHaveBeenCalledWith(expect.stringContaining("timelineItems"), expect.anything());
		// Verify addComment was NOT called
		expect(mockOctokit.graphql).not.toHaveBeenCalledWith(expect.stringContaining("addComment"), expect.anything());
	});

	it("should handle missing PR gracefully", async () => {
		// Mock tags
		mockOctokit.rest.repos.listTags.mockResolvedValue({
			data: [{ name: "v1.0.0", commit: { sha: "tag-sha" } }],
		});
		mockOctokit.rest.repos.compareCommits.mockResolvedValue({
			data: {
				commits: [{ sha: "abc123", commit: { message: "Closes #42", author: { name: "Test" } } }],
			},
		});
		mockOctokit.rest.issues.get.mockResolvedValue({
			data: {
				number: 42,
				title: "Issue",
				state: "open",
				html_url: "https://github.com/test/issues/42",
				node_id: "I_42",
			},
		});

		// Mock no PR found
		mockOctokit.rest.repos.listPullRequestsAssociatedWithCommit.mockResolvedValue({
			data: [],
		});

		await linkIssuesFromCommits();

		// Should not throw, just skip linking
		expect(core.warning).toHaveBeenCalledWith("No PR found for current commit, skipping issue linking");
		// Verify GraphQL was NOT called when no PR exists
		expect(mockOctokit.graphql).not.toHaveBeenCalled();
	});
});
