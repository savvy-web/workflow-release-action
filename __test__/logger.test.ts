import * as core from "@actions/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PHASE, STATE, logger } from "../src/utils/logger.js";
import { cleanupTestEnvironment, setupTestEnvironment } from "./utils/github-mocks.js";

vi.mock("@actions/core");

describe("logger", () => {
	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });
	});

	afterEach(() => {
		cleanupTestEnvironment();
	});

	describe("STATE constants", () => {
		it("should define all state emojis", () => {
			expect(STATE.good).toBeDefined();
			expect(STATE.neutral).toBeDefined();
			expect(STATE.warning).toBeDefined();
			expect(STATE.issue).toBeDefined();
		});
	});

	describe("PHASE constants", () => {
		it("should define all phase emojis", () => {
			expect(PHASE.branch).toBeDefined();
			expect(PHASE.validation).toBeDefined();
			expect(PHASE.publish).toBeDefined();
			expect(PHASE.skip).toBeDefined();
			expect(PHASE.rocket).toBeDefined();
			expect(PHASE.test).toBeDefined();
		});
	});

	describe("phase", () => {
		it("should log phase header with emoji", () => {
			logger.phase(1, PHASE.branch, "Branch Management");

			expect(core.info).toHaveBeenCalledWith("");
			expect(core.info).toHaveBeenCalledWith(`${PHASE.branch} Phase 1: Branch Management`);
		});
	});

	describe("step", () => {
		it("should start a group with step number and name", () => {
			logger.step(2, "Validate Builds");

			expect(core.startGroup).toHaveBeenCalledWith("Step 2: Validate Builds");
		});
	});

	describe("endStep", () => {
		it("should end the current group", () => {
			logger.endStep();

			expect(core.endGroup).toHaveBeenCalled();
		});
	});

	describe("context", () => {
		it("should log basic branch context", () => {
			logger.context({
				branch: "main",
				isReleaseBranch: false,
				isMainBranch: true,
				isReleaseCommit: false,
				dryRun: false,
			});

			expect(core.info).toHaveBeenCalledWith(`${STATE.neutral} Branch: main`);
			expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Main branch: true"));
		});

		it("should log dry-run mode", () => {
			logger.context({
				branch: "main",
				isReleaseBranch: false,
				isMainBranch: true,
				isReleaseCommit: false,
				dryRun: true,
			});

			expect(core.info).toHaveBeenCalledWith(expect.stringContaining("dry-run mode"));
		});

		it("should log commit message and truncate long messages", () => {
			const longMessage = "a".repeat(100);
			logger.context({
				branch: "main",
				commitMessage: longMessage,
				isReleaseBranch: false,
				isMainBranch: true,
				isReleaseCommit: false,
				dryRun: false,
			});

			expect(core.info).toHaveBeenCalledWith(expect.stringContaining("..."));
		});

		it("should not truncate short commit messages", () => {
			logger.context({
				branch: "main",
				commitMessage: "fix: short message",
				isReleaseBranch: false,
				isMainBranch: true,
				isReleaseCommit: false,
				dryRun: false,
			});

			expect(core.info).toHaveBeenCalledWith(expect.stringContaining("fix: short message"));
		});

		it("should log merged release PR info", () => {
			logger.context({
				branch: "main",
				isReleaseBranch: false,
				isMainBranch: true,
				isReleaseCommit: true,
				mergedReleasePR: "#42",
				dryRun: false,
			});

			expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Merged release PR: #42"));
		});

		it("should log PR event detection when isPullRequestEvent is defined", () => {
			logger.context({
				branch: "main",
				isReleaseBranch: false,
				isMainBranch: true,
				isReleaseCommit: false,
				isPullRequestEvent: true,
				isPRMerged: true,
				isReleasePRMerged: true,
				dryRun: false,
			});

			expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Pull request event: true"));
			expect(core.info).toHaveBeenCalledWith(expect.stringContaining("PR merged: true"));
			expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Release PR merged: true"));
		});

		it("should not log PR event detection when isPullRequestEvent is undefined", () => {
			logger.context({
				branch: "main",
				isReleaseBranch: false,
				isMainBranch: true,
				isReleaseCommit: false,
				dryRun: false,
			});

			const calls = vi.mocked(core.info).mock.calls.map((c) => c[0]);
			expect(calls.some((c) => c.includes("Pull request event"))).toBe(false);
		});

		it("should use good state for true branch flags", () => {
			logger.context({
				branch: "changeset-release/main",
				isReleaseBranch: true,
				isMainBranch: false,
				isReleaseCommit: false,
				dryRun: false,
			});

			expect(core.info).toHaveBeenCalledWith(expect.stringContaining(`${STATE.good} Release branch: true`));
		});

		it("should handle multiline commit messages by taking first line", () => {
			logger.context({
				branch: "main",
				commitMessage: "first line\nsecond line\nthird line",
				isReleaseBranch: false,
				isMainBranch: true,
				isReleaseCommit: false,
				dryRun: false,
			});

			const calls = vi.mocked(core.info).mock.calls.map((c) => c[0]);
			const commitCall = calls.find((c) => c.includes("Commit:"));
			expect(commitCall).toContain("first line");
			expect(commitCall).not.toContain("second line");
		});
	});

	describe("success", () => {
		it("should log success message with good state", () => {
			logger.success("Build completed");

			expect(core.info).toHaveBeenCalledWith(`${STATE.good} Build completed`);
		});
	});

	describe("info", () => {
		it("should log info message with neutral state", () => {
			logger.info("Processing packages");

			expect(core.info).toHaveBeenCalledWith(`${STATE.neutral} Processing packages`);
		});
	});

	describe("warn", () => {
		it("should log warning message with warning state", () => {
			logger.warn("Deprecated feature used");

			expect(core.warning).toHaveBeenCalledWith(`${STATE.warning} Deprecated feature used`);
		});
	});

	describe("error", () => {
		it("should log error message with issue state", () => {
			logger.error("Build failed");

			expect(core.error).toHaveBeenCalledWith(`${STATE.issue} Build failed`);
		});
	});

	describe("skip", () => {
		it("should log skip message with skip phase emoji", () => {
			logger.skip("No changes detected");

			expect(core.info).toHaveBeenCalledWith(`${PHASE.skip} No changes detected`);
		});
	});

	describe("phaseComplete", () => {
		it("should log phase completion with good state", () => {
			logger.phaseComplete(2);

			expect(core.info).toHaveBeenCalledWith("");
			expect(core.info).toHaveBeenCalledWith(`${STATE.good} Phase 2 completed successfully`);
		});
	});

	describe("start", () => {
		it("should log workflow start with rocket emoji", () => {
			logger.start();

			expect(core.info).toHaveBeenCalledWith(`${PHASE.rocket} Starting release workflow...`);
		});
	});

	describe("noAction", () => {
		it("should log no action needed with skip emoji", () => {
			logger.noAction("not a release branch");

			expect(core.info).toHaveBeenCalledWith(`${PHASE.skip} No release action needed: not a release branch`);
		});
	});
});
