import * as fs from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedTarget } from "../src/types/publish-config.js";
import { generateNpmrc, setupRegistryAuth, validateTokensAvailable } from "../src/utils/registry-auth.js";
import { cleanupTestEnvironment, setupTestEnvironment } from "./utils/github-mocks.js";

// Mock modules
vi.mock("@actions/core");
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

	describe("setupRegistryAuth", () => {
		it("sets GITHUB_TOKEN from input", () => {
			vi.mocked(core.getInput).mockImplementation((name: string) => {
				if (name === "token") return "github-app-token";
				return "";
			});

			const targets: ResolvedTarget[] = [];
			setupRegistryAuth(targets);

			expect(process.env.GITHUB_TOKEN).toBe("github-app-token");
		});

		it("does not set NPM_TOKEN (npm uses OIDC)", () => {
			vi.mocked(core.getInput).mockImplementation((name: string) => {
				if (name === "token") return "github-token";
				return "";
			});

			// Clear any existing NPM_TOKEN
			delete process.env.NPM_TOKEN;

			const targets: ResolvedTarget[] = [];
			setupRegistryAuth(targets);

			// NPM_TOKEN should not be set - npm uses OIDC trusted publishing
			expect(process.env.NPM_TOKEN).toBeUndefined();
		});

		it("does not set JSR_TOKEN (JSR uses OIDC)", () => {
			vi.mocked(core.getInput).mockImplementation((name: string) => {
				if (name === "token") return "github-token";
				return "";
			});

			// Clear any existing JSR_TOKEN
			delete process.env.JSR_TOKEN;

			const targets: ResolvedTarget[] = [];
			setupRegistryAuth(targets);

			// JSR_TOKEN should not be set - JSR uses OIDC
			expect(process.env.JSR_TOKEN).toBeUndefined();
		});

		it("parses registry-tokens input", () => {
			vi.mocked(core.getInput).mockImplementation((name: string) => {
				if (name === "token") return "github-token";
				if (name === "registry-tokens") return "https://custom.registry.com/=custom-token";
				return "";
			});

			const targets: ResolvedTarget[] = [];
			setupRegistryAuth(targets);

			expect(process.env.CUSTOM_REGISTRY_COM_TOKEN).toBe("custom-token");
		});

		it("returns configured registries", () => {
			process.env.NPM_TOKEN = "npm-token";
			vi.mocked(core.getInput).mockImplementation((name: string) => {
				if (name === "token") return "github-token";
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

			const result = setupRegistryAuth(targets);

			expect(result.configuredRegistries).toContain("https://registry.npmjs.org/");
		});
	});
});
