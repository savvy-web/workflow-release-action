import { debug, getBooleanInput, getInput, info, saveState, setFailed, setOutput, setSecret } from "@actions/core";

import { checkTokenPermissions } from "./utils/check-token-permissions.js";
import { createAppToken } from "./utils/create-app-token.js";

/**
 * Pre-action script
 *
 * @remarks
 * Runs before the main action. Handles:
 * - GitHub App token generation from app-id and private-key
 * - Token permission validation
 * - State initialization for post-action cleanup
 */
async function run(): Promise<void> {
	try {
		debug("Running pre-action script");

		// Store initial state for post-action cleanup
		const startTime = Date.now().toString();
		saveState("startTime", startTime);

		// Get required GitHub App credentials
		const appId = getInput("app-id", { required: true });
		const privateKey = getInput("private-key", { required: true });
		const skipTokenRevoke = getBooleanInput("skip-token-revoke");
		const githubToken = getInput("github-token");

		// Generate token from app credentials
		info("Generating GitHub App installation token...");

		const tokenResult = await createAppToken({
			appId,
			privateKey,
		});

		const token = tokenResult.token;

		// Save token info for main action and post-action cleanup
		saveState("token", token);
		saveState("expiresAt", tokenResult.expiresAt);
		saveState("installationId", tokenResult.installationId.toString());
		saveState("appSlug", tokenResult.appSlug);
		saveState("skipTokenRevoke", skipTokenRevoke.toString());

		// Save optional github-token for GitHub Packages (when app doesn't have packages:write)
		if (githubToken) {
			saveState("githubToken", githubToken);
			setSecret(githubToken);
			info("GitHub token provided for GitHub Packages authentication");
		}

		// Set outputs for use in subsequent workflow steps
		setOutput("token", token);
		setOutput("installation-id", tokenResult.installationId);
		setOutput("app-slug", tokenResult.appSlug);

		info(`Token generated for app "${tokenResult.appSlug}" (expires: ${tokenResult.expiresAt})`);

		// Validate token permissions
		info("Checking GitHub token permissions...");
		const tokenInfo = await checkTokenPermissions(token);

		if (tokenInfo.valid) {
			saveState("tokenType", tokenInfo.type || "");
			saveState("tokenLogin", tokenInfo.login || "");
			if (tokenInfo.appName) {
				saveState("appName", tokenInfo.appName);
			}
		}

		debug(`Pre-action completed at ${startTime}`);
	} catch (error) {
		// Pre-action failures SHOULD fail the workflow - token is required
		setFailed(`Pre-action failed: ${error instanceof Error ? error.message : String(error)}`);
	}
}

await run();
