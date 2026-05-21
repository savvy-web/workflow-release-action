/**
 * Tests for the pure projection functions that map internal release-pipeline
 * results into ReleaseOutput phase structs.
 */

import { describe, expect, it } from "vitest";
import type { PackagePublishResult, ValidationPackageResult } from "../src/release/types.js";
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
	/** A build node with one ready npm target and a compliant SBOM. */
	const npmBuild: ValidationPackageResult["builds"][number] = {
		directory: "/repo/dist/npm",
		packedBytes: 700,
		unpackedBytes: 2300,
		fileCount: 5,
		sbom: { componentCount: 3, ntiaCompliant: true, missingNtiaFields: [] },
		targets: [{ registry: "https://registry.npmjs.org/", status: "ready", access: "public", provenance: false }],
	};

	it("projects a clean build-centric validation run as success", () => {
		const output = toValidationOutput({
			buildsPassed: true,
			packageCount: 2,
			npmReady: true,
			githubPackagesReady: true,
			totalTargets: 2,
			readyTargets: 2,
			checks: [
				{ name: "Build Validation", status: "pass", outcome: "Build passed", url: "https://example.com/check/1" },
				{ name: "Publish Validation", status: "pass", outcome: "2/2 target(s) ready", url: null },
			],
			findings: [],
			validationPackages: [
				{
					name: "@savvy-web/foo",
					version: "1.2.0",
					baseVersion: "1.1.0",
					changesetCount: 1,
					builds: [npmBuild],
					releaseNotes: { status: "found", content: "### Minor Changes\n\n- something" },
				},
				{
					name: "@savvy-web/bar",
					version: "0.3.0",
					baseVersion: null,
					changesetCount: null,
					builds: [
						{
							directory: "/repo/dist/github",
							packedBytes: 800,
							unpackedBytes: 2500,
							fileCount: 6,
							sbom: { componentCount: 3, ntiaCompliant: false, missingNtiaFields: ["Supplier"] },
							targets: [
								{
									registry: "https://npm.pkg.github.com/",
									status: "ready",
									access: "public",
									provenance: true,
								},
							],
						},
					],
					releaseNotes: { status: "no-changelog" },
				},
			],
			checkRun: { url: "https://example.com/check/1", conclusion: "success" },
			dryRun: false,
		});

		expect(output.phase).toBe("validation");
		expect(output.noop).toBe(false);
		expect(output.succeeded).toBe(true);
		expect(output.hasFailures).toBe(false);
		expect(output.status).toBe("success");
		expect(output.$schema).toBe(SCHEMA_URL);
		expect(output.schemaVersion).toBe(SCHEMA_VERSION);
		expect(output.dryRun).toBe(false);
		expect(output.validation.buildValidation).toEqual({ passed: true, packageCount: 2 });
		expect(output.validation.checks).toEqual([
			{ name: "Build Validation", status: "pass", outcome: "Build passed", url: "https://example.com/check/1" },
			{ name: "Publish Validation", status: "pass", outcome: "2/2 target(s) ready", url: null },
		]);
		expect(output.validation.findings).toEqual([]);
		expect(output.validation.publish.npmReady).toBe(true);
		expect(output.validation.publish.githubPackagesReady).toBe(true);
		expect(output.validation.publish.totalTargets).toBe(2);
		expect(output.validation.publish.readyTargets).toBe(2);

		const [foo, bar] = output.validation.publish.packages;
		expect(foo).toEqual({
			name: "@savvy-web/foo",
			version: "1.2.0",
			baseVersion: "1.1.0",
			bumpType: "minor",
			changesetCount: 1,
			ready: true,
			versionOnly: false,
			builds: [
				{
					directory: "/repo/dist/npm",
					packedBytes: 700,
					unpackedBytes: 2300,
					fileCount: 5,
					sbom: { componentCount: 3, ntiaCompliant: true, missingNtiaFields: [] },
					targets: [{ registry: "https://registry.npmjs.org/", status: "ready", access: "public", provenance: false }],
				},
			],
			releaseNotes: { status: "found", content: "### Minor Changes\n\n- something" },
		});
		// A null base version is a brand-new package.
		expect(bar?.bumpType).toBe("new");
		expect(bar?.builds[0]?.sbom).toEqual({
			componentCount: 3,
			ntiaCompliant: false,
			missingNtiaFields: ["Supplier"],
		});
		expect(output.validation.checkRun).toEqual({ url: "https://example.com/check/1", conclusion: "success" });
	});

	it("marks a branch with no packages as a no-op", () => {
		const output = toValidationOutput({
			buildsPassed: true,
			packageCount: 0,
			npmReady: true,
			githubPackagesReady: true,
			totalTargets: 0,
			readyTargets: 0,
			checks: [],
			findings: [],
			validationPackages: [],
			checkRun: null,
			dryRun: false,
		});

		expect(output.noop).toBe(true);
		expect(output.status).toBe("no-op");
		expect(output.validation.publish.packages).toEqual([]);
		expect(output.validation.checkRun).toBeNull();
	});

	it("projects a version-only package with no builds", () => {
		const output = toValidationOutput({
			buildsPassed: true,
			packageCount: 1,
			npmReady: true,
			githubPackagesReady: true,
			totalTargets: 0,
			readyTargets: 0,
			checks: [],
			findings: [],
			validationPackages: [
				{
					name: "@savvy-web/foo",
					version: "1.2.1",
					baseVersion: "1.2.0",
					changesetCount: 1,
					builds: [],
					releaseNotes: { status: "found", content: "### Patch Changes\n\n- something" },
				},
			],
			checkRun: null,
			dryRun: false,
		});

		const pkg = output.validation.publish.packages[0];
		expect(pkg?.versionOnly).toBe(true);
		expect(pkg?.ready).toBe(true);
		expect(pkg?.builds).toEqual([]);
		expect(pkg?.bumpType).toBe("patch");
	});

	it("derives an unknown bumpType for a non-semver base version", () => {
		const output = toValidationOutput({
			buildsPassed: true,
			packageCount: 1,
			npmReady: true,
			githubPackagesReady: true,
			totalTargets: 0,
			readyTargets: 0,
			checks: [],
			findings: [],
			validationPackages: [
				// A two-part base version is not a three-part semver string.
				{
					name: "@savvy-web/foo",
					version: "1.2.0",
					baseVersion: "1.0",
					changesetCount: 1,
					builds: [],
					releaseNotes: { status: "found", content: "### Patch Changes\n\n- something" },
				},
			],
			checkRun: null,
			dryRun: false,
		});

		expect(output.validation.publish.packages[0]?.bumpType).toBe("unknown");
	});

	it("flags failed builds and an error finding as a failure", () => {
		const output = toValidationOutput({
			buildsPassed: false,
			packageCount: 1,
			npmReady: false,
			githubPackagesReady: false,
			totalTargets: 1,
			readyTargets: 0,
			checks: [
				{ name: "Build Validation", status: "error", outcome: "Build failed", url: null },
				{ name: "Publish Validation", status: "error", outcome: "0/1 target(s) ready", url: null },
			],
			findings: [
				{
					severity: "error",
					check: "Publish Validation",
					scope: { package: "@savvy-web/foo", directory: "/repo/dist/npm" },
					message: "dry-run failed: boom",
				},
			],
			validationPackages: [
				{
					name: "@savvy-web/foo",
					version: "1.2.0",
					baseVersion: "1.1.0",
					changesetCount: 1,
					builds: [
						{
							directory: "/repo/dist/npm",
							packedBytes: null,
							unpackedBytes: null,
							fileCount: null,
							sbom: null,
							targets: [
								{
									registry: "https://registry.npmjs.org/",
									status: "failed",
									access: "public",
									provenance: false,
								},
							],
						},
					],
					releaseNotes: { status: "no-changelog" },
				},
			],
			checkRun: { url: "https://example.com/check/2", conclusion: "failure" },
			dryRun: true,
		});

		expect(output.hasFailures).toBe(true);
		expect(output.succeeded).toBe(false);
		expect(output.status).toBe("partial");
		expect(output.dryRun).toBe(true);
		expect(output.validation.buildValidation.passed).toBe(false);
		expect(output.validation.publish.npmReady).toBe(false);
		expect(output.validation.publish.githubPackagesReady).toBe(false);
		expect(output.validation.findings).toEqual([
			{
				severity: "error",
				check: "Publish Validation",
				scope: { package: "@savvy-web/foo", directory: "/repo/dist/npm" },
				message: "dry-run failed: boom",
			},
		]);
		// A build with a failed target makes the package not ready.
		expect(output.validation.publish.packages[0]?.ready).toBe(false);
		expect(output.validation.checkRun).toEqual({ url: "https://example.com/check/2", conclusion: "failure" });
	});

	it("keeps a run with only warning findings succeeded", () => {
		const output = toValidationOutput({
			buildsPassed: true,
			packageCount: 1,
			npmReady: true,
			githubPackagesReady: true,
			totalTargets: 1,
			readyTargets: 1,
			checks: [],
			findings: [
				{
					severity: "warning",
					check: "SBOM Preview",
					scope: { package: "@savvy-web/foo", directory: "/repo/dist/npm" },
					message: "SBOM generated but missing NTIA fields: Supplier",
				},
			],
			validationPackages: [
				{
					name: "@savvy-web/foo",
					version: "1.2.0",
					baseVersion: "1.1.0",
					changesetCount: 1,
					builds: [npmBuild],
					releaseNotes: { status: "found", content: "### Patch Changes\n\n- something" },
				},
			],
			checkRun: null,
			dryRun: false,
		});

		// A warning finding does not fail the run.
		expect(output.succeeded).toBe(true);
		expect(output.hasFailures).toBe(false);
		expect(output.status).toBe("success");
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
		expect(output.publishing.tags[0]).toEqual({
			name: "@savvy-web/foo@1.2.0",
			sha: "abc123",
			packageName: "@savvy-web/foo",
		});
		expect(output.dryRun).toBe(false);
		expect(output.publishing.releases[0]).toEqual({
			tag: "@savvy-web/foo@1.2.0",
			url: "https://example.com/r/1",
			id: 999,
			packageName: "@savvy-web/foo",
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
		expect(output.publishing.tags[0]).toEqual({ name: "@savvy-web/foo@1.2.0", sha: "", packageName: "@savvy-web/foo" });
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
