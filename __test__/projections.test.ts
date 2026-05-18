/**
 * Tests for the pure projection functions that map internal release-pipeline
 * results into ReleaseOutput phase structs.
 */

import { describe, expect, it } from "vitest";
import type { PackagePublishResult } from "../src/release/types.js";
import { toBranchManagementOutput, toPublishingOutput, toValidationOutput } from "../src/schema/projections.js";
import { SCHEMA_URL, SCHEMA_VERSION } from "../src/schema/release-output.js";

describe("toBranchManagementOutput", () => {
	it("projects a clean update with a release PR", () => {
		const output = toBranchManagementOutput({
			releaseBranchName: "changeset-release/main",
			existed: true,
			created: false,
			updated: true,
			hasConflicts: false,
			releasePr: { number: 42, url: "https://example.com/pr/42", action: "updated" },
			changesets: [{ name: "@savvy-web/foo", bumpType: "minor" }],
			dryRun: false,
		});

		expect(output.phase).toBe("branch-management");
		expect(output.$schema).toBe(SCHEMA_URL);
		expect(output.schemaVersion).toBe(SCHEMA_VERSION);
		expect(output.noop).toBe(false);
		expect(output.succeeded).toBe(true);
		expect(output.hasFailures).toBe(false);
		expect(output.status).toBe("success");
		expect(output.dryRun).toBe(false);
		expect(output.branchManagement.changesets.count).toBe(1);
		expect(output.branchManagement.releaseBranch.name).toBe("changeset-release/main");
		expect(output.branchManagement.releaseBranch.existed).toBe(true);
		expect(output.branchManagement.releaseBranch.hasConflicts).toBe(false);
		expect(output.branchManagement.changesets.packages).toEqual([{ name: "@savvy-web/foo", bumpType: "minor" }]);
	});

	it("marks a run with no changesets as a no-op", () => {
		const output = toBranchManagementOutput({
			releaseBranchName: "changeset-release/main",
			existed: false,
			created: false,
			updated: false,
			hasConflicts: false,
			releasePr: null,
			changesets: [],
			dryRun: false,
		});

		expect(output.noop).toBe(true);
		expect(output.status).toBe("no-op");
		expect(output.branchManagement.releasePr).toBe(null);
	});

	it("flags merge conflicts as a failure", () => {
		const output = toBranchManagementOutput({
			releaseBranchName: "changeset-release/main",
			existed: true,
			created: false,
			updated: false,
			hasConflicts: true,
			releasePr: null,
			changesets: [{ name: "@savvy-web/foo", bumpType: "patch" }],
			dryRun: true,
		});

		expect(output.hasFailures).toBe(true);
		expect(output.succeeded).toBe(false);
		expect(output.status).toBe("partial");
		expect(output.dryRun).toBe(true);
	});
});

describe("toValidationOutput", () => {
	it("projects a clean validation run as success", () => {
		const output = toValidationOutput({
			buildsPassed: true,
			packageCount: 2,
			npmReady: true,
			githubPackagesReady: true,
			publishOk: true,
			packages: [
				{ name: "@savvy-web/foo", version: "1.2.0", ready: true },
				{ name: "@savvy-web/bar", version: "0.3.0", ready: true },
			],
			checkRun: { url: "https://example.com/check/1", conclusion: "success" },
			dryRun: false,
		});

		expect(output.phase).toBe("validation");
		expect(output.noop).toBe(false);
		expect(output.succeeded).toBe(true);
		expect(output.hasFailures).toBe(false);
		expect(output.status).toBe("success");
		expect(output.validation.builds.packageCount).toBe(2);
		expect(output.$schema).toBe(SCHEMA_URL);
		expect(output.schemaVersion).toBe(SCHEMA_VERSION);
		expect(output.dryRun).toBe(false);
		expect(output.validation.builds.passed).toBe(true);
		expect(output.validation.publish.npmReady).toBe(true);
		expect(output.validation.publish.githubPackagesReady).toBe(true);
		expect(output.validation.publish.packages).toEqual([
			{ name: "@savvy-web/foo", version: "1.2.0", ready: true },
			{ name: "@savvy-web/bar", version: "0.3.0", ready: true },
		]);
		expect(output.validation.checkRun).toEqual({ url: "https://example.com/check/1", conclusion: "success" });
	});

	it("marks a branch with no packages as a no-op", () => {
		const output = toValidationOutput({
			buildsPassed: true,
			packageCount: 0,
			npmReady: true,
			githubPackagesReady: true,
			publishOk: true,
			packages: [],
			checkRun: null,
			dryRun: false,
		});

		expect(output.noop).toBe(true);
		expect(output.status).toBe("no-op");
		expect(output.validation.publish.packages).toEqual([]);
		expect(output.validation.checkRun).toBeNull();
	});

	it("flags failed builds and publish-dry-run as a failure", () => {
		const output = toValidationOutput({
			buildsPassed: false,
			packageCount: 1,
			npmReady: false,
			githubPackagesReady: false,
			publishOk: false,
			packages: [{ name: "@savvy-web/foo", version: "1.2.0", ready: false }],
			checkRun: { url: "https://example.com/check/2", conclusion: "failure" },
			dryRun: true,
		});

		expect(output.hasFailures).toBe(true);
		expect(output.succeeded).toBe(false);
		expect(output.status).toBe("partial");
		expect(output.dryRun).toBe(true);
		expect(output.validation.builds.passed).toBe(false);
		expect(output.validation.publish.npmReady).toBe(false);
		expect(output.validation.publish.githubPackagesReady).toBe(false);
		expect(output.validation.publish.packages).toEqual([{ name: "@savvy-web/foo", version: "1.2.0", ready: false }]);
		expect(output.validation.checkRun).toEqual({ url: "https://example.com/check/2", conclusion: "failure" });
	});
});

/** Minimal TargetPublishResult fixture — only the fields the projection reads. */
const target = (over: Record<string, unknown>): PackagePublishResult["targets"][number] =>
	({
		target: {
			protocol: "npm",
			registry: "https://npm.pkg.github.com/",
			directory: "/x",
			access: "public",
			provenance: true,
			tag: "latest",
			tokenEnv: null,
		},
		success: true,
		...over,
		// biome-ignore lint/suspicious/noExplicitAny: minimal TargetPublishResult fixture
	}) as any;

describe("toPublishingOutput", () => {
	it("projects a clean publish", () => {
		const pkg: PackagePublishResult = {
			name: "@savvy-web/foo",
			version: "1.2.0",
			targets: [
				target({
					success: true,
					registryUrl: "https://github.com/foo/pkgs",
					attestationUrl: "https://example.com/prov/1",
					sbomAttestationUrl: "https://example.com/sbom/1",
					tarballDigest: "sha256:deadbeef",
				}),
			],
			githubAttestationUrl: "https://example.com/att/1",
		};
		const output = toPublishingOutput({
			publishResult: {
				success: true,
				packages: [pkg],
				totalPackages: 1,
				successfulPackages: 1,
				totalTargets: 1,
				successfulTargets: 1,
			},
			tags: [{ name: "@savvy-web/foo@1.2.0", packageName: "@savvy-web/foo", version: "1.2.0" }],
			releases: [{ tag: "@savvy-web/foo@1.2.0", url: "https://example.com/r/1", id: 999, assets: [] }],
			tagShas: { "@savvy-web/foo@1.2.0": "abc123" },
			dryRun: false,
		});

		expect(output.phase).toBe("publishing");
		expect(output.succeeded).toBe(true);
		expect(output.hasFailures).toBe(false);
		expect(output.publishing.packages[0]?.status).toBe("published");
		expect(output.publishing.packages[0]?.targets[0]?.registry).toBe("https://npm.pkg.github.com/");
		expect(output.publishing.packages[0]?.attestations.githubAttestationUrl).toBe("https://example.com/att/1");
		expect(output.publishing.tags[0]).toEqual({ name: "@savvy-web/foo@1.2.0", sha: "abc123" });
		expect(output.dryRun).toBe(false);
		expect(output.publishing.releases[0]).toEqual({
			tag: "@savvy-web/foo@1.2.0",
			url: "https://example.com/r/1",
			id: 999,
		});
		expect(output.publishing.packages[0]?.attestations.provenanceUrl).toBe("https://example.com/prov/1");
		expect(output.publishing.packages[0]?.attestations.sbomUrl).toBe("https://example.com/sbom/1");
		expect(output.publishing.packages[0]?.tarballDigest).toBe("sha256:deadbeef");
	});

	it("treats an identical already-published target as skipped", () => {
		const pkg: PackagePublishResult = {
			name: "@savvy-web/foo",
			version: "1.2.0",
			targets: [target({ success: true, alreadyPublished: true, alreadyPublishedReason: "identical" })],
		};
		const output = toPublishingOutput({
			publishResult: {
				success: true,
				packages: [pkg],
				totalPackages: 1,
				successfulPackages: 1,
				totalTargets: 1,
				successfulTargets: 1,
			},
			tags: [],
			releases: [],
			tagShas: {},
			dryRun: false,
		});

		expect(output.publishing.packages[0]?.status).toBe("skipped");
		expect(output.publishing.packages[0]?.skipReason).toBe("already-published-identical");
		expect(output.publishing.packages[0]?.targets[0]?.status).toBe("skipped");
		expect(output.succeeded).toBe(true);
		expect(output.hasFailures).toBe(false);
	});

	it("treats a content-mismatch (different) target as failed, not skipped", () => {
		const pkg: PackagePublishResult = {
			name: "@savvy-web/foo",
			version: "1.2.0",
			targets: [
				target({
					success: false,
					alreadyPublished: true,
					alreadyPublishedReason: "different",
					error: "content mismatch",
				}),
			],
		};
		const output = toPublishingOutput({
			publishResult: {
				success: false,
				packages: [pkg],
				totalPackages: 1,
				successfulPackages: 0,
				totalTargets: 1,
				successfulTargets: 0,
			},
			tags: [],
			releases: [],
			tagShas: {},
			dryRun: false,
		});

		expect(output.publishing.packages[0]?.status).toBe("failed");
		expect(output.publishing.packages[0]?.skipReason).toBe(null);
		expect(output.publishing.packages[0]?.targets[0]?.status).toBe("failed");
		expect(output.publishing.packages[0]?.targets[0]?.error).toBe("content mismatch");
		expect(output.hasFailures).toBe(true);
	});

	it("projects a version-only package as published with no targets", () => {
		const pkg: PackagePublishResult = { name: "@savvy-web/foo", version: "1.2.0", targets: [] };
		const output = toPublishingOutput({
			publishResult: {
				success: true,
				packages: [pkg],
				totalPackages: 1,
				successfulPackages: 1,
				totalTargets: 0,
				successfulTargets: 0,
			},
			tags: [{ name: "@savvy-web/foo@1.2.0", packageName: "@savvy-web/foo", version: "1.2.0" }],
			releases: [],
			tagShas: {},
			dryRun: false,
		});

		expect(output.publishing.packages[0]?.status).toBe("published");
		expect(output.publishing.packages[0]?.targets).toEqual([]);
		expect(output.publishing.tags[0]).toEqual({ name: "@savvy-web/foo@1.2.0", sha: "" });
	});

	it("falls back to the 'jsr' string when a target registry is null", () => {
		const pkg: PackagePublishResult = {
			name: "@savvy-web/foo",
			version: "1.2.0",
			targets: [
				target({
					target: {
						protocol: "jsr",
						registry: null,
						directory: "/x",
						access: "public",
						provenance: true,
						tag: "latest",
						tokenEnv: null,
					},
					success: true,
				}),
			],
		};
		const output = toPublishingOutput({
			publishResult: {
				success: true,
				packages: [pkg],
				totalPackages: 1,
				successfulPackages: 1,
				totalTargets: 1,
				successfulTargets: 1,
			},
			tags: [],
			releases: [],
			tagShas: {},
			dryRun: false,
		});

		expect(output.publishing.packages[0]?.targets[0]?.registry).toBe("jsr");
	});

	it("reports a no-op when nothing was released", () => {
		const output = toPublishingOutput({
			publishResult: {
				success: true,
				packages: [],
				totalPackages: 0,
				successfulPackages: 0,
				totalTargets: 0,
				successfulTargets: 0,
			},
			tags: [],
			releases: [],
			tagShas: {},
			dryRun: false,
		});

		expect(output.noop).toBe(true);
		expect(output.status).toBe("no-op");
	});
});
