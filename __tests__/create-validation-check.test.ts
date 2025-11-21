import { afterEach, beforeEach, describe, expect, it } from "vitest";
import createValidationCheck from "../.github/actions/setup-release/create-validation-check.js";
import type { MockContext, MockCore, MockGithub } from "./utils/github-mocks.js";
import {
	cleanupTestEnvironment,
	createMockContext,
	createMockCore,
	createMockGithub,
	setupTestEnvironment,
} from "./utils/github-mocks.js";

describe("createValidationCheck", () => {
	let mockCore: MockCore;
	let mockGithub: MockGithub;
	let mockContext: MockContext;

	beforeEach(() => {
		setupTestEnvironment();

		mockCore = createMockCore();
		mockGithub = createMockGithub({ checkId: 123456 });
		mockContext = createMockContext();

		// Default environment
		delete process.env.VALIDATIONS;
		delete process.env.DRY_RUN;
	});

	afterEach(() => {
		cleanupTestEnvironment();
	});

	describe("happy path", () => {
		it("should create unified check when all validations pass", async () => {
			process.env.VALIDATIONS = JSON.stringify([
				{
					name: "Build Validation",
					success: true,
					checkId: 111,
					message: "All packages built successfully",
				},
				{
					name: "NPM Publish Validation",
					success: true,
					checkId: 222,
					message: "All packages ready for NPM",
				},
				{
					name: "GitHub Packages Validation",
					success: true,
					checkId: 333,
					message: "All packages ready for GitHub Packages",
				},
			]);

			await createValidationCheck({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "true");
			expect(mockCore.notice).toHaveBeenCalledWith("✓ All 3 validation(s) passed");
			expect(mockGithub.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					conclusion: "success",
					output: expect.objectContaining({
						title: "All 3 validation(s) passed",
					}),
				}),
			);
		});

		it("should handle single validation", async () => {
			process.env.VALIDATIONS = JSON.stringify([
				{
					name: "Build Validation",
					success: true,
					checkId: 111,
				},
			]);

			await createValidationCheck({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "true");
			expect(mockCore.notice).toHaveBeenCalledWith("✓ All 1 validation(s) passed");
		});

		it("should handle validations without optional message field", async () => {
			process.env.VALIDATIONS = JSON.stringify([
				{
					name: "Test Validation",
					success: true,
					checkId: 111,
				},
			]);

			await createValidationCheck({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "true");
		});
	});

	describe("validation failures", () => {
		it("should detect when some validations fail", async () => {
			process.env.VALIDATIONS = JSON.stringify([
				{
					name: "Build Validation",
					success: true,
					checkId: 111,
				},
				{
					name: "NPM Publish Validation",
					success: false,
					checkId: 222,
					message: "Version conflict detected",
				},
				{
					name: "GitHub Packages Validation",
					success: false,
					checkId: 333,
					message: "Authentication required",
				},
			]);

			await createValidationCheck({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "false");
			expect(mockCore.error).toHaveBeenCalledWith("❌ 2 of 3 validation(s) failed");
			expect(mockCore.setFailed).toHaveBeenCalledWith("One or more validations failed. See check run for details.");
			expect(mockGithub.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					conclusion: "failure",
					output: expect.objectContaining({
						title: "2 of 3 validation(s) failed",
					}),
				}),
			);
		});

		it("should detect when all validations fail", async () => {
			process.env.VALIDATIONS = JSON.stringify([
				{
					name: "Build Validation",
					success: false,
					checkId: 111,
					message: "Build failed",
				},
				{
					name: "NPM Publish Validation",
					success: false,
					checkId: 222,
					message: "Publish failed",
				},
			]);

			await createValidationCheck({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "false");
			expect(mockCore.error).toHaveBeenCalledWith("❌ 2 of 2 validation(s) failed");
		});

		it("should handle failed validation without message", async () => {
			process.env.VALIDATIONS = JSON.stringify([
				{
					name: "Test Validation",
					success: false,
					checkId: 111,
				},
			]);

			await createValidationCheck({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "false");
			expect(mockCore.setFailed).toHaveBeenCalledWith("One or more validations failed. See check run for details.");
		});
	});

	describe("dry-run mode", () => {
		it("should indicate dry-run in check title and summary", async () => {
			process.env.DRY_RUN = "true";
			process.env.VALIDATIONS = JSON.stringify([
				{
					name: "Build Validation",
					success: true,
					checkId: 111,
				},
			]);

			await createValidationCheck({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.notice).toHaveBeenCalledWith("🧪 Running in dry-run mode (preview only)");
			expect(mockGithub.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "🧪 Release Validation Summary (Dry Run)",
				}),
			);
		});

		it("should not fail action on validation failure in dry-run", async () => {
			process.env.DRY_RUN = "true";
			process.env.VALIDATIONS = JSON.stringify([
				{
					name: "Build Validation",
					success: false,
					checkId: 111,
					message: "Build failed",
				},
			]);

			await createValidationCheck({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "false");
			expect(mockCore.error).toHaveBeenCalledWith("❌ 1 of 1 validation(s) failed");
			expect(mockCore.setFailed).not.toHaveBeenCalled();
		});
	});

	describe("input validation", () => {
		it("should fail when VALIDATIONS environment variable is missing", async () => {
			// Don't set VALIDATIONS

			await createValidationCheck({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setFailed).toHaveBeenCalledWith("VALIDATIONS environment variable is required");
		});

		it("should fail when VALIDATIONS is empty array", async () => {
			process.env.VALIDATIONS = JSON.stringify([]);

			await createValidationCheck({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setFailed).toHaveBeenCalledWith("VALIDATIONS must be a non-empty array");
		});

		it("should fail when VALIDATIONS is not an array", async () => {
			process.env.VALIDATIONS = JSON.stringify({ name: "test", success: true });

			await createValidationCheck({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setFailed).toHaveBeenCalledWith("VALIDATIONS must be a non-empty array");
		});

		it("should fail when validation is missing name field", async () => {
			process.env.VALIDATIONS = JSON.stringify([
				{
					success: true,
					checkId: 111,
				},
			]);

			await createValidationCheck({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setFailed).toHaveBeenCalledWith(expect.stringContaining("Invalid validation result structure"));
		});

		it("should fail when validation is missing success field", async () => {
			process.env.VALIDATIONS = JSON.stringify([
				{
					name: "Test",
					checkId: 111,
				},
			]);

			await createValidationCheck({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setFailed).toHaveBeenCalledWith(expect.stringContaining("Invalid validation result structure"));
		});

		it("should fail when validation is missing checkId field", async () => {
			process.env.VALIDATIONS = JSON.stringify([
				{
					name: "Test",
					success: true,
				},
			]);

			await createValidationCheck({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setFailed).toHaveBeenCalledWith(expect.stringContaining("Invalid validation result structure"));
		});

		it("should fail when validation has wrong type for name", async () => {
			process.env.VALIDATIONS = JSON.stringify([
				{
					name: 123,
					success: true,
					checkId: 111,
				},
			]);

			await createValidationCheck({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setFailed).toHaveBeenCalledWith(expect.stringContaining("Invalid validation result structure"));
		});

		it("should fail when validation has wrong type for success", async () => {
			process.env.VALIDATIONS = JSON.stringify([
				{
					name: "Test",
					success: "true",
					checkId: 111,
				},
			]);

			await createValidationCheck({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setFailed).toHaveBeenCalledWith(expect.stringContaining("Invalid validation result structure"));
		});

		it("should fail when validation has wrong type for checkId", async () => {
			process.env.VALIDATIONS = JSON.stringify([
				{
					name: "Test",
					success: true,
					checkId: "111",
				},
			]);

			await createValidationCheck({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setFailed).toHaveBeenCalledWith(expect.stringContaining("Invalid validation result structure"));
		});

		it("should handle invalid JSON in VALIDATIONS", async () => {
			process.env.VALIDATIONS = "{ invalid json }";

			await createValidationCheck({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setFailed).toHaveBeenCalledWith(expect.stringContaining("Failed to create validation check"));
		});
	});

	describe("outputs and logging", () => {
		it("should set all outputs correctly", async () => {
			process.env.VALIDATIONS = JSON.stringify([
				{
					name: "Build Validation",
					success: true,
					checkId: 111,
					message: "All good",
				},
				{
					name: "NPM Validation",
					success: false,
					checkId: 222,
					message: "Version conflict",
				},
			]);

			await createValidationCheck({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "false");
			expect(mockCore.setOutput).toHaveBeenCalledWith("validations", expect.any(String));
			expect(mockCore.setOutput).toHaveBeenCalledWith("check_id", "123456");

			const validationsOutput = mockCore.setOutput.mock.calls.find((call) => call[0] === "validations")?.[1];
			const validations = JSON.parse(validationsOutput);
			expect(validations).toHaveLength(2);
			expect(validations[0]).toMatchObject({
				name: "Build Validation",
				success: true,
				checkId: 111,
			});
		});

		it("should create job summary with table", async () => {
			process.env.VALIDATIONS = JSON.stringify([
				{
					name: "Build Validation",
					success: true,
					checkId: 111,
				},
				{
					name: "NPM Validation",
					success: false,
					checkId: 222,
					message: "Failed",
				},
			]);

			await createValidationCheck({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.summary.addHeading).toHaveBeenCalledWith("Release Validation Summary", 2);
			expect(mockCore.summary.addTable).toHaveBeenCalledWith(
				expect.arrayContaining([
					expect.arrayContaining([
						{ data: "Check", header: true },
						{ data: "Status", header: true },
						{ data: "Details", header: true },
					]),
				]),
			);
			expect(mockCore.summary.write).toHaveBeenCalled();
		});

		it("should include failed validations section in summary when there are failures", async () => {
			process.env.VALIDATIONS = JSON.stringify([
				{
					name: "Build Validation",
					success: false,
					checkId: 111,
					message: "Build error",
				},
			]);

			await createValidationCheck({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.summary.addHeading).toHaveBeenCalledWith("Failed Validations", 3);
			expect(mockCore.summary.addRaw).toHaveBeenCalledWith(expect.stringContaining("Build Validation"));
		});

		it("should log validation processing details", async () => {
			process.env.VALIDATIONS = JSON.stringify([
				{
					name: "Test 1",
					success: true,
					checkId: 111,
				},
				{
					name: "Test 2",
					success: false,
					checkId: 222,
				},
				{
					name: "Test 3",
					success: true,
					checkId: 333,
				},
			]);

			await createValidationCheck({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.info).toHaveBeenCalledWith("Processed 3 validation check(s)");
			expect(mockCore.info).toHaveBeenCalledWith("Passed: 2, Failed: 1");
		});

		it("should set debug outputs", async () => {
			process.env.VALIDATIONS = JSON.stringify([
				{
					name: "Test",
					success: true,
					checkId: 111,
				},
			]);

			await createValidationCheck({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.debug).toHaveBeenCalledWith("Set output 'success' to: true");
			expect(mockCore.debug).toHaveBeenCalledWith(expect.stringContaining("Set output 'validations' to:"));
			expect(mockCore.debug).toHaveBeenCalledWith("Set output 'check_id' to: 123456");
		});
	});

	describe("error handling", () => {
		it("should handle non-Error exceptions", async () => {
			process.env.VALIDATIONS = JSON.stringify([
				{
					name: "Test",
					success: true,
					checkId: 111,
				},
			]);

			mockGithub.rest.checks.create.mockRejectedValueOnce("String error");

			await createValidationCheck({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setFailed).toHaveBeenCalledWith("Failed to create validation check: String error");
		});

		it("should handle GitHub API errors", async () => {
			process.env.VALIDATIONS = JSON.stringify([
				{
					name: "Test",
					success: true,
					checkId: 111,
				},
			]);

			mockGithub.rest.checks.create.mockRejectedValueOnce(new Error("API rate limit exceeded"));

			await createValidationCheck({
				core: mockCore as never,
				github: mockGithub as never,
				exec: {} as never,
				context: mockContext as never,
				octokit: mockGithub as never,
				glob: {} as never,
				io: {} as never,
			});

			expect(mockCore.setFailed).toHaveBeenCalledWith("Failed to create validation check: API rate limit exceeded");
		});
	});
});
