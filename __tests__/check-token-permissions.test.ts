import * as core from "@actions/core";
import * as github from "@actions/github";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkTokenPermissions } from "../src/utils/check-token-permissions.js";
import { cleanupTestEnvironment, setupTestEnvironment } from "./utils/github-mocks.js";

// Mock modules
vi.mock("@actions/core");
vi.mock("@actions/github");

describe("check-token-permissions", () => {
	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });
	});

	afterEach(() => {
		cleanupTestEnvironment();
	});

	describe("checkTokenPermissions", () => {
		it("identifies GitHub App tokens correctly", async () => {
			const mockOctokit = {
				rest: {
					users: {
						getAuthenticated: vi.fn().mockResolvedValue({
							data: {
								type: "Bot",
								login: "my-github-app[bot]",
								id: 12345,
							},
						}),
					},
				},
			};

			vi.mocked(github.getOctokit).mockReturnValue(mockOctokit as never);
			vi.mocked(github.context).payload = {
				installation: {
					id: 67890,
				},
			} as never;

			const result = await checkTokenPermissions("test-token");

			expect(result.valid).toBe(true);
			expect(result.type).toBe("Bot");
			expect(result.login).toBe("my-github-app[bot]");
			expect(result.appName).toBe("my-github-app");
			expect(result.installationId).toBe(67890);
		});

		it("identifies PAT tokens correctly", async () => {
			const mockOctokit = {
				rest: {
					users: {
						getAuthenticated: vi.fn().mockResolvedValue({
							data: {
								type: "User",
								login: "octocat",
								id: 123,
							},
						}),
					},
				},
			};

			vi.mocked(github.getOctokit).mockReturnValue(mockOctokit as never);
			vi.mocked(github.context).payload = {} as never;

			const result = await checkTokenPermissions("test-token");

			expect(result.valid).toBe(true);
			expect(result.type).toBe("User");
			expect(result.login).toBe("octocat");
			expect(result.appName).toBeUndefined();
			expect(result.installationId).toBeUndefined();
		});

		it("handles API errors gracefully", async () => {
			const mockOctokit = {
				rest: {
					users: {
						getAuthenticated: vi.fn().mockRejectedValue(new Error("Bad credentials")),
					},
				},
			};

			vi.mocked(github.getOctokit).mockReturnValue(mockOctokit as never);

			const result = await checkTokenPermissions("invalid-token");

			expect(result.valid).toBe(false);
			expect(result.error).toBe("Bad credentials");
		});

		it("handles GitHub App without installation context", async () => {
			const mockOctokit = {
				rest: {
					users: {
						getAuthenticated: vi.fn().mockResolvedValue({
							data: {
								type: "Bot",
								login: "test-app[bot]",
								id: 999,
							},
						}),
					},
				},
			};

			vi.mocked(github.getOctokit).mockReturnValue(mockOctokit as never);
			vi.mocked(github.context).payload = {} as never;

			const result = await checkTokenPermissions("test-token");

			expect(result.valid).toBe(true);
			expect(result.type).toBe("Bot");
			expect(result.appName).toBe("test-app");
			expect(result.installationId).toBeUndefined();
		});

		it("logs helpful information for GitHub App tokens", async () => {
			const mockOctokit = {
				rest: {
					users: {
						getAuthenticated: vi.fn().mockResolvedValue({
							data: {
								type: "Bot",
								login: "release-bot[bot]",
								id: 555,
							},
						}),
					},
				},
			};

			vi.mocked(github.getOctokit).mockReturnValue(mockOctokit as never);
			vi.mocked(github.context).payload = {
				installation: { id: 777 },
			} as never;

			await checkTokenPermissions("test-token");

			// Verify that core.info was called with helpful messages
			expect(core.info).toHaveBeenCalledWith(expect.stringContaining("GitHub App token"));
			expect(core.info).toHaveBeenCalledWith(expect.stringContaining("permissions"));
		});

		it("handles Bot token without [bot] suffix", async () => {
			const mockOctokit = {
				rest: {
					users: {
						getAuthenticated: vi.fn().mockResolvedValue({
							data: {
								type: "Bot",
								login: "somebot",
								id: 888,
							},
						}),
					},
				},
			};

			vi.mocked(github.getOctokit).mockReturnValue(mockOctokit as never);
			vi.mocked(github.context).payload = {} as never;

			const result = await checkTokenPermissions("test-token");

			expect(result.valid).toBe(true);
			expect(result.type).toBe("Bot");
			expect(result.appName).toBeUndefined(); // No [bot] suffix, so appName not extracted
		});

		it("handles non-Bot tokens (PAT) without installation", async () => {
			const mockOctokit = {
				rest: {
					users: {
						getAuthenticated: vi.fn().mockResolvedValue({
							data: {
								type: "User",
								login: "user123",
								id: 111,
							},
						}),
					},
				},
			};

			vi.mocked(github.getOctokit).mockReturnValue(mockOctokit as never);
			vi.mocked(github.context).payload = {} as never;

			await checkTokenPermissions("test-token");

			// Verify that the PAT message was logged
			expect(core.info).toHaveBeenCalledWith(expect.stringContaining("not a GitHub App token"));
		});
	});
});
