/**
 * Tests for the ReleaseOutput schema module: status derivation, schema
 * round-tripping, and phase discrimination on the union.
 */

import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import type { ValidationOutput } from "../src/schema/release-output.js";
import { ReleaseOutput, SCHEMA_URL, SCHEMA_VERSION, deriveStatus } from "../src/schema/release-output.js";

describe("deriveStatus", () => {
	it("returns no-op when noop is set, regardless of other flags", () => {
		expect(deriveStatus({ noop: true, succeeded: true, hasFailures: false })).toBe("no-op");
		expect(deriveStatus({ noop: true, succeeded: false, hasFailures: true })).toBe("no-op");
	});

	it("returns success when succeeded and not noop", () => {
		expect(deriveStatus({ noop: false, succeeded: true, hasFailures: false })).toBe("success");
	});

	it("returns success when succeeded even if hasFailures is set", () => {
		expect(deriveStatus({ noop: false, succeeded: true, hasFailures: true })).toBe("success");
	});

	it("returns partial when hasFailures and not succeeded or noop", () => {
		expect(deriveStatus({ noop: false, succeeded: false, hasFailures: true })).toBe("partial");
	});

	it("returns failed as the fallthrough", () => {
		expect(deriveStatus({ noop: false, succeeded: false, hasFailures: false })).toBe("failed");
	});
});

describe("ReleaseOutput schema", () => {
	const branchSample: ReleaseOutput = {
		$schema: SCHEMA_URL,
		schemaVersion: SCHEMA_VERSION,
		phase: "branch-management",
		status: "success",
		noop: false,
		succeeded: true,
		hasFailures: false,
		dryRun: false,
		branchManagement: {
			releaseBranch: {
				name: "changeset-release/main",
				existed: true,
				created: false,
				updated: true,
				hasConflicts: false,
			},
			releasePr: { number: 42, url: "https://example.com/pr/42", action: "updated" },
			changesets: { count: 1, packages: [{ name: "@savvy-web/foo", bumpType: "minor" }] },
		},
	};

	const publishingSample: ReleaseOutput = {
		$schema: SCHEMA_URL,
		schemaVersion: SCHEMA_VERSION,
		phase: "publishing",
		status: "success",
		noop: false,
		succeeded: true,
		hasFailures: false,
		dryRun: false,
		publishing: {
			packages: [
				{
					name: "@savvy-web/foo",
					version: "1.2.0",
					status: "published",
					skipReason: null,
					targets: [
						{
							registry: "https://npm.pkg.github.com/",
							status: "published",
							skipReason: null,
							recovery: null,
							registryUrl: null,
							error: null,
							attestationRecovered: null,
							sbomAttestationRecovered: null,
						},
					],
					attestations: { provenanceUrl: null, sbomUrl: null, githubAttestationUrl: null },
					tarballDigest: "sha256:abc",
				},
			],
			tags: [{ name: "@savvy-web/foo@1.2.0", sha: "abc123", packageName: "@savvy-web/foo" }],
			releases: [
				{ tag: "@savvy-web/foo@1.2.0", url: "https://example.com/r/1", id: 999, packageName: "@savvy-web/foo" },
			],
		},
	};

	const validationSample: ValidationOutput = {
		$schema: SCHEMA_URL,
		schemaVersion: SCHEMA_VERSION,
		phase: "validation",
		status: "success",
		noop: false,
		succeeded: true,
		hasFailures: false,
		dryRun: false,
		validation: {
			buildValidation: { passed: true, packageCount: 1 },
			checks: [{ name: "Build Validation", status: "pass", outcome: "Build passed", url: null }],
			findings: [],
			publish: {
				npmReady: true,
				githubPackagesReady: true,
				totalTargets: 1,
				readyTargets: 1,
				packages: [
					{
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
								targets: [
									{
										registry: "https://registry.npmjs.org/",
										status: "ready",
										access: "public",
										provenance: false,
									},
								],
							},
						],
						releaseNotes: { status: "found", content: "### Minor Changes\n\n- something" },
					},
				],
			},
			checkRun: { url: "https://example.com/check/1", conclusion: "success" },
		},
	};

	it("round-trips encode then decode as identity", () => {
		const encoded = Schema.encodeSync(ReleaseOutput)(branchSample);
		const decoded = Schema.decodeUnknownSync(ReleaseOutput)(encoded);
		expect(decoded).toEqual(branchSample);
	});

	it("round-trips validation encode then decode as identity", () => {
		const encoded = Schema.encodeSync(ReleaseOutput)(validationSample);
		const decoded = Schema.decodeUnknownSync(ReleaseOutput)(encoded);
		expect(decoded).toEqual(validationSample);
	});

	it("decodes a publishing instance and keeps the phase block", () => {
		const decoded = Schema.decodeUnknownSync(ReleaseOutput)(publishingSample);
		expect(decoded.phase).toBe("publishing");
	});

	it("decodes a validation instance and keeps the phase block", () => {
		const decoded = Schema.decodeUnknownSync(ReleaseOutput)(validationSample);
		expect(decoded.phase).toBe("validation");
	});

	it("decodes a validation instance with a null checkRun", () => {
		const decoded = Schema.decodeUnknownSync(ReleaseOutput)({
			...validationSample,
			validation: { ...validationSample.validation, checkRun: null },
		});
		expect(decoded.phase).toBe("validation");
	});

	it("rejects a struct whose phase block does not match its phase literal", () => {
		const bad = { ...branchSample, phase: "publishing" };
		expect(() => Schema.decodeUnknownSync(ReleaseOutput)(bad)).toThrow();
	});

	it("emits $schema as the first JSON key", () => {
		const encoded = Schema.encodeSync(ReleaseOutput)(branchSample) as Record<string, unknown>;
		expect(Object.keys(encoded)[0]).toBe("$schema");
	});
});
