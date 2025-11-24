import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";

/**
 * Cleanup result
 */
interface CleanupResult {
	/** Number of checks cleaned up */
	cleanedUp: number;
	/** Number of checks that failed to clean up */
	failed: number;
	/** Error messages for failed cleanups */
	errors: string[];
}

/**
 * Retry wrapper with exponential backoff
 *
 * @param operation - Async operation to retry
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param baseDelay - Base delay in ms (default: 1000)
 * @returns Promise resolving to operation result
 */
async function withRetry<T>(operation: () => Promise<T>, maxRetries: number = 3, baseDelay: number = 1000): Promise<T> {
	let lastError: Error | undefined;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await operation();
		} catch (error) {
			/* v8 ignore next -- @preserve - Defensive: handles non-Error throws (extremely rare) */
			lastError = error instanceof Error ? error : new Error(String(error));

			if (attempt === maxRetries) {
				break;
			}

			// Exponential backoff with jitter
			const delay = Math.min(baseDelay * 2 ** attempt + Math.random() * 1000, 10000);

			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}

	throw lastError;
}

/**
 * Cleans up incomplete validation checks by marking them as cancelled
 *
 * @param reason - Reason for cleanup (e.g., "Workflow cancelled", "Workflow failed")
 * @param dryRun - Whether this is a dry-run
 * @returns Cleanup result
 */
export async function cleanupValidationChecks(
	checkIds: number[],
	reason: string,
	dryRun: boolean,
): Promise<CleanupResult> {
	core.startGroup(`Cleaning up ${checkIds.length} validation check(s)`);

	const result: CleanupResult = {
		cleanedUp: 0,
		failed: 0,
		errors: [],
	};

	for (const checkId of checkIds) {
		const token = core.getInput("token", { required: true });
		const github = getOctokit(token);

		try {
			core.info(`Cleaning up check ID: ${checkId}`);

			if (dryRun) {
				core.info(`🧪 [Dry Run] Would mark check ${checkId} as cancelled`);
				result.cleanedUp++;
				continue;
			}

			// Get current check run status first
			const { data: currentCheck } = await withRetry(async () => {
				return await github.rest.checks.get({
					owner: context.repo.owner,
					repo: context.repo.repo,
					check_run_id: checkId,
				});
			});

			// Only update if the check is not already completed
			if (currentCheck.status !== "completed") {
				await withRetry(async () => {
					await github.rest.checks.update({
						owner: context.repo.owner,
						repo: context.repo.repo,
						check_run_id: checkId,
						status: "completed",
						conclusion: "cancelled",
						output: {
							title: "Workflow Cancelled",
							summary: `This check was cancelled due to workflow interruption.\n\n**Reason**: ${reason}`,
						},
					});
				});

				core.info(`✓ Marked check ${checkId} (${currentCheck.name}) as cancelled`);
				result.cleanedUp++;
			} else {
				core.info(`⏭️ Skipped check ${checkId} (${currentCheck.name}) - already ${currentCheck.conclusion}`);
			}
		} catch (error) {
			/* v8 ignore next -- @preserve - Defensive: handles non-Error throws (extremely rare) */
			const errorMsg = error instanceof Error ? error.message : String(error);
			core.warning(`Failed to cleanup check ${checkId}: ${errorMsg}`);
			result.failed++;
			result.errors.push(`Check ${checkId}: ${errorMsg}`);
		}
	}

	core.endGroup();

	// Write job summary
	const summaryBuilder = core.summary.addHeading("Validation Check Cleanup", 2).addEOL();

	if (dryRun) {
		summaryBuilder.addRaw("**Mode**: Dry Run (Preview Only)").addEOL().addEOL();
	}

	summaryBuilder
		.addRaw(`**Reason**: ${reason}`)
		.addEOL()
		.addEOL()
		.addHeading("Results", 3)
		.addEOL()
		.addTable([
			[
				{ data: "Status", header: true },
				{ data: "Count", header: true },
			],
			["Cleaned Up", result.cleanedUp.toString()],
			["Failed", result.failed.toString()],
			["Total", checkIds.length.toString()],
		]);

	if (result.errors.length > 0) {
		summaryBuilder.addEOL().addHeading("Errors", 3).addEOL().addList(result.errors);
	}

	await summaryBuilder.write();

	return result;
}
