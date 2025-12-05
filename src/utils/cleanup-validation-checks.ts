import { endGroup, getState, info, startGroup, warning } from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { summaryWriter } from "./summary-writer.js";

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
	startGroup(`Cleaning up ${checkIds.length} validation check(s)`);

	const result: CleanupResult = {
		cleanedUp: 0,
		failed: 0,
		errors: [],
	};

	const token = getState("token");
	if (!token) {
		throw new Error("No token available from state - ensure pre.ts ran successfully");
	}

	for (const checkId of checkIds) {
		const github = getOctokit(token);

		try {
			info(`Cleaning up check ID: ${checkId}`);

			if (dryRun) {
				info(`🧪 [Dry Run] Would mark check ${checkId} as cancelled`);
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

				info(`✓ Marked check ${checkId} (${currentCheck.name}) as cancelled`);
				result.cleanedUp++;
			} else {
				info(`⏭️ Skipped check ${checkId} (${currentCheck.name}) - already ${currentCheck.conclusion}`);
			}
		} catch (error) {
			/* v8 ignore next -- @preserve - Defensive: handles non-Error throws (extremely rare) */
			const errorMsg = error instanceof Error ? error.message : String(error);
			warning(`Failed to cleanup check ${checkId}: ${errorMsg}`);
			result.failed++;
			result.errors.push(`Check ${checkId}: ${errorMsg}`);
		}
	}

	endGroup();

	// Write job summary using summaryWriter (markdown, not HTML)
	const resultsTable = summaryWriter.table(
		["Status", "Count"],
		[
			["Cleaned Up", result.cleanedUp.toString()],
			["Failed", result.failed.toString()],
			["Total", checkIds.length.toString()],
		],
	);

	const sections: Array<{ heading?: string; level?: 2 | 3; content: string }> = [
		{ heading: "Validation Check Cleanup", content: "" },
	];

	sections.push({ content: `**Reason**: ${reason}` });
	sections.push({ heading: "Results", level: 3, content: resultsTable });

	if (result.errors.length > 0) {
		sections.push({ heading: "Errors", level: 3, content: summaryWriter.list(result.errors) });
	}

	await summaryWriter.write(summaryWriter.build(sections));

	return result;
}
