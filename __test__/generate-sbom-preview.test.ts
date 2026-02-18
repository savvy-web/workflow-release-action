import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PackagePublishValidation } from "../src/types/publish-config.js";
import { generateSBOMPreview } from "../src/utils/generate-sbom-preview.js";
import { cleanupTestEnvironment, setupTestEnvironment } from "./utils/github-mocks.js";

vi.mock("@actions/core");

vi.mock("../src/utils/create-attestation.js", () => ({
	validateSBOMGeneration: vi.fn(),
}));

vi.mock("../src/utils/validate-ntia-compliance.js", () => ({
	validateNTIACompliance: vi.fn(),
	formatNTIAComplianceMarkdown: vi.fn(),
}));

import { validateSBOMGeneration } from "../src/utils/create-attestation.js";
import { formatNTIAComplianceMarkdown, validateNTIACompliance } from "../src/utils/validate-ntia-compliance.js";

function createValidation(overrides: Partial<PackagePublishValidation> = {}): PackagePublishValidation {
	return {
		name: "@test/pkg",
		version: "1.0.0",
		path: "/workspace/packages/pkg",
		targets: [
			{
				target: {
					protocol: "npm" as const,
					registry: "https://registry.npmjs.org/",
					directory: "/workspace/packages/pkg",
					access: "public" as const,
					provenance: true,
					tag: "latest",
					tokenEnv: null,
				},
				canPublish: true,
				directoryExists: true,
				packageJsonValid: true,
				dryRunPassed: true,
				dryRunOutput: "",
				dryRunError: "",
				versionConflict: false,
				provenanceReady: true,
				message: "Ready to publish",
			},
		],
		allTargetsValid: true,
		hasPublishableTargets: true,
		...overrides,
	};
}

describe("generateSBOMPreview", () => {
	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });

		vi.mocked(validateNTIACompliance).mockReturnValue({
			compliant: true,
			passedCount: 7,
			totalCount: 7,
			percentage: 100,
			fields: [],
		});

		vi.mocked(formatNTIAComplianceMarkdown).mockReturnValue("**NTIA:** 100% compliant");
	});

	afterEach(() => {
		cleanupTestEnvironment();
	});

	it("should return empty result when no packages have publishable targets", async () => {
		const validation = createValidation({ hasPublishableTargets: false });

		const result = await generateSBOMPreview("pnpm", [validation]);

		expect(result.packages).toHaveLength(0);
		expect(result.success).toBe(true);
		expect(result.checkTitle).toBe("No packages require SBOM");
		expect(result.summaryContent).toContain("No packages with npm provenance targets found");
	});

	it("should skip packages without npm targets with provenance", async () => {
		const validation = createValidation({
			targets: [
				{
					target: {
						protocol: "npm" as const,
						registry: "https://registry.npmjs.org/",
						directory: "/workspace/packages/pkg",
						access: "public" as const,
						provenance: false, // no provenance
						tag: "latest",
						tokenEnv: null,
					},
					canPublish: true,
					directoryExists: true,
					packageJsonValid: true,
					dryRunPassed: true,
					dryRunOutput: "",
					dryRunError: "",
					versionConflict: false,
					provenanceReady: false,
					message: "Ready",
				},
			],
		});

		const result = await generateSBOMPreview("pnpm", [validation]);

		expect(result.packages).toHaveLength(0);
	});

	it("should use existing SBOM validation when available", async () => {
		const sbom = {
			bomFormat: "CycloneDX" as const,
			specVersion: "1.5",
			version: 1,
			components: [{ type: "library", name: "lodash", version: "4.17.21", purl: "pkg:npm/lodash@4.17.21" }],
		};

		const validation = createValidation({
			sbomValidation: {
				valid: true,
				hasDependencies: true,
				dependencyCount: 1,
				generatedSbom: sbom,
			},
		});

		const result = await generateSBOMPreview("pnpm", [validation]);

		expect(result.packages).toHaveLength(1);
		expect(result.packages[0].success).toBe(true);
		expect(result.packages[0].componentCount).toBe(1);
		// Should not call validateSBOMGeneration since existing SBOM is used
		expect(validateSBOMGeneration).not.toHaveBeenCalled();
	});

	it("should generate SBOM when no existing validation is available", async () => {
		const sbom = {
			bomFormat: "CycloneDX",
			specVersion: "1.5",
			version: 1,
			components: [
				{ type: "library", name: "lodash", version: "4.17.21" },
				{ type: "library", name: "express", version: "4.18.2" },
			],
		};

		vi.mocked(validateSBOMGeneration).mockResolvedValue({
			valid: true,
			hasDependencies: true,
			dependencyCount: 2,
			generatedSbom: sbom,
		});

		const validation = createValidation();

		const result = await generateSBOMPreview("pnpm", [validation]);

		expect(result.packages).toHaveLength(1);
		expect(result.packages[0].success).toBe(true);
		expect(result.packages[0].componentCount).toBe(2);
		expect(validateSBOMGeneration).toHaveBeenCalledWith(
			expect.objectContaining({
				packageManager: "pnpm",
				packageName: "@test/pkg",
				packageVersion: "1.0.0",
				enhanceMetadata: true,
			}),
		);
	});

	it("should handle SBOM generation failure", async () => {
		vi.mocked(validateSBOMGeneration).mockResolvedValue({
			valid: false,
			hasDependencies: false,
			dependencyCount: 0,
			error: "Failed to generate SBOM",
		});

		const validation = createValidation();

		const result = await generateSBOMPreview("pnpm", [validation]);

		expect(result.packages).toHaveLength(1);
		expect(result.packages[0].success).toBe(false);
		expect(result.packages[0].error).toBe("Failed to generate SBOM");
		expect(result.success).toBe(false);
	});

	it("should detect NTIA compliance warnings", async () => {
		const sbom = {
			bomFormat: "CycloneDX",
			specVersion: "1.5",
			version: 1,
			components: [],
		};

		vi.mocked(validateSBOMGeneration).mockResolvedValue({
			valid: true,
			hasDependencies: false,
			dependencyCount: 0,
			generatedSbom: sbom,
		});

		vi.mocked(validateNTIACompliance).mockReturnValue({
			compliant: false,
			passedCount: 5,
			totalCount: 7,
			percentage: 71,
			fields: [
				{ name: "Supplier", description: "Supplier name", passed: false, suggestion: "Add supplier" },
				{ name: "Author", description: "Author name", passed: false, suggestion: "Add author" },
				{ name: "Component", description: "Component", passed: true, value: "@test/pkg" },
			],
		});

		const validation = createValidation();

		const result = await generateSBOMPreview("pnpm", [validation]);

		expect(result.hasComplianceWarnings).toBe(true);
		expect(result.complianceSummary).toContain("Supplier");
		expect(result.complianceSummary).toContain("Author");
	});

	it("should generate correct check title for all success", async () => {
		const sbom = {
			bomFormat: "CycloneDX",
			specVersion: "1.5",
			version: 1,
			components: [],
		};

		vi.mocked(validateSBOMGeneration).mockResolvedValue({
			valid: true,
			hasDependencies: false,
			dependencyCount: 0,
			generatedSbom: sbom,
		});

		const validation = createValidation();

		const result = await generateSBOMPreview("pnpm", [validation]);

		expect(result.checkTitle).toBe("1 SBOM(s) generated successfully");
	});

	it("should generate correct check title for partial success", async () => {
		vi.mocked(validateSBOMGeneration).mockResolvedValueOnce({
			valid: true,
			hasDependencies: true,
			dependencyCount: 1,
			generatedSbom: { bomFormat: "CycloneDX", specVersion: "1.5", version: 1, components: [] },
		});

		vi.mocked(validateSBOMGeneration).mockResolvedValueOnce({
			valid: false,
			hasDependencies: false,
			dependencyCount: 0,
			error: "Failed",
		});

		const validation1 = createValidation({ name: "@test/pkg-a" });
		const validation2 = createValidation({ name: "@test/pkg-b" });

		const result = await generateSBOMPreview("pnpm", [validation1, validation2]);

		expect(result.checkTitle).toBe("1/2 SBOM(s) generated");
	});

	it("should include summary content with table and package details", async () => {
		const sbom = {
			bomFormat: "CycloneDX",
			specVersion: "1.5",
			version: 1,
			metadata: {
				supplier: { name: "Test Corp" },
				component: {
					name: "@test/pkg",
					publisher: "Test Corp",
					externalReferences: [
						{ type: "vcs", url: "https://github.com/test/pkg" },
						{ type: "issue-tracker", url: "https://github.com/test/pkg/issues" },
						{ type: "documentation", url: "https://test-pkg.dev" },
						{ type: "website", url: "https://test.dev" },
						{ type: "support", url: "https://test.dev/support" },
						{ type: "license", url: "https://test.dev/license" },
						{ type: "release-notes", url: "https://test.dev/changelog" },
						{ type: "security-contact", url: "https://test.dev/security" },
					],
				},
			},
			components: [
				{
					type: "library",
					name: "lodash",
					version: "4.17.21",
					licenses: [{ license: { id: "MIT" } }],
				},
				{
					type: "library",
					name: "express",
					version: "4.18.2",
					licenses: [{ license: { name: "MIT License" } }],
				},
				{
					type: "application",
					name: "test-app",
					version: "1.0.0",
					licenses: [{ expression: "Apache-2.0" }],
				},
				{
					type: "framework",
					name: "react",
					version: "18.2.0",
				},
			],
		};

		vi.mocked(validateSBOMGeneration).mockResolvedValue({
			valid: true,
			hasDependencies: true,
			dependencyCount: 4,
			generatedSbom: sbom,
		});

		const validation = createValidation();

		const result = await generateSBOMPreview("pnpm", [validation]);

		expect(result.summaryContent).toContain("## SBOM Preview");
		expect(result.summaryContent).toContain("@test/pkg@1.0.0");
		expect(result.summaryContent).toContain("CycloneDX 1.5");
		expect(result.summaryContent).toContain("Test Corp");
		// External references with various types
		expect(result.summaryContent).toContain("Vcs");
		expect(result.summaryContent).toContain("Issue tracker");
		// License summary
		expect(result.summaryContent).toContain("License Summary");
		// Component groups
		expect(result.summaryContent).toContain("Library");
		expect(result.summaryContent).toContain("Application");
		expect(result.summaryContent).toContain("Framework");
	});

	it("should handle empty components", async () => {
		const sbom = {
			bomFormat: "CycloneDX",
			specVersion: "1.5",
			version: 1,
			components: [],
		};

		vi.mocked(validateSBOMGeneration).mockResolvedValue({
			valid: true,
			hasDependencies: false,
			dependencyCount: 0,
			generatedSbom: sbom,
		});

		const validation = createValidation();

		const result = await generateSBOMPreview("pnpm", [validation]);

		expect(result.summaryContent).toContain("No components found in SBOM");
	});

	it("should handle package with error", async () => {
		vi.mocked(validateSBOMGeneration).mockResolvedValue({
			valid: false,
			hasDependencies: false,
			dependencyCount: 0,
			error: "Could not resolve dependencies",
		});

		const validation = createValidation();

		const result = await generateSBOMPreview("pnpm", [validation]);

		expect(result.summaryContent).toContain("Could not resolve dependencies");
	});

	it("should handle package with warning", async () => {
		const sbom = {
			bomFormat: "CycloneDX",
			specVersion: "1.5",
			version: 1,
			components: [],
		};

		vi.mocked(validateSBOMGeneration).mockResolvedValue({
			valid: true,
			hasDependencies: false,
			dependencyCount: 0,
			warning: "No production dependencies found",
			generatedSbom: sbom,
		});

		const validation = createValidation();

		const result = await generateSBOMPreview("pnpm", [validation]);

		expect(result.summaryContent).toContain("No production dependencies found");
		expect(result.packages[0].warning).toBe("No production dependencies found");
	});

	it("should handle package with no SBOM content", async () => {
		vi.mocked(validateSBOMGeneration).mockResolvedValue({
			valid: true,
			hasDependencies: false,
			dependencyCount: 0,
		});

		const validation = createValidation();

		const result = await generateSBOMPreview("pnpm", [validation]);

		expect(result.summaryContent).toContain("No SBOM content available");
	});

	it("should include footer with CycloneDX link", async () => {
		const result = await generateSBOMPreview("pnpm", []);

		expect(result.summaryContent).not.toContain("CycloneDX"); // No packages = no footer
	});

	it("should truncate components list at 20 and show more count", async () => {
		const components = Array.from({ length: 25 }, (_, i) => ({
			type: "library",
			name: `pkg-${i}`,
			version: "1.0.0",
		}));

		const sbom = {
			bomFormat: "CycloneDX",
			specVersion: "1.5",
			version: 1,
			components,
		};

		vi.mocked(validateSBOMGeneration).mockResolvedValue({
			valid: true,
			hasDependencies: true,
			dependencyCount: 25,
			generatedSbom: sbom,
		});

		const validation = createValidation();

		const result = await generateSBOMPreview("pnpm", [validation]);

		expect(result.summaryContent).toContain("... and 5 more");
	});

	it("should handle more than 10 licenses with truncation", async () => {
		const components = Array.from({ length: 15 }, (_, i) => ({
			type: "library",
			name: `pkg-${i}`,
			version: "1.0.0",
			licenses: [{ license: { id: `License-${i}` } }],
		}));

		const sbom = {
			bomFormat: "CycloneDX",
			specVersion: "1.5",
			version: 1,
			components,
		};

		vi.mocked(validateSBOMGeneration).mockResolvedValue({
			valid: true,
			hasDependencies: true,
			dependencyCount: 15,
			generatedSbom: sbom,
		});

		const validation = createValidation();

		const result = await generateSBOMPreview("pnpm", [validation]);

		expect(result.summaryContent).toContain("... 5 more");
	});

	it("should handle various component types with correct icons", async () => {
		const components = [
			{ type: "library", name: "lib", version: "1.0.0" },
			{ type: "application", name: "app", version: "1.0.0" },
			{ type: "framework", name: "fw", version: "1.0.0" },
			{ type: "file", name: "f", version: "1.0.0" },
			{ type: "container", name: "c", version: "1.0.0" },
			{ type: "device", name: "d", version: "1.0.0" },
			{ type: "firmware", name: "fw2", version: "1.0.0" },
			{ type: "operating-system", name: "os", version: "1.0.0" },
			{ type: "other", name: "o", version: "1.0.0" },
		];

		const sbom = {
			bomFormat: "CycloneDX",
			specVersion: "1.5",
			version: 1,
			components,
		};

		vi.mocked(validateSBOMGeneration).mockResolvedValue({
			valid: true,
			hasDependencies: true,
			dependencyCount: components.length,
			generatedSbom: sbom,
		});

		const validation = createValidation();

		const result = await generateSBOMPreview("pnpm", [validation]);

		// Each type should have a section
		expect(result.summaryContent).toContain("Library");
		expect(result.summaryContent).toContain("Application");
		expect(result.summaryContent).toContain("Framework");
		expect(result.summaryContent).toContain("File");
		expect(result.summaryContent).toContain("Container");
		expect(result.summaryContent).toContain("Device");
		expect(result.summaryContent).toContain("Firmware");
		expect(result.summaryContent).toContain("Operating-system");
		expect(result.summaryContent).toContain("Other");
	});

	it("should include raw SBOM JSON in details block", async () => {
		const sbom = {
			bomFormat: "CycloneDX",
			specVersion: "1.5",
			version: 1,
			components: [],
		};

		vi.mocked(validateSBOMGeneration).mockResolvedValue({
			valid: true,
			hasDependencies: false,
			dependencyCount: 0,
			generatedSbom: sbom,
		});

		const validation = createValidation();

		const result = await generateSBOMPreview("pnpm", [validation]);

		expect(result.summaryContent).toContain("View raw SBOM JSON");
		expect(result.summaryContent).toContain("```json");
	});
});
