import type * as core from "@actions/core";
import type { Context } from "@actions/github/lib/context";
import type { GitHub } from "@actions/github/lib/utils";
import type { AsyncFunctionArguments } from "../shared/types.js";

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
 * @param coreModule - GitHub Actions core module
 * @param github - GitHub API client
 * @param context - GitHub Actions context
 * @param checkIds - Array of check run IDs to clean up
 * @param reason - Reason for cleanup (e.g., "Workflow cancelled", "Workflow failed")
 * @param dryRun - Whether this is a dry-run
 * @returns Cleanup result
 */
async function cleanupValidationChecks(
	coreModule: typeof core,
	github: InstanceType<typeof GitHub>,
	context: Context,
	checkIds: number[],
	reason: string,
	dryRun: boolean,
): Promise<CleanupResult> {
	const core = coreModule;

	core.startGroup(`Cleaning up ${checkIds.length} validation check(s)`);

	const result: CleanupResult = {
		cleanedUp: 0,
		failed: 0,
		errors: [],
	};

	for (const checkId of checkIds) {
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

/**
 * Main action entrypoint: Cleans up incomplete validation checks and sets GitHub Actions outputs
 *
 * @param args - Function arguments from github-script
 * @param args.core - GitHub Actions core module
 * @param args.github - GitHub API client
 * @param args.context - GitHub Actions context
 *
 * @remarks
 * This action is called when a workflow fails or is cancelled to clean up
 * any validation checks that are stuck in "pending" or "in_progress" state.
 * It marks all provided check runs as "cancelled" with an appropriate message.
 *
 * The action respects environment variables:
 * - `CHECK_IDS`: JSON array of check run IDs to clean up
 * - `CLEANUP_REASON`: Reason for cleanup (default: "Workflow interrupted")
 * - `DRY_RUN`: Whether this is a dry-run (true | false)
 *
 * Outputs:
 * - `cleaned_up`: Number of checks successfully cleaned up
 * - `failed`: Number of checks that failed to clean up
 * - `errors`: JSON array of error messages
 *
 * @example
 * ```yaml
 * - uses: actions/github-script@v8
 *   if: failure() || cancelled()
 *   env:
 *     CHECK_IDS: ${{ steps.create-checks.outputs.check_ids }}
 *     CLEANUP_REASON: ${{ github.event_name == 'workflow_dispatch' && 'Manually cancelled' || 'Workflow failed' }}
 *     DRY_RUN: ${{ inputs.dry_run }}
 *   with:
 *     script: |
 *       const { default: cleanupValidationChecks } = await import('${{ github.workspace }}/.github/actions/setup-release/cleanup-validation-checks.ts');
 *       await cleanupValidationChecks({ core, github, context });
 * ```
 */
export default async ({ core, github, context }: AsyncFunctionArguments): Promise<void> => {
	try {
		/* v8 ignore next -- @preserve - Default value ensures this branch is never taken in production */
		const checkIdsJson = process.env.CHECK_IDS || "[]";
		const checkIds: number[] = JSON.parse(checkIdsJson);
		const reason = process.env.CLEANUP_REASON || "Workflow interrupted";
		const dryRun = process.env.DRY_RUN === "true";

		if (dryRun) {
			core.notice("🧪 Running in dry-run mode (preview only)");
		}

		if (checkIds.length === 0) {
			core.warning("No check IDs provided for cleanup");
			core.setOutput("cleaned_up", "0");
			core.setOutput("failed", "0");
			core.setOutput("errors", "[]");
			return;
		}

		core.info(`Cleaning up ${checkIds.length} check(s): ${checkIds.join(", ")}`);

		const result = await cleanupValidationChecks(core, github, context, checkIds, reason, dryRun);

		// Set outputs
		core.setOutput("cleaned_up", result.cleanedUp.toString());
		core.setOutput("failed", result.failed.toString());
		core.setOutput("errors", JSON.stringify(result.errors));

		// Log summary
		if (result.failed > 0) {
			core.warning(`⚠️ Cleanup completed with ${result.failed} failure(s) out of ${checkIds.length} check(s)`);
		} else {
			core.notice(`✓ Successfully cleaned up ${result.cleanedUp} check(s)`);
		}

		// Debug outputs
		core.debug(`Set output 'cleaned_up' to: ${result.cleanedUp}`);
		core.debug(`Set output 'failed' to: ${result.failed}`);
		core.debug(`Set output 'errors' to: ${JSON.stringify(result.errors)}`);
	} catch (error) {
		/* v8 ignore next -- @preserve */
		core.setFailed(`Failed to cleanup validation checks: ${error instanceof Error ? error.message : String(error)}`);
	}
};
