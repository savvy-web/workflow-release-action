import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { debug, info, warning } from "@actions/core";
import { exec } from "@actions/exec";

/**
 * Changeset status result
 */
export interface ChangesetStatusResult {
	/** Packages with version changes */
	releases: Array<{ name: string; oldVersion?: string; newVersion: string; type: string }>;
	/** Changeset information */
	changesets: Array<{
		/** Changeset ID */
		id: string;
		/** Changeset summary */
		summary: string;
		/** Packages affected by this changeset */
		releases: Array<{ name: string; type: string }>;
	}>;
}

/**
 * Gets changeset status, handling the case where changesets have been consumed
 *
 * @remarks
 * On the release branch after `changeset version` has run, the changesets are
 * consumed (deleted). To get the release information, we need to:
 * 1. Find the merge base between HEAD and the target branch (main)
 * 2. Checkout that commit
 * 3. Run `changeset status --output=json`
 * 4. Checkout back to HEAD
 *
 * @param packageManager - Package manager to use (pnpm, yarn, npm)
 * @param targetBranch - Target branch to find merge base with (default: main)
 * @returns Changeset status with releases and changesets
 */
export async function getChangesetStatus(
	packageManager: string,
	targetBranch: string = "main",
): Promise<ChangesetStatusResult> {
	let stderrOutput = "";

	// Create a temp file for changeset output
	// Changeset's --output flag writes to a file relative to cwd
	// Use just a filename (no path) to avoid path resolution issues
	const tempFileName = `.changeset-status-${Date.now()}.json`;
	const tempFile = join(process.cwd(), tempFileName);

	const statusCmd = packageManager === "pnpm" ? "pnpm" : packageManager === "yarn" ? "yarn" : "npm";
	const statusArgs =
		packageManager === "pnpm"
			? ["changeset", "status", `--output=${tempFileName}`]
			: packageManager === "yarn"
				? ["changeset", "status", `--output=${tempFileName}`]
				: ["run", "changeset", "status", "--", `--output=${tempFileName}`];

	const exitCode = await exec(statusCmd, statusArgs, {
		listeners: {
			stderr: (data: Buffer) => {
				stderrOutput += data.toString();
				debug(`changeset status stderr: ${data.toString()}`);
			},
		},
		ignoreReturnCode: true,
	});

	// Try to read the output file if it exists
	let output = "";
	try {
		if (existsSync(tempFile)) {
			output = readFileSync(tempFile, "utf8");
			unlinkSync(tempFile); // Clean up
		}
	} catch (err) {
		debug(`Failed to read changeset output file: ${err instanceof Error ? err.message : String(err)}`);
	}

	// If successful and has output, parse and return
	if (exitCode === 0 && output.trim()) {
		return JSON.parse(output.trim());
	}

	// Handle case where changesets have already been consumed (versioned)
	// This happens on the release branch after `changeset version` has run
	const noChangesetsError =
		stderrOutput.includes("no changesets were found") || stderrOutput.includes("No changesets present");

	if (noChangesetsError || (exitCode === 0 && !output.trim())) {
		info("Changesets have been consumed, checking merge base for release info...");

		// Try to get release info from merge base
		const result = await getChangesetStatusFromMergeBase(packageManager, targetBranch);
		if (result) {
			return result;
		}

		// If we can't get merge base info, return empty
		info("Could not determine releases from merge base, returning empty");
		return { releases: [], changesets: [] };
	}

	// For other errors, throw to surface the issue
	throw new Error(`changeset status failed with exit code ${exitCode}: ${stderrOutput}`);
}

/**
 * Gets changeset status by checking out the merge base
 *
 * @param packageManager - Package manager to use
 * @param targetBranch - Target branch to find merge base with
 * @returns Changeset status or null if unable to retrieve
 */
async function getChangesetStatusFromMergeBase(
	packageManager: string,
	targetBranch: string,
): Promise<ChangesetStatusResult | null> {
	// Store current HEAD for restoration
	let currentHead = "";
	try {
		let headOutput = "";
		await exec("git", ["rev-parse", "HEAD"], {
			listeners: {
				stdout: (data: Buffer) => {
					headOutput += data.toString();
				},
			},
		});
		currentHead = headOutput.trim();
	} catch (err) {
		warning(`Failed to get current HEAD: ${err instanceof Error ? err.message : String(err)}`);
		return null;
	}

	// Find merge base
	let mergeBase = "";
	try {
		let mergeBaseOutput = "";
		await exec("git", ["merge-base", "HEAD", targetBranch], {
			listeners: {
				stdout: (data: Buffer) => {
					mergeBaseOutput += data.toString();
				},
			},
		});
		mergeBase = mergeBaseOutput.trim();
		info(`Found merge base: ${mergeBase.substring(0, 8)}`);
	} catch (err) {
		warning(`Failed to find merge base: ${err instanceof Error ? err.message : String(err)}`);
		return null;
	}

	// Checkout merge base
	try {
		info(`Checking out merge base ${mergeBase.substring(0, 8)} to get changeset status...`);
		await exec("git", ["checkout", mergeBase], { silent: true });
	} catch (err) {
		warning(`Failed to checkout merge base: ${err instanceof Error ? err.message : String(err)}`);
		return null;
	}

	// Get changeset status at merge base using temp file
	// Changeset writes output relative to cwd, so use just filename for --output
	// but full path for fs operations
	let result: ChangesetStatusResult | null = null;
	const tempFileName = `.changeset-mergebase-${Date.now()}.json`;
	const tempFile = join(process.cwd(), tempFileName);
	try {
		const statusCmd = packageManager === "pnpm" ? "pnpm" : packageManager === "yarn" ? "yarn" : "npm";
		const statusArgs =
			packageManager === "pnpm"
				? ["changeset", "status", `--output=${tempFileName}`]
				: packageManager === "yarn"
					? ["changeset", "status", `--output=${tempFileName}`]
					: ["run", "changeset", "status", "--", `--output=${tempFileName}`];

		const exitCode = await exec(statusCmd, statusArgs, {
			ignoreReturnCode: true,
		});

		// Read output from temp file
		if (exitCode === 0 && existsSync(tempFile)) {
			const output = readFileSync(tempFile, "utf8");
			if (output.trim()) {
				result = JSON.parse(output.trim()) as ChangesetStatusResult;
				info(`Found ${result.releases.length} package(s) to release from merge base`);
			}
		}
	} catch (err) {
		warning(`Failed to get changeset status at merge base: ${err instanceof Error ? err.message : String(err)}`);
	} finally {
		// Clean up temp file
		try {
			if (existsSync(tempFile)) {
				unlinkSync(tempFile);
			}
		} catch {
			// Ignore cleanup errors
		}
	}

	// Always restore to original HEAD
	try {
		info(`Restoring to HEAD ${currentHead.substring(0, 8)}...`);
		await exec("git", ["checkout", currentHead], { silent: true });
	} catch (err) {
		warning(`Failed to restore HEAD: ${err instanceof Error ? err.message : String(err)}`);
		// This is critical - try harder to restore
		try {
			await exec("git", ["checkout", "-"], { silent: true });
		} catch {
			warning("Could not restore git state - manual intervention may be required");
		}
	}

	return result;
}
