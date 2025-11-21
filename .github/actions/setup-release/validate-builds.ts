import type * as core from "@actions/core";
import type * as exec from "@actions/exec";
import type { Context } from "@actions/github/lib/context";
import type { GitHub } from "@actions/github/lib/utils";
import type { AsyncFunctionArguments } from "../shared/types.js";

/**
 * Build validation result
 */
interface BuildValidationResult {
	/** Whether all builds succeeded */
	success: boolean;
	/** Build errors if any */
	errors: string;
	/** GitHub check run ID */
	checkId: number;
}

/**
 * Validates that all packages build successfully
 *
 * @param core - GitHub Actions core module
 * @param exec - GitHub Actions exec module
 * @param github - GitHub API client
 * @param context - GitHub Actions context
 * @param packageManager - Package manager to use
 * @param buildCommand - Custom build command
 * @param dryRun - Whether this is a dry-run
 * @returns Build validation result
 *
 * @remarks
 * This function:
 * 1. Runs the single master build command (`ci:build` by default)
 * 2. Captures all build output and errors
 * 3. Parses errors and creates annotations for failed files
 * 4. Creates a GitHub check run with comprehensive build results
 * 5. Returns success status and error details
 *
 * The build validates ALL packages (not just publishable ones) to ensure
 * the entire codebase is in a good state.
 */
async function validateBuilds(
	coreModule: typeof core,
	execModule: typeof exec,
	github: InstanceType<typeof GitHub>,
	context: Context,
	packageManager: string,
	buildCommand: string,
	dryRun: boolean,
): Promise<BuildValidationResult> {
	const core = coreModule;
	const exec = execModule;

	core.startGroup("Validating builds");

	// Determine build command
	const buildCmd = buildCommand || (packageManager === "pnpm" ? "pnpm" : packageManager === "yarn" ? "yarn" : "npm");
	const buildArgs =
		buildCommand === ""
			? packageManager === "pnpm"
				? ["ci:build"]
				: packageManager === "yarn"
					? ["ci:build"]
					: ["run", "ci:build"]
			: buildCommand.split(" ");

	core.info(`Running build command: ${buildCmd} ${buildArgs.join(" ")}`);

	let buildError = "";
	let buildExitCode = 0;

	if (!dryRun) {
		try {
			await exec.exec(buildCmd, buildArgs, {
				listeners: {
					stdout: (data: Buffer) => {
						const output = data.toString();
						process.stdout.write(output);
					},
					stderr: (data: Buffer) => {
						const output = data.toString();
						buildError += output;
						process.stderr.write(output);
					},
				},
				ignoreReturnCode: true,
			});
		} catch (error) {
			buildExitCode = 1;
			buildError = error instanceof Error ? error.message : String(error);
			core.error(`Build command failed: ${buildError}`);
		}
	} else {
		core.info(`[DRY RUN] Would run: ${buildCmd} ${buildArgs.join(" ")}`);
		buildExitCode = 0; // Assume success in dry-run
	}

	const success = buildExitCode === 0 && !buildError.includes("error") && !buildError.includes("ERROR");

	core.endGroup();

	// Parse errors for annotations
	const annotations: Array<{
		path: string;
		start_line: number;
		end_line: number;
		annotation_level: "failure" | "warning";
		message: string;
	}> = [];

	if (!success && buildError) {
		// Parse TypeScript errors (format: path/to/file.ts:line:col - error TS1234: message)
		const tsErrorPattern = /([^\s:]+\.tsx?):(\d+):(\d+)\s+-\s+error\s+TS\d+:\s+(.+)/g;
		let match: RegExpExecArray | null = tsErrorPattern.exec(buildError);

		while (match !== null) {
			annotations.push({
				path: match[1],
				start_line: Number.parseInt(match[2], 10),
				end_line: Number.parseInt(match[2], 10),
				annotation_level: "failure",
				message: match[4],
			});
			match = tsErrorPattern.exec(buildError);
		}

		// Parse generic build errors (format: ERROR in path/to/file.ts)
		const genericErrorPattern = /ERROR in ([^\s:]+):?\s*(.+)?/g;
		match = genericErrorPattern.exec(buildError);

		while (match !== null) {
			if (match[1].includes(".ts")) {
				// Only include TS files
				annotations.push({
					path: match[1],
					start_line: 1,
					end_line: 1,
					annotation_level: "failure",
					message: match[2] || "Build error",
				});
			}
			match = genericErrorPattern.exec(buildError);
		}

		core.info(`Parsed ${annotations.length} error annotations`);
	}

	// Create GitHub check run
	const checkTitle = dryRun ? "🧪 Build Validation (Dry Run)" : "Build Validation";
	const checkSummary = success ? "All packages built successfully" : "Build failed with errors";

	const errorSummary =
		!success && buildError
			? buildError
					.split("\n")
					.filter((line) => line.includes("error") || line.includes("ERROR"))
					.slice(0, 20) // Limit to first 20 errors
					.join("\n")
			: "";

	// Build check details using core.summary methods
	const checkSummaryBuilder = core.summary
		.addHeading("Build Results", 2)
		.addEOL()
		.addTable([
			[
				{ data: "Status", header: true },
				{ data: "Details", header: true },
			],
			["Result", success ? "✅ Success" : "❌ Failed"],
			["Command", `\`${buildCmd} ${buildArgs.join(" ")}\``],
			["Errors", annotations.length.toString()],
		]);

	if (!success && errorSummary) {
		checkSummaryBuilder.addEOL().addHeading("Build Errors", 3).addEOL().addCodeBlock(errorSummary, "text");

		if (annotations.length > 20) {
			checkSummaryBuilder.addEOL().addRaw(`_Showing first 20 of ${annotations.length} errors_`);
		}
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
			annotations: annotations.slice(0, 50), // GitHub API limits to 50 annotations per request
		},
	});

	core.info(`Created check run: ${checkRun.html_url}`);

	// Log error annotations
	for (const annotation of annotations.slice(0, 10)) {
		// Log first 10 to console
		core.error(annotation.message, {
			file: annotation.path,
			startLine: annotation.start_line,
			endLine: annotation.end_line,
		});
	}

	// Write job summary
	const summaryBuilder = core.summary
		.addHeading(checkTitle, 2)
		.addRaw(checkSummary)
		.addEOL()
		.addHeading("Build Results", 3)
		.addTable([
			[
				{ data: "Property", header: true },
				{ data: "Value", header: true },
			],
			["Result", success ? "✅ Success" : "❌ Failed"],
			["Command", `\`${buildCmd} ${buildArgs.join(" ")}\``],
			["Errors Found", annotations.length.toString()],
		]);

	if (!success && errorSummary) {
		summaryBuilder.addHeading("Build Errors", 3).addCodeBlock(errorSummary, "text").addEOL();

		if (annotations.length > 20) {
			summaryBuilder.addRaw(`_Showing first 20 of ${annotations.length} errors_`).addEOL();
		}
	}

	await summaryBuilder.write();

	return {
		success,
		errors: buildError,
		checkId: checkRun.id,
	};
}

/**
 * Main action entrypoint: Validates builds and sets GitHub Actions outputs
 *
 * @param args - Function arguments from github-script
 * @param args.core - GitHub Actions core module
 * @param args.exec - GitHub Actions exec module
 * @param args.github - GitHub API client
 * @param args.context - GitHub Actions context
 *
 * @remarks
 * This action runs the build command for all packages and validates success.
 * It sets the following outputs:
 * - `success`: Whether all builds succeeded (true | false)
 * - `errors`: Build errors if any (string)
 * - `check_id`: GitHub check run ID
 *
 * The action respects environment variables:
 * - `PACKAGE_MANAGER`: Package manager to use (default: pnpm)
 * - `BUILD_COMMAND`: Custom build command (default: empty, uses package manager default)
 * - `DRY_RUN`: Whether this is a dry-run (true | false)
 *
 * @example
 * ```yaml
 * - uses: actions/github-script@v8
 *   env:
 *     PACKAGE_MANAGER: ${{ steps.detect-repo-type.outputs.package-manager }}
 *     BUILD_COMMAND: ""
 *     DRY_RUN: ${{ inputs.dry_run }}
 *   with:
 *     script: |
 *       const { default: validateBuilds } = await import('${{ github.workspace }}/.github/actions/setup-release/validate-builds.ts');
 *       await validateBuilds({ core, exec, github, context });
 * ```
 */
export default async ({ core, exec, github, context }: AsyncFunctionArguments): Promise<void> => {
	try {
		const packageManager = process.env.PACKAGE_MANAGER || "pnpm";
		const buildCommand = process.env.BUILD_COMMAND || "";
		const dryRun = process.env.DRY_RUN === "true";

		if (dryRun) {
			core.notice("🧪 Running in dry-run mode (preview only)");
		}

		const result = await validateBuilds(core, exec, github, context, packageManager, buildCommand, dryRun);

		// Set outputs
		core.setOutput("success", result.success.toString());
		core.setOutput("errors", result.errors);
		core.setOutput("check_id", result.checkId.toString());

		// Log summary
		if (result.success) {
			core.notice("✓ All packages built successfully");
		} else {
			core.error("❌ Build validation failed");
		}

		// Debug outputs
		core.debug(`Set output 'success' to: ${result.success}`);
		core.debug(`Set output 'errors' length: ${result.errors.length} characters`);
		core.debug(`Set output 'check_id' to: ${result.checkId}`);

		// Fail the action if builds failed (unless dry-run)
		if (!result.success && !dryRun) {
			core.setFailed("Build validation failed. See check run for details.");
		}
	} catch (error) {
		/* v8 ignore next -- @preserve */
		core.setFailed(`Failed to validate builds: ${error instanceof Error ? error.message : String(error)}`);
	}
};
