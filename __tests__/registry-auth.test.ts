import * as fs from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedTarget } from "../src/types/publish-config.js";
import {
	generateNpmrc,
	setupRegistryAuth,
	validateRegistriesReachable,
	validateTokensAvailable,
} from "../src/utils/registry-auth.js";
import { cleanupTestEnvironment, setupTestEnvironment } from "./utils/github-mocks.js";

// Mock modules
vi.mock("@actions/core");
vi.mock("@actions/exec");
vi.mock("node:fs");

describe("registry-auth", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });
		process.env = { ...originalEnv, HOME: "/home/testuser" };
		vi.mocked(fs.existsSync).mockReturnValue(false);
		vi.mocked(fs.readFileSync).mockReturnValue("");
		vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
	});

	afterEach(() => {
		process.env = originalEnv;
		cleanupTestEnvironment();
	});

	describe("validateTokensAvailable", () => {
		it("returns valid when all required tokens are present", () => {
			process.env.GITHUB_TOKEN = "test-github-token";
			process.env.CUSTOM_TOKEN = "test-custom-token";

			const targets: ResolvedTarget[] = [
				{
					protocol: "npm",
					registry: "https://npm.pkg.github.com/",
					directory: "/test",
					access: "restricted",
					provenance: true,
					tag: "latest",
					tokenEnv: "GITHUB_TOKEN",
				},
				{
					protocol: "npm",
					registry: "https://custom.registry.com/",
					directory: "/test",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: "CUSTOM_TOKEN",
				},
			];

			const result = validateTokensAvailable(targets);
			expect(result.valid).toBe(true);
			expect(result.missing).toHaveLength(0);
		});

		it("skips npm public registry (uses OIDC)", () => {
			// npm registry uses OIDC, so no token is required
			const targets: ResolvedTarget[] = [
				{
					protocol: "npm",
					registry: "https://registry.npmjs.org/",
					directory: "/test",
					access: "public",
					provenance: true,
					tag: "latest",
					tokenEnv: null, // npm uses OIDC
				},
			];

			const result = validateTokensAvailable(targets);
			expect(result.valid).toBe(true);
			expect(result.missing).toHaveLength(0);
		});

		it("returns missing tokens when custom registry tokens are absent", () => {
			// Ensure tokens are not set
			delete process.env.CUSTOM_TOKEN;
			delete process.env.ANOTHER_TOKEN;

			const targets: ResolvedTarget[] = [
				{
					protocol: "npm",
					registry: "https://custom.registry.com/",
					directory: "/test",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: "CUSTOM_TOKEN",
				},
				{
					protocol: "npm",
					registry: "https://another.registry.com/",
					directory: "/test",
					access: "restricted",
					provenance: false,
					tag: "latest",
					tokenEnv: "ANOTHER_TOKEN",
				},
			];

			const result = validateTokensAvailable(targets);
			expect(result.valid).toBe(false);
			expect(result.missing).toHaveLength(2);
			expect(result.missing[0]).toEqual({
				registry: "https://custom.registry.com/",
				tokenEnv: "CUSTOM_TOKEN",
			});
		});

		it("does not require token for JSR (uses OIDC)", () => {
			const targets: ResolvedTarget[] = [
				{
					protocol: "jsr",
					registry: null,
					directory: "/test",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: "JSR_TOKEN",
				},
			];

			const result = validateTokensAvailable(targets);
			expect(result.valid).toBe(true);
			expect(result.missing).toHaveLength(0);
		});

		it("reports missing when tokenEnv is not specified", () => {
			const targets: ResolvedTarget[] = [
				{
					protocol: "npm",
					registry: "https://custom.registry.com/",
					directory: "/test",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: null,
				},
			];

			const result = validateTokensAvailable(targets);
			expect(result.valid).toBe(false);
			expect(result.missing[0].tokenEnv).toBe("tokenEnv not specified");
		});
	});

	describe("generateNpmrc", () => {
		it("creates .npmrc with auth for GitHub Packages and custom registries", () => {
			process.env.GITHUB_TOKEN = "test-github-token";
			process.env.CUSTOM_TOKEN = "test-custom-token";

			const targets: ResolvedTarget[] = [
				{
					protocol: "npm",
					registry: "https://npm.pkg.github.com/",
					directory: "/test",
					access: "restricted",
					provenance: true,
					tag: "latest",
					tokenEnv: "GITHUB_TOKEN",
				},
				{
					protocol: "npm",
					registry: "https://custom.registry.com/",
					directory: "/test",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: "CUSTOM_TOKEN",
				},
			];

			generateNpmrc(targets);

			expect(fs.writeFileSync).toHaveBeenCalled();
			const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
			const npmrcPath = writeCall[0] as string;
			const content = writeCall[1] as string;

			expect(npmrcPath).toBe(path.join("/home/testuser", ".npmrc"));
			expect(content).toContain("//npm.pkg.github.com/:_authToken=test-github-token");
			expect(content).toContain("//custom.registry.com/:_authToken=test-custom-token");
		});

		it("skips JSR targets", () => {
			const targets: ResolvedTarget[] = [
				{
					protocol: "jsr",
					registry: null,
					directory: "/test",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: "JSR_TOKEN",
				},
			];

			generateNpmrc(targets);

			// Should not write any file since there are no npm targets
			expect(fs.writeFileSync).not.toHaveBeenCalled();
		});

		it("deduplicates registries", () => {
			process.env.GITHUB_TOKEN = "test-github-token";

			const targets: ResolvedTarget[] = [
				{
					protocol: "npm",
					registry: "https://npm.pkg.github.com/",
					directory: "/test/pkg1",
					access: "public",
					provenance: true,
					tag: "latest",
					tokenEnv: "GITHUB_TOKEN",
				},
				{
					protocol: "npm",
					registry: "https://npm.pkg.github.com/",
					directory: "/test/pkg2",
					access: "public",
					provenance: true,
					tag: "latest",
					tokenEnv: "GITHUB_TOKEN",
				},
			];

			generateNpmrc(targets);

			expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
			const content = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
			// Should only have one entry for GitHub Packages
			const githubMatches = content.match(/npm\.pkg\.github\.com/g);
			expect(githubMatches).toHaveLength(1);
		});

		it("appends to existing .npmrc for GitHub Packages", () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue("existing-content\n");
			process.env.GITHUB_TOKEN = "test-github-token";

			const targets: ResolvedTarget[] = [
				{
					protocol: "npm",
					registry: "https://npm.pkg.github.com/",
					directory: "/test",
					access: "public",
					provenance: true,
					tag: "latest",
					tokenEnv: "GITHUB_TOKEN",
				},
			];

			generateNpmrc(targets);

			const content = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
			expect(content).toContain("existing-content");
			expect(content).toContain("Added by workflow-release-action");
		});

		it("skips npm public registry (uses OIDC)", () => {
			vi.mocked(fs.existsSync).mockReturnValue(false);

			const targets: ResolvedTarget[] = [
				{
					protocol: "npm",
					registry: "https://registry.npmjs.org/",
					directory: "/test",
					access: "public",
					provenance: true,
					tag: "latest",
					tokenEnv: null, // npm uses OIDC
				},
			];

			generateNpmrc(targets);

			// Should not write .npmrc for OIDC registry
			expect(fs.writeFileSync).not.toHaveBeenCalled();
			expect(core.info).toHaveBeenCalledWith(expect.stringContaining("uses OIDC - skipping .npmrc auth"));
		});

		it("warns when token is not set", () => {
			delete process.env.MISSING_TOKEN;

			const targets: ResolvedTarget[] = [
				{
					protocol: "npm",
					registry: "https://custom.registry.com/",
					directory: "/test",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: "MISSING_TOKEN",
				},
			];

			generateNpmrc(targets);

			expect(core.warning).toHaveBeenCalledWith(
				"Token env var MISSING_TOKEN is not set for registry: https://custom.registry.com/",
			);
		});

		it("warns when tokenEnv is null", () => {
			const targets: ResolvedTarget[] = [
				{
					protocol: "npm",
					registry: "https://custom.registry.com/",
					directory: "/test",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: null,
				},
			];

			generateNpmrc(targets);

			expect(core.warning).toHaveBeenCalledWith("No token env var for registry: https://custom.registry.com/");
		});
	});

	describe("validateRegistriesReachable", () => {
		it("returns empty array when all registries are reachable", async () => {
			// npm ping returns exit code 0 for reachable registries
			vi.mocked(exec.exec).mockResolvedValue(0);

			const targets: ResolvedTarget[] = [
				{
					protocol: "npm",
					registry: "https://custom.registry.com/",
					directory: "/test",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: "CUSTOM_TOKEN",
				},
			];

			const result = await validateRegistriesReachable(targets);
			expect(result).toHaveLength(0);
		});

		it("returns unreachable registries when npm ping fails", async () => {
			// npm ping returns non-zero exit code for unreachable registries
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				// Simulate stderr output with ENOTFOUND
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from("npm ERR! getaddrinfo ENOTFOUND invalid.registry.com"));
				}
				return 1;
			});

			const targets: ResolvedTarget[] = [
				{
					protocol: "npm",
					registry: "https://invalid.registry.com/",
					directory: "/test",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: "CUSTOM_TOKEN",
				},
			];

			const result = await validateRegistriesReachable(targets);
			expect(result).toHaveLength(1);
			expect(result[0].registry).toBe("https://invalid.registry.com/");
			expect(result[0].error).toContain("hostname not found");
		});

		it("returns unreachable on connection refused", async () => {
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from("npm ERR! ECONNREFUSED"));
				}
				return 1;
			});

			const targets: ResolvedTarget[] = [
				{
					protocol: "npm",
					registry: "https://down.registry.com/",
					directory: "/test",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: "CUSTOM_TOKEN",
				},
			];

			const result = await validateRegistriesReachable(targets);
			expect(result).toHaveLength(1);
			expect(result[0].error).toContain("Connection refused");
		});

		it("skips npm public registry", async () => {
			vi.mocked(exec.exec).mockResolvedValue(0);

			const targets: ResolvedTarget[] = [
				{
					protocol: "npm",
					registry: "https://registry.npmjs.org/",
					directory: "/test",
					access: "public",
					provenance: true,
					tag: "latest",
					tokenEnv: null,
				},
			];

			await validateRegistriesReachable(targets);
			// exec should not be called for npm public registry (OIDC)
			expect(exec.exec).not.toHaveBeenCalled();
		});

		it("skips GitHub Packages registry", async () => {
			vi.mocked(exec.exec).mockResolvedValue(0);

			const targets: ResolvedTarget[] = [
				{
					protocol: "npm",
					registry: "https://npm.pkg.github.com/",
					directory: "/test",
					access: "restricted",
					provenance: true,
					tag: "latest",
					tokenEnv: "GITHUB_TOKEN",
				},
			];

			await validateRegistriesReachable(targets);
			// exec should not be called for GitHub Packages (well-known registry)
			expect(exec.exec).not.toHaveBeenCalled();
		});

		it("skips JSR targets", async () => {
			vi.mocked(exec.exec).mockResolvedValue(0);

			const targets: ResolvedTarget[] = [
				{
					protocol: "jsr",
					registry: null,
					directory: "/test",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: null,
				},
			];

			await validateRegistriesReachable(targets);
			// exec should not be called for JSR (non-npm protocol)
			expect(exec.exec).not.toHaveBeenCalled();
		});

		it("deduplicates registry checks", async () => {
			vi.mocked(exec.exec).mockResolvedValue(0);

			const targets: ResolvedTarget[] = [
				{
					protocol: "npm",
					registry: "https://custom.registry.com/",
					directory: "/test/pkg1",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: "CUSTOM_TOKEN",
				},
				{
					protocol: "npm",
					registry: "https://custom.registry.com/",
					directory: "/test/pkg2",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: "CUSTOM_TOKEN",
				},
			];

			await validateRegistriesReachable(targets);
			// Should only call exec once for the same registry
			expect(exec.exec).toHaveBeenCalledTimes(1);
		});

		it("handles npm ping returning JSON error", async () => {
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(
						Buffer.from(JSON.stringify({ error: { summary: "Custom error from npm", code: "E503" } })),
					);
				}
				return 1;
			});

			const targets: ResolvedTarget[] = [
				{
					protocol: "npm",
					registry: "https://error.registry.com/",
					directory: "/test",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: "CUSTOM_TOKEN",
				},
			];

			const result = await validateRegistriesReachable(targets);
			expect(result).toHaveLength(1);
			expect(result[0].error).toBe("Custom error from npm");
		});

		it("handles 503 service unavailable", async () => {
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from("503 Service Unavailable"));
				}
				return 1;
			});

			const targets: ResolvedTarget[] = [
				{
					protocol: "npm",
					registry: "https://down.registry.com/",
					directory: "/test",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: "CUSTOM_TOKEN",
				},
			];

			const result = await validateRegistriesReachable(targets);
			expect(result).toHaveLength(1);
			expect(result[0].error).toContain("Service unavailable");
		});

		it("handles timeout error", async () => {
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from("ETIMEDOUT"));
				}
				return 1;
			});

			const targets: ResolvedTarget[] = [
				{
					protocol: "npm",
					registry: "https://slow.registry.com/",
					directory: "/test",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: "CUSTOM_TOKEN",
				},
			];

			const result = await validateRegistriesReachable(targets);
			expect(result).toHaveLength(1);
			expect(result[0].error).toContain("timed out");
		});

		it("handles fallback error with exit code", async () => {
			// No specific error pattern in output - triggers fallback
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from("Some generic error message"));
				}
				return 1;
			});

			const targets: ResolvedTarget[] = [
				{
					protocol: "npm",
					registry: "https://unknown-error.registry.com/",
					directory: "/test",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: "CUSTOM_TOKEN",
				},
			];

			const result = await validateRegistriesReachable(targets);
			expect(result).toHaveLength(1);
			// Should use the combined output when no specific pattern matches
			expect(result[0].error).toContain("Some generic error message");
		});

		it("handles exec throwing an Error", async () => {
			vi.mocked(exec.exec).mockRejectedValue(new Error("Exec failed unexpectedly"));

			const targets: ResolvedTarget[] = [
				{
					protocol: "npm",
					registry: "https://exec-error.registry.com/",
					directory: "/test",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: "CUSTOM_TOKEN",
				},
			];

			const result = await validateRegistriesReachable(targets);
			expect(result).toHaveLength(1);
			expect(result[0].error).toBe("Exec failed unexpectedly");
		});

		it("handles exec throwing a non-Error", async () => {
			vi.mocked(exec.exec).mockRejectedValue("String error");

			const targets: ResolvedTarget[] = [
				{
					protocol: "npm",
					registry: "https://string-error.registry.com/",
					directory: "/test",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: "CUSTOM_TOKEN",
				},
			];

			const result = await validateRegistriesReachable(targets);
			expect(result).toHaveLength(1);
			expect(result[0].error).toBe("Unknown error checking registry");
		});
	});

	describe("setupRegistryAuth", () => {
		beforeEach(() => {
			// Mock exec to return success by default for npm ping reachability checks
			vi.mocked(exec.exec).mockResolvedValue(0);
		});

		it("uses app token for GITHUB_TOKEN when no workflow token provided", async () => {
			vi.mocked(core.getState).mockImplementation((name: string) => {
				if (name === "token") return "app-token";
				return "";
			});

			const targets: ResolvedTarget[] = [];
			await setupRegistryAuth(targets);

			expect(process.env.GITHUB_TOKEN).toBe("app-token");
			expect(core.info).toHaveBeenCalledWith("Using GitHub App token for GitHub Packages authentication");
		});

		it("prefers workflow GITHUB_TOKEN over app token for packages", async () => {
			vi.mocked(core.getState).mockImplementation((name: string) => {
				if (name === "token") return "app-token";
				if (name === "githubToken") return "workflow-token";
				return "";
			});

			const targets: ResolvedTarget[] = [];
			await setupRegistryAuth(targets);

			expect(process.env.GITHUB_TOKEN).toBe("workflow-token");
			expect(core.info).toHaveBeenCalledWith(
				"Using workflow GITHUB_TOKEN for GitHub Packages authentication (packages:write)",
			);
		});

		it("warns when no token in state", async () => {
			vi.mocked(core.getState).mockReturnValue("");

			const targets: ResolvedTarget[] = [];
			await setupRegistryAuth(targets);

			expect(core.warning).toHaveBeenCalledWith(
				"No GitHub token available - GitHub Packages and custom registries may fail to authenticate",
			);
		});

		it("does not set NPM_TOKEN (npm uses OIDC)", async () => {
			vi.mocked(core.getState).mockImplementation((name: string) => {
				if (name === "token") return "app-token";
				return "";
			});

			// Clear any existing NPM_TOKEN
			delete process.env.NPM_TOKEN;

			const targets: ResolvedTarget[] = [];
			await setupRegistryAuth(targets);

			// NPM_TOKEN should not be set - npm uses OIDC trusted publishing
			expect(process.env.NPM_TOKEN).toBeUndefined();
		});

		it("does not set JSR_TOKEN (JSR uses OIDC)", async () => {
			vi.mocked(core.getState).mockImplementation((name: string) => {
				if (name === "token") return "app-token";
				return "";
			});

			// Clear any existing JSR_TOKEN
			delete process.env.JSR_TOKEN;

			const targets: ResolvedTarget[] = [];
			await setupRegistryAuth(targets);

			// JSR_TOKEN should not be set - JSR uses OIDC
			expect(process.env.JSR_TOKEN).toBeUndefined();
		});

		it("parses custom-registries input", async () => {
			vi.mocked(core.getState).mockImplementation((name: string) => {
				if (name === "token") return "app-token";
				return "";
			});
			vi.mocked(core.getInput).mockImplementation((name: string) => {
				if (name === "custom-registries") return "https://custom.registry.com/=custom-token";
				return "";
			});

			const targets: ResolvedTarget[] = [];
			await setupRegistryAuth(targets);

			expect(process.env.CUSTOM_REGISTRY_COM_TOKEN).toBe("custom-token");
		});

		it("uses GitHub App token for custom-registries without explicit token", async () => {
			vi.mocked(core.getState).mockImplementation((name: string) => {
				if (name === "token") return "github-app-token";
				return "";
			});
			vi.mocked(core.getInput).mockImplementation((name: string) => {
				if (name === "custom-registries") return "https://npm.savvyweb.dev/";
				return "";
			});

			const targets: ResolvedTarget[] = [];
			await setupRegistryAuth(targets);

			expect(process.env.NPM_SAVVYWEB_DEV_TOKEN).toBe("github-app-token");
			expect(core.info).toHaveBeenCalledWith(
				"Set NPM_SAVVYWEB_DEV_TOKEN for custom registry: https://npm.savvyweb.dev/ (using GitHub App token)",
			);
		});

		it("uses GitHub App token for custom-registries with trailing = but no token", async () => {
			vi.mocked(core.getState).mockImplementation((name: string) => {
				if (name === "token") return "github-app-token";
				return "";
			});
			vi.mocked(core.getInput).mockImplementation((name: string) => {
				if (name === "custom-registries") return "https://npm.savvyweb.dev/=";
				return "";
			});

			const targets: ResolvedTarget[] = [];
			await setupRegistryAuth(targets);

			expect(process.env.NPM_SAVVYWEB_DEV_TOKEN).toBe("github-app-token");
			expect(core.info).toHaveBeenCalledWith(
				"Set NPM_SAVVYWEB_DEV_TOKEN for custom registry: https://npm.savvyweb.dev/ (using GitHub App token)",
			);
		});

		it("handles multiple custom-registries with mixed formats", async () => {
			vi.mocked(core.getState).mockImplementation((name: string) => {
				if (name === "token") return "github-app-token";
				return "";
			});
			vi.mocked(core.getInput).mockImplementation((name: string) => {
				if (name === "custom-registries") {
					return "https://npm.savvyweb.dev/\nhttps://custom.registry.com/=explicit-token";
				}
				return "";
			});

			const targets: ResolvedTarget[] = [];
			await setupRegistryAuth(targets);

			expect(process.env.NPM_SAVVYWEB_DEV_TOKEN).toBe("github-app-token");
			expect(process.env.CUSTOM_REGISTRY_COM_TOKEN).toBe("explicit-token");
		});

		it("warns when no GitHub token and custom-registries without explicit value", async () => {
			vi.mocked(core.getState).mockReturnValue("");
			vi.mocked(core.getInput).mockImplementation((name: string) => {
				if (name === "custom-registries") return "https://npm.savvyweb.dev/";
				return "";
			});

			const targets: ResolvedTarget[] = [];
			await setupRegistryAuth(targets);

			expect(core.warning).toHaveBeenCalledWith(
				"No GitHub token available - GitHub Packages and custom registries may fail to authenticate",
			);
			// Should NOT set the token since no GitHub token available
			expect(process.env.NPM_SAVVYWEB_DEV_TOKEN).toBeUndefined();
		});

		it("returns configured registries", async () => {
			process.env.NPM_TOKEN = "npm-token";
			vi.mocked(core.getState).mockImplementation((name: string) => {
				if (name === "token") return "app-token";
				return "";
			});

			const targets: ResolvedTarget[] = [
				{
					protocol: "npm",
					registry: "https://registry.npmjs.org/",
					directory: "/test",
					access: "public",
					provenance: true,
					tag: "latest",
					tokenEnv: "NPM_TOKEN",
				},
			];

			const result = await setupRegistryAuth(targets);

			expect(result.configuredRegistries).toContain("https://registry.npmjs.org/");
		});

		it("returns unreachable registries in result", async () => {
			// Mock npm ping to fail with ENOTFOUND
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from("npm ERR! getaddrinfo ENOTFOUND invalid.registry.com"));
				}
				return 1;
			});
			vi.mocked(core.getState).mockImplementation((name: string) => {
				if (name === "token") return "app-token";
				return "";
			});

			const targets: ResolvedTarget[] = [
				{
					protocol: "npm",
					registry: "https://invalid.registry.com/",
					directory: "/test",
					access: "public",
					provenance: false,
					tag: "latest",
					tokenEnv: "CUSTOM_TOKEN",
				},
			];

			process.env.CUSTOM_TOKEN = "test-token";
			const result = await setupRegistryAuth(targets);

			expect(result.success).toBe(false);
			expect(result.unreachableRegistries).toHaveLength(1);
			expect(result.unreachableRegistries[0].registry).toBe("https://invalid.registry.com/");
		});
	});
});
