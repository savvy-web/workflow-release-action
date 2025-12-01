import * as core from "@actions/core";

/**
 * Pre-action script
 *
 * @remarks
 * Runs before the main action. Used for setup tasks like:
 * - Validating inputs
 * - Setting up environment
 * - Caching state for post-action
 */
async function run(): Promise<void> {
	try {
		core.debug("Running pre-action script");

		// Store initial state for post-action cleanup
		const startTime = Date.now().toString();
		core.saveState("startTime", startTime);

		core.debug(`Pre-action completed at ${startTime}`);
	} catch (error) {
		// Pre-action failures should not fail the entire workflow
		core.warning(`Pre-action warning: ${error instanceof Error ? error.message : String(error)}`);
	}
}

await run();
