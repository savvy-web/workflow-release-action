import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { debug, getInput, getState, info, setSecret, warning } from "@actions/core";
import { exec } from "@actions/exec";
import type { AuthSetupResult, ResolvedTarget } from "../types/publish-config.js";
import { registryToEnvName } from "./resolve-targets.js";

/** Timeout for registry health checks (10 seconds) */
const REGISTRY_CHECK_TIMEOUT_MS = 10000;

/**
 * Get the command to run npm operations
 *
 * This is the primary wrapper for running npm commands across different package managers.
 * All package managers use their "execute" command to run npm.
 *
 * @remarks
 * - npm: `npx npm <args>`
 * - pnpm: `pnpm dlx npm <args>`
 * - yarn: `yarn npm <args>`
 * - bun: `bun x npm <args>`
 *
 * @param packageManager - The package manager being used
 * @returns Command and base args to prepend before npm arguments
 */
function getNpmCommand(packageManager: string): { cmd: string; baseArgs: string[] } {
	switch (packageManager) {
		case "pnpm":
			return { cmd: "pnpm", baseArgs: ["dlx", "npm"] };
		case "yarn":
			return { cmd: "yarn", baseArgs: ["npm"] };
		case "bun":
			return { cmd: "bun", baseArgs: ["x", "npm"] };
		default:
			return { cmd: "npx", baseArgs: ["npm"] };
	}
}

/**
 * Check if a registry uses OIDC-based authentication
 *
 * @remarks
 * OIDC (OpenID Connect) enables token-less publishing:
 * - npm public registry: Uses trusted publishing via Sigstore OIDC
 * - JSR: Uses OIDC natively in GitHub Actions
 *
 * @param registry - Registry URL to check
 * @returns true if registry uses OIDC
 */
function isOidcRegistry(registry: string | null): boolean {
	if (!registry) return false;
	// npm public registry supports OIDC trusted publishing
	if (registry.includes("registry.npmjs.org")) return true;
	return false;
}

/**
 * Check if a registry URL is reachable using npm ping
 *
 * @remarks
 * Uses `npm ping --registry=<url> --json` which is more accurate than HTTP fetch
 * because it tests the actual npm protocol that will be used for publishing.
 *
 * @param registry - Registry URL to check
 * @param packageManager - Package manager to use for running npm commands
 * @returns Object with reachable status and error message if failed
 */
async function checkRegistryReachable(
	registry: string,
	packageManager: string,
): Promise<{ reachable: boolean; error?: string }> {
	let output = "";
	let errorOutput = "";

	// Create a timeout promise that rejects after the timeout
	const timeoutPromise = new Promise<never>((_, reject) => {
		setTimeout(() => {
			reject(new Error(`Timeout after ${REGISTRY_CHECK_TIMEOUT_MS}ms`));
		}, REGISTRY_CHECK_TIMEOUT_MS);
	});

	// Create the exec promise
	const execPromise = (async (): Promise<{ reachable: boolean; error?: string }> => {
		const npmCmd = getNpmCommand(packageManager);
		const args = [...npmCmd.baseArgs, "ping", "--registry", registry, "--json"];
		const exitCode = await exec(npmCmd.cmd, args, {
			silent: true,
			listeners: {
				stdout: (data: Buffer) => {
					output += data.toString();
				},
				stderr: (data: Buffer) => {
					errorOutput += data.toString();
				},
			},
			ignoreReturnCode: true,
		});

		if (exitCode === 0) {
			return { reachable: true };
		}

		// Try to parse JSON error from npm
		try {
			const parsed = JSON.parse(output || errorOutput) as { error?: { summary?: string; code?: string } };
			if (parsed.error) {
				return {
					reachable: false,
					error: parsed.error.summary || parsed.error.code || "npm ping failed",
				};
			}
		} catch {
			// Not JSON, use raw output
		}

		// Extract meaningful error from output
		const combinedOutput = `${output} ${errorOutput}`.trim();
		if (combinedOutput.includes("ENOTFOUND") || combinedOutput.includes("getaddrinfo")) {
			return { reachable: false, error: "Registry hostname not found" };
		}
		if (combinedOutput.includes("ECONNREFUSED")) {
			return { reachable: false, error: "Connection refused" };
		}
		if (combinedOutput.includes("ETIMEDOUT") || combinedOutput.includes("timeout")) {
			return { reachable: false, error: "Connection timed out" };
		}
		if (combinedOutput.includes("503") || combinedOutput.includes("Service Unavailable")) {
			return { reachable: false, error: "Service unavailable (503)" };
		}

		return {
			reachable: false,
			error: combinedOutput.slice(0, 200) || `npm ping failed with exit code ${exitCode}`,
		};
	})();

	try {
		// Race between exec and timeout
		return await Promise.race([execPromise, timeoutPromise]);
	} catch (error) {
		if (error instanceof Error) {
			if (error.message.includes("Timeout")) {
				return {
					reachable: false,
					error: error.message,
				};
			}
			return {
				reachable: false,
				error: error.message,
			};
		}
		return {
			reachable: false,
			error: "Unknown error checking registry",
		};
	}
}

/**
 * Validate that all non-OIDC registries are reachable
 *
 * @remarks
 * Checks each custom registry URL to ensure it responds. This prevents
 * npm from hanging indefinitely when a registry URL is misconfigured.
 *
 * @param targets - Array of resolved targets to validate
 * @param packageManager - Package manager to use for running npm commands
 * @returns Array of unreachable registries with error messages
 */
export async function validateRegistriesReachable(
	targets: ResolvedTarget[],
	packageManager: string,
): Promise<Array<{ registry: string; error: string }>> {
	const unreachable: Array<{ registry: string; error: string }> = [];
	const checkedRegistries = new Set<string>();

	for (const target of targets) {
		// Skip non-npm protocols
		if (target.protocol !== "npm" || !target.registry) continue;

		// Skip already checked registries
		if (checkedRegistries.has(target.registry)) continue;
		checkedRegistries.add(target.registry);

		// Skip well-known registries that we trust
		if (isOidcRegistry(target.registry)) continue;
		if (target.registry.includes("npm.pkg.github.com")) continue;

		debug(`Checking registry reachability: ${target.registry}`);
		const result = await checkRegistryReachable(target.registry, packageManager);

		if (!result.reachable) {
			warning(`Registry unreachable: ${target.registry} - ${result.error}`);
			unreachable.push({
				registry: target.registry,
				error: result.error || "Unknown error",
			});
		} else {
			debug(`Registry reachable: ${target.registry}`);
		}
	}

	return unreachable;
}

/**
 * Validate that required tokens are available in environment
 *
 * @remarks
 * OIDC-based registries (npm, JSR) don't require tokens - they use
 * temporary credentials from the GitHub Actions OIDC provider.
 * Only GitHub Packages and custom registries require tokens.
 *
 * @param targets - Array of resolved targets to validate
 * @returns Validation result with missing tokens
 */
export function validateTokensAvailable(targets: ResolvedTarget[]): {
	valid: boolean;
	missing: Array<{ registry: string; tokenEnv: string }>;
} {
	const missing: Array<{ registry: string; tokenEnv: string }> = [];

	for (const target of targets) {
		// JSR uses OIDC in GitHub Actions, token is optional
		if (target.protocol === "jsr") {
			debug("JSR uses OIDC - no token required");
			continue;
		}

		// npm public registry uses OIDC trusted publishing
		if (isOidcRegistry(target.registry)) {
			debug("npm uses OIDC trusted publishing - no token required");
			continue;
		}

		// GitHub Packages and custom registries need tokens
		if (!target.tokenEnv) {
			missing.push({
				registry: target.registry || "unknown",
				tokenEnv: "tokenEnv not specified",
			});
			continue;
		}

		if (!process.env[target.tokenEnv]) {
			missing.push({
				registry: target.registry || "unknown",
				tokenEnv: target.tokenEnv,
			});
		}
	}

	return {
		valid: missing.length === 0,
		missing,
	};
}

/**
 * Generate .npmrc with authentication for non-OIDC registries
 *
 * @remarks
 * Only generates auth entries for:
 * - GitHub Packages (uses GitHub App token)
 * - Custom registries (uses provided tokens)
 *
 * OIDC registries (npm public, JSR) don't need .npmrc entries.
 *
 * @param targets - Array of resolved targets to configure auth for
 */
export function generateNpmrc(targets: ResolvedTarget[]): void {
	const lines: string[] = [];
	const processedRegistries = new Set<string>();

	for (const target of targets) {
		if (target.protocol !== "npm" || !target.registry) continue;
		if (processedRegistries.has(target.registry)) continue;

		// Skip OIDC registries - they don't need .npmrc auth
		if (isOidcRegistry(target.registry)) {
			info(`${target.registry} uses OIDC - skipping .npmrc auth`);
			processedRegistries.add(target.registry);
			continue;
		}

		processedRegistries.add(target.registry);

		if (!target.tokenEnv) {
			warning(`No token env var for registry: ${target.registry}`);
			continue;
		}

		const authValue = process.env[target.tokenEnv];
		if (!authValue) {
			warning(`Token env var ${target.tokenEnv} is not set for registry: ${target.registry}`);
			continue;
		}

		// Convert registry URL to npmrc format
		// https://npm.pkg.github.com/ -> //npm.pkg.github.com/:_authToken=TOKEN
		const registryPath = target.registry.replace(/^https?:/, "");

		// Check if authValue is already a full auth string (_authToken=... or _auth=...)
		// or if it's just a raw token that needs wrapping
		if (authValue.startsWith("_authToken=") || authValue.startsWith("_auth=")) {
			// Full auth string - use as-is
			lines.push(`${registryPath}:${authValue}`);
		} else {
			// Raw token - wrap with _authToken=
			lines.push(`${registryPath}:_authToken=${authValue}`);
		}
		info(`Configured auth for: ${target.registry}`);
	}

	if (lines.length === 0) {
		debug("No registries to configure in .npmrc");
		return;
	}

	// Write to user's home .npmrc
	const npmrcPath = join(process.env.HOME || "~", ".npmrc");

	// Append to existing .npmrc if it exists
	const existingContent = existsSync(npmrcPath) ? readFileSync(npmrcPath, "utf-8") : "";

	const newContent = existingContent
		? `${existingContent}\n\n# Added by workflow-release-action\n${lines.join("\n")}\n`
		: `# Generated by workflow-release-action\n${lines.join("\n")}\n`;

	writeFileSync(npmrcPath, newContent);
	info(`Updated .npmrc with ${lines.length} registry auth(s)`);
}

/**
 * Setup authentication for all registries
 *
 * @remarks
 * Authentication strategy:
 * - **npm public registry**: Uses OIDC trusted publishing (no token needed)
 * - **GitHub Packages**: Uses `github-token` input if provided, otherwise GitHub App token
 * - **JSR**: Uses OIDC (no token needed)
 * - **Custom registries**: Uses tokens from `custom-registries` input, or GitHub App token if not specified
 *
 * The GitHub token is set to GITHUB_TOKEN for GitHub Packages auth.
 * No .npmrc entry is needed for npm/JSR since they use OIDC.
 *
 * Custom registries format (one per line):
 * - `https://registry.example.com/` - Use GitHub App token
 * - `https://registry.example.com/=TOKEN` - Use explicit token (optional)
 *
 * @param targets - Array of resolved targets to setup auth for
 * @param packageManager - Package manager to use for running npm commands
 * @returns Authentication setup result
 */
export async function setupRegistryAuth(targets: ResolvedTarget[], packageManager: string): Promise<AuthSetupResult> {
	// Get tokens from state (set by pre.ts)
	const appToken = getState("token");
	const githubToken = getState("githubToken"); // Optional: workflow's GITHUB_TOKEN for packages:write

	// Determine which token to use for GitHub Packages
	// Prefer the explicit github-token input (has packages:write from workflow permissions)
	// Fall back to GitHub App token if not provided
	const packagesToken = githubToken || appToken;

	if (!packagesToken) {
		warning("No GitHub token available - GitHub Packages and custom registries may fail to authenticate");
	} else {
		// Set GITHUB_TOKEN for GitHub Packages
		process.env.GITHUB_TOKEN = packagesToken;
		if (githubToken) {
			info("Using workflow GITHUB_TOKEN for GitHub Packages authentication (packages:write)");
		} else {
			info("Using GitHub App token for GitHub Packages authentication");
		}
	}

	// Use appToken for custom registries (GitHub App token for API operations)
	const customRegistryToken = appToken;

	// Parse custom registries input
	// Format: "https://registry.example.com/" (uses GitHub App token)
	// Format: "https://registry.example.com/_authToken=TOKEN" (npmrc auth string appended)
	// Format: "https://registry.example.com/_auth=BASE64" (htpasswd auth string appended)
	const customRegistriesInput = getInput("custom-registries");
	if (customRegistriesInput) {
		const inputLines = customRegistriesInput.split("\n").filter((line) => line.trim());
		for (const line of inputLines) {
			const trimmedLine = line.trim();

			// Look for npmrc auth string patterns (_authToken= or _auth=)
			const authTokenMatch = trimmedLine.match(/^(.+?)(_authToken=.+)$/);
			const authMatch = trimmedLine.match(/^(.+?)(_auth=.+)$/);

			if (authTokenMatch) {
				// Format: URL_authToken=TOKEN (npmrc auth string appended directly)
				const registry = `${authTokenMatch[1].replace(/\/$/, "")}/`; // Normalize trailing slash
				const authString = authTokenMatch[2]; // Full auth string: _authToken=TOKEN
				const envVarName = registryToEnvName(registry);

				// Mask both the full auth string and the token value to prevent leaks
				setSecret(authString);
				const tokenValue = authString.replace(/^_authToken=/, "");
				if (tokenValue) setSecret(tokenValue);

				process.env[envVarName] = authString;
				info(`Set ${envVarName} for custom registry: ${registry}`);
			} else if (authMatch) {
				// Format: URL_auth=BASE64 (htpasswd auth string appended directly)
				const registry = `${authMatch[1].replace(/\/$/, "")}/`; // Normalize trailing slash
				const authString = authMatch[2]; // Full auth string: _auth=BASE64
				const envVarName = registryToEnvName(registry);

				// Mask both the full auth string and the base64 value to prevent leaks
				setSecret(authString);
				const authValue = authString.replace(/^_auth=/, "");
				if (authValue) setSecret(authValue);

				process.env[envVarName] = authString;
				info(`Set ${envVarName} for custom registry: ${registry}`);
			} else {
				// No auth string found - registry URL only, use GitHub App token
				const registry = trimmedLine;
				if (registry && customRegistryToken) {
					const envVarName = registryToEnvName(registry);
					// Store as _authToken= format for consistency
					const authString = `_authToken=${customRegistryToken}`;

					// Mask both formats (token is already masked by GitHub, but be safe)
					setSecret(authString);
					setSecret(customRegistryToken);

					process.env[envVarName] = authString;
					info(`Set ${envVarName} for custom registry: ${registry} (using GitHub App token)`);
				}
			}
		}
	}

	// Validate tokens for non-OIDC registries
	const validation = validateTokensAvailable(targets);

	// Check custom registries are reachable before attempting to use them
	const unreachableRegistries = await validateRegistriesReachable(targets, packageManager);

	// Generate .npmrc for GitHub Packages and custom registries
	generateNpmrc(targets);

	return {
		success: validation.valid && unreachableRegistries.length === 0,
		configuredRegistries: Array.from(
			new Set(targets.filter((t) => t.protocol === "npm" && t.registry).map((t) => t.registry as string)),
		),
		missingTokens: validation.missing,
		unreachableRegistries,
	};
}
