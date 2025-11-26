import * as core from "@actions/core";

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
		core.info("");
		core.info(`${emoji} Phase ${number}: ${name}`);
	},

	/**
	 * Log a step within a phase
	 */
	step(number: number, name: string): void {
		core.startGroup(`Step ${number}: ${name}`);
	},

	/**
	 * End a step group
	 */
	endStep(): void {
		core.endGroup();
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
		isPullRequestEvent?: boolean;
		isPRMerged?: boolean;
		isReleasePRMerged?: boolean;
		dryRun: boolean;
	}): void {
		core.info("");
		core.info("=== Workflow Context ===");

		if (data.dryRun) {
			core.info(`${PHASE.test} Running in dry-run mode (preview only)`);
		}

		core.info(`${STATE.neutral} Branch: ${data.branch}`);

		if (data.commitMessage) {
			// Truncate long commit messages
			const truncated = data.commitMessage.split("\n")[0].slice(0, 80);
			core.info(`${STATE.neutral} Commit: ${truncated}${data.commitMessage.length > 80 ? "..." : ""}`);
		}

		core.info("");
		core.info("Branch detection:");
		core.info(`  ${data.isReleaseBranch ? STATE.good : STATE.neutral} Release branch: ${data.isReleaseBranch}`);
		core.info(`  ${data.isMainBranch ? STATE.good : STATE.neutral} Main branch: ${data.isMainBranch}`);
		core.info(`  ${data.isReleaseCommit ? STATE.good : STATE.neutral} Release commit: ${data.isReleaseCommit}`);

		if (data.isPullRequestEvent !== undefined) {
			core.info("");
			core.info("PR event detection:");
			core.info(
				`  ${data.isPullRequestEvent ? STATE.good : STATE.neutral} Pull request event: ${data.isPullRequestEvent}`,
			);
			core.info(`  ${data.isPRMerged ? STATE.good : STATE.neutral} PR merged: ${data.isPRMerged}`);
			core.info(
				`  ${data.isReleasePRMerged ? STATE.good : STATE.neutral} Release PR merged: ${data.isReleasePRMerged}`,
			);
		}

		core.info("");
	},

	/**
	 * Log a success message
	 */
	success(message: string): void {
		core.info(`${STATE.good} ${message}`);
	},

	/**
	 * Log a neutral/informational message
	 */
	info(message: string): void {
		core.info(`${STATE.neutral} ${message}`);
	},

	/**
	 * Log a warning message
	 */
	warn(message: string): void {
		core.warning(`${STATE.warning} ${message}`);
	},

	/**
	 * Log an error message
	 */
	error(message: string): void {
		core.error(`${STATE.issue} ${message}`);
	},

	/**
	 * Log a skip message
	 */
	skip(message: string): void {
		core.info(`${PHASE.skip} ${message}`);
	},

	/**
	 * Log phase completion
	 */
	phaseComplete(number: number): void {
		core.info("");
		core.info(`${STATE.good} Phase ${number} completed successfully`);
	},

	/**
	 * Log workflow start
	 */
	start(): void {
		core.info(`${PHASE.rocket} Starting release workflow...`);
	},

	/**
	 * Log no action needed
	 */
	noAction(reason: string): void {
		core.info(`${PHASE.skip} No release action needed: ${reason}`);
	},
} as const;
