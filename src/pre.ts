import * as core from "@actions/core";

import { checkTokenPermissions } from "./utils/check-token-permissions.js";
import { createAppToken } from "./utils/create-app-token.js";

/**
 * Pre-action script
 *
 * @remarks
 * Runs before the main action. Handles:
 * - GitHub App token generation (when app-id and private-key are provided)
 * - Token permission validation
 * - State initialization for post-action cleanup
 */
async function run(): Promise<void> {
	try {
		core.debug("Running pre-action script");

		// Store initial state for post-action cleanup
		const startTime = Date.now().toString();
		core.saveState("startTime", startTime);

		// Check if we need to generate a token
		const appId = core.getInput("app-id");
		const privateKey = core.getInput("private-key");
		const legacyToken = core.getInput("token");
		const skipTokenRevoke = core.getBooleanInput("skip-token-revoke");

		let token: string;

		if (appId && privateKey) {
			// Generate token from app credentials
			core.info("Generating GitHub App installation token...");

			const tokenResult = await createAppToken({
				appId,
				privateKey,
			});

			token = tokenResult.token;

			// Save token info for main action and post-action cleanup
			core.saveState("token", token);
			core.saveState("expiresAt", tokenResult.expiresAt);
			core.saveState("installationId", tokenResult.installationId.toString());
			core.saveState("appSlug", tokenResult.appSlug);
			core.saveState("skipTokenRevoke", skipTokenRevoke.toString());

			// Set outputs for use in subsequent workflow steps
			core.setOutput("token", token);
			core.setOutput("installation-id", tokenResult.installationId);
			core.setOutput("app-slug", tokenResult.appSlug);

			core.info(`Token generated for app "${tokenResult.appSlug}" (expires: ${tokenResult.expiresAt})`);
		} else if (legacyToken) {
			// Use provided token (backwards compatibility)
			core.info("Using provided token (legacy mode)");
			token = legacyToken;
			core.saveState("token", token);
			core.saveState("isLegacyToken", "true");
		} else {
			throw new Error("Either app-id/private-key or token must be provided");
		}

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

		core.debug(`Pre-action completed at ${startTime}`);
	} catch (error) {
		// Pre-action failures SHOULD fail the workflow - token is required
		core.setFailed(`Pre-action failed: ${error instanceof Error ? error.message : String(error)}`);
	}
}

await run();
