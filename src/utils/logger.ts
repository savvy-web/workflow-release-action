import { endGroup, error, info, startGroup, warning } from "@actions/core";

/**
 * Informational state emojis for logging
 */
export const STATE = {
	good: "\u{1F7E2}", // 🟢
	neutral: "\u{26AA}", // ⚪
	warning: "\u{1F7E1}", // 🟡
	issue: "\u{1F534}", // 🔴
} as const;

/**
 * Phase emojis for workflow steps
 */
export const PHASE = {
	branch: "\u{1F33F}", // 🌿
	validation: "\u{2705}", // ✅
	publish: "\u{1F4E6}", // 📦
	skip: "\u{23ED}\u{FE0F}", // ⏭️
	rocket: "\u{1F680}", // 🚀
	test: "\u{1F9EA}", // 🧪
} as const;

/**
 * Logger utility for consistent, clean output
 */
export const logger = {
	/**
	 * Log a phase header with emoji
	 */
	phase(number: number, emoji: string, name: string): void {
		info("");
		info(`${emoji} Phase ${number}: ${name}`);
	},

	/**
	 * Log a step within a phase
	 */
	step(number: number, name: string): void {
		startGroup(`Step ${number}: ${name}`);
	},

	/**
	 * End a step group
	 */
	endStep(): void {
		endGroup();
	},

	/**
	 * Log branch/context information
	 */
	context(data: {
		branch: string;
		commitMessage?: string;
		isReleaseBranch: boolean;
		isMainBranch: boolean;
		isReleaseCommit: boolean;
		mergedReleasePR?: string;
		isPullRequestEvent?: boolean;
		isPRMerged?: boolean;
		isReleasePRMerged?: boolean;
		dryRun: boolean;
	}): void {
		info("");
		info("=== Workflow Context ===");

		if (data.dryRun) {
			info(`${PHASE.test} Running in dry-run mode (preview only)`);
		}

		info(`${STATE.neutral} Branch: ${data.branch}`);

		if (data.commitMessage) {
			// Truncate long commit messages
			const truncated = data.commitMessage.split("\n")[0].slice(0, 80);
			info(`${STATE.neutral} Commit: ${truncated}${data.commitMessage.length > 80 ? "..." : ""}`);
		}

		info("");
		info("Branch detection:");
		info(`  ${data.isReleaseBranch ? STATE.good : STATE.neutral} Release branch: ${data.isReleaseBranch}`);
		info(`  ${data.isMainBranch ? STATE.good : STATE.neutral} Main branch: ${data.isMainBranch}`);

		info("");
		info("Release commit detection:");
		info(
			`  ${data.isReleaseCommit ? STATE.good : STATE.neutral} Release commit (triggers Phase 3): ${data.isReleaseCommit}`,
		);
		if (data.mergedReleasePR) {
			info(`  ${STATE.good} Merged release PR: ${data.mergedReleasePR}`);
		}

		if (data.isPullRequestEvent !== undefined) {
			info("");
			info("PR event detection:");
			info(`  ${data.isPullRequestEvent ? STATE.good : STATE.neutral} Pull request event: ${data.isPullRequestEvent}`);
			info(`  ${data.isPRMerged ? STATE.good : STATE.neutral} PR merged: ${data.isPRMerged}`);
			info(`  ${data.isReleasePRMerged ? STATE.good : STATE.neutral} Release PR merged: ${data.isReleasePRMerged}`);
		}

		info("");
	},

	/**
	 * Log a success message
	 */
	success(message: string): void {
		info(`${STATE.good} ${message}`);
	},

	/**
	 * Log a neutral/informational message
	 */
	info(message: string): void {
		info(`${STATE.neutral} ${message}`);
	},

	/**
	 * Log a warning message
	 */
	warn(message: string): void {
		warning(`${STATE.warning} ${message}`);
	},

	/**
	 * Log an error message
	 */
	error(message: string): void {
		error(`${STATE.issue} ${message}`);
	},

	/**
	 * Log a skip message
	 */
	skip(message: string): void {
		info(`${PHASE.skip} ${message}`);
	},

	/**
	 * Log phase completion
	 */
	phaseComplete(number: number): void {
		info("");
		info(`${STATE.good} Phase ${number} completed successfully`);
	},

	/**
	 * Log workflow start
	 */
	start(): void {
		info(`${PHASE.rocket} Starting release workflow...`);
	},

	/**
	 * Log no action needed
	 */
	noAction(reason: string): void {
		info(`${PHASE.skip} No release action needed: ${reason}`);
	},
} as const;
