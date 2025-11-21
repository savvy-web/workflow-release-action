import type * as core from "@actions/core";
import type { Context } from "@actions/github/lib/context";
import type { GitHub } from "@actions/github/lib/utils";
import type { AsyncFunctionArguments, ValidationResult } from "../shared/types.js";

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
 * @param core - GitHub Actions core module
 * @param github - GitHub API client
 * @param context - GitHub Actions context
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
async function createValidationCheck(
	coreModule: typeof core,
	github: InstanceType<typeof GitHub>,
	context: Context,
	validations: ValidationResult[],
	dryRun: boolean,
): Promise<UnifiedValidationResult> {
	const core = coreModule;

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

/**
 * Main action entrypoint: Creates unified validation check and sets GitHub Actions outputs
 *
 * @param args - Function arguments from github-script
 * @param args.core - GitHub Actions core module
 * @param args.github - GitHub API client
 * @param args.context - GitHub Actions context
 *
 * @remarks
 * This action creates a unified validation check that aggregates multiple validation results.
 * It sets the following outputs:
 * - `success`: Whether all validations passed (true | false)
 * - `validations`: JSON array of validation results
 * - `check_id`: GitHub check run ID
 *
 * The action respects environment variables:
 * - `VALIDATIONS`: JSON array of validation results (required)
 * - `DRY_RUN`: Whether this is a dry-run (true | false)
 *
 * @example
 * ```yaml
 * - uses: actions/github-script@v8
 *   env:
 *     VALIDATIONS: ${{ toJson(steps.*.outputs) }}
 *     DRY_RUN: ${{ inputs.dry_run }}
 *   with:
 *     script: |
 *       const { default: createValidationCheck } = await import('${{ github.workspace }}/.github/actions/setup-release/create-validation-check.ts');
 *       await createValidationCheck({ core, github, context });
 * ```
 */
export default async ({ core, github, context }: AsyncFunctionArguments): Promise<void> => {
	try {
		const validationsJson = process.env.VALIDATIONS;
		const dryRun = process.env.DRY_RUN === "true";

		if (!validationsJson) {
			core.setFailed("VALIDATIONS environment variable is required");
			return;
		}

		if (dryRun) {
			core.notice("🧪 Running in dry-run mode (preview only)");
		}

		const validations: ValidationResult[] = JSON.parse(validationsJson);

		if (!Array.isArray(validations) || validations.length === 0) {
			core.setFailed("VALIDATIONS must be a non-empty array");
			return;
		}

		// Validate structure of each validation result
		for (const validation of validations) {
			if (
				typeof validation.name !== "string" ||
				typeof validation.success !== "boolean" ||
				typeof validation.checkId !== "number"
			) {
				core.setFailed(
					`Invalid validation result structure: ${JSON.stringify(validation)}. Expected: { name: string, success: boolean, checkId: number, message?: string }`,
				);
				return;
			}
		}

		const result = await createValidationCheck(core, github, context, validations, dryRun);

		// Set outputs
		core.setOutput("success", result.success.toString());
		core.setOutput("validations", JSON.stringify(result.validations));
		core.setOutput("check_id", result.checkId.toString());

		// Log summary
		if (result.success) {
			core.notice(`✓ All ${result.validations.length} validation(s) passed`);
		} else {
			const failedCount = result.validations.filter((v) => !v.success).length;
			core.error(`❌ ${failedCount} of ${result.validations.length} validation(s) failed`);
		}

		// Debug outputs
		core.debug(`Set output 'success' to: ${result.success}`);
		core.debug(`Set output 'validations' to: ${JSON.stringify(result.validations)}`);
		core.debug(`Set output 'check_id' to: ${result.checkId}`);

		// Fail the action if any validations failed (unless dry-run)
		if (!result.success && !dryRun) {
			core.setFailed("One or more validations failed. See check run for details.");
		}
	} catch (error) {
		/* v8 ignore next -- @preserve */
		core.setFailed(`Failed to create validation check: ${error instanceof Error ? error.message : String(error)}`);
	}
};
