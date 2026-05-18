/**
 * Unit tests for runReleases (Phase-3 tag / release / attestation / storage-record).
 *
 * All dependencies are provided via in-memory test layers; no real git, GitHub
 * API, or attestation tooling is exercised.
 *
 * Note on OIDC / SLSA: `OidcTokenIssuerTest` returns a synthetic non-JWT
 * token.  `decodeJwtClaims` cannot decode it, so `buildProvenancePredicate`
 * returns null and `attest.provenance` is not called.  This matches the
 * behaviour of `runPublish` tests — attestation is silently skipped when OIDC
 * claims are unavailable.  What IS asserted is that the tag, release, and
 * upload state machines executed the correct calls.
 */

import {
	ActionLoggerTest,
	AttestTest,
	GitHubClientTest,
	GitHubReleaseTest,
	GitTagTest,
	OidcTokenIssuerTest,
	SigstoreSignerTest,
} from "@savvy-web/github-action-effects/testing";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import type { ReleasesInputArgs, ReleasesReport } from "./releases.js";
import { runReleases } from "./releases.js";
import type { PackagePublishResult, TagInfo } from "./types.js";

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** Minimal PackagePublishResult for a successfully-published package. */
const makePublishResult = (name: string, version: string, tarballPath?: string): PackagePublishResult => ({
	name,
	version,
	targets: [
		{
			target: {
				protocol: "npm" as const,
				registry: "https://registry.npmjs.org/",
				directory: `/tmp/dist/${name}`,
				access: "public" as const,
				provenance: true,
				tag: "latest" as const,
				tokenEnv: null,
			},
			success: true,
			tarballPath: tarballPath ?? `/tmp/dist/${name}/pkg.tgz`,
			tarballDigest: "sha256:abc123",
		},
	],
});

/** Minimal TagInfo. */
const makeTag = (name: string, packageName: string, version: string): TagInfo => ({
	name,
	packageName,
	version,
});

/** Build a minimal PublishPackagesResult wrapping an array of package results. */
const makePublishPackagesResult = (packages: PackagePublishResult[]) => ({
	success: true,
	packages,
	totalPackages: packages.length,
	successfulPackages: packages.length,
	totalTargets: packages.reduce((n, p) => n + p.targets.length, 0),
	successfulTargets: packages.reduce((n, p) => n + p.targets.filter((t) => t.success).length, 0),
});

// ─── Shared base layers ───────────────────────────────────────────────────────

const loggerLayer = ActionLoggerTest.layer(ActionLoggerTest.empty());
const oidcLayer = OidcTokenIssuerTest;
const sigstoreLayer = SigstoreSignerTest;

/** Build a GitHubClientTest layer answering the REST calls runReleases makes. */
const makeGhClientLayer = () => {
	const state: import("@savvy-web/github-action-effects").GitHubClientTestState = {
		restResponses: new Map([
			// Storage-record endpoint
			["orgs.createArtifactStorageRecord", { data: { storage_records: [{ id: 42 }] } }],
		]),
		graphqlResponses: new Map<string, unknown>(),
		paginateResponses: new Map<string, Array<unknown[]>>(),
		repo: { owner: "test-owner", repo: "test-repo" },
	};
	return GitHubClientTest.layer(state);
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("runReleases", () => {
	describe("happy-path: two tags → two releases", () => {
		it("creates two git tags and two GitHub releases and returns success: true", async () => {
			// Arrange
			const { state: tagState, layer: tagLayer } = GitTagTest.empty();
			const { state: releaseState, layer: releaseLayer } = GitHubReleaseTest.empty();
			const attestLayer = AttestTest.empty();

			const tags: TagInfo[] = [makeTag("v1.0.0", "@test/pkg-a", "1.0.0"), makeTag("v2.0.0", "@test/pkg-b", "2.0.0")];
			const publishResult = makePublishPackagesResult([
				makePublishResult("@test/pkg-a", "1.0.0"),
				makePublishResult("@test/pkg-b", "2.0.0"),
			]);

			const args: ReleasesInputArgs = {
				tags,
				publishResult,
				packageManager: "pnpm",
				dryRun: false,
			};

			const layers = Layer.mergeAll(
				loggerLayer,
				tagLayer,
				releaseLayer,
				attestLayer,
				oidcLayer,
				sigstoreLayer,
				makeGhClientLayer(),
			);

			// Act
			const result: ReleasesReport = await Effect.runPromise(
				runReleases(args).pipe(Effect.provide(layers)) as Effect.Effect<ReleasesReport>,
			);

			// Assert: report
			expect(result.success).toBe(true);
			expect(result.errors).toHaveLength(0);
			expect(result.releases).toHaveLength(2);
			expect(result.releases.map((r) => r.tag)).toContain("v1.0.0");
			expect(result.releases.map((r) => r.tag)).toContain("v2.0.0");

			// Assert: two git tags were created in Test-layer state
			expect(tagState.createCalls).toHaveLength(2);
			expect(tagState.createCalls.map((c) => c.tag)).toContain("v1.0.0");
			expect(tagState.createCalls.map((c) => c.tag)).toContain("v2.0.0");

			// Assert: two GitHub releases were created in Test-layer state
			expect(releaseState.createCalls).toHaveLength(2);
			expect(releaseState.createCalls.map((c) => c.tag)).toContain("v1.0.0");
			expect(releaseState.createCalls.map((c) => c.tag)).toContain("v2.0.0");
		});
	});

	describe("resilient batch: one release failure does not abort the other", () => {
		it("captures the failing release in errors but still creates the succeeding release", async () => {
			// Arrange: GitHubRelease.create fails for the first tag (v1.0.0)
			const { state: tagState, layer: tagLayer } = GitTagTest.empty();

			const { GitHubReleaseError } = await import("@savvy-web/github-action-effects");

			// Custom release state shared by the hand-rolled layer so tests can
			// inspect what was recorded.
			const customReleaseState: import("@savvy-web/github-action-effects").GitHubReleaseTestState = {
				releases: new Map(),
				createCalls: [],
				uploadCalls: [],
			};

			const failingReleaseLayer = Layer.succeed((await import("@savvy-web/github-action-effects")).GitHubRelease, {
				create: (options: { tag: string; name: string; body: string; draft?: boolean; prerelease?: boolean }) => {
					customReleaseState.createCalls.push({ tag: options.tag, name: options.name });

					if (options.tag === "v1.0.0") {
						return Effect.fail(
							new GitHubReleaseError({
								operation: "create",
								tag: options.tag,
								reason: "Simulated create failure for pkg-a",
								retryable: false,
							}),
						);
					}

					// v2.0.0 (pkg-b) succeeds
					const releaseData: import("@savvy-web/github-action-effects").ReleaseData = {
						id: 101,
						tag: options.tag,
						name: options.name,
						body: options.body,
						draft: options.draft ?? false,
						prerelease: options.prerelease ?? false,
						uploadUrl: "https://uploads.github.com/releases/101/assets",
					};
					customReleaseState.releases.set(options.tag, releaseData);
					return Effect.succeed(releaseData);
				},
				uploadAsset: (releaseId: number, name: string) => {
					customReleaseState.uploadCalls.push({ releaseId, name });
					const asset: import("@savvy-web/github-action-effects").ReleaseAsset = {
						id: 1,
						name,
						url: `https://github.com/test-owner/test-repo/releases/assets/1`,
						size: 1024,
					};
					return Effect.succeed(asset);
				},
				getByTag: (tag: string) => {
					const r = customReleaseState.releases.get(tag);
					if (r) return Effect.succeed(r);
					return Effect.fail(
						new GitHubReleaseError({ operation: "getByTag", tag, reason: "not found", retryable: false }),
					);
				},
				list: () => Effect.succeed([...customReleaseState.releases.values()]),
			});

			const attestLayer = AttestTest.empty();

			const tags: TagInfo[] = [makeTag("v1.0.0", "@test/pkg-a", "1.0.0"), makeTag("v2.0.0", "@test/pkg-b", "2.0.0")];
			const publishResult = makePublishPackagesResult([
				makePublishResult("@test/pkg-a", "1.0.0"),
				makePublishResult("@test/pkg-b", "2.0.0"),
			]);

			const args: ReleasesInputArgs = {
				tags,
				publishResult,
				packageManager: "pnpm",
				dryRun: false,
			};

			const layers = Layer.mergeAll(
				loggerLayer,
				tagLayer,
				failingReleaseLayer,
				attestLayer,
				oidcLayer,
				sigstoreLayer,
				makeGhClientLayer(),
			);

			// Act
			const result: ReleasesReport = await Effect.runPromise(
				runReleases(args).pipe(Effect.provide(layers)) as Effect.Effect<ReleasesReport>,
			);

			// Assert: both git tags were created (tag step happens before release step)
			expect(tagState.createCalls.map((c) => c.tag)).toContain("v1.0.0");
			expect(tagState.createCalls.map((c) => c.tag)).toContain("v2.0.0");

			// Assert: only one release succeeded (pkg-b / v2.0.0)
			expect(result.releases).toHaveLength(1);
			expect(result.releases[0]?.tag).toBe("v2.0.0");

			// Assert: one error was captured for pkg-a / v1.0.0
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toMatch(/v1\.0\.0/);

			// Assert: overall success is false due to the error
			expect(result.success).toBe(false);
		});
	});

	describe("dry-run mode", () => {
		it("does not mutate tag/release state when dryRun: true", async () => {
			// Arrange
			const { state: tagState, layer: tagLayer } = GitTagTest.empty();
			const { state: releaseState, layer: releaseLayer } = GitHubReleaseTest.empty();
			const attestLayer = AttestTest.empty();

			const tags: TagInfo[] = [makeTag("v3.0.0", "@test/pkg-c", "3.0.0")];
			const publishResult = makePublishPackagesResult([makePublishResult("@test/pkg-c", "3.0.0")]);

			const args: ReleasesInputArgs = {
				tags,
				publishResult,
				packageManager: "pnpm",
				dryRun: true,
			};

			const layers = Layer.mergeAll(
				loggerLayer,
				tagLayer,
				releaseLayer,
				attestLayer,
				oidcLayer,
				sigstoreLayer,
				makeGhClientLayer(),
			);

			// Act
			const result: ReleasesReport = await Effect.runPromise(
				runReleases(args).pipe(Effect.provide(layers)) as Effect.Effect<ReleasesReport>,
			);

			// Assert: no real mutations in Test-layer state
			expect(tagState.createCalls).toHaveLength(0);
			expect(releaseState.createCalls).toHaveLength(0);
			expect(releaseState.uploadCalls).toHaveLength(0);

			// Assert: report still describes what would have happened
			expect(result.success).toBe(true);
			expect(result.releases).toHaveLength(1);
			expect(result.releases[0]?.tag).toBe("v3.0.0");
			expect(result.errors).toHaveLength(0);
		});
	});
});
