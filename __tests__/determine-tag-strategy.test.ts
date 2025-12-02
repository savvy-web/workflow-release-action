import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { determineReleaseType, determineTagStrategy } from "../src/utils/determine-tag-strategy.js";
import type { PackagePublishResult } from "../src/utils/generate-publish-summary.js";

// Mock @actions/core
vi.mock("@actions/core", () => ({
	info: vi.fn(),
	warning: vi.fn(),
	debug: vi.fn(),
}));

describe("determine-tag-strategy", () => {
	beforeEach(() => {
		vi.clearAllMocks();
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
				name: "v1.2.3",
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
			expect(result.tags[0].name).toBe("v2.0.0");
			expect(result.tags[0].packageName).toContain("@org/pkg-a");
			expect(result.tags[0].packageName).toContain("@org/pkg-b");
			expect(result.isFixedVersioning).toBe(true);
		});

		it("returns multiple tags for independent versioning", () => {
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
			expect(result.tags[0].name).toBe("v1.0.0");
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
