import * as core from "@actions/core";

import { checkTokenPermissions } from "./utils/check-token-permissions.js";
import { createAppToken } from "./utils/create-app-token.js";
import { detectRepoType } from "./utils/detect-repo-type.js";

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
		core.debug("Running pre-action script");

		// Store initial state for post-action cleanup
		const startTime = Date.now().toString();
		core.saveState("startTime", startTime);

		// Get required GitHub App credentials
		const appId = core.getInput("app-id", { required: true });
		const privateKey = core.getInput("private-key", { required: true });
		const skipTokenRevoke = core.getBooleanInput("skip-token-revoke");
		const githubToken = core.getInput("github-token");

		// Generate token from app credentials
		core.info("Generating GitHub App installation token...");

		const tokenResult = await createAppToken({
			appId,
			privateKey,
		});

		const token = tokenResult.token;

		// Save token info for main action and post-action cleanup
		core.saveState("token", token);
		core.saveState("expiresAt", tokenResult.expiresAt);
		core.saveState("installationId", tokenResult.installationId.toString());
		core.saveState("appSlug", tokenResult.appSlug);
		core.saveState("skipTokenRevoke", skipTokenRevoke.toString());

		// Save optional github-token for GitHub Packages (when app doesn't have packages:write)
		if (githubToken) {
			core.saveState("githubToken", githubToken);
			core.setSecret(githubToken);
			core.info("GitHub token provided for GitHub Packages authentication");
		}

		// Set outputs for use in subsequent workflow steps
		core.setOutput("token", token);
		core.setOutput("installation-id", tokenResult.installationId);
		core.setOutput("app-slug", tokenResult.appSlug);

		core.info(`Token generated for app "${tokenResult.appSlug}" (expires: ${tokenResult.expiresAt})`);

		// Validate token permissions
		core.info("Checking GitHub token permissions...");
		const tokenInfo = await checkTokenPermissions(token);

		if (tokenInfo.valid) {
			core.saveState("tokenType", tokenInfo.type || "");
			core.saveState("tokenLogin", tokenInfo.login || "");
			if (tokenInfo.appName) {
				core.saveState("appName", tokenInfo.appName);
			}
		}

		// Auto-detect package manager from package.json
		core.info("Detecting package manager...");
		const repoType = await detectRepoType();
		core.saveState("packageManager", repoType.packageManager);
		core.info(`Detected package manager: ${repoType.packageManager}`);

		core.debug(`Pre-action completed at ${startTime}`);
	} catch (error) {
		// Pre-action failures SHOULD fail the workflow - token is required
		core.setFailed(`Pre-action failed: ${error instanceof Error ? error.message : String(error)}`);
	}
}

await run();
