import * as core from "@actions/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCloseLinkedIssues } from "../src/utils/run-close-linked-issues.js";
import { cleanupTestEnvironment, setupTestEnvironment } from "./utils/github-mocks.js";

vi.mock("@actions/core");

vi.mock("../src/utils/close-linked-issues.js", () => ({
	closeLinkedIssues: vi.fn(),
}));

vi.mock("../src/utils/logger.js", () => ({
	logger: {
		step: vi.fn(),
		endStep: vi.fn(),
		success: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		phaseComplete: vi.fn(),
	},
}));

import { closeLinkedIssues } from "../src/utils/close-linked-issues.js";
import { logger } from "../src/utils/logger.js";

describe("runCloseLinkedIssues", () => {
	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });
	});

	afterEach(() => {
		cleanupTestEnvironment();
	});

	it("should close linked issues and set outputs", async () => {
		vi.mocked(closeLinkedIssues).mockResolvedValue({
			closedCount: 2,
			failedCount: 0,
			issues: [
				{ number: 1, title: "Bug fix", state: "closed" as const, url: "https://github.com/test/issues/1" },
				{ number: 2, title: "Feature", state: "closed" as const, url: "https://github.com/test/issues/2" },
			],
		});

		await runCloseLinkedIssues({ token: "test-token", dryRun: false }, 42);

		expect(closeLinkedIssues).toHaveBeenCalledWith("test-token", 42, false);
		expect(core.setOutput).toHaveBeenCalledWith("closed_issues_count", 2);
		expect(core.setOutput).toHaveBeenCalledWith("failed_issues_count", 0);
		expect(logger.success).toHaveBeenCalledWith("Closed 2 linked issue(s)");
		expect(logger.endStep).toHaveBeenCalled();
		expect(logger.phaseComplete).toHaveBeenCalledWith(3);
	});

	it("should log info when no linked issues to close", async () => {
		vi.mocked(closeLinkedIssues).mockResolvedValue({
			closedCount: 0,
			failedCount: 0,
			issues: [],
		});

		await runCloseLinkedIssues({ token: "test-token", dryRun: false }, 42);

		expect(logger.info).toHaveBeenCalledWith("No linked issues to close");
	});

	it("should warn when some issues fail to close", async () => {
		vi.mocked(closeLinkedIssues).mockResolvedValue({
			closedCount: 1,
			failedCount: 1,
			issues: [{ number: 1, title: "Bug fix", state: "closed" as const, url: "https://github.com/test/issues/1" }],
		});

		await runCloseLinkedIssues({ token: "test-token", dryRun: false }, 42);

		expect(logger.warn).toHaveBeenCalledWith("Failed to close 1 issue(s)");
	});

	it("should pass dryRun flag to closeLinkedIssues", async () => {
		vi.mocked(closeLinkedIssues).mockResolvedValue({
			closedCount: 0,
			failedCount: 0,
			issues: [],
		});

		await runCloseLinkedIssues({ token: "test-token", dryRun: true }, 10);

		expect(closeLinkedIssues).toHaveBeenCalledWith("test-token", 10, true);
	});

	it("should set failed and rethrow on error", async () => {
		const error = new Error("API rate limit exceeded");
		vi.mocked(closeLinkedIssues).mockRejectedValue(error);

		await expect(runCloseLinkedIssues({ token: "test-token", dryRun: false }, 42)).rejects.toThrow(
			"API rate limit exceeded",
		);

		expect(core.setFailed).toHaveBeenCalledWith("Failed to close linked issues: API rate limit exceeded");
	});

	it("should handle non-Error exceptions", async () => {
		vi.mocked(closeLinkedIssues).mockRejectedValue("string error");

		await expect(runCloseLinkedIssues({ token: "test-token", dryRun: false }, 42)).rejects.toBe("string error");

		expect(core.setFailed).toHaveBeenCalledWith("Failed to close linked issues: string error");
	});

	it("should serialize issues array as JSON in output", async () => {
		const issues = [{ number: 5, title: "Test", state: "closed" as const, url: "https://github.com/test/issues/5" }];
		vi.mocked(closeLinkedIssues).mockResolvedValue({
			closedCount: 1,
			failedCount: 0,
			issues,
		});

		await runCloseLinkedIssues({ token: "test-token", dryRun: false }, 42);

		expect(core.setOutput).toHaveBeenCalledWith("closed_issues", JSON.stringify(issues));
	});
});
