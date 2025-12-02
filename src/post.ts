import * as core from "@actions/core";

import { isTokenExpired, revokeAppToken } from "./utils/create-app-token.js";

/**
 * Post-action script
 *
 * @remarks
 * Runs after the main action (even on failure). Used for cleanup tasks like:
 * - Revoking GitHub App installation tokens
 * - Reporting final status
 * - Releasing resources
 */
async function run(): Promise<void> {
	try {
		core.debug("Running post-action script");

		// Retrieve state from pre-action
		const startTime = core.getState("startTime");

		if (startTime) {
			const duration = Date.now() - parseInt(startTime, 10);
			core.info(`Release action completed in ${(duration / 1000).toFixed(2)}s`);
		}

		// Revoke token if we generated it (not for legacy tokens)
		const token = core.getState("token");
		const isLegacyToken = core.getState("isLegacyToken") === "true";
		const skipTokenRevoke = core.getState("skipTokenRevoke") === "true";
		const expiresAt = core.getState("expiresAt");

		if (token && !isLegacyToken) {
			if (skipTokenRevoke) {
				core.info("Token revocation skipped (skip-token-revoke is true)");
			} else if (expiresAt && isTokenExpired(expiresAt)) {
				core.info("Token already expired, skipping revocation");
			} else {
				core.info("Revoking GitHub App installation token...");
				await revokeAppToken(token);
			}
		}

		core.debug("Post-action completed");
	} catch (error) {
		// Post-action failures should not fail the entire workflow
		core.warning(`Post-action warning: ${error instanceof Error ? error.message : String(error)}`);
	}
}

await run();
