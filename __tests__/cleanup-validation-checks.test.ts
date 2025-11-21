import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import cleanupValidationChecks from "../.github/actions/setup-release/cleanup-validation-checks.js";
import type { AsyncFunctionArguments } from "../.github/actions/shared/types.js";
import type { MockCore } from "./utils/github-mocks.js";
import { createMockAsyncFunctionArguments, createMockCore } from "./utils/github-mocks.js";

describe("cleanup-validation-checks", () => {
	let mockCore: MockCore;
	let mockArgs: AsyncFunctionArguments;

	let mockGithub: {
		rest: {
			checks: {
				get: ReturnType<typeof vi.fn>;
				update: ReturnType<typeof vi.fn>;
			};
		};
	};

	beforeEach(() => {
		vi.clearAllMocks();

		mockCore = createMockCore();

		mockGithub = {
			rest: {
				checks: {
					get: vi.fn(),
					update: vi.fn(),
				},
			},
		};

		mockArgs = createMockAsyncFunctionArguments({
			core: mockCore as never,
			github: mockGithub as never,
			context: {
				repo: {
					owner: "test-owner",
					repo: "test-repo",
				},
				sha: "abc123",
			} as never,
		});
	});

	afterEach(() => {
		vi.useRealTimers(); // Always reset timers between tests
		vi.restoreAllMocks();
		delete process.env.CHECK_IDS;
		delete process.env.CLEANUP_REASON;
		delete process.env.DRY_RUN;
	});

	describe("cleanup incomplete checks", () => {
		it("should mark incomplete checks as cancelled", async () => {
			process.env.CHECK_IDS = JSON.stringify([1001, 1002]);
			process.env.CLEANUP_REASON = "Workflow cancelled";

			mockGithub.rest.checks.get
				.mockResolvedValueOnce({
					data: {
						id: 1001,
						name: "Build Validation",
						status: "in_progress",
					},
				} as never)
				.mockResolvedValueOnce({
					data: {
						id: 1002,
						name: "Publish Validation",
						status: "queued",
					},
				} as never);

			mockGithub.rest.checks.update.mockResolvedValue({ data: {} } as never);

			await cleanupValidationChecks(mockArgs);

			expect(mockGithub.rest.checks.get).toHaveBeenCalledTimes(2);
			expect(mockGithub.rest.checks.update).toHaveBeenCalledTimes(2);

			expect(mockGithub.rest.checks.update).toHaveBeenCalledWith({
				owner: "test-owner",
				repo: "test-repo",
				check_run_id: 1001,
				status: "completed",
				conclusion: "cancelled",
				output: {
					title: "Workflow Cancelled",
					summary: expect.stringContaining("Workflow cancelled"),
				},
			});

			expect(mockCore.setOutput).toHaveBeenCalledWith("cleaned_up", "2");
			expect(mockCore.setOutput).toHaveBeenCalledWith("failed", "0");
		});

		it("should skip already completed checks", async () => {
			process.env.CHECK_IDS = JSON.stringify([1001, 1002]);

			mockGithub.rest.checks.get
				.mockResolvedValueOnce({
					data: {
						id: 1001,
						name: "Build Validation",
						status: "completed",
						conclusion: "success",
					},
				} as never)
				.mockResolvedValueOnce({
					data: {
						id: 1002,
						name: "Publish Validation",
						status: "in_progress",
					},
				} as never);

			mockGithub.rest.checks.update.mockResolvedValue({ data: {} } as never);

			await cleanupValidationChecks(mockArgs);

			expect(mockGithub.rest.checks.update).toHaveBeenCalledTimes(1);
			expect(mockGithub.rest.checks.update).toHaveBeenCalledWith(
				expect.objectContaining({
					check_run_id: 1002,
				}),
			);
		});

		it("should handle empty check IDs array", async () => {
			process.env.CHECK_IDS = JSON.stringify([]);

			await cleanupValidationChecks(mockArgs);

			expect(mockCore.warning).toHaveBeenCalledWith("No check IDs provided for cleanup");
			expect(mockCore.setOutput).toHaveBeenCalledWith("cleaned_up", "0");
			expect(mockCore.setOutput).toHaveBeenCalledWith("failed", "0");
		});
	});

	describe("error handling", () => {
		it("should handle API failures gracefully", async () => {
			vi.useFakeTimers();

			process.env.CHECK_IDS = JSON.stringify([1001, 1002]);

			mockGithub.rest.checks.get
				.mockResolvedValueOnce({
					data: {
						id: 1001,
						name: "Build Validation",
						status: "in_progress",
					},
				} as never)
				.mockRejectedValue(new Error("API error"));

			mockGithub.rest.checks.update.mockResolvedValue({ data: {} } as never);

			const actionPromise = cleanupValidationChecks(mockArgs);
			await vi.runAllTimersAsync(); // Run all pending timers
			await actionPromise;

			expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining("Failed to cleanup check 1002"));
			expect(mockCore.setOutput).toHaveBeenCalledWith("cleaned_up", "1");
			expect(mockCore.setOutput).toHaveBeenCalledWith("failed", "1");
			expect(mockCore.setOutput).toHaveBeenCalledWith("errors", expect.any(String));

			vi.useRealTimers();
		});

		it("should retry on transient failures", async () => {
			vi.useFakeTimers();

			process.env.CHECK_IDS = JSON.stringify([1001]);

			mockGithub.rest.checks.get.mockResolvedValue({
				data: {
					id: 1001,
					name: "Build Validation",
					status: "in_progress",
				},
			} as never);

			// Fail first two attempts, succeed on third
			mockGithub.rest.checks.update
				.mockRejectedValueOnce(new Error("Network error"))
				.mockRejectedValueOnce(new Error("Timeout"))
				.mockResolvedValueOnce({ data: {} } as never);

			const actionPromise = cleanupValidationChecks(mockArgs);
			await vi.advanceTimersByTimeAsync(60000); // Advance 60 seconds to cover all potential retries
			await actionPromise;

			expect(mockGithub.rest.checks.update).toHaveBeenCalledTimes(3);
			expect(mockCore.setOutput).toHaveBeenCalledWith("cleaned_up", "1");
			expect(mockCore.setOutput).toHaveBeenCalledWith("failed", "0");

			vi.useRealTimers();
		});

		it("should fail after exhausting retries", async () => {
			vi.useFakeTimers();

			process.env.CHECK_IDS = JSON.stringify([1001]);

			mockGithub.rest.checks.get.mockResolvedValue({
				data: {
					id: 1001,
					name: "Build Validation",
					status: "in_progress",
				},
			} as never);

			mockGithub.rest.checks.update.mockRejectedValue(new Error("Persistent error"));

			const actionPromise = cleanupValidationChecks(mockArgs);
			await vi.runAllTimersAsync(); // Run all pending timers
			await actionPromise;

			expect(mockGithub.rest.checks.update).toHaveBeenCalledTimes(4); // Initial + 3 retries
			expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining("Failed to cleanup check 1001"));
			expect(mockCore.setOutput).toHaveBeenCalledWith("cleaned_up", "0");
			expect(mockCore.setOutput).toHaveBeenCalledWith("failed", "1");
			expect(mockCore.setOutput).toHaveBeenCalledWith("errors", expect.any(String));

			vi.useRealTimers();
		});
	});

	describe("dry-run mode", () => {
		it("should not modify checks in dry-run mode", async () => {
			process.env.CHECK_IDS = JSON.stringify([1001, 1002]);
			process.env.DRY_RUN = "true";

			await cleanupValidationChecks(mockArgs);

			expect(mockCore.notice).toHaveBeenCalledWith(expect.stringContaining("dry-run mode"));
			expect(mockGithub.rest.checks.get).not.toHaveBeenCalled();
			expect(mockGithub.rest.checks.update).not.toHaveBeenCalled();
			expect(mockCore.setOutput).toHaveBeenCalledWith("cleaned_up", "2");
		});
	});

	describe("custom cleanup reasons", () => {
		it("should use custom cleanup reason", async () => {
			process.env.CHECK_IDS = JSON.stringify([1001]);
			process.env.CLEANUP_REASON = "Manual cancellation by user";

			mockGithub.rest.checks.get.mockResolvedValue({
				data: {
					id: 1001,
					name: "Build Validation",
					status: "in_progress",
				},
			} as never);

			mockGithub.rest.checks.update.mockResolvedValue({ data: {} } as never);

			await cleanupValidationChecks(mockArgs);

			expect(mockGithub.rest.checks.update).toHaveBeenCalledWith(
				expect.objectContaining({
					output: {
						title: "Workflow Cancelled",
						summary: expect.stringContaining("Manual cancellation by user"),
					},
				}),
			);
		});
	});

	describe("output validation", () => {
		it("should set correct outputs for successful cleanup", async () => {
			vi.useFakeTimers();

			process.env.CHECK_IDS = JSON.stringify([1001, 1002, 1003]);

			mockGithub.rest.checks.get
				.mockResolvedValueOnce({
					data: { id: 1001, name: "Check 1", status: "in_progress" },
				} as never)
				.mockResolvedValueOnce({
					data: { id: 1002, name: "Check 2", status: "queued" },
				} as never)
				.mockRejectedValue(new Error("Not found"));

			mockGithub.rest.checks.update.mockResolvedValue({ data: {} } as never);

			const actionPromise = cleanupValidationChecks(mockArgs);
			await vi.runAllTimersAsync(); // Run all pending timers
			await actionPromise;

			expect(mockCore.setOutput).toHaveBeenCalledWith("cleaned_up", "2");
			expect(mockCore.setOutput).toHaveBeenCalledWith("failed", "1");
			expect(mockCore.setOutput).toHaveBeenCalledWith("errors", expect.stringContaining("Check 1003"));

			vi.useRealTimers();
		});
	});
});
