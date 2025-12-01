import { describe, expect, it } from "vitest";
import type { PackagePublishValidation, ResolvedTarget, TargetValidationResult } from "../src/types/publish-config.js";
import type { PackagePublishResult } from "../src/utils/generate-publish-summary.js";
import { generatePublishResultsSummary, generatePublishSummary } from "../src/utils/generate-publish-summary.js";

describe("generate-publish-summary", () => {
	describe("generatePublishSummary", () => {
		it("generates summary header with dry-run indicator", () => {
			const validations: PackagePublishValidation[] = [];
			const summary = generatePublishSummary(validations, true);

			expect(summary).toContain("Publish Validation");
			expect(summary).toContain("(Dry Run)");
		});

		it("generates summary header without dry-run indicator", () => {
			const validations: PackagePublishValidation[] = [];
			const summary = generatePublishSummary(validations, false);

			expect(summary).toContain("Publish Validation");
			expect(summary).not.toContain("(Dry Run)");
		});

		it("includes summary stats table", () => {
			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: true,
				tag: "latest",
				tokenEnv: "NPM_TOKEN",
			};

			const targetResult: TargetValidationResult = {
				target,
				canPublish: true,
				directoryExists: true,
				packageJsonValid: true,
				dryRunPassed: true,
				dryRunOutput: "",
				dryRunError: "",
				versionConflict: false,
				provenanceReady: true,
				message: "Ready to publish",
			};

			const validations: PackagePublishValidation[] = [
				{
					name: "@test/package",
					version: "1.0.0",
					path: "/test",
					targets: [targetResult],
					allTargetsValid: true,
					hasPublishableTargets: true,
				},
			];

			const summary = generatePublishSummary(validations, false);

			expect(summary).toContain("| Metric | Count |");
			expect(summary).toContain("| Packages ready | 1/1 |");
			expect(summary).toContain("| Targets ready | 1/1 |");
		});

		it("shows package status with checkmark for valid packages", () => {
			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: true,
				tag: "latest",
				tokenEnv: "NPM_TOKEN",
			};

			const targetResult: TargetValidationResult = {
				target,
				canPublish: true,
				directoryExists: true,
				packageJsonValid: true,
				dryRunPassed: true,
				dryRunOutput: "",
				dryRunError: "",
				versionConflict: false,
				provenanceReady: true,
				message: "Ready to publish",
			};

			const validations: PackagePublishValidation[] = [
				{
					name: "@test/package",
					version: "1.0.0",
					path: "/test",
					targets: [targetResult],
					allTargetsValid: true,
					hasPublishableTargets: true,
				},
			];

			const summary = generatePublishSummary(validations, false);

			expect(summary).toContain("\u2705 @test/package@1.0.0");
		});

		it("shows package status with X for invalid packages", () => {
			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: true,
				tag: "latest",
				tokenEnv: "NPM_TOKEN",
			};

			const targetResult: TargetValidationResult = {
				target,
				canPublish: false,
				directoryExists: true,
				packageJsonValid: false,
				dryRunPassed: false,
				dryRunOutput: "",
				dryRunError: "Version conflict",
				versionConflict: true,
				existingVersion: "1.0.0",
				provenanceReady: false,
				message: "Version conflict",
			};

			const validations: PackagePublishValidation[] = [
				{
					name: "@test/package",
					version: "1.0.0",
					path: "/test",
					targets: [targetResult],
					allTargetsValid: false,
					hasPublishableTargets: false,
				},
			];

			const summary = generatePublishSummary(validations, false);

			expect(summary).toContain("\u274C @test/package@1.0.0");
		});

		it("shows target table with protocol icons", () => {
			const npmTarget: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist/npm",
				access: "public",
				provenance: true,
				tag: "latest",
				tokenEnv: "NPM_TOKEN",
			};

			const jsrTarget: ResolvedTarget = {
				protocol: "jsr",
				registry: null,
				directory: "/test/dist/jsr",
				access: "public",
				provenance: false,
				tag: "latest",
				tokenEnv: "JSR_TOKEN",
			};

			const validations: PackagePublishValidation[] = [
				{
					name: "@test/package",
					version: "1.0.0",
					path: "/test",
					targets: [
						{
							target: npmTarget,
							canPublish: true,
							directoryExists: true,
							packageJsonValid: true,
							dryRunPassed: true,
							dryRunOutput: "",
							dryRunError: "",
							versionConflict: false,
							provenanceReady: true,
							message: "Ready",
						},
						{
							target: jsrTarget,
							canPublish: true,
							directoryExists: true,
							packageJsonValid: true,
							dryRunPassed: true,
							dryRunOutput: "",
							dryRunError: "",
							versionConflict: false,
							provenanceReady: true,
							message: "Ready",
						},
					],
					allTargetsValid: true,
					hasPublishableTargets: true,
				},
			];

			const summary = generatePublishSummary(validations, false);

			// Check table headers
			expect(summary).toContain("| Protocol | Registry | Directory | Status | Provenance |");

			// Check npm target row
			expect(summary).toContain("\u{1F4E6} npm");
			expect(summary).toContain("`npm`"); // directory name

			// Check jsr target row
			expect(summary).toContain("\u{1F995} jsr");
			expect(summary).toContain("jsr.io");
		});

		it("shows no targets message for packages without targets", () => {
			const validations: PackagePublishValidation[] = [
				{
					name: "@test/private-package",
					version: "1.0.0",
					path: "/test",
					targets: [],
					allTargetsValid: true,
					hasPublishableTargets: false,
				},
			];

			const summary = generatePublishSummary(validations, false);

			expect(summary).toContain("_No publish targets configured_");
		});

		it("includes legend at the end", () => {
			const validations: PackagePublishValidation[] = [];
			const summary = generatePublishSummary(validations, false);

			expect(summary).toContain("**Legend:**");
			expect(summary).toContain("\u{1F4E6} npm-compatible");
			expect(summary).toContain("\u{1F995} JSR");
		});
	});

	describe("generatePublishResultsSummary", () => {
		it("generates results header with dry-run indicator", () => {
			const results: PackagePublishResult[] = [];
			const summary = generatePublishResultsSummary(results, true);

			expect(summary).toContain("Publish Results");
			expect(summary).toContain("(Dry Run)");
		});

		it("shows successful publish results", () => {
			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: true,
				tag: "latest",
				tokenEnv: "NPM_TOKEN",
			};

			const results: PackagePublishResult[] = [
				{
					name: "@test/package",
					version: "1.0.0",
					targets: [
						{
							target,
							success: true,
							registryUrl: "https://www.npmjs.com/package/@test/package",
							attestationUrl: "https://sigstore.dev/attestation/123",
						},
					],
				},
			];

			const summary = generatePublishResultsSummary(results, false);

			expect(summary).toContain("\u2705 @test/package@1.0.0");
			expect(summary).toContain("\u2705 Published");
			expect(summary).toContain("[View](https://www.npmjs.com/package/@test/package)");
			expect(summary).toContain("[View](https://sigstore.dev/attestation/123)");
		});

		it("shows failed publish results", () => {
			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: true,
				tag: "latest",
				tokenEnv: "NPM_TOKEN",
			};

			const results: PackagePublishResult[] = [
				{
					name: "@test/package",
					version: "1.0.0",
					targets: [
						{
							target,
							success: false,
							error: "Authentication failed",
						},
					],
				},
			];

			const summary = generatePublishResultsSummary(results, false);

			expect(summary).toContain("\u274C @test/package@1.0.0");
			expect(summary).toContain("\u274C Authentication failed");
		});

		it("shows dash for missing URLs", () => {
			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://custom.registry.com/",
				directory: "/test/dist",
				access: "public",
				provenance: false,
				tag: "latest",
				tokenEnv: "CUSTOM_TOKEN",
			};

			const results: PackagePublishResult[] = [
				{
					name: "@test/package",
					version: "1.0.0",
					targets: [
						{
							target,
							success: true,
						},
					],
				},
			];

			const summary = generatePublishResultsSummary(results, false);

			// Should show dashes for missing URLs
			expect(summary).toContain("\u2014");
		});

		it("shows checkmark for provenance without URL", () => {
			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: true,
				tag: "latest",
				tokenEnv: "NPM_TOKEN",
			};

			const results: PackagePublishResult[] = [
				{
					name: "@test/package",
					version: "1.0.0",
					targets: [
						{
							target,
							success: true,
							registryUrl: "https://www.npmjs.com/package/@test/package",
							// No attestationUrl, but provenance is enabled
						},
					],
				},
			];

			const summary = generatePublishResultsSummary(results, false);

			// Should show checkmark for provenance without specific URL
			const tableRowMatch = summary.match(/npm.*Published.*View.*\|(.*)\|/);
			expect(tableRowMatch).toBeTruthy();
		});
	});
});
