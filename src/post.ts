import * as core from "@actions/core";

/**
 * Post-action script
 *
 * @remarks
 * Runs after the main action (even on failure). Used for cleanup tasks like:
 * - Cleaning up incomplete checks
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

		core.debug("Post-action completed");
	} catch (error) {
		// Post-action failures should not fail the entire workflow
		core.warning(`Post-action warning: ${error instanceof Error ? error.message : String(error)}`);
	}
}

await run();
