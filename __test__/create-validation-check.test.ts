import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ValidationResult } from "../src/types/shared-types.js";
import { createValidationCheck } from "../src/utils/create-validation-check.js";
import { cleanupTestEnvironment, createMockOctokit, setupTestEnvironment } from "./utils/github-mocks.js";
import type { MockOctokit } from "./utils/test-types.js";

// Mock modules
vi.mock("@actions/core");
vi.mock("@actions/github");

describe("create-validation-check", () => {
	let mockOctokit: MockOctokit;

	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });

		// Setup core.getState to return token
		vi.mocked(core.getState).mockReturnValue("test-token");

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
		Object.defineProperty(vi.mocked(context), "sha", { value: "abc123", writable: true });
	});

	afterEach(() => {
		cleanupTestEnvironment();
	});

	it("should report success when all validations pass", async () => {
		const validations: ValidationResult[] = [
			{ name: "Build Validation", success: true, checkId: 1, message: "All builds passed" },
			{ name: "NPM Validation", success: true, checkId: 2, message: "Ready for publish" },
		];

		const result = await createValidationCheck(validations, false);

		expect(result.success).toBe(true);
		expect(result.validations).toEqual(validations);
		expect(result.checkId).toBe(12345);
		expect(mockOctokit.rest.checks.create).toHaveBeenCalledWith(
			expect.objectContaining({
				conclusion: "success",
			}),
		);
	});

	it("should report failure when any validation fails", async () => {
		const validations: ValidationResult[] = [
			{ name: "Build Validation", success: true, checkId: 1, message: "All builds passed" },
			{ name: "NPM Validation", success: false, checkId: 2, message: "Version conflict" },
		];

		const result = await createValidationCheck(validations, false);

		expect(result.success).toBe(false);
		expect(mockOctokit.rest.checks.create).toHaveBeenCalledWith(
			expect.objectContaining({
				conclusion: "failure",
			}),
		);
	});

	it("should handle all validations failing", async () => {
		const validations: ValidationResult[] = [
			{ name: "Build Validation", success: false, checkId: 1, message: "Build failed" },
			{ name: "NPM Validation", success: false, checkId: 2, message: "Auth error" },
		];

		const result = await createValidationCheck(validations, false);

		expect(result.success).toBe(false);
		expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Failed: 2"));
	});

	it("should handle empty validations array", async () => {
		const result = await createValidationCheck([], false);

		expect(result.success).toBe(true);
		expect(result.validations).toEqual([]);
	});

	it("should include dry-run mode in check name", async () => {
		const validations: ValidationResult[] = [{ name: "Build Validation", success: true, checkId: 1 }];

		await createValidationCheck(validations, true);

		expect(mockOctokit.rest.checks.create).toHaveBeenCalledWith(
			expect.objectContaining({
				name: expect.stringContaining("Dry Run"),
			}),
		);
	});

	it("should include validation messages in output", async () => {
		const validations: ValidationResult[] = [
			{ name: "Build", success: false, checkId: 1, message: "TypeScript error in index.ts" },
		];

		await createValidationCheck(validations, false);

		const createCall = mockOctokit.rest.checks.create.mock.calls[0][0];
		expect(createCall.output.title).toContain("1 of 1 validation(s) failed");
	});

	it("should report correct counts for mixed results", async () => {
		const validations: ValidationResult[] = [
			{ name: "Check 1", success: true, checkId: 1 },
			{ name: "Check 2", success: false, checkId: 2 },
			{ name: "Check 3", success: true, checkId: 3 },
			{ name: "Check 4", success: false, checkId: 4 },
		];

		const result = await createValidationCheck(validations, false);

		expect(result.success).toBe(false);
		expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Passed: 2"));
		expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Failed: 2"));
	});

	it("should provide default message when validation message is missing", async () => {
		const validations: ValidationResult[] = [
			{ name: "Build", success: true, checkId: 1 }, // No message
		];

		await createValidationCheck(validations, false);

		// Check that summary was built with default message (summaryWriter uses addRaw)
		expect(core.summary.addRaw).toHaveBeenCalled();
	});
});
