import { debug, endGroup, info, startGroup } from "@actions/core";
import { context, getOctokit } from "@actions/github";

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
 *
 * @param token - GitHub token to check
 * @returns Promise resolving to token information
 */
export async function checkTokenPermissions(token: string): Promise<TokenInfo> {
	try {
		const octokit = getOctokit(token);

		startGroup("🔐 GitHub Token Information");

		// Get authenticated user/app info
		const { data: user } = await octokit.rest.users.getAuthenticated();

		const tokenInfo: TokenInfo = {
			type: user.type,
			login: user.login,
			valid: true,
		};

		info(`Token Type: ${user.type}`);
		info(`Login: ${user.login}`);
		info(`Account ID: ${user.id}`);

		// For GitHub App tokens (type: "Bot"), try to get more info
		if (user.type === "Bot") {
			info("✓ This is a GitHub App token");

			// The login for GitHub App tokens typically ends with [bot]
			if (user.login.endsWith("[bot]")) {
				tokenInfo.appName = user.login.replace("[bot]", "");
				info(`App Name: ${tokenInfo.appName}`);
			}

			// Try to get installation context from the GitHub context
			if (context.payload.installation) {
				tokenInfo.installationId = context.payload.installation.id;
				info(`Installation ID: ${tokenInfo.installationId}`);
			}

			// Log important notes about GitHub App permissions
			info("");
			info("📋 GitHub App Permission Notes:");
			info("  • GitHub Apps use permissions, not OAuth scopes");
			info("  • For publishing to GitHub Packages, the app needs:");
			info("    - Repository permission: packages (write)");
			info("  • Organization packages require the app to have packages:write on the specific repository");
			info("  • Configure permissions at: https://github.com/settings/apps");
			info("");
			info("⚠️  Common Issues:");
			info('  • "installation not allowed to Create organization package"');
			info("    → The GitHub App may not have packages:write permission");
			info("    → Ensure packages:write is enabled on the repository");
			info("  • Ensure the app installation has been granted necessary permissions");
		} else {
			info("ℹ️  This is not a GitHub App token (PAT or other type)");
		}

		endGroup();
		return tokenInfo;
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		// Use debug instead of warning to avoid creating annotations for expected failures
		// GitHub App tokens often can't access /user endpoint (requires user:email scope)
		debug(`Failed to check token permissions: ${errorMessage}`);
		endGroup();

		return {
			valid: false,
			error: errorMessage,
		};
	}
}
