import * as core from "@actions/core";
import { checkTokenPermissions } from "./utils/check-token-permissions.js";

/**
 * Pre-action script
 *
 * @remarks
 * Runs before the main action. Used for setup tasks like:
 * - Validating inputs
 * - Setting up environment
 * - Checking token permissions
 * - Caching state for post-action
 */
async function run(): Promise<void> {
	try {
		core.debug("Running pre-action script");

		// Store initial state for post-action cleanup
		const startTime = Date.now().toString();
		core.saveState("startTime", startTime);

		// Check and log token permissions
		const token = core.getInput("token", { required: true });
		core.info("Checking GitHub token permissions...");
		const tokenInfo = await checkTokenPermissions(token);

		// Store token info for potential use in main/post actions
		if (tokenInfo.valid) {
			core.saveState("tokenType", tokenInfo.type || "");
			core.saveState("tokenLogin", tokenInfo.login || "");
			if (tokenInfo.appName) {
				core.saveState("appName", tokenInfo.appName);
			}
			if (tokenInfo.installationId) {
				core.saveState("installationId", tokenInfo.installationId.toString());
			}
		}

		core.debug(`Pre-action completed at ${startTime}`);
	} catch (error) {
		// Pre-action failures should not fail the entire workflow
		core.warning(`Pre-action warning: ${error instanceof Error ? error.message : String(error)}`);
	}
}

await run();
