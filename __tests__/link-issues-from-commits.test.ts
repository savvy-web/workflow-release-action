import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import linkIssuesFromCommits from "../.github/actions/setup-release/link-issues-from-commits.js";
import type { AsyncFunctionArguments } from "../.github/actions/shared/types.js";
import type { MockCore } from "./utils/github-mocks.js";
import { createMockAsyncFunctionArguments, createMockCore } from "./utils/github-mocks.js";

describe("link-issues-from-commits", () => {
	let mockCore: MockCore;
	let mockArgs: AsyncFunctionArguments;

	let mockGithub: {
		rest: {
			repos: {
				compareCommits: ReturnType<typeof vi.fn>;
			};
			issues: {
				get: ReturnType<typeof vi.fn>;
			};
			checks: {
				create: ReturnType<typeof vi.fn>;
			};
		};
	};

	beforeEach(() => {
		vi.clearAllMocks();

		mockCore = createMockCore();

		mockGithub = {
			rest: {
				repos: {
					compareCommits: vi.fn(),
				},
				issues: {
					get: vi.fn(),
				},
				checks: {
					create: vi.fn(),
				},
			},
		};

		mockArgs = createMockAsyncFunctionArguments({
			core: mockCore as never,
			github: mockGithub as never,
			context: {
				repo: {
					owner: "test-owner",
					repo: "test-repo",
				},
				sha: "abc123",
				runId: 12345,
			} as never,
		});

		// Default successful check creation
		mockGithub.rest.checks.create.mockResolvedValue({
			data: {
				id: 999,
				html_url: "https://github.com/test-owner/test-repo/runs/999",
			},
		} as never);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		delete process.env.RELEASE_BRANCH;
		delete process.env.TARGET_BRANCH;
		delete process.env.DRY_RUN;
	});

	describe("issue reference extraction", () => {
		it("should extract issue references with closes pattern", async () => {
			process.env.RELEASE_BRANCH = "release";
			process.env.TARGET_BRANCH = "main";

			mockGithub.rest.repos.compareCommits.mockResolvedValueOnce({
				data: {
					commits: [
						{
							sha: "commit1",
							commit: {
								message: "closes #123",
								author: { name: "Test Author" },
							},
						},
					],
				},
			} as never);

			mockGithub.rest.issues.get.mockResolvedValueOnce({
				data: {
					title: "Test Issue",
					state: "open",
					html_url: "https://github.com/test-owner/test-repo/issues/123",
				},
			} as never);

			await linkIssuesFromCommits(mockArgs);

			expect(mockGithub.rest.issues.get).toHaveBeenCalledWith({
				owner: "test-owner",
				repo: "test-repo",
				issue_number: 123,
			});

			expect(mockCore.setOutput).toHaveBeenCalledWith(
				"linked_issues",
				JSON.stringify([
					{
						number: 123,
						title: "Test Issue",
						state: "open",
						url: "https://github.com/test-owner/test-repo/issues/123",
						commits: ["commit1"],
					},
				]),
			);
		});

		it("should extract issue references with fixes pattern", async () => {
			process.env.RELEASE_BRANCH = "release";
			process.env.TARGET_BRANCH = "main";

			mockGithub.rest.repos.compareCommits.mockResolvedValueOnce({
				data: {
					commits: [
						{
							sha: "commit2",
							commit: {
								message: "fixes #456",
								author: { name: "Test Author" },
							},
						},
					],
				},
			} as never);

			mockGithub.rest.issues.get.mockResolvedValueOnce({
				data: {
					title: "Bug Fix",
					state: "closed",
					html_url: "https://github.com/test-owner/test-repo/issues/456",
				},
			} as never);

			await linkIssuesFromCommits(mockArgs);

			expect(mockGithub.rest.issues.get).toHaveBeenCalledWith({
				owner: "test-owner",
				repo: "test-repo",
				issue_number: 456,
			});
		});

		it("should extract issue references with resolves pattern", async () => {
			process.env.RELEASE_BRANCH = "release";
			process.env.TARGET_BRANCH = "main";

			mockGithub.rest.repos.compareCommits.mockResolvedValueOnce({
				data: {
					commits: [
						{
							sha: "commit3",
							commit: {
								message: "resolves #789",
								author: { name: "Test Author" },
							},
						},
					],
				},
			} as never);

			mockGithub.rest.issues.get.mockResolvedValueOnce({
				data: {
					title: "Feature Request",
					state: "closed",
					html_url: "https://github.com/test-owner/test-repo/issues/789",
				},
			} as never);

			await linkIssuesFromCommits(mockArgs);

			expect(mockGithub.rest.issues.get).toHaveBeenCalledWith({
				owner: "test-owner",
				repo: "test-repo",
				issue_number: 789,
			});
		});

		it("should extract multiple issue references from single commit", async () => {
			process.env.RELEASE_BRANCH = "release";
			process.env.TARGET_BRANCH = "main";

			mockGithub.rest.repos.compareCommits.mockResolvedValueOnce({
				data: {
					commits: [
						{
							sha: "commit4",
							commit: {
								message: "closes #100 and fixes #200",
								author: { name: "Test Author" },
							},
						},
					],
				},
			} as never);

			mockGithub.rest.issues.get
				.mockResolvedValueOnce({
					data: {
						title: "Issue 100",
						state: "open",
						html_url: "https://github.com/test-owner/test-repo/issues/100",
					},
				} as never)
				.mockResolvedValueOnce({
					data: {
						title: "Issue 200",
						state: "closed",
						html_url: "https://github.com/test-owner/test-repo/issues/200",
					},
				} as never);

			await linkIssuesFromCommits(mockArgs);

			expect(mockGithub.rest.issues.get).toHaveBeenCalledTimes(2);
			const linkedIssues = JSON.parse(
				mockCore.setOutput.mock.calls.find((call: string[]) => call[0] === "linked_issues")?.[1] as string,
			);
			expect(linkedIssues).toHaveLength(2);
		});

		it("should handle case insensitive patterns", async () => {
			process.env.RELEASE_BRANCH = "release";
			process.env.TARGET_BRANCH = "main";

			mockGithub.rest.repos.compareCommits.mockResolvedValueOnce({
				data: {
					commits: [
						{
							sha: "commit5",
							commit: {
								message: "CLOSES #111, Fixes #222, ReSOLVeS #333",
								author: { name: "Test Author" },
							},
						},
					],
				},
			} as never);

			mockGithub.rest.issues.get
				.mockResolvedValueOnce({
					data: {
						title: "Issue 111",
						state: "open",
						html_url: "https://github.com/test-owner/test-repo/issues/111",
					},
				} as never)
				.mockResolvedValueOnce({
					data: {
						title: "Issue 222",
						state: "open",
						html_url: "https://github.com/test-owner/test-repo/issues/222",
					},
				} as never)
				.mockResolvedValueOnce({
					data: {
						title: "Issue 333",
						state: "open",
						html_url: "https://github.com/test-owner/test-repo/issues/333",
					},
				} as never);

			await linkIssuesFromCommits(mockArgs);

			expect(mockGithub.rest.issues.get).toHaveBeenCalledTimes(3);
		});

		it("should handle plural forms (closed, fixed, resolved)", async () => {
			process.env.RELEASE_BRANCH = "release";
			process.env.TARGET_BRANCH = "main";

			mockGithub.rest.repos.compareCommits.mockResolvedValueOnce({
				data: {
					commits: [
						{
							sha: "commit6",
							commit: {
								message: "closed #11, fixed #22, resolved #33",
								author: { name: "Test Author" },
							},
						},
					],
				},
			} as never);

			mockGithub.rest.issues.get
				.mockResolvedValueOnce({
					data: {
						title: "Issue 11",
						state: "closed",
						html_url: "https://github.com/test-owner/test-repo/issues/11",
					},
				} as never)
				.mockResolvedValueOnce({
					data: {
						title: "Issue 22",
						state: "closed",
						html_url: "https://github.com/test-owner/test-repo/issues/22",
					},
				} as never)
				.mockResolvedValueOnce({
					data: {
						title: "Issue 33",
						state: "closed",
						html_url: "https://github.com/test-owner/test-repo/issues/33",
					},
				} as never);

			await linkIssuesFromCommits(mockArgs);

			expect(mockGithub.rest.issues.get).toHaveBeenCalledTimes(3);
		});
	});

	describe("commit processing", () => {
		it("should process multiple commits and deduplicate issue references", async () => {
			process.env.RELEASE_BRANCH = "release";
			process.env.TARGET_BRANCH = "main";

			mockGithub.rest.repos.compareCommits.mockResolvedValueOnce({
				data: {
					commits: [
						{
							sha: "commit1",
							commit: {
								message: "closes #500",
								author: { name: "Author 1" },
							},
						},
						{
							sha: "commit2",
							commit: {
								message: "also closes #500",
								author: { name: "Author 2" },
							},
						},
						{
							sha: "commit3",
							commit: {
								message: "fixes #600",
								author: { name: "Author 3" },
							},
						},
					],
				},
			} as never);

			mockGithub.rest.issues.get
				.mockResolvedValueOnce({
					data: {
						title: "Issue 500",
						state: "open",
						html_url: "https://github.com/test-owner/test-repo/issues/500",
					},
				} as never)
				.mockResolvedValueOnce({
					data: {
						title: "Issue 600",
						state: "open",
						html_url: "https://github.com/test-owner/test-repo/issues/600",
					},
				} as never);

			await linkIssuesFromCommits(mockArgs);

			// Should only fetch each unique issue once
			expect(mockGithub.rest.issues.get).toHaveBeenCalledTimes(2);

			const linkedIssues = JSON.parse(
				mockCore.setOutput.mock.calls.find((call: string[]) => call[0] === "linked_issues")?.[1] as string,
			);

			// Issue 500 should have both commits
			const issue500 = linkedIssues.find((issue: { number: number }) => issue.number === 500);
			expect(issue500.commits).toEqual(["commit1", "commit2"]);

			// Issue 600 should have one commit
			const issue600 = linkedIssues.find((issue: { number: number }) => issue.number === 600);
			expect(issue600.commits).toEqual(["commit3"]);
		});

		it("should handle commits with no issue references", async () => {
			process.env.RELEASE_BRANCH = "release";
			process.env.TARGET_BRANCH = "main";

			mockGithub.rest.repos.compareCommits.mockResolvedValueOnce({
				data: {
					commits: [
						{
							sha: "commit1",
							commit: {
								message: "update documentation",
								author: { name: "Test Author" },
							},
						},
						{
							sha: "commit2",
							commit: {
								message: "refactor code",
								author: { name: "Test Author" },
							},
						},
					],
				},
			} as never);

			await linkIssuesFromCommits(mockArgs);

			expect(mockGithub.rest.issues.get).not.toHaveBeenCalled();
			expect(mockCore.notice).toHaveBeenCalledWith("✓ No issue references found in commits");
			expect(mockCore.setOutput).toHaveBeenCalledWith("linked_issues", JSON.stringify([]));
		});
	});

	describe("error handling", () => {
		it("should handle API errors when fetching issue details", async () => {
			process.env.RELEASE_BRANCH = "release";
			process.env.TARGET_BRANCH = "main";

			mockGithub.rest.repos.compareCommits.mockResolvedValueOnce({
				data: {
					commits: [
						{
							sha: "commit1",
							commit: {
								message: "closes #404",
								author: { name: "Test Author" },
							},
						},
					],
				},
			} as never);

			mockGithub.rest.issues.get.mockRejectedValueOnce(new Error("Issue not found"));

			await linkIssuesFromCommits(mockArgs);

			expect(mockCore.warning).toHaveBeenCalledWith("Failed to fetch issue #404: Issue not found");
			expect(mockCore.setOutput).toHaveBeenCalledWith("linked_issues", JSON.stringify([]));
		});

		it("should handle non-Error exceptions when fetching issues", async () => {
			process.env.RELEASE_BRANCH = "release";
			process.env.TARGET_BRANCH = "main";

			mockGithub.rest.repos.compareCommits.mockResolvedValueOnce({
				data: {
					commits: [
						{
							sha: "commit1",
							commit: {
								message: "closes #999",
								author: { name: "Test Author" },
							},
						},
					],
				},
			} as never);

			mockGithub.rest.issues.get.mockRejectedValueOnce("string error");

			await linkIssuesFromCommits(mockArgs);

			expect(mockCore.warning).toHaveBeenCalledWith("Failed to fetch issue #999: string error");
		});

		it("should handle errors in commit comparison", async () => {
			process.env.RELEASE_BRANCH = "release";
			process.env.TARGET_BRANCH = "main";

			mockGithub.rest.repos.compareCommits.mockRejectedValueOnce(new Error("Branch not found"));

			await linkIssuesFromCommits(mockArgs);

			expect(mockCore.setFailed).toHaveBeenCalledWith("Failed to link issues from commits: Branch not found");
		});

		it("should handle non-Error exceptions in main function", async () => {
			process.env.RELEASE_BRANCH = "release";
			process.env.TARGET_BRANCH = "main";

			mockGithub.rest.repos.compareCommits.mockRejectedValueOnce("string error");

			await linkIssuesFromCommits(mockArgs);

			expect(mockCore.setFailed).toHaveBeenCalledWith("Failed to link issues from commits: string error");
		});
	});

	describe("dry-run mode", () => {
		it("should indicate dry-run in check title and summary", async () => {
			process.env.RELEASE_BRANCH = "release";
			process.env.TARGET_BRANCH = "main";
			process.env.DRY_RUN = "true";

			mockGithub.rest.repos.compareCommits.mockResolvedValueOnce({
				data: {
					commits: [
						{
							sha: "commit1",
							commit: {
								message: "closes #700",
								author: { name: "Test Author" },
							},
						},
					],
				},
			} as never);

			mockGithub.rest.issues.get.mockResolvedValueOnce({
				data: {
					title: "Test Issue",
					state: "open",
					html_url: "https://github.com/test-owner/test-repo/issues/700",
				},
			} as never);

			await linkIssuesFromCommits(mockArgs);

			expect(mockCore.notice).toHaveBeenCalledWith("🧪 Running in dry-run mode (preview only)");
			expect(mockGithub.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "🧪 Link Issues from Commits (Dry Run)",
				}),
			);
		});
	});

	describe("outputs and logging", () => {
		it("should set all outputs correctly", async () => {
			process.env.RELEASE_BRANCH = "release";
			process.env.TARGET_BRANCH = "main";

			mockGithub.rest.repos.compareCommits.mockResolvedValueOnce({
				data: {
					commits: [
						{
							sha: "abc123",
							commit: {
								message: "closes #800",
								author: { name: "Test Author" },
							},
						},
					],
				},
			} as never);

			mockGithub.rest.issues.get.mockResolvedValueOnce({
				data: {
					title: "Test Issue 800",
					state: "open",
					html_url: "https://github.com/test-owner/test-repo/issues/800",
				},
			} as never);

			await linkIssuesFromCommits(mockArgs);

			expect(mockCore.setOutput).toHaveBeenCalledWith(
				"linked_issues",
				JSON.stringify([
					{
						number: 800,
						title: "Test Issue 800",
						state: "open",
						url: "https://github.com/test-owner/test-repo/issues/800",
						commits: ["abc123"],
					},
				]),
			);
			expect(mockCore.setOutput).toHaveBeenCalledWith("commits", JSON.stringify(["abc123"]));
			expect(mockCore.setOutput).toHaveBeenCalledWith("check_id", "999");
			expect(mockCore.notice).toHaveBeenCalledWith("✓ Found 1 linked issue(s): #800");
		});

		it("should create check run with correct details", async () => {
			process.env.RELEASE_BRANCH = "release";
			process.env.TARGET_BRANCH = "main";

			mockGithub.rest.repos.compareCommits.mockResolvedValueOnce({
				data: {
					commits: [
						{
							sha: "def456",
							commit: {
								message: "fixes #900",
								author: { name: "Test Author" },
							},
						},
					],
				},
			} as never);

			mockGithub.rest.issues.get.mockResolvedValueOnce({
				data: {
					title: "Bug Fix 900",
					state: "closed",
					html_url: "https://github.com/test-owner/test-repo/issues/900",
				},
			} as never);

			await linkIssuesFromCommits(mockArgs);

			expect(mockGithub.rest.checks.create).toHaveBeenCalledWith({
				owner: "test-owner",
				repo: "test-repo",
				name: "Link Issues from Commits",
				head_sha: "abc123",
				status: "completed",
				conclusion: "success",
				output: {
					title: "Found 1 linked issue(s) from 1 commit(s)",
					summary: expect.stringContaining("- [#900]"),
				},
			});
		});

		it("should create job summary with table", async () => {
			process.env.RELEASE_BRANCH = "release";
			process.env.TARGET_BRANCH = "main";

			mockGithub.rest.repos.compareCommits.mockResolvedValueOnce({
				data: {
					commits: [
						{
							sha: "ghi789",
							commit: {
								message: "resolves #1000",
								author: { name: "Test Author" },
							},
						},
					],
				},
			} as never);

			mockGithub.rest.issues.get.mockResolvedValueOnce({
				data: {
					title: "Feature 1000",
					state: "open",
					html_url: "https://github.com/test-owner/test-repo/issues/1000",
				},
			} as never);

			await linkIssuesFromCommits(mockArgs);

			expect(mockCore.summary.addHeading).toHaveBeenCalledWith("Link Issues from Commits", 2);
			expect(mockCore.summary.addTable).toHaveBeenCalled();
			expect(mockCore.summary.write).toHaveBeenCalled();
		});
	});

	describe("default values", () => {
		it("should use default branch names when not provided", async () => {
			mockGithub.rest.repos.compareCommits.mockResolvedValueOnce({
				data: {
					commits: [],
				},
			} as never);

			await linkIssuesFromCommits(mockArgs);

			expect(mockGithub.rest.repos.compareCommits).toHaveBeenCalledWith({
				owner: "test-owner",
				repo: "test-repo",
				base: "main",
				head: "changeset-release/main",
			});
		});
	});
});
