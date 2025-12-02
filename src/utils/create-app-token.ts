import * as core from "@actions/core";
import { context } from "@actions/github";
import { createAppAuth } from "@octokit/auth-app";
import { request } from "@octokit/request";

/**
 * Result from creating a GitHub App installation token
 */
export interface AppTokenResult {
	/** The installation access token */
	token: string;
	/** When the token expires (ISO 8601 format) */
	expiresAt: string;
	/** The installation ID */
	installationId: number;
	/** The app slug (URL-friendly name) */
	appSlug: string;
}

/**
 * Options for creating an app token
 */
export interface CreateAppTokenOptions {
	/** GitHub App ID */
	appId: string;
	/** GitHub App private key (PEM format) */
	privateKey: string;
	/** Repository owner (defaults to current repository owner) */
	owner?: string;
	/** Repository name (defaults to current repository) */
	repository?: string;
	/** GitHub API URL (defaults to https://api.github.com) */
	apiUrl?: string;
}

/**
 * Internal type for installation authentication response
 */
interface InstallationAuth {
	token: string;
	expiresAt?: string;
	permissions?: Record<string, string>;
}

/**
 * Default permissions required for the release workflow
 *
 * @remarks
 * These permissions are needed for:
 * - contents:write - Push commits, create branches and tags
 * - pull_requests:write - Create and update release PRs
 * - checks:write - Create validation check runs
 * - issues:write - Add comments, close linked issues
 * - packages:write - Publish to GitHub Packages (repo-level)
 * - organization_packages:write - Publish to GitHub Packages (org-level)
 * - members:read - Read org membership for team notifications
 */
const RELEASE_WORKFLOW_PERMISSIONS = {
	contents: "write",
	pull_requests: "write",
	checks: "write",
	issues: "write",
	packages: "write",
	organization_packages: "write",
	members: "read",
} as const;

/**
 * Creates a GitHub App installation access token
 *
 * @remarks
 * This generates a short-lived token (1 hour) that can be used to authenticate
 * as the GitHub App installation. The token has the permissions configured
 * for the app installation on the repository.
 *
 * @example
 * ```typescript
 * const result = await createAppToken({
 *   appId: "12345",
 *   privateKey: "-----BEGIN RSA PRIVATE KEY-----\n...",
 * });
 * console.log(`Token expires at: ${result.expiresAt}`);
 * ```
 */
export async function createAppToken(options: CreateAppTokenOptions): Promise<AppTokenResult> {
	const { appId, privateKey, apiUrl = "https://api.github.com" } = options;

	// Default to current repository if not specified
	const owner = options.owner || context.repo.owner;
	const repository = options.repository || context.repo.repo;

	if (!appId) {
		throw new Error("app-id is required");
	}

	if (!privateKey) {
		throw new Error("private-key is required");
	}

	core.info(`Creating GitHub App token for ${owner}/${repository}`);

	// Create the app auth instance
	const auth = createAppAuth({
		appId,
		privateKey,
		request: request.defaults({
			baseUrl: apiUrl,
		}),
	});

	// Get the installation ID for this repository
	const appAuthentication = await auth({ type: "app" });

	const installationResponse = await request("GET /repos/{owner}/{repo}/installation", {
		owner,
		repo: repository,
		headers: {
			authorization: `bearer ${appAuthentication.token}`,
		},
		baseUrl: apiUrl,
	});

	const installationId = installationResponse.data.id;
	const appSlug = installationResponse.data.app_slug;

	core.debug(`Found installation ${installationId} for app ${appSlug}`);
	core.debug(`Requesting permissions: ${JSON.stringify(RELEASE_WORKFLOW_PERMISSIONS)}`);

	// Get an installation access token with specific permissions
	let installationAuthentication: InstallationAuth;
	try {
		installationAuthentication = (await auth({
			type: "installation",
			installationId,
			permissions: RELEASE_WORKFLOW_PERMISSIONS,
		})) as InstallationAuth;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		core.error(`Failed to create installation token: ${message}`);

		// Check for common permission errors
		if (message.includes("Resource not accessible") || message.includes("403")) {
			core.error("This may indicate the GitHub App doesn't have the required permissions configured.");
			core.error(
				"Required permissions: contents:write, pull_requests:write, checks:write, issues:write, packages:write, organization_packages:write, members:read",
			);
		}

		throw error;
	}

	// Log granted permissions
	const grantedPermissions = installationAuthentication.permissions;
	if (grantedPermissions) {
		core.info(`Granted permissions: ${JSON.stringify(grantedPermissions)}`);

		// Check for missing permissions
		const requested = Object.keys(RELEASE_WORKFLOW_PERMISSIONS);
		const granted = Object.keys(grantedPermissions);
		const missing = requested.filter((p) => !granted.includes(p));

		if (missing.length > 0) {
			core.warning(`Some requested permissions were not granted: ${missing.join(", ")}`);
			core.warning("The GitHub App may not have these permissions configured, or they may not be available.");
		}
	} else {
		core.debug("No permissions object returned in authentication response");
	}

	core.info(`Created token for app "${appSlug}" (installation ${installationId})`);

	// Mask the token in logs
	core.setSecret(installationAuthentication.token);

	return {
		token: installationAuthentication.token,
		expiresAt: installationAuthentication.expiresAt || new Date(Date.now() + 3600000).toISOString(),
		installationId,
		appSlug,
	};
}

/**
 * Revokes a GitHub App installation access token
 *
 * @remarks
 * This invalidates the token immediately. Should be called in post-action
 * cleanup to ensure tokens don't persist beyond the job lifetime.
 *
 * @param token - The installation access token to revoke
 * @param apiUrl - GitHub API URL (defaults to https://api.github.com)
 */
export async function revokeAppToken(token: string, apiUrl: string = "https://api.github.com"): Promise<void> {
	if (!token) {
		core.debug("No token to revoke");
		return;
	}

	try {
		await request("DELETE /installation/token", {
			headers: {
				authorization: `token ${token}`,
			},
			baseUrl: apiUrl,
		});
		core.info("Token revoked successfully");
	} catch (error) {
		// Don't fail the workflow if revocation fails - token will expire anyway
		core.warning(`Token revocation failed: ${error instanceof Error ? error.message : String(error)}`);
	}
}

/**
 * Checks if a token has expired based on its expiration time
 *
 * @param expiresAt - ISO 8601 timestamp of when the token expires
 * @returns true if the token has expired
 */
export function isTokenExpired(expiresAt: string): boolean {
	const expiresAtDate = new Date(expiresAt);
	return expiresAtDate.getTime() < Date.now();
}
