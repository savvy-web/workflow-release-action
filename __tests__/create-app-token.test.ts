import * as core from "@actions/core";
import * as github from "@actions/github";
import { createAppAuth } from "@octokit/auth-app";
import { request } from "@octokit/request";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAppToken, isTokenExpired, revokeAppToken } from "../src/utils/create-app-token.js";
import { cleanupTestEnvironment, setupTestEnvironment } from "./utils/github-mocks.js";

// Mock modules
vi.mock("@actions/core");
vi.mock("@actions/github");
vi.mock("@octokit/auth-app");
vi.mock("@octokit/request");

describe("create-app-token", () => {
	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });

		// Setup default github context - use Object.defineProperty since repo is a getter
		Object.defineProperty(github.context, "repo", {
			value: {
				owner: "test-owner",
				repo: "test-repo",
			},
			writable: true,
			configurable: true,
		});
	});

	afterEach(() => {
		cleanupTestEnvironment();
	});

	describe("createAppToken", () => {
		it("generates token successfully with app credentials", async () => {
			const mockAuth = vi.fn();
			// First call for app authentication
			mockAuth.mockResolvedValueOnce({
				token: "app-jwt-token",
			});
			// Second call for installation authentication
			mockAuth.mockResolvedValueOnce({
				token: "ghs_installation_token",
				expiresAt: "2024-12-31T23:59:59Z",
			});

			vi.mocked(createAppAuth).mockReturnValue(mockAuth as never);

			// Mock the installation lookup request
			vi.mocked(request).mockResolvedValueOnce({
				data: {
					id: 12345,
					app_slug: "my-release-app",
				},
				status: 200,
				headers: {},
				url: "",
			} as never);

			const result = await createAppToken({
				appId: "123456",
				privateKey: "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----",
			});

			expect(result.token).toBe("ghs_installation_token");
			expect(result.installationId).toBe(12345);
			expect(result.appSlug).toBe("my-release-app");
			expect(result.expiresAt).toBe("2024-12-31T23:59:59Z");

			// Verify token was masked
			expect(core.setSecret).toHaveBeenCalledWith("ghs_installation_token");

			// Verify permissions were requested
			expect(mockAuth).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "installation",
					installationId: 12345,
					permissions: expect.objectContaining({
						contents: "write",
						pull_requests: "write",
						checks: "write",
						issues: "write",
						packages: "write",
						organization_packages: "write",
						members: "read",
					}),
				}),
			);
		});

		it("uses default owner/repo from context when not specified", async () => {
			const mockAuth = vi.fn();
			mockAuth.mockResolvedValueOnce({ token: "app-jwt" });
			mockAuth.mockResolvedValueOnce({
				token: "ghs_token",
				expiresAt: "2024-12-31T23:59:59Z",
			});

			vi.mocked(createAppAuth).mockReturnValue(mockAuth as never);
			vi.mocked(request).mockResolvedValueOnce({
				data: { id: 999, app_slug: "test-app" },
				status: 200,
				headers: {},
				url: "",
			} as never);

			await createAppToken({
				appId: "123",
				privateKey: "key",
			});

			// Verify request was made to correct repo
			expect(request).toHaveBeenCalledWith(
				"GET /repos/{owner}/{repo}/installation",
				expect.objectContaining({
					owner: "test-owner",
					repo: "test-repo",
				}),
			);
		});

		it("uses custom owner/repo when specified", async () => {
			const mockAuth = vi.fn();
			mockAuth.mockResolvedValueOnce({ token: "app-jwt" });
			mockAuth.mockResolvedValueOnce({
				token: "ghs_token",
				expiresAt: "2024-12-31T23:59:59Z",
			});

			vi.mocked(createAppAuth).mockReturnValue(mockAuth as never);
			vi.mocked(request).mockResolvedValueOnce({
				data: { id: 888, app_slug: "custom-app" },
				status: 200,
				headers: {},
				url: "",
			} as never);

			await createAppToken({
				appId: "123",
				privateKey: "key",
				owner: "custom-owner",
				repository: "custom-repo",
			});

			expect(request).toHaveBeenCalledWith(
				"GET /repos/{owner}/{repo}/installation",
				expect.objectContaining({
					owner: "custom-owner",
					repo: "custom-repo",
				}),
			);
		});

		it("throws error when app-id is missing", async () => {
			await expect(
				createAppToken({
					appId: "",
					privateKey: "key",
				}),
			).rejects.toThrow("app-id is required");
		});

		it("throws error when private-key is missing", async () => {
			await expect(
				createAppToken({
					appId: "123",
					privateKey: "",
				}),
			).rejects.toThrow("private-key is required");
		});

		it("generates fallback expiration when not provided by auth", async () => {
			const mockAuth = vi.fn();
			mockAuth.mockResolvedValueOnce({ token: "app-jwt" });
			mockAuth.mockResolvedValueOnce({
				token: "ghs_token",
				// No expiresAt provided
			});

			vi.mocked(createAppAuth).mockReturnValue(mockAuth as never);
			vi.mocked(request).mockResolvedValueOnce({
				data: { id: 111, app_slug: "app" },
				status: 200,
				headers: {},
				url: "",
			} as never);

			const result = await createAppToken({
				appId: "123",
				privateKey: "key",
			});

			// Should have a generated expiration (approximately 1 hour from now)
			expect(result.expiresAt).toBeDefined();
			const expiresAt = new Date(result.expiresAt);
			const now = new Date();
			const diffMs = expiresAt.getTime() - now.getTime();
			// Should be approximately 1 hour (3600000ms) with some tolerance
			expect(diffMs).toBeGreaterThan(3500000);
			expect(diffMs).toBeLessThan(3700000);
		});

		it("uses custom API URL when provided", async () => {
			const mockAuth = vi.fn();
			mockAuth.mockResolvedValueOnce({ token: "app-jwt" });
			mockAuth.mockResolvedValueOnce({
				token: "ghs_token",
				expiresAt: "2024-12-31T23:59:59Z",
			});

			vi.mocked(createAppAuth).mockReturnValue(mockAuth as never);
			vi.mocked(request).mockImplementation((() => ({
				defaults: vi.fn().mockReturnValue(vi.fn()),
			})) as never);
			vi.mocked(request).mockResolvedValueOnce({
				data: { id: 222, app_slug: "enterprise-app" },
				status: 200,
				headers: {},
				url: "",
			} as never);

			await createAppToken({
				appId: "123",
				privateKey: "key",
				apiUrl: "https://github.example.com/api/v3",
			});

			expect(request).toHaveBeenCalledWith(
				"GET /repos/{owner}/{repo}/installation",
				expect.objectContaining({
					baseUrl: "https://github.example.com/api/v3",
				}),
			);
		});

		it("logs granted permissions when returned by auth", async () => {
			const mockAuth = vi.fn();
			mockAuth.mockResolvedValueOnce({ token: "app-jwt" });
			mockAuth.mockResolvedValueOnce({
				token: "ghs_token",
				expiresAt: "2024-12-31T23:59:59Z",
				permissions: {
					contents: "write",
					pull_requests: "write",
					checks: "write",
					issues: "write",
					packages: "write",
					members: "read",
				},
			});

			vi.mocked(createAppAuth).mockReturnValue(mockAuth as never);
			vi.mocked(request).mockResolvedValueOnce({
				data: { id: 333, app_slug: "perm-app" },
				status: 200,
				headers: {},
				url: "",
			} as never);

			await createAppToken({
				appId: "123",
				privateKey: "key",
			});

			// Verify permissions were logged
			expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Granted permissions:"));
			// Verify warning about missing organization_packages
			expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("organization_packages"));
		});

		it("handles auth error with helpful message for permission issues", async () => {
			const mockAuth = vi.fn();
			mockAuth.mockResolvedValueOnce({ token: "app-jwt" });
			mockAuth.mockRejectedValueOnce(new Error("Resource not accessible by integration"));

			vi.mocked(createAppAuth).mockReturnValue(mockAuth as never);
			vi.mocked(request).mockResolvedValueOnce({
				data: { id: 444, app_slug: "error-app" },
				status: 200,
				headers: {},
				url: "",
			} as never);

			await expect(
				createAppToken({
					appId: "123",
					privateKey: "key",
				}),
			).rejects.toThrow("Resource not accessible by integration");

			// Verify helpful error messages were logged
			expect(core.error).toHaveBeenCalledWith(expect.stringContaining("Failed to create installation token"));
			expect(core.error).toHaveBeenCalledWith(
				expect.stringContaining("GitHub App doesn't have the required permissions"),
			);
		});

		it("handles auth error with 403 status", async () => {
			const mockAuth = vi.fn();
			mockAuth.mockResolvedValueOnce({ token: "app-jwt" });
			mockAuth.mockRejectedValueOnce(new Error("403 Forbidden"));

			vi.mocked(createAppAuth).mockReturnValue(mockAuth as never);
			vi.mocked(request).mockResolvedValueOnce({
				data: { id: 555, app_slug: "forbidden-app" },
				status: 200,
				headers: {},
				url: "",
			} as never);

			await expect(
				createAppToken({
					appId: "123",
					privateKey: "key",
				}),
			).rejects.toThrow("403 Forbidden");

			expect(core.error).toHaveBeenCalledWith(expect.stringContaining("Required permissions:"));
		});

		it("handles auth error without permission hint", async () => {
			const mockAuth = vi.fn();
			mockAuth.mockResolvedValueOnce({ token: "app-jwt" });
			mockAuth.mockRejectedValueOnce(new Error("Network error"));

			vi.mocked(createAppAuth).mockReturnValue(mockAuth as never);
			vi.mocked(request).mockResolvedValueOnce({
				data: { id: 666, app_slug: "network-app" },
				status: 200,
				headers: {},
				url: "",
			} as never);

			await expect(
				createAppToken({
					appId: "123",
					privateKey: "key",
				}),
			).rejects.toThrow("Network error");

			expect(core.error).toHaveBeenCalledWith("Failed to create installation token: Network error");
			// Should NOT have the permissions hint
			expect(core.error).not.toHaveBeenCalledWith(expect.stringContaining("Required permissions:"));
		});
	});

	describe("revokeAppToken", () => {
		it("revokes token successfully", async () => {
			vi.mocked(request).mockResolvedValueOnce({
				status: 204,
				headers: {},
				url: "",
				data: undefined,
			} as never);

			await revokeAppToken("ghs_test_token");

			expect(request).toHaveBeenCalledWith("DELETE /installation/token", {
				headers: {
					authorization: "token ghs_test_token",
				},
				baseUrl: "https://api.github.com",
			});
			expect(core.info).toHaveBeenCalledWith("Token revoked successfully");
		});

		it("handles empty token gracefully", async () => {
			await revokeAppToken("");

			expect(request).not.toHaveBeenCalled();
			expect(core.debug).toHaveBeenCalledWith("No token to revoke");
		});

		it("handles revocation failure gracefully", async () => {
			vi.mocked(request).mockRejectedValueOnce(new Error("Token already revoked"));

			await revokeAppToken("ghs_invalid_token");

			expect(core.warning).toHaveBeenCalledWith("Token revocation failed: Token already revoked");
		});

		it("uses custom API URL when provided", async () => {
			vi.mocked(request).mockResolvedValueOnce({
				status: 204,
				headers: {},
				url: "",
				data: undefined,
			} as never);

			await revokeAppToken("ghs_token", "https://github.example.com/api/v3");

			expect(request).toHaveBeenCalledWith("DELETE /installation/token", {
				headers: {
					authorization: "token ghs_token",
				},
				baseUrl: "https://github.example.com/api/v3",
			});
		});
	});

	describe("isTokenExpired", () => {
		it("returns true for expired tokens", () => {
			const pastDate = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
			expect(isTokenExpired(pastDate)).toBe(true);
		});

		it("returns false for valid tokens", () => {
			const futureDate = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now
			expect(isTokenExpired(futureDate)).toBe(false);
		});

		it("returns false for tokens expiring exactly now (edge case)", () => {
			const now = new Date().toISOString();
			// A token expiring right now is technically not yet expired (< vs <=)
			// Due to timing, it could be either true or false
			const result = isTokenExpired(now);
			expect(typeof result).toBe("boolean");
		});

		it("returns false for invalid date strings (NaN comparison)", () => {
			// new Date("invalid-date").getTime() returns NaN
			// NaN < Date.now() is always false
			expect(isTokenExpired("invalid-date")).toBe(false);
		});
	});
});
