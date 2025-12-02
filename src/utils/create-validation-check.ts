import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import type { ValidationResult } from "../types/shared-types.js";
import { summaryWriter } from "./summary-writer.js";

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
	const token = core.getState("token");
	if (!token) {
		throw new Error("No token available from state - ensure pre.ts ran successfully");
	}
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

	// Build check details using summaryWriter (markdown, not HTML)
	const resultsTable = summaryWriter.table(
		["Check", "Status", "Details"],
		validations.map((v) => {
			const status = v.success ? "✅ Passed" : "❌ Failed";
			const details = v.message || (v.success ? "All checks passed" : "Validation failed");
			return [v.name, status, details];
		}),
	);

	const checkSections: Array<{ heading?: string; level?: 2 | 3; content: string }> = [
		{ heading: "Validation Results", content: resultsTable },
	];

	if (failedChecks.length > 0) {
		checkSections.push({
			heading: "Failed Validations",
			level: 3,
			content: summaryWriter.list(failedChecks.map((v) => `**${v.name}**: ${v.message || "Validation failed"}`)),
		});
	}

	const checkDetails = summaryWriter.build(checkSections);

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

	// Write job summary using summaryWriter (markdown, not HTML)
	const jobResultsTable = summaryWriter.table(
		["Check", "Status", "Details"],
		validations.map((v) => {
			const status = v.success ? "✅ Passed" : "❌ Failed";
			const details = v.message || (v.success ? "All checks passed" : "Validation failed");
			return [v.name, status, details];
		}),
	);

	const jobSections: Array<{ heading?: string; level?: 2 | 3; content: string }> = [
		{ heading: checkTitle, content: checkSummary },
		{ heading: "Validation Results", level: 3, content: jobResultsTable },
	];

	if (failedChecks.length > 0) {
		jobSections.push({
			heading: "Failed Validations",
			level: 3,
			content: summaryWriter.list(failedChecks.map((v) => `**${v.name}**: ${v.message || "Validation failed"}`)),
		});
	}

	await summaryWriter.write(summaryWriter.build(jobSections));

	return {
		success,
		validations,
		checkId: checkRun.id,
	};
}
