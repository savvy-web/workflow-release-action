import { setFailed, setOutput } from "@actions/core";
import { closeLinkedIssues } from "./close-linked-issues.js";
import { logger } from "./logger.js";

/**
 * Close linked issues when release PR is merged
 *
 * @remarks
 * Runs on pull_request closed event when:
 * - The PR was merged (not just closed)
 * - The PR is from the release branch to the target branch
 *
 * Uses GitHub's GraphQL API to find issues linked to the PR via
 * "fixes #123" keywords and closes each one with a comment.
 *
 * @param inputs - Input configuration containing token and dryRun flag
 * @param prNumber - The pull request number that was merged
 */
export async function runCloseLinkedIssues(
	inputs: { token: string; dryRun: boolean },
	prNumber: number,
): Promise<void> {
	try {
		logger.step(1, "Close Linked Issues");

		const result = await closeLinkedIssues(inputs.token, prNumber, inputs.dryRun);

		setOutput("closed_issues_count", result.closedCount);
		setOutput("failed_issues_count", result.failedCount);
		setOutput("closed_issues", JSON.stringify(result.issues));

		if (result.closedCount > 0) {
			logger.success(`Closed ${result.closedCount} linked issue(s)`);
		} else {
			logger.info("No linked issues to close");
		}

		if (result.failedCount > 0) {
			logger.warn(`Failed to close ${result.failedCount} issue(s)`);
		}

		logger.endStep();
		logger.phaseComplete(3);
	} catch (err) {
		setFailed(`Failed to close linked issues: ${err instanceof Error ? err.message : String(err)}`);
		throw err;
	}
}
