import { debug, getState, info, warning } from "@actions/core";

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
		debug("Running post-action script");

		// Retrieve state from pre-action
		const startTime = getState("startTime");

		if (startTime) {
			const duration = Date.now() - parseInt(startTime, 10);
			info(`Release action completed in ${(duration / 1000).toFixed(2)}s`);
		}

		// Revoke token if we generated it (not for legacy tokens)
		const token = getState("token");
		const isLegacyToken = getState("isLegacyToken") === "true";
		const skipTokenRevoke = getState("skipTokenRevoke") === "true";
		const expiresAt = getState("expiresAt");

		if (token && !isLegacyToken) {
			if (skipTokenRevoke) {
				info("Token revocation skipped (skip-token-revoke is true)");
			} else if (expiresAt && isTokenExpired(expiresAt)) {
				info("Token already expired, skipping revocation");
			} else {
				info("Revoking GitHub App installation token...");
				await revokeAppToken(token);
			}
		}

		debug("Post-action completed");
	} catch (error) {
		// Post-action failures should not fail the entire workflow
		warning(`Post-action warning: ${error instanceof Error ? error.message : String(error)}`);
	}
}

await run();
