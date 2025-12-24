import { endGroup, error, getBooleanInput, getInput, getState, info, startGroup } from "@actions/core";
import { exec } from "@actions/exec";
import { context, getOctokit } from "@actions/github";
import { summaryWriter } from "./summary-writer.js";

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
 * @param packageManager - Package manager to use (npm, pnpm, yarn, bun)
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
export async function validateBuilds(packageManager: string): Promise<BuildValidationResult> {
	// Read all inputs
	const token = getState("token");
	if (!token) {
		throw new Error("No token available from state - ensure pre.ts ran successfully");
	}
	const buildCommand = getInput("build-command") || "";
	const dryRun = getBooleanInput("dry-run") || false;

	const github = getOctokit(token);
	startGroup("Validating builds");

	// Determine build command
	const buildCmd =
		packageManager === "pnpm" ? "pnpm" : packageManager === "yarn" ? "yarn" : packageManager === "bun" ? "bun" : "npm";
	const buildArgs =
		buildCommand === ""
			? packageManager === "pnpm"
				? ["ci:build"]
				: packageManager === "yarn"
					? ["ci:build"]
					: packageManager === "bun"
						? ["run", "ci:build"]
						: ["run", "ci:build"]
			: ["run", buildCommand];

	info(`Running build command: ${buildCmd} ${buildArgs.join(" ")}`);

	let buildError = "";
	let buildExitCode = 0;

	if (!dryRun) {
		try {
			await exec(buildCmd, buildArgs, {
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
		} catch (err) {
			buildExitCode = 1;
			buildError = err instanceof Error ? err.message : String(err);
			error(`Build command failed: ${buildError}`);
		}
	} else {
		info(`[DRY RUN] Would run: ${buildCmd} ${buildArgs.join(" ")}`);
		buildExitCode = 0; // Assume success in dry-run
	}

	const success = buildExitCode === 0 && !buildError.includes("error") && !buildError.includes("ERROR");

	endGroup();

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

		info(`Parsed ${annotations.length} error annotations`);
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

	// Build check details using summaryWriter (markdown, not HTML)
	const resultsTable = summaryWriter.table(
		["Status", "Details"],
		[
			["Result", success ? "✅ Success" : "❌ Failed"],
			["Command", `\`${buildCmd} ${buildArgs.join(" ")}\``],
			["Errors", annotations.length.toString()],
		],
	);

	const checkSections: Array<{ heading?: string; level?: 2 | 3; content: string }> = [
		{ heading: "Build Results", content: resultsTable },
	];

	if (!success && errorSummary) {
		checkSections.push({ heading: "Build Errors", level: 3, content: summaryWriter.codeBlock(errorSummary, "text") });

		if (annotations.length > 20) {
			checkSections.push({ content: `_Showing first 20 of ${annotations.length} errors_` });
		}
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
			annotations: annotations.slice(0, 50), // GitHub API limits to 50 annotations per request
		},
	});

	info(`Created check run: ${checkRun.html_url}`);

	// Log error annotations
	for (const annotation of annotations.slice(0, 10)) {
		// Log first 10 to console
		error(annotation.message, {
			file: annotation.path,
			startLine: annotation.start_line,
			endLine: annotation.end_line,
		});
	}

	// Write job summary using summaryWriter (markdown, not HTML)
	const jobResultsTable = summaryWriter.keyValueTable([
		{ key: "Result", value: success ? "✅ Success" : "❌ Failed" },
		{ key: "Command", value: `\`${buildCmd} ${buildArgs.join(" ")}\`` },
		{ key: "Errors Found", value: annotations.length.toString() },
	]);

	const jobSections: Array<{ heading?: string; level?: 2 | 3; content: string }> = [
		{ heading: checkTitle, content: checkSummary },
		{ heading: "Build Results", level: 3, content: jobResultsTable },
	];

	if (!success && errorSummary) {
		jobSections.push({ heading: "Build Errors", level: 3, content: summaryWriter.codeBlock(errorSummary, "text") });

		if (annotations.length > 20) {
			jobSections.push({ content: `_Showing first 20 of ${annotations.length} errors_` });
		}
	}

	await summaryWriter.write(summaryWriter.build(jobSections));

	return {
		success,
		errors: buildError,
		checkId: checkRun.id,
	};
}
