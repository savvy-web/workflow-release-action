import * as core from "@actions/core";
import * as github from "@actions/github";

/**
 * Token information result
 */
export interface TokenInfo {
	/** Token type (User, Bot, Integration) */
	type?: string;
	/** Login/username of the token holder */
	login?: string;
	/** App name if GitHub App token */
	appName?: string;
	/** Installation ID if GitHub App token */
	installationId?: number;
	/** Whether token validation succeeded */
	valid: boolean;
	/** Error message if validation failed */
	error?: string;
}

/**
 * Check and log GitHub token information and permissions
 *
 * @remarks
 * For GitHub App tokens, this logs:
 * - Token type (should be "Bot" for GitHub Apps)
 * - App name
 * - Installation context
 *
 * This helps diagnose permission issues like:
 * - "installation not allowed to Create organization package"
 * - Missing packages:write permission
 * - Missing organization_packages:write permission
 *
 * @param token - GitHub token to check
 * @returns Promise resolving to token information
 */
export async function checkTokenPermissions(token: string): Promise<TokenInfo> {
	try {
		const octokit = github.getOctokit(token);

		core.startGroup("🔐 GitHub Token Information");

		// Get authenticated user/app info
		const { data: user } = await octokit.rest.users.getAuthenticated();

		const info: TokenInfo = {
			type: user.type,
			login: user.login,
			valid: true,
		};

		core.info(`Token Type: ${user.type}`);
		core.info(`Login: ${user.login}`);
		core.info(`Account ID: ${user.id}`);

		// For GitHub App tokens (type: "Bot"), try to get more info
		if (user.type === "Bot") {
			core.info("✓ This is a GitHub App token");

			// The login for GitHub App tokens typically ends with [bot]
			if (user.login.endsWith("[bot]")) {
				info.appName = user.login.replace("[bot]", "");
				core.info(`App Name: ${info.appName}`);
			}

			// Try to get installation context from the GitHub context
			if (github.context.payload.installation) {
				info.installationId = github.context.payload.installation.id;
				core.info(`Installation ID: ${info.installationId}`);
			}

			// Log important notes about GitHub App permissions
			core.info("");
			core.info("📋 GitHub App Permission Notes:");
			core.info("  • GitHub Apps use permissions, not OAuth scopes");
			core.info("  • For publishing to GitHub Packages, the app needs:");
			core.info("    - Repository permission: packages (write)");
			core.info("    - For organization packages: may need org-level package permissions");
			core.info("  • Configure permissions at: https://github.com/settings/apps");
			core.info("");
			core.info("⚠️  Common Issues:");
			core.info('  • "installation not allowed to Create organization package"');
			core.info("    → The GitHub App may not have packages:write permission");
			core.info("    → Or it may not have permission to create org-level packages");
			core.info("  • Ensure the app installation has been granted necessary permissions");
			core.info("  • Repository-level packages should work with packages:write");
		} else {
			core.info("ℹ️  This is not a GitHub App token (PAT or other type)");
		}

		core.endGroup();
		return info;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		core.warning(`Failed to check token permissions: ${errorMessage}`);

		core.endGroup();
		return {
			valid: false,
			error: errorMessage,
		};
	}
}
