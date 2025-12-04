import { context } from "@actions/github";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PackagePublishValidation, ResolvedTarget, TargetValidationResult } from "../src/types/publish-config.js";
import type {
	PackagePublishResult,
	PreValidationDetails,
	PreValidationTarget,
} from "../src/utils/generate-publish-summary.js";
import {
	generateBuildFailureSummary,
	generatePreValidationFailureSummary,
	generatePublishResultsSummary,
	generatePublishSummary,
} from "../src/utils/generate-publish-summary.js";
import type { PublishPackagesResult } from "../src/utils/publish-packages.js";

// Mock @actions/github for context.ref
vi.mock("@actions/github", () => ({
	context: {
		ref: "refs/heads/main",
		repo: {
			owner: "test-owner",
			repo: "test-repo",
		},
	},
}));

describe("generate-publish-summary", () => {
	beforeEach(() => {
		// Reset context values
		Object.defineProperty(vi.mocked(context), "ref", { value: "refs/heads/main", writable: true });
		Object.defineProperty(vi.mocked(context), "repo", {
			value: { owner: "test-owner", repo: "test-repo" },
			writable: true,
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});
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

		it("includes package summary table with columns", () => {
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

			// New table format with Current/Next columns (status column leftmost with empty header)
			expect(summary).toContain("|   | Package | Current | Next | Bump | Changesets |");
			expect(summary).toContain("@test/package");
			expect(summary).toContain("1.0.0");
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

			// Check table headers (new format with per-target stats)
			expect(summary).toContain("|   | Registry | Directory | Packed | Unpacked | Files | Access | Provenance |");

			// Check npm target row (protocol icon before registry name)
			expect(summary).toContain("\u{1F4E6} npm");
			expect(summary).toContain("`dist/npm`"); // directory name shows last 2 path segments

			// Check jsr target row
			expect(summary).toContain("\u{1F995} jsr.io");
		});

		it("shows packages without targets in summary table", () => {
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

			// Package appears in summary table even without targets
			expect(summary).toContain("@test/private-package");
			expect(summary).toContain("1.0.0");
			// No details section for packages without targets (no <details> tag at all)
			expect(summary).not.toContain("<details>");
		});

		it("includes legend in summary table", () => {
			const validations: PackagePublishValidation[] = [];
			const summary = generatePublishSummary(validations, false);

			expect(summary).toContain("**Legend:**");
			// Summary table legend includes status icons and bump types
			expect(summary).toContain("\u2705 Ready");
			expect(summary).toContain("\u23ED\uFE0F Skipped");
			expect(summary).toContain("\u26A0\uFE0F Warning");
			expect(summary).toContain("\u274C Failed");
			expect(summary).toContain("\u{1F534} major");
			expect(summary).toContain("\u{1F7E1} minor");
			expect(summary).toContain("\u{1F7E2} patch");
		});

		it("shows bump type icons when options provided", () => {
			const validations: PackagePublishValidation[] = [
				{
					name: "@test/major-pkg",
					version: "2.0.0",
					path: "/test/major",
					targets: [],
					allTargetsValid: true,
					hasPublishableTargets: false,
				},
				{
					name: "@test/minor-pkg",
					version: "1.1.0",
					path: "/test/minor",
					targets: [],
					allTargetsValid: true,
					hasPublishableTargets: false,
				},
				{
					name: "@test/patch-pkg",
					version: "1.0.1",
					path: "/test/patch",
					targets: [],
					allTargetsValid: true,
					hasPublishableTargets: false,
				},
			];

			const bumpTypes = new Map([
				["@test/major-pkg", "major"],
				["@test/minor-pkg", "minor"],
				["@test/patch-pkg", "patch"],
			]);

			const summary = generatePublishSummary(validations, false, { bumpTypes });

			expect(summary).toContain("\u{1F534} major"); // 🔴
			expect(summary).toContain("\u{1F7E1} minor"); // 🟡
			expect(summary).toContain("\u{1F7E2} patch"); // 🟢
		});

		it("shows changeset counts in column", () => {
			const validations: PackagePublishValidation[] = [
				{
					name: "@test/package",
					version: "1.1.0",
					path: "/test",
					targets: [],
					allTargetsValid: true,
					hasPublishableTargets: false,
				},
			];

			const changesetCounts = new Map([["@test/package", 3]]);

			const summary = generatePublishSummary(validations, false, { changesetCounts });

			// Changeset count now appears as just the number
			expect(summary).toContain("| 3 |");
		});

		it("shows package sizes from stats in target table", () => {
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
				stats: {
					packageSize: "1.5 kB",
					unpackedSize: "4.2 kB",
					totalFiles: 5,
				},
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

			// Sizes now appear in target table columns
			expect(summary).toContain("1.5 kB");
			expect(summary).toContain("4.2 kB");
			expect(summary).toContain("| 5 |");
		});

		it("shows aggregate totals when stats available", () => {
			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: true,
				tag: "latest",
				tokenEnv: "NPM_TOKEN",
			};

			const targetResult1: TargetValidationResult = {
				target,
				canPublish: true,
				directoryExists: true,
				packageJsonValid: true,
				dryRunPassed: true,
				dryRunOutput: "",
				dryRunError: "",
				versionConflict: false,
				provenanceReady: true,
				message: "Ready",
				stats: { packageSize: "1.0 kB", unpackedSize: "2.0 kB", totalFiles: 3 },
			};

			const targetResult2: TargetValidationResult = {
				target,
				canPublish: true,
				directoryExists: true,
				packageJsonValid: true,
				dryRunPassed: true,
				dryRunOutput: "",
				dryRunError: "",
				versionConflict: false,
				provenanceReady: true,
				message: "Ready",
				stats: { packageSize: "2.0 kB", unpackedSize: "4.0 kB", totalFiles: 7 },
			};

			const validations: PackagePublishValidation[] = [
				{
					name: "@test/pkg1",
					version: "1.0.0",
					path: "/test/pkg1",
					targets: [targetResult1],
					allTargetsValid: true,
					hasPublishableTargets: true,
				},
				{
					name: "@test/pkg2",
					version: "2.0.0",
					path: "/test/pkg2",
					targets: [targetResult2],
					allTargetsValid: true,
					hasPublishableTargets: true,
				},
			];

			const summary = generatePublishSummary(validations, false);

			// Aggregate totals (1.0 + 2.0 = 3.0 kB packed)
			expect(summary).toContain("**Totals:**");
			expect(summary).toContain("3.0 kB packed"); // 1024 + 2048 = 3072 bytes = 3.0 kB
			expect(summary).toContain("10 files"); // 3 + 7 = 10
		});

		it("shows individual collapsible details for each package with targets", () => {
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
				message: "Ready",
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

			// Per-package collapsible section (collapsed by default when valid)
			expect(summary).toContain("<details>");
			expect(summary).toContain("<summary><strong>\u2705 @test/package@1.0.0</strong></summary>");
			expect(summary).toContain("</details>");
			// Should NOT have 'open' attribute when all targets are valid
			expect(summary).not.toContain("<details open>");
		});

		it("expands details by default when package has errors", () => {
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
				packageJsonValid: true,
				dryRunPassed: false,
				dryRunOutput: "",
				dryRunError: "Version conflict",
				versionConflict: true,
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

			// Per-package collapsible section (expanded by default when error)
			expect(summary).toContain("<details open>");
			expect(summary).toContain("<summary><strong>\u274C @test/package@1.0.0</strong></summary>");
		});

		it("links package names to GitHub when path available", () => {
			const validations: PackagePublishValidation[] = [
				{
					name: "@test/package",
					version: "1.0.0",
					path: "/test/packages/my-pkg",
					targets: [],
					allTargetsValid: true,
					hasPublishableTargets: false,
				},
			];

			const summary = generatePublishSummary(validations, false);

			// Package name is linked to GitHub
			expect(summary).toContain("[@test/package]");
			expect(summary).toContain("github.com");
			expect(summary).toContain("/tree/");
		});

		it("shows em-dash for bump type when not provided", () => {
			const validations: PackagePublishValidation[] = [
				{
					name: "@test/package",
					version: "1.0.0",
					path: "/test",
					targets: [],
					allTargetsValid: true,
					hasPublishableTargets: false,
				},
			];

			const summary = generatePublishSummary(validations, false);

			// Em-dash for missing bump type
			expect(summary).toContain("\u2014"); // —
		});

		it("shows skipped status when all targets already published", () => {
			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: true,
				tag: "latest",
				tokenEnv: "NPM_TOKEN",
			};

			const validations: PackagePublishValidation[] = [
				{
					name: "@test/package",
					version: "1.0.0",
					path: "/test",
					targets: [
						{
							target,
							canPublish: true,
							directoryExists: true,
							packageJsonValid: true,
							dryRunPassed: true,
							dryRunOutput: "",
							dryRunError: "",
							versionConflict: true, // Already published
							existingVersion: "1.0.0",
							provenanceReady: true,
							message: "Already published",
						},
					],
					allTargetsValid: true,
					hasPublishableTargets: true,
				},
			];

			const summary = generatePublishSummary(validations, false);

			// Package should show skipped icon in summary table
			expect(summary).toContain("\u23ED\uFE0F | [@test/package]");
			// Details section shows skipped icon
			expect(summary).toContain("\u23ED\uFE0F @test/package@1.0.0");
			// Issues list shows informational message
			expect(summary).toContain("\u2139\uFE0F **npm**: v1.0.0 already published");
		});

		it("shows warning status when mix of ready and skipped targets", () => {
			const npmTarget: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist/npm",
				access: "public",
				provenance: true,
				tag: "latest",
				tokenEnv: "NPM_TOKEN",
			};

			const ghTarget: ResolvedTarget = {
				protocol: "npm",
				registry: "https://npm.pkg.github.com/",
				directory: "/test/dist/npm",
				access: "restricted",
				provenance: true,
				tag: "latest",
				tokenEnv: "GITHUB_TOKEN",
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
							versionConflict: false, // Ready to publish
							provenanceReady: true,
							message: "Ready",
						},
						{
							target: ghTarget,
							canPublish: true,
							directoryExists: true,
							packageJsonValid: true,
							dryRunPassed: true,
							dryRunOutput: "",
							dryRunError: "",
							versionConflict: true, // Already published
							existingVersion: "1.0.0",
							provenanceReady: true,
							message: "Already published",
						},
					],
					allTargetsValid: true,
					hasPublishableTargets: true,
				},
			];

			const summary = generatePublishSummary(validations, false);

			// Package should show warning icon in summary table
			expect(summary).toContain("\u26A0\uFE0F | [@test/package]");
			// Details section shows warning icon and is expanded
			expect(summary).toContain("<details open>");
			expect(summary).toContain("\u26A0\uFE0F @test/package@1.0.0");
			// Issues list only shows skipped target, not ready one
			expect(summary).toContain("\u2139\uFE0F **GitHub Packages**: v1.0.0 already published");
			expect(summary).not.toContain("npm**: Ready");
		});

		it("shows current and next versions from options", () => {
			const validations: PackagePublishValidation[] = [
				{
					name: "@test/package",
					version: "2.0.0", // Next version
					path: "/test",
					targets: [],
					allTargetsValid: true,
					hasPublishableTargets: false,
				},
			];

			const currentVersions = new Map([["@test/package", "1.5.0"]]);

			const summary = generatePublishSummary(validations, false, { currentVersions });

			// Should show both current and next versions
			expect(summary).toContain("| 1.5.0 | 2.0.0 |");
		});

		it("formats large package sizes correctly (MB)", () => {
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
				message: "Ready",
				stats: {
					packageSize: "2.5 MB",
					unpackedSize: "10.0 MB",
					totalFiles: 100,
				},
			};

			const validations: PackagePublishValidation[] = [
				{
					name: "@test/large-pkg",
					version: "1.0.0",
					path: "/test",
					targets: [targetResult],
					allTargetsValid: true,
					hasPublishableTargets: true,
				},
			];

			const summary = generatePublishSummary(validations, false);

			expect(summary).toContain("2.5 MB");
			expect(summary).toContain("10.0 MB");
		});

		it("handles byte-level sizes", () => {
			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: true,
				tag: "latest",
				tokenEnv: "NPM_TOKEN",
			};

			const targetResult1: TargetValidationResult = {
				target,
				canPublish: true,
				directoryExists: true,
				packageJsonValid: true,
				dryRunPassed: true,
				dryRunOutput: "",
				dryRunError: "",
				versionConflict: false,
				provenanceReady: true,
				message: "Ready",
				stats: {
					packageSize: "500 B",
					unpackedSize: "1000 B",
					totalFiles: 2,
				},
			};

			const targetResult2: TargetValidationResult = {
				target,
				canPublish: true,
				directoryExists: true,
				packageJsonValid: true,
				dryRunPassed: true,
				dryRunOutput: "",
				dryRunError: "",
				versionConflict: false,
				provenanceReady: true,
				message: "Ready",
				stats: {
					packageSize: "300 B",
					unpackedSize: "600 B",
					totalFiles: 1,
				},
			};

			const validations: PackagePublishValidation[] = [
				{
					name: "@test/tiny-pkg",
					version: "1.0.0",
					path: "/test",
					targets: [targetResult1],
					allTargetsValid: true,
					hasPublishableTargets: true,
				},
				{
					name: "@test/another-tiny-pkg",
					version: "1.0.0",
					path: "/test2",
					targets: [targetResult2],
					allTargetsValid: true,
					hasPublishableTargets: true,
				},
			];

			const summary = generatePublishSummary(validations, false);

			expect(summary).toContain("500 B");
			expect(summary).toContain("300 B");
			// Aggregate totals: 500 + 300 = 800 bytes
			expect(summary).toContain("**Totals:**");
			expect(summary).toContain("800 B packed");
		});

		it("handles GB-level sizes", () => {
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
				message: "Ready",
				stats: {
					packageSize: "1.5 GB",
					unpackedSize: "3.0 GB",
					totalFiles: 50000,
				},
			};

			const validations: PackagePublishValidation[] = [
				{
					name: "@test/huge-pkg",
					version: "1.0.0",
					path: "/test",
					targets: [targetResult],
					allTargetsValid: true,
					hasPublishableTargets: true,
				},
			];

			const summary = generatePublishSummary(validations, false);

			expect(summary).toContain("1.5 GB");
			// Aggregate totals formatted as GB
			expect(summary).toContain("GB packed");
		});

		it("handles unknown size formats gracefully", () => {
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
				message: "Ready",
				stats: {
					packageSize: "unknown format",
					totalFiles: 5,
				},
			};

			const validations: PackagePublishValidation[] = [
				{
					name: "@test/weird-pkg",
					version: "1.0.0",
					path: "/test",
					targets: [targetResult],
					allTargetsValid: true,
					hasPublishableTargets: true,
				},
			];

			const summary = generatePublishSummary(validations, false);

			// Should not crash, just show the raw size
			expect(summary).toContain("unknown format");
			// Aggregate should only show file count since size parsing failed
			expect(summary).toContain("5 files");
		});

		it("shows discovery errors in details section (expanded by default)", () => {
			const validations: PackagePublishValidation[] = [
				{
					name: "@test/broken-pkg",
					version: "1.0.0",
					path: "",
					targets: [],
					allTargetsValid: false,
					hasPublishableTargets: false,
					discoveryError: "Could not find package.json",
				},
			];

			const summary = generatePublishSummary(validations, false);

			// Discovery error appears in details (expanded because of error)
			expect(summary).toContain("<details open>");
			expect(summary).toContain("Could not find package.json");
			expect(summary).toContain("\u274C Error:");
		});

		it("shows no targets message in details for packages in details section", () => {
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
				message: "Ready",
			};

			// One package with targets, one with discoveryError (triggers details section)
			const validations: PackagePublishValidation[] = [
				{
					name: "@test/with-targets",
					version: "1.0.0",
					path: "/test/pkg1",
					targets: [targetResult],
					allTargetsValid: true,
					hasPublishableTargets: true,
				},
				{
					name: "@test/with-error",
					version: "1.0.0",
					path: "",
					targets: [],
					allTargetsValid: false,
					hasPublishableTargets: false,
					discoveryError: "Package not found",
				},
			];

			const summary = generatePublishSummary(validations, false);

			// Both appear in details section
			expect(summary).toContain("@test/with-targets");
			expect(summary).toContain("Package not found");
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

			// Check for failure status in summary
			expect(summary).toContain("\u274C");
			expect(summary).toContain("@test/package");
			expect(summary).toContain("1.0.0");
			// Check for error details section
			expect(summary).toContain("Error Details");
			expect(summary).toContain("Authentication failed");
		});

		it("shows exit code in error details", () => {
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
							error: "npm ERR! 403 Forbidden",
							exitCode: 1,
							stderr: "npm ERR! code E403",
						},
					],
				},
			];

			const summary = generatePublishResultsSummary(results, false);

			expect(summary).toContain("Exit Code:");
			expect(summary).toContain("1");
			expect(summary).toContain("Error Details");
		});

		it("shows stdout output in error details", () => {
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
							error: "Publish failed",
							exitCode: 1,
							stdout: "npm notice package.json detected\nnpm notice Publishing to npm...",
							stderr: "npm ERR! authentication required",
						},
					],
				},
			];

			const summary = generatePublishResultsSummary(results, false);

			expect(summary).toContain("stdout output");
			expect(summary).toContain("package.json detected");
			expect(summary).toContain("stderr output");
			expect(summary).toContain("authentication required");
		});

		it("shows N/A icon for missing URLs", () => {
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

			// Should show N/A icon for missing URLs
			expect(summary).toContain("\u{1F6AB}");
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
			// Table format: | ✅ Published | npm | [View](url) | ✅ |
			expect(summary).toContain("Published");
			expect(summary).toContain("npm");
			expect(summary).toContain("[View]");
			// Provenance enabled but no URL should show checkmark
			expect(summary).toContain("\u2705");
		});

		it("categorizes authentication errors", () => {
			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: false,
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
							error: "401 Unauthorized",
							stderr: "npm ERR! code E401",
						},
					],
				},
			];

			const summary = generatePublishResultsSummary(results, false);
			expect(summary).toContain("Authentication Error");
			expect(summary).toContain("token");
		});

		it("categorizes permission errors for GitHub Packages", () => {
			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://npm.pkg.github.com/",
				directory: "/test/dist",
				access: "public",
				provenance: false,
				tag: "latest",
				tokenEnv: "GITHUB_TOKEN",
			};

			const results: PackagePublishResult[] = [
				{
					name: "@test/package",
					version: "1.0.0",
					targets: [
						{
							target,
							success: false,
							error: "403 Forbidden",
							stderr: "npm ERR! code E403",
						},
					],
				},
			];

			const summary = generatePublishResultsSummary(results, false);
			expect(summary).toContain("GitHub Packages Permission");
			expect(summary).toContain("packages:write");
		});

		it("categorizes provenance errors", () => {
			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: true,
				tag: "latest",
				tokenEnv: null, // npm uses OIDC
			};

			const results: PackagePublishResult[] = [
				{
					name: "@test/package",
					version: "1.0.0",
					targets: [
						{
							target,
							success: false,
							error: "Failed to get id-token",
							stderr: "Error: Unable to get token for Sigstore",
						},
					],
				},
			];

			const summary = generatePublishResultsSummary(results, false);
			expect(summary).toContain("Provenance Error");
			expect(summary).toContain("id-token: write");
		});

		it("categorizes version conflict errors", () => {
			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: false,
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
							error: "Version 1.0.0 already exists",
							stderr: "npm ERR! 409 Conflict",
						},
					],
				},
			];

			const summary = generatePublishResultsSummary(results, false);
			expect(summary).toContain("Version Conflict");
			expect(summary).toContain("version");
		});

		it("shows stderr output in collapsible section", () => {
			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: false,
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
							error: "Publish failed",
							stderr: "npm ERR! code ENEEDAUTH\nnpm ERR! need auth",
						},
					],
				},
			];

			const summary = generatePublishResultsSummary(results, false);
			expect(summary).toContain("<details>");
			expect(summary).toContain("stderr output");
			expect(summary).toContain("npm ERR!");
		});

		it("truncates long output", () => {
			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: false,
				tag: "latest",
				tokenEnv: "NPM_TOKEN",
			};

			// Create output with more than 20 lines
			const longOutput = Array.from({ length: 30 }, (_, i) => `Line ${i + 1}: Error message`).join("\n");

			const results: PackagePublishResult[] = [
				{
					name: "@test/package",
					version: "1.0.0",
					targets: [
						{
							target,
							success: false,
							error: "Publish failed",
							stderr: longOutput,
						},
					],
				},
			];

			const summary = generatePublishResultsSummary(results, false);
			expect(summary).toContain("... (10 more lines)");
		});

		it("shows required permissions section on failure", () => {
			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: false,
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
							error: "Failed",
						},
					],
				},
			];

			const summary = generatePublishResultsSummary(results, false);
			expect(summary).toContain("Required Permissions");
			expect(summary).toContain("contents: write");
			expect(summary).toContain("packages: write");
			expect(summary).toContain("id-token: write");
			expect(summary).toContain("attestations: write");
		});

		it("shows skipped (identical) status for already published targets with matching content", () => {
			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: false,
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
							alreadyPublished: true,
							alreadyPublishedReason: "identical",
							registryUrl: "https://www.npmjs.com/package/@test/package",
						},
					],
				},
			];

			const summary = generatePublishResultsSummary(results, false);

			// Should show skipped (identical) status with skip icon (not check)
			expect(summary).toContain("\u23ED\uFE0F Skipped (identical)");
			expect(summary).not.toContain("\u2705 Published");
		});

		it("shows content mismatch error for already published targets with different content", () => {
			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: false,
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
							success: false, // Content mismatch is an error
							alreadyPublished: true,
							alreadyPublishedReason: "different",
						},
					],
				},
			];

			const summary = generatePublishResultsSummary(results, false);

			// Should show content mismatch error
			expect(summary).toContain("\u274C Content mismatch");
		});

		it("shows skipped (unverified) status when content could not be compared", () => {
			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: false,
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
							alreadyPublished: true,
							alreadyPublishedReason: "unknown",
						},
					],
				},
			];

			const summary = generatePublishResultsSummary(results, false);

			// Should show skipped (unverified) status
			expect(summary).toContain("\u26A0\uFE0F Skipped (unverified)");
		});

		it("shows summary note when targets were skipped", () => {
			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: false,
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
							alreadyPublished: true,
						},
						{
							target: { ...target, registry: "https://npm.pkg.github.com/" },
							success: true,
							alreadyPublished: true,
						},
					],
				},
			];

			const summary = generatePublishResultsSummary(results, false);

			// Should show summary note about skipped targets
			expect(summary).toContain("2 targets were already published and skipped");
		});

		it("shows singular note when one target was skipped", () => {
			const target: ResolvedTarget = {
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/test/dist",
				access: "public",
				provenance: false,
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
							alreadyPublished: true,
						},
					],
				},
			];

			const summary = generatePublishResultsSummary(results, false);

			// Should show singular note
			expect(summary).toContain("1 target was already published and skipped");
		});
	});

	describe("generateBuildFailureSummary", () => {
		it("generates build failure summary with error", () => {
			const result: PublishPackagesResult = {
				success: false,
				packages: [],
				totalPackages: 2,
				successfulPackages: 0,
				totalTargets: 4,
				successfulTargets: 0,
				buildError: "TypeScript compilation failed\nError: Cannot find module",
				buildOutput: "Building packages...\nCompiling TypeScript...",
			};

			const summary = generateBuildFailureSummary(result, false);

			expect(summary).toContain("Build Failed");
			expect(summary).toContain("TypeScript compilation failed");
			expect(summary).toContain("Build output");
			expect(summary).toContain("Troubleshooting");
			expect(summary).toContain("ci:build");
		});

		it("shows dry-run indicator in build failure summary", () => {
			const result: PublishPackagesResult = {
				success: false,
				packages: [],
				totalPackages: 1,
				successfulPackages: 0,
				totalTargets: 2,
				successfulTargets: 0,
				buildError: "Build failed",
			};

			const summary = generateBuildFailureSummary(result, true);

			expect(summary).toContain("Dry Run");
		});

		it("handles missing build output gracefully", () => {
			const result: PublishPackagesResult = {
				success: false,
				packages: [],
				totalPackages: 1,
				successfulPackages: 0,
				totalTargets: 2,
				successfulTargets: 0,
				buildError: "Build failed",
			};

			const summary = generateBuildFailureSummary(result, false);

			expect(summary).toContain("Build Failed");
			expect(summary).toContain("Build failed");
			// Should not contain build output section since it's undefined
			expect(summary).not.toContain("Build output</summary>");
		});

		it("truncates long build error output", () => {
			const longError = Array.from({ length: 50 }, (_, i) => `Error line ${i + 1}`).join("\n");

			const result: PublishPackagesResult = {
				success: false,
				packages: [],
				totalPackages: 1,
				successfulPackages: 0,
				totalTargets: 2,
				successfulTargets: 0,
				buildError: longError,
			};

			const summary = generateBuildFailureSummary(result, false);

			expect(summary).toContain("... (20 more lines)");
		});
	});

	describe("generatePreValidationFailureSummary", () => {
		const createTarget = (overrides: Partial<PreValidationTarget> = {}): PreValidationTarget => ({
			registryName: "npm",
			protocol: "npm",
			packageName: "@test/package",
			version: "1.0.0",
			status: "error",
			...overrides,
		});

		it("generates header without dry-run indicator", () => {
			const details: PreValidationDetails = {
				targets: [],
				readyTargets: [],
				skipTargets: [],
				errorTargets: [],
			};

			const summary = generatePreValidationFailureSummary(details, false);

			expect(summary).toContain("Pre-Validation Failed");
			expect(summary).not.toContain("Dry Run");
		});

		it("generates header with dry-run indicator", () => {
			const details: PreValidationDetails = {
				targets: [],
				readyTargets: [],
				skipTargets: [],
				errorTargets: [],
			};

			const summary = generatePreValidationFailureSummary(details, true);

			expect(summary).toContain("Pre-Validation Failed");
			expect(summary).toContain("Dry Run");
		});

		it("shows summary counts", () => {
			const errorTarget = createTarget({ status: "error" });
			const readyTarget = createTarget({ status: "ready", packageName: "@test/ready" });
			const skipTarget = createTarget({ status: "skip", packageName: "@test/skip" });

			const details: PreValidationDetails = {
				targets: [errorTarget, readyTarget, skipTarget],
				readyTargets: [readyTarget],
				skipTargets: [skipTarget],
				errorTargets: [errorTarget],
			};

			const summary = generatePreValidationFailureSummary(details, false);

			expect(summary).toContain("1 error(s)");
			expect(summary).toContain("1 ready");
			expect(summary).toContain("1 already published");
			expect(summary).toContain("3 target(s)");
		});

		it("shows target status table with icons", () => {
			const errorTarget = createTarget({ status: "error", registryName: "npm" });
			const readyTarget = createTarget({
				status: "ready",
				registryName: "GitHub Packages",
				packageName: "@test/ready",
			});
			const skipTarget = createTarget({
				status: "skip",
				registryName: "jsr.io",
				protocol: "jsr",
				packageName: "@test/skip",
			});

			const details: PreValidationDetails = {
				targets: [errorTarget, readyTarget, skipTarget],
				readyTargets: [readyTarget],
				skipTargets: [skipTarget],
				errorTargets: [errorTarget],
			};

			const summary = generatePreValidationFailureSummary(details, false);

			// Check table headers
			expect(summary).toContain("| Package | Version | Registry | Status |");

			// Check status icons
			expect(summary).toContain("\u274C"); // Error
			expect(summary).toContain("\u2705"); // Ready
			expect(summary).toContain("\u23ED\uFE0F"); // Skip

			// Check protocol icons
			expect(summary).toContain("\u{1F4E6} npm"); // npm box icon
			expect(summary).toContain("\u{1F995}"); // jsr deno icon
		});

		it("shows error details section with categorized errors", () => {
			const errorTarget = createTarget({
				status: "error",
				error: "401 Unauthorized",
				registryUrl: "https://registry.npmjs.org/",
			});

			const details: PreValidationDetails = {
				targets: [errorTarget],
				readyTargets: [],
				skipTargets: [],
				errorTargets: [errorTarget],
			};

			const summary = generatePreValidationFailureSummary(details, false);

			expect(summary).toContain("Error Details");
			expect(summary).toContain("<details open>");
			expect(summary).toContain("@test/package@1.0.0");
			expect(summary).toContain("npm Auth Error");
			expect(summary).toContain("401 Unauthorized");
		});

		it("shows content mismatch error with integrity comparison", () => {
			const errorTarget = createTarget({
				status: "error",
				error: "Content mismatch: local differs from published",
				localIntegrity: "sha512-abc123",
				remoteIntegrity: "sha512-def456",
			});

			const details: PreValidationDetails = {
				targets: [errorTarget],
				readyTargets: [],
				skipTargets: [],
				errorTargets: [errorTarget],
			};

			const summary = generatePreValidationFailureSummary(details, false);

			expect(summary).toContain("Content Mismatch");
			expect(summary).toContain("bump the version");
			expect(summary).toContain("Integrity Comparison");
			expect(summary).toContain("sha512-abc123");
			expect(summary).toContain("sha512-def456");
		});

		it("shows GitHub Packages auth error hints", () => {
			const errorTarget = createTarget({
				status: "error",
				error: "401 Unauthorized",
				registryUrl: "https://npm.pkg.github.com/",
				registryName: "GitHub Packages",
			});

			const details: PreValidationDetails = {
				targets: [errorTarget],
				readyTargets: [],
				skipTargets: [],
				errorTargets: [errorTarget],
			};

			const summary = generatePreValidationFailureSummary(details, false);

			expect(summary).toContain("GitHub Packages Auth Error");
			expect(summary).toContain("permission-packages: write");
		});

		it("shows GitHub Packages permission error hints", () => {
			const errorTarget = createTarget({
				status: "error",
				error: "403 Forbidden",
				registryUrl: "https://npm.pkg.github.com/",
				registryName: "GitHub Packages",
			});

			const details: PreValidationDetails = {
				targets: [errorTarget],
				readyTargets: [],
				skipTargets: [],
				errorTargets: [errorTarget],
			};

			const summary = generatePreValidationFailureSummary(details, false);

			expect(summary).toContain("GitHub Packages Permission");
			expect(summary).toContain("packages:write");
		});

		it("shows custom registry auth error hints", () => {
			const errorTarget = createTarget({
				status: "error",
				error: "401 Unauthorized",
				registryUrl: "https://npm.savvyweb.dev/",
				registryName: "npm.savvyweb.dev",
			});

			const details: PreValidationDetails = {
				targets: [errorTarget],
				readyTargets: [],
				skipTargets: [],
				errorTargets: [errorTarget],
			};

			const summary = generatePreValidationFailureSummary(details, false);

			expect(summary).toContain("Custom Registry Auth Error");
			expect(summary).toContain("registry-tokens");
			expect(summary).toContain("npm.savvyweb.dev");
		});

		it("shows custom registry permission error hints", () => {
			const errorTarget = createTarget({
				status: "error",
				error: "403 Forbidden",
				registryUrl: "https://npm.savvyweb.dev/",
				registryName: "npm.savvyweb.dev",
			});

			const details: PreValidationDetails = {
				targets: [errorTarget],
				readyTargets: [],
				skipTargets: [],
				errorTargets: [errorTarget],
			};

			const summary = generatePreValidationFailureSummary(details, false);

			expect(summary).toContain("Custom Registry Permission");
			expect(summary).toContain("write access");
		});

		it("shows network error hints", () => {
			const errorTarget = createTarget({
				status: "error",
				error: "ECONNREFUSED: connection refused",
			});

			const details: PreValidationDetails = {
				targets: [errorTarget],
				readyTargets: [],
				skipTargets: [],
				errorTargets: [errorTarget],
			};

			const summary = generatePreValidationFailureSummary(details, false);

			expect(summary).toContain("Network Error");
			expect(summary).toContain("unreachable");
		});

		it("shows generic error for unrecognized errors", () => {
			const errorTarget = createTarget({
				status: "error",
				error: "Something unexpected happened",
			});

			const details: PreValidationDetails = {
				targets: [errorTarget],
				readyTargets: [],
				skipTargets: [],
				errorTargets: [errorTarget],
			};

			const summary = generatePreValidationFailureSummary(details, false);

			expect(summary).toContain("Pre-Validation Error");
			expect(summary).toContain("Review the error details");
		});

		it("shows ready targets section", () => {
			const readyTarget = createTarget({
				status: "ready",
				packageName: "@test/ready-pkg",
				registryName: "npm",
			});

			const details: PreValidationDetails = {
				targets: [readyTarget],
				readyTargets: [readyTarget],
				skipTargets: [],
				errorTargets: [],
			};

			const summary = generatePreValidationFailureSummary(details, false);

			expect(summary).toContain("Ready Targets");
			expect(summary).toContain("@test/ready-pkg@1.0.0");
			expect(summary).toContain("would be published once errors are resolved");
		});

		it("shows skip targets section", () => {
			const skipTarget = createTarget({
				status: "skip",
				packageName: "@test/skip-pkg",
				registryName: "GitHub Packages",
			});

			const details: PreValidationDetails = {
				targets: [skipTarget],
				readyTargets: [],
				skipTargets: [skipTarget],
				errorTargets: [],
			};

			const summary = generatePreValidationFailureSummary(details, false);

			expect(summary).toContain("Already Published");
			expect(summary).toContain("@test/skip-pkg@1.0.0");
			expect(summary).toContain("identical content");
		});

		it("shows custom registry configuration help", () => {
			const errorTarget = createTarget({
				status: "error",
				error: "401 Unauthorized",
				registryUrl: "https://npm.savvyweb.dev/",
			});

			const details: PreValidationDetails = {
				targets: [errorTarget],
				readyTargets: [],
				skipTargets: [],
				errorTargets: [errorTarget],
			};

			const summary = generatePreValidationFailureSummary(details, false);

			expect(summary).toContain("Configuration");
			expect(summary).toContain("custom registries");
			expect(summary).toContain("registry-tokens:");
			expect(summary).toContain("npm.savvyweb.dev");
		});

		it("shows GitHub Packages configuration help", () => {
			const errorTarget = createTarget({
				status: "error",
				error: "403 Forbidden",
				registryUrl: "https://npm.pkg.github.com/",
			});

			const details: PreValidationDetails = {
				targets: [errorTarget],
				readyTargets: [],
				skipTargets: [],
				errorTargets: [errorTarget],
			};

			const summary = generatePreValidationFailureSummary(details, false);

			expect(summary).toContain("GitHub Packages");
			expect(summary).toContain("create-github-app-token");
			expect(summary).toContain("permission-packages: write");
		});

		it("shows npm configuration help", () => {
			const errorTarget = createTarget({
				status: "error",
				error: "401 Unauthorized",
				registryUrl: "https://registry.npmjs.org/",
			});

			const details: PreValidationDetails = {
				targets: [errorTarget],
				readyTargets: [],
				skipTargets: [],
				errorTargets: [errorTarget],
			};

			const summary = generatePreValidationFailureSummary(details, false);

			expect(summary).toContain("npm");
			expect(summary).toContain("trusted publishing");
			expect(summary).toContain("id-token: write");
		});

		it("shows JSR protocol icon for jsr targets", () => {
			const jsrTarget = createTarget({
				status: "ready",
				protocol: "jsr",
				registryName: "jsr.io",
			});

			const details: PreValidationDetails = {
				targets: [jsrTarget],
				readyTargets: [jsrTarget],
				skipTargets: [],
				errorTargets: [],
			};

			const summary = generatePreValidationFailureSummary(details, false);

			// JSR uses the deno dinosaur icon
			expect(summary).toContain("\u{1F995}");
		});

		it("includes explainer about preventing partial releases", () => {
			const details: PreValidationDetails = {
				targets: [],
				readyTargets: [],
				skipTargets: [],
				errorTargets: [],
			};

			const summary = generatePreValidationFailureSummary(details, false);

			expect(summary).toContain("Publishing was aborted");
			expect(summary).toContain("partial releases");
		});

		it("handles timeout network errors", () => {
			const errorTarget = createTarget({
				status: "error",
				error: "Request timeout after 30000ms",
			});

			const details: PreValidationDetails = {
				targets: [errorTarget],
				readyTargets: [],
				skipTargets: [],
				errorTargets: [errorTarget],
			};

			const summary = generatePreValidationFailureSummary(details, false);

			expect(summary).toContain("Network Error");
		});

		it("handles ENOTFOUND network errors", () => {
			const errorTarget = createTarget({
				status: "error",
				error: "ENOTFOUND: DNS lookup failed",
			});

			const details: PreValidationDetails = {
				targets: [errorTarget],
				readyTargets: [],
				skipTargets: [],
				errorTargets: [errorTarget],
			};

			const summary = generatePreValidationFailureSummary(details, false);

			expect(summary).toContain("Network Error");
		});
	});
});
