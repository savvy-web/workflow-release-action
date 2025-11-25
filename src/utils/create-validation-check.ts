import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import type { ValidationResult } from "../types/shared-types.js";

/**
 * Unified validation check result
 */
interface UnifiedValidationResult {
	/** Whether all validations passed */
	success: boolean;
	/** Individual validation results */
	validations: ValidationResult[];
	/** GitHub check run ID */
	checkId: number;
}

/**
 * Creates a unified validation check that aggregates multiple validation results
 *
 * @param validations - Array of validation results to aggregate
 * @param dryRun - Whether this is a dry-run
 * @returns Unified validation result
 *
 * @remarks
 * This function:
 * 1. Aggregates results from multiple validation checks
 * 2. Creates a single unified check run with all results
 * 3. Determines overall success (all checks must pass)
 * 4. Generates a comprehensive summary table
 * 5. Returns unified result with check ID
 */
export async function createValidationCheck(
	validations: ValidationResult[],
	dryRun: boolean,
): Promise<UnifiedValidationResult> {
	const token = core.getInput("token", { required: true });
	const github = getOctokit(token);
	core.startGroup("Creating unified validation check");

	// Determine overall success
	const success = validations.every((v) => v.success);
	const failedChecks = validations.filter((v) => !v.success);

	core.info(`Processed ${validations.length} validation check(s)`);
	core.info(`Passed: ${validations.length - failedChecks.length}, Failed: ${failedChecks.length}`);

	core.endGroup();

	// Create GitHub check run
	const checkTitle = dryRun ? "🧪 Release Validation Summary (Dry Run)" : "Release Validation Summary";
	const checkSummary = success
		? `All ${validations.length} validation(s) passed`
		: `${failedChecks.length} of ${validations.length} validation(s) failed`;

	// Build check details using core.summary methods
	const checkSummaryBuilder = core.summary
		.addHeading("Validation Results", 2)
		.addEOL()
		.addTable([
			[
				{ data: "Check", header: true },
				{ data: "Status", header: true },
				{ data: "Details", header: true },
			],
			...validations.map((v) => {
				const status = v.success ? "✅ Passed" : "❌ Failed";
				const details = v.message || (v.success ? "All checks passed" : "Validation failed");
				return [v.name, status, details];
			}),
		]);

	if (failedChecks.length > 0) {
		checkSummaryBuilder
			.addEOL()
			.addHeading("Failed Validations", 3)
			.addEOL()
			.addRaw(failedChecks.map((v) => `- **${v.name}**: ${v.message || "Validation failed"}`).join("\n"));
	}

	if (dryRun) {
		checkSummaryBuilder.addEOL().addEOL().addRaw("---").addEOL().addRaw("**Mode**: Dry Run (Preview Only)");
	}

	const checkDetails = checkSummaryBuilder.stringify();

	const { data: checkRun } = await github.rest.checks.create({
		owner: context.repo.owner,
		repo: context.repo.repo,
		name: checkTitle,
		head_sha: context.sha,
		status: "completed",
		conclusion: success ? "success" : "failure",
		output: {
			title: checkSummary,
			summary: checkDetails,
		},
	});

	core.info(`Created unified check run: ${checkRun.html_url}`);

	// Write job summary
	const summaryBuilder = core.summary
		.addHeading(checkTitle, 2)
		.addRaw(checkSummary)
		.addEOL()
		.addHeading("Validation Results", 3)
		.addTable([
			[
				{ data: "Check", header: true },
				{ data: "Status", header: true },
				{ data: "Details", header: true },
			],
			...validations.map((v) => {
				const status = v.success ? "✅ Passed" : "❌ Failed";
				const details = v.message || (v.success ? "All checks passed" : "Validation failed");
				return [v.name, status, details];
			}),
		]);

	if (failedChecks.length > 0) {
		summaryBuilder.addHeading("Failed Validations", 3);

		for (const v of failedChecks) {
			summaryBuilder.addRaw(`- **${v.name}**: ${v.message || "Validation failed"}`).addEOL();
		}
	}

	await summaryBuilder.write();

	return {
		success,
		validations,
		checkId: checkRun.id,
	};
}
