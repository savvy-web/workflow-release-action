import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupValidationChecks } from "../src/utils/cleanup-validation-checks.js";
import { cleanupTestEnvironment, createMockOctokit, setupTestEnvironment } from "./utils/github-mocks.js";
import type { MockOctokit } from "./utils/test-types.js";

// Mock modules
vi.mock("@actions/core");
vi.mock("@actions/github");

describe("cleanup-validation-checks", () => {
	let mockOctokit: MockOctokit;

	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });

		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "token") return "test-token";
			return "";
		});

		// Mock core.summary
		const mockSummary = {
			addHeading: vi.fn().mockReturnThis(),
			addEOL: vi.fn().mockReturnThis(),
			addTable: vi.fn().mockReturnThis(),
			addRaw: vi.fn().mockReturnThis(),
			addList: vi.fn().mockReturnThis(),
			write: vi.fn().mockResolvedValue(undefined),
			stringify: vi.fn().mockReturnValue(""),
		};
		Object.defineProperty(core, "summary", { value: mockSummary, writable: true });

		mockOctokit = createMockOctokit();
		vi.mocked(getOctokit).mockReturnValue(mockOctokit as unknown as ReturnType<typeof getOctokit>);
		Object.defineProperty(vi.mocked(context), "repo", {
			value: { owner: "test-owner", repo: "test-repo" },
			writable: true,
		});
	});

	afterEach(() => {
		vi.useRealTimers(); // Reset to real timers after each test
		cleanupTestEnvironment();
	});

	it("should cleanup incomplete checks", async () => {
		mockOctokit.rest.checks.get.mockResolvedValue({
			data: { id: 12345, status: "in_progress", name: "Build Validation" },
		});

		const result = await cleanupValidationChecks([12345], "Workflow cancelled", false);

		expect(result.cleanedUp).toBe(1);
		expect(result.failed).toBe(0);
		expect(result.errors).toEqual([]);
		expect(mockOctokit.rest.checks.update).toHaveBeenCalledWith(
			expect.objectContaining({
				check_run_id: 12345,
				status: "completed",
				conclusion: "cancelled",
			}),
		);
	});

	it("should skip already completed checks", async () => {
		mockOctokit.rest.checks.get.mockResolvedValue({
			data: { id: 12345, status: "completed", conclusion: "success", name: "Build Validation" },
		});

		const result = await cleanupValidationChecks([12345], "Workflow cancelled", false);

		expect(result.cleanedUp).toBe(0);
		expect(mockOctokit.rest.checks.update).not.toHaveBeenCalled();
	});

	it("should handle multiple checks", async () => {
		mockOctokit.rest.checks.get
			.mockResolvedValueOnce({ data: { id: 111, status: "in_progress", name: "Check 1" } })
			.mockResolvedValueOnce({ data: { id: 222, status: "completed", name: "Check 2" } })
			.mockResolvedValueOnce({ data: { id: 333, status: "queued", name: "Check 3" } });

		const result = await cleanupValidationChecks([111, 222, 333], "Workflow failed", false);

		expect(result.cleanedUp).toBe(2); // 111 and 333 (in_progress and queued)
		expect(mockOctokit.rest.checks.update).toHaveBeenCalledTimes(2);
	});

	it("should handle API errors gracefully", async () => {
		vi.useFakeTimers(); // Enable fake timers for retry test

		mockOctokit.rest.checks.get.mockRejectedValue(new Error("API Error"));

		const actionPromise = cleanupValidationChecks([12345], "Workflow cancelled", false);
		await vi.advanceTimersByTimeAsync(60000); // Advance time to cover all retries
		const result = await actionPromise;

		expect(result.cleanedUp).toBe(0);
		expect(result.failed).toBe(1);
		expect(result.errors).toContain("Check 12345: API Error");
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Failed to cleanup check 12345"));
	});

	it("should not make API calls in dry-run mode", async () => {
		const result = await cleanupValidationChecks([12345], "Workflow cancelled", true);

		expect(result.cleanedUp).toBe(1);
		expect(result.failed).toBe(0);
		expect(mockOctokit.rest.checks.get).not.toHaveBeenCalled();
		expect(mockOctokit.rest.checks.update).not.toHaveBeenCalled();
		expect(core.info).toHaveBeenCalledWith(expect.stringContaining("[Dry Run]"));
	});

	it("should handle empty check list", async () => {
		const result = await cleanupValidationChecks([], "Workflow cancelled", false);

		expect(result.cleanedUp).toBe(0);
		expect(result.failed).toBe(0);
		expect(result.errors).toEqual([]);
	});

	it("should include reason in check update output", async () => {
		mockOctokit.rest.checks.get.mockResolvedValue({
			data: { id: 12345, status: "in_progress", name: "Test Check" },
		});

		await cleanupValidationChecks([12345], "Build failed", false);

		expect(mockOctokit.rest.checks.update).toHaveBeenCalledWith(
			expect.objectContaining({
				output: expect.objectContaining({
					summary: expect.stringContaining("Build failed"),
				}),
			}),
		);
	});
});
