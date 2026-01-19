import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	determineReleaseType,
	determineTagStrategy,
	isMonorepoForTagging,
} from "../src/utils/determine-tag-strategy.js";
import type { PackagePublishResult } from "../src/utils/generate-publish-summary.js";
import * as releaseSummaryHelpers from "../src/utils/release-summary-helpers.js";

// Mock @actions/core
vi.mock("@actions/core", () => ({
	info: vi.fn(),
	warning: vi.fn(),
	debug: vi.fn(),
}));

// Mock release-summary-helpers
vi.mock("../src/utils/release-summary-helpers.js", () => ({
	getAllWorkspacePackages: vi.fn(),
	readChangesetConfig: vi.fn(),
}));

describe("determine-tag-strategy", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Default: single package repo (not a monorepo)
		vi.mocked(releaseSummaryHelpers.getAllWorkspacePackages).mockReturnValue([
			{ name: "root-pkg", version: "1.0.0", path: "/", private: false, hasPublishConfig: true, targetCount: 1 },
		]);
		vi.mocked(releaseSummaryHelpers.readChangesetConfig).mockReturnValue(null);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("determineTagStrategy", () => {
		it("returns empty tags for no successful packages", () => {
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [
						{
							target: {
								protocol: "npm",
								registry: "https://registry.npmjs.org/",
								directory: "/path/to/pkg-a",
								access: "public",
								provenance: true,
								tag: "latest",
								tokenEnv: "NPM_TOKEN",
							},
							success: false,
							error: "Failed to publish",
						},
					],
				},
			];

			const result = determineTagStrategy(publishResults);

			expect(result.strategy).toBe("single");
			expect(result.tags).toHaveLength(0);
			expect(result.isFixedVersioning).toBe(true);
		});

		it("returns single tag for single package", () => {
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.2.3",
					targets: [
						{
							target: {
								protocol: "npm",
								registry: "https://registry.npmjs.org/",
								directory: "/path/to/pkg-a",
								access: "public",
								provenance: true,
								tag: "latest",
								tokenEnv: "NPM_TOKEN",
							},
							success: true,
							registryUrl: "https://www.npmjs.com/package/@org/pkg-a",
						},
					],
				},
			];

			const result = determineTagStrategy(publishResults);

			expect(result.strategy).toBe("single");
			expect(result.tags).toHaveLength(1);
			expect(result.tags[0]).toEqual({
				name: "1.2.3",
				packageName: "@org/pkg-a",
				version: "1.2.3",
			});
			expect(result.isFixedVersioning).toBe(true);
		});

		it("returns single tag for fixed versioning (all same version)", () => {
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "2.0.0",
					targets: [
						{
							target: {
								protocol: "npm",
								registry: "https://registry.npmjs.org/",
								directory: "/path/to/pkg-a",
								access: "public",
								provenance: true,
								tag: "latest",
								tokenEnv: "NPM_TOKEN",
							},
							success: true,
						},
					],
				},
				{
					name: "@org/pkg-b",
					version: "2.0.0",
					targets: [
						{
							target: {
								protocol: "npm",
								registry: "https://registry.npmjs.org/",
								directory: "/path/to/pkg-b",
								access: "public",
								provenance: true,
								tag: "latest",
								tokenEnv: "NPM_TOKEN",
							},
							success: true,
						},
					],
				},
			];

			const result = determineTagStrategy(publishResults);

			expect(result.strategy).toBe("single");
			expect(result.tags).toHaveLength(1);
			expect(result.tags[0].name).toBe("2.0.0");
			expect(result.tags[0].packageName).toContain("@org/pkg-a");
			expect(result.tags[0].packageName).toContain("@org/pkg-b");
			expect(result.isFixedVersioning).toBe(true);
		});

		it("returns multiple tags for independent versioning in monorepo", () => {
			// Mock a monorepo with multiple publishable packages
			vi.mocked(releaseSummaryHelpers.getAllWorkspacePackages).mockReturnValue([
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					path: "/pkgs/a",
					private: false,
					hasPublishConfig: true,
					targetCount: 1,
				},
				{
					name: "@org/pkg-b",
					version: "2.0.0",
					path: "/pkgs/b",
					private: false,
					hasPublishConfig: true,
					targetCount: 1,
				},
			]);

			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [
						{
							target: {
								protocol: "npm",
								registry: "https://registry.npmjs.org/",
								directory: "/path/to/pkg-a",
								access: "public",
								provenance: true,
								tag: "latest",
								tokenEnv: "NPM_TOKEN",
							},
							success: true,
						},
					],
				},
				{
					name: "@org/pkg-b",
					version: "2.0.0",
					targets: [
						{
							target: {
								protocol: "npm",
								registry: "https://registry.npmjs.org/",
								directory: "/path/to/pkg-b",
								access: "public",
								provenance: true,
								tag: "latest",
								tokenEnv: "NPM_TOKEN",
							},
							success: true,
						},
					],
				},
			];

			const result = determineTagStrategy(publishResults);

			expect(result.strategy).toBe("multiple");
			expect(result.tags).toHaveLength(2);
			expect(result.tags[0].name).toBe("@org/pkg-a@1.0.0");
			expect(result.tags[1].name).toBe("@org/pkg-b@2.0.0");
			expect(result.isFixedVersioning).toBe(false);
		});

		it("uses v prefix for non-scoped packages in independent versioning", () => {
			// Mock a monorepo with multiple non-scoped publishable packages
			vi.mocked(releaseSummaryHelpers.getAllWorkspacePackages).mockReturnValue([
				{ name: "pkg-a", version: "1.0.0", path: "/pkgs/a", private: false, hasPublishConfig: true, targetCount: 1 },
				{ name: "pkg-b", version: "2.0.0", path: "/pkgs/b", private: false, hasPublishConfig: true, targetCount: 1 },
			]);

			const publishResults: PackagePublishResult[] = [
				{
					name: "pkg-a",
					version: "1.0.0",
					targets: [
						{
							target: {
								protocol: "npm",
								registry: "https://registry.npmjs.org/",
								directory: "/path/to/pkg-a",
								access: "public",
								provenance: true,
								tag: "latest",
								tokenEnv: "NPM_TOKEN",
							},
							success: true,
						},
					],
				},
				{
					name: "pkg-b",
					version: "2.0.0",
					targets: [
						{
							target: {
								protocol: "npm",
								registry: "https://registry.npmjs.org/",
								directory: "/path/to/pkg-b",
								access: "public",
								provenance: true,
								tag: "latest",
								tokenEnv: "NPM_TOKEN",
							},
							success: true,
						},
					],
				},
			];

			const result = determineTagStrategy(publishResults);

			expect(result.tags[0].name).toBe("pkg-a@v1.0.0");
			expect(result.tags[1].name).toBe("pkg-b@v2.0.0");
		});

		it("only considers packages with at least one successful target", () => {
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [
						{
							target: {
								protocol: "npm",
								registry: "https://registry.npmjs.org/",
								directory: "/path/to/pkg-a",
								access: "public",
								provenance: true,
								tag: "latest",
								tokenEnv: "NPM_TOKEN",
							},
							success: true,
						},
					],
				},
				{
					name: "@org/pkg-b",
					version: "2.0.0",
					targets: [
						{
							target: {
								protocol: "npm",
								registry: "https://registry.npmjs.org/",
								directory: "/path/to/pkg-b",
								access: "public",
								provenance: true,
								tag: "latest",
								tokenEnv: "NPM_TOKEN",
							},
							success: false,
							error: "Failed",
						},
					],
				},
			];

			const result = determineTagStrategy(publishResults);

			expect(result.strategy).toBe("single");
			expect(result.tags).toHaveLength(1);
			expect(result.tags[0].name).toBe("1.0.0");
		});

		it("uses per-package tag when monorepo releases single package (bug fix)", () => {
			// This is the key bug fix: when a monorepo releases only ONE package,
			// it should still use per-package tags, not v1.0.0
			vi.mocked(releaseSummaryHelpers.getAllWorkspacePackages).mockReturnValue([
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					path: "/pkgs/a",
					private: false,
					hasPublishConfig: true,
					targetCount: 1,
				},
				{
					name: "@org/pkg-b",
					version: "0.1.0",
					path: "/pkgs/b",
					private: false,
					hasPublishConfig: true,
					targetCount: 1,
				},
				{
					name: "@org/pkg-c",
					version: "0.1.0",
					path: "/pkgs/c",
					private: false,
					hasPublishConfig: true,
					targetCount: 1,
				},
			]);

			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [
						{
							target: {
								protocol: "npm",
								registry: "https://registry.npmjs.org/",
								directory: "/path/to/pkg-a",
								access: "public",
								provenance: true,
								tag: "latest",
								tokenEnv: "NPM_TOKEN",
							},
							success: true,
						},
					],
				},
			];

			const result = determineTagStrategy(publishResults);

			// Should use per-package tag, NOT v1.0.0
			expect(result.strategy).toBe("multiple");
			expect(result.tags).toHaveLength(1);
			expect(result.tags[0].name).toBe("@org/pkg-a@1.0.0");
		});

		it("uses single tag when all packages are in same fixed group", () => {
			vi.mocked(releaseSummaryHelpers.getAllWorkspacePackages).mockReturnValue([
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					path: "/pkgs/a",
					private: false,
					hasPublishConfig: true,
					targetCount: 1,
				},
				{
					name: "@org/pkg-b",
					version: "1.0.0",
					path: "/pkgs/b",
					private: false,
					hasPublishConfig: true,
					targetCount: 1,
				},
			]);
			vi.mocked(releaseSummaryHelpers.readChangesetConfig).mockReturnValue({
				fixed: [["@org/pkg-a", "@org/pkg-b"]],
			});

			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [{ target: {} as never, success: true }],
				},
				{
					name: "@org/pkg-b",
					version: "1.0.0",
					targets: [{ target: {} as never, success: true }],
				},
			];

			const result = determineTagStrategy(publishResults);

			expect(result.strategy).toBe("single");
			expect(result.tags).toHaveLength(1);
			expect(result.tags[0].name).toBe("1.0.0");
		});
	});

	describe("isMonorepoForTagging", () => {
		it("returns false for single publishable package", () => {
			vi.mocked(releaseSummaryHelpers.getAllWorkspacePackages).mockReturnValue([
				{ name: "my-pkg", version: "1.0.0", path: "/", private: false, hasPublishConfig: true, targetCount: 1 },
			]);

			expect(isMonorepoForTagging()).toBe(false);
		});

		it("returns true for multiple publishable packages without fixed config", () => {
			vi.mocked(releaseSummaryHelpers.getAllWorkspacePackages).mockReturnValue([
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					path: "/pkgs/a",
					private: false,
					hasPublishConfig: true,
					targetCount: 1,
				},
				{
					name: "@org/pkg-b",
					version: "1.0.0",
					path: "/pkgs/b",
					private: false,
					hasPublishConfig: true,
					targetCount: 1,
				},
			]);
			vi.mocked(releaseSummaryHelpers.readChangesetConfig).mockReturnValue(null);

			expect(isMonorepoForTagging()).toBe(true);
		});

		it("returns false when all publishable packages are in same fixed group", () => {
			vi.mocked(releaseSummaryHelpers.getAllWorkspacePackages).mockReturnValue([
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					path: "/pkgs/a",
					private: false,
					hasPublishConfig: true,
					targetCount: 1,
				},
				{
					name: "@org/pkg-b",
					version: "1.0.0",
					path: "/pkgs/b",
					private: false,
					hasPublishConfig: true,
					targetCount: 1,
				},
			]);
			vi.mocked(releaseSummaryHelpers.readChangesetConfig).mockReturnValue({
				fixed: [["@org/pkg-a", "@org/pkg-b"]],
			});

			expect(isMonorepoForTagging()).toBe(false);
		});

		it("returns true when packages are in linked group (not fixed)", () => {
			vi.mocked(releaseSummaryHelpers.getAllWorkspacePackages).mockReturnValue([
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					path: "/pkgs/a",
					private: false,
					hasPublishConfig: true,
					targetCount: 1,
				},
				{
					name: "@org/pkg-b",
					version: "1.0.0",
					path: "/pkgs/b",
					private: false,
					hasPublishConfig: true,
					targetCount: 1,
				},
			]);
			vi.mocked(releaseSummaryHelpers.readChangesetConfig).mockReturnValue({
				linked: [["@org/pkg-a", "@org/pkg-b"]],
			});

			expect(isMonorepoForTagging()).toBe(true);
		});

		it("returns true when only some packages are in fixed group", () => {
			vi.mocked(releaseSummaryHelpers.getAllWorkspacePackages).mockReturnValue([
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					path: "/pkgs/a",
					private: false,
					hasPublishConfig: true,
					targetCount: 1,
				},
				{
					name: "@org/pkg-b",
					version: "1.0.0",
					path: "/pkgs/b",
					private: false,
					hasPublishConfig: true,
					targetCount: 1,
				},
				{
					name: "@org/pkg-c",
					version: "1.0.0",
					path: "/pkgs/c",
					private: false,
					hasPublishConfig: true,
					targetCount: 1,
				},
			]);
			vi.mocked(releaseSummaryHelpers.readChangesetConfig).mockReturnValue({
				fixed: [["@org/pkg-a", "@org/pkg-b"]], // pkg-c not in fixed
			});

			expect(isMonorepoForTagging()).toBe(true);
		});

		it("ignores private packages without publish config", () => {
			vi.mocked(releaseSummaryHelpers.getAllWorkspacePackages).mockReturnValue([
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					path: "/pkgs/a",
					private: false,
					hasPublishConfig: true,
					targetCount: 1,
				},
				{ name: "root", version: "0.0.0", path: "/", private: true, hasPublishConfig: false, targetCount: 0 },
			]);

			// Only 1 publishable package, so not a monorepo for tagging
			expect(isMonorepoForTagging()).toBe(false);
		});
	});

	describe("determineReleaseType", () => {
		it("returns major for major bump", () => {
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "2.0.0",
					targets: [{ target: {} as never, success: true }],
				},
			];
			const bumpTypes = new Map([["@org/pkg-a", "major"]]);

			const result = determineReleaseType(publishResults, bumpTypes);

			expect(result).toBe("major");
		});

		it("returns minor for minor bump", () => {
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.1.0",
					targets: [{ target: {} as never, success: true }],
				},
			];
			const bumpTypes = new Map([["@org/pkg-a", "minor"]]);

			const result = determineReleaseType(publishResults, bumpTypes);

			expect(result).toBe("minor");
		});

		it("returns patch for patch bump", () => {
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.1",
					targets: [{ target: {} as never, success: true }],
				},
			];
			const bumpTypes = new Map([["@org/pkg-a", "patch"]]);

			const result = determineReleaseType(publishResults, bumpTypes);

			expect(result).toBe("patch");
		});

		it("returns highest bump type when mixed", () => {
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "2.0.0",
					targets: [{ target: {} as never, success: true }],
				},
				{
					name: "@org/pkg-b",
					version: "1.1.0",
					targets: [{ target: {} as never, success: true }],
				},
				{
					name: "@org/pkg-c",
					version: "1.0.1",
					targets: [{ target: {} as never, success: true }],
				},
			];
			const bumpTypes = new Map([
				["@org/pkg-a", "major"],
				["@org/pkg-b", "minor"],
				["@org/pkg-c", "patch"],
			]);

			const result = determineReleaseType(publishResults, bumpTypes);

			expect(result).toBe("major");
		});

		it("returns minor when major is not present", () => {
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.1.0",
					targets: [{ target: {} as never, success: true }],
				},
				{
					name: "@org/pkg-b",
					version: "1.0.1",
					targets: [{ target: {} as never, success: true }],
				},
			];
			const bumpTypes = new Map([
				["@org/pkg-a", "minor"],
				["@org/pkg-b", "patch"],
			]);

			const result = determineReleaseType(publishResults, bumpTypes);

			expect(result).toBe("minor");
		});

		it("returns patch when no bump types found", () => {
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "1.0.0",
					targets: [{ target: {} as never, success: true }],
				},
			];
			const bumpTypes = new Map<string, string>();

			const result = determineReleaseType(publishResults, bumpTypes);

			expect(result).toBe("patch");
		});

		it("ignores failed packages", () => {
			const publishResults: PackagePublishResult[] = [
				{
					name: "@org/pkg-a",
					version: "2.0.0",
					targets: [{ target: {} as never, success: false, error: "Failed" }],
				},
				{
					name: "@org/pkg-b",
					version: "1.0.1",
					targets: [{ target: {} as never, success: true }],
				},
			];
			const bumpTypes = new Map([
				["@org/pkg-a", "major"],
				["@org/pkg-b", "patch"],
			]);

			const result = determineReleaseType(publishResults, bumpTypes);

			expect(result).toBe("patch");
		});
	});
});
