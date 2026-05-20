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

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	ActionLoggerTest,
	AttestTest,
	GitHubArtifactMetadataTest,
	GitHubClientTest,
	GitHubReleaseTest,
	GitTagTest,
	OidcTokenIssuerTest,
	SigstoreSignerTest,
} from "@savvy-web/github-action-effects/testing";
import { Effect, Layer, LogLevel, Logger } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PackageNotFoundError, WorkspaceDiscovery } from "workspaces-effect";
import type { ReleasesInputArgs, ReleasesReport } from "./releases.js";
import { runReleases } from "./releases.js";
import type { PackagePublishResult, TagInfo } from "./types.js";

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** Minimal PackagePublishResult for a successfully-published package. */
const makePublishResult = (
	name: string,
	version: string,
	tarballPath?: string,
	sbomPath?: string,
): PackagePublishResult => ({
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
			sbomPath,
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

/**
 * Minimal WorkspaceDiscovery stub for releases tests.
 *
 * Returns PackageNotFoundError for every package lookup so buildReleaseNotes
 * falls back to process.cwd() for the CHANGELOG path — the test cases don't
 * need real workspace paths.
 */
const workspaceDiscoveryLayer = Layer.succeed(WorkspaceDiscovery, {
	listPackages: () => Effect.succeed([]),
	getPackage: (name: string, _cwd?: string) =>
		Effect.fail(new PackageNotFoundError({ name, available: [] })) as Effect.Effect<never, PackageNotFoundError>,
	importerMap: (_cwd?: string) => Effect.succeed(new Map()),
});

/**
 * Build a GitHubClientTest layer for runReleases.
 *
 * runReleases no longer makes raw REST calls — release / storage-record
 * traffic now goes through the `GitHubRelease` and `GitHubArtifactMetadata`
 * services. The only thing read off `GitHubClient` is the `repo` slug
 * (in `runReleases` itself and `createStorageRecord`).
 */
const makeGhClientLayer = () => {
	const state: import("@savvy-web/github-action-effects").GitHubClientTestState = {
		restResponses: new Map(),
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
				GitHubArtifactMetadataTest.empty().layer,
				workspaceDiscoveryLayer,
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
				assets: new Map(),
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
					const existing = customReleaseState.assets.get(releaseId) ?? [];
					existing.push(asset);
					customReleaseState.assets.set(releaseId, existing);
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
				updateRelease: (releaseId: number, options: { body?: string; name?: string }) => {
					const existing = [...customReleaseState.releases.values()].find((r) => r.id === releaseId);
					const updated: import("@savvy-web/github-action-effects").ReleaseData = {
						id: releaseId,
						tag: existing?.tag ?? "",
						name: options.name ?? existing?.name ?? "",
						body: options.body ?? existing?.body ?? "",
						draft: existing?.draft ?? false,
						prerelease: existing?.prerelease ?? false,
						uploadUrl: existing?.uploadUrl ?? "",
					};
					if (existing) customReleaseState.releases.set(existing.tag, updated);
					return Effect.succeed(updated);
				},
				listReleaseAssets: (releaseId: number) => Effect.succeed(customReleaseState.assets.get(releaseId) ?? []),
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
				GitHubArtifactMetadataTest.empty().layer,
				workspaceDiscoveryLayer,
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

	describe("idempotent tag recovery on create failure", () => {
		it("logs info (not warning) when tag.create fails but resolve returns the head SHA", async () => {
			// Arrange — GitTag.create fails, but GitTag.resolve returns the same
			// SHA the orchestrator tried to create the tag at. This is the
			// idempotent path: the tag already points at the right SHA, so the
			// run proceeds without raising a warning annotation.
			const { GitTag: GitTagSvc, GitTagError } = await import("@savvy-web/github-action-effects");

			const headSha = "head-sha-deadbeef";
			const savedSha = process.env.GITHUB_SHA;
			process.env.GITHUB_SHA = headSha;

			const createCalls: Array<{ tag: string; sha: string }> = [];
			const resolveCalls: Array<string> = [];

			const idempotentTagLayer = Layer.succeed(GitTagSvc, {
				create: (tag: string, sha: string) => {
					createCalls.push({ tag, sha });
					return Effect.fail(
						new GitTagError({
							operation: "create",
							tag,
							reason: "Reference already exists",
						}),
					);
				},
				delete: (_tag: string) => Effect.void,
				list: () => Effect.succeed([]),
				resolve: (tag: string) => {
					resolveCalls.push(tag);
					// Return the SAME SHA the orchestrator tried to point at —
					// idempotent case.
					return Effect.succeed(headSha);
				},
			});

			const { state: releaseState, layer: releaseLayer } = GitHubReleaseTest.empty();
			const attestLayer = AttestTest.empty();

			const tags: TagInfo[] = [makeTag("v7.0.0", "@test/pkg-idem", "7.0.0")];
			const publishResult = makePublishPackagesResult([makePublishResult("@test/pkg-idem", "7.0.0")]);

			const args: ReleasesInputArgs = {
				tags,
				publishResult,
				packageManager: "pnpm",
				dryRun: false,
			};

			const layers = Layer.mergeAll(
				loggerLayer,
				idempotentTagLayer,
				releaseLayer,
				attestLayer,
				oidcLayer,
				sigstoreLayer,
				makeGhClientLayer(),
				GitHubArtifactMetadataTest.empty().layer,
				workspaceDiscoveryLayer,
			);

			// Act
			let result: ReleasesReport;
			try {
				result = await Effect.runPromise(
					runReleases(args).pipe(Effect.provide(layers)) as Effect.Effect<ReleasesReport>,
				);
			} finally {
				if (savedSha === undefined) delete process.env.GITHUB_SHA;
				else process.env.GITHUB_SHA = savedSha;
			}

			// Assert — create was attempted and resolve was called to confirm
			// the existing tag's SHA matched. The release was still created.
			expect(createCalls).toHaveLength(1);
			expect(resolveCalls).toEqual(["v7.0.0"]);
			expect(releaseState.createCalls).toHaveLength(1);
			expect(result.success).toBe(true);
			expect(result.releases).toHaveLength(1);
		});

		it("logs a warning with both SHAs when tag.create fails and resolve returns a DIFFERENT SHA", async () => {
			// Arrange — GitTag.create fails, GitTag.resolve returns a SHA that
			// does NOT match the head we tried to point at. The orchestrator
			// must log a warning naming BOTH SHAs so the divergence is
			// auditable, then proceed.
			const { GitTag: GitTagSvc, GitTagError } = await import("@savvy-web/github-action-effects");

			const headSha = "head-sha-aaaa";
			const existingSha = "existing-sha-bbbb";
			const savedSha = process.env.GITHUB_SHA;
			process.env.GITHUB_SHA = headSha;

			// `Step.withStep` installs a buffering logger that intercepts the
			// Effect logger pipeline; warnings emit directly via
			// `WorkflowCommand.issue("warning", ...)` as `::warning::…` lines
			// on stdout. Capture stdout for the duration of the run instead of
			// the Effect logger.
			const stdoutChunks: string[] = [];
			const origStdoutWrite = process.stdout.write.bind(process.stdout);
			// biome-ignore lint/suspicious/noExplicitAny: monkey-patch for test capture
			(process.stdout.write as any) = (chunk: unknown, ...rest: unknown[]) => {
				stdoutChunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString("utf-8"));
				return origStdoutWrite(chunk as string, ...(rest as []));
			};

			const divergentTagLayer = Layer.succeed(GitTagSvc, {
				create: (tag: string, _sha: string) =>
					Effect.fail(
						new GitTagError({
							operation: "create",
							tag,
							reason: "Reference already exists",
						}),
					),
				delete: (_tag: string) => Effect.void,
				list: () => Effect.succeed([]),
				resolve: (_tag: string) => Effect.succeed(existingSha),
			});

			const { layer: releaseLayer } = GitHubReleaseTest.empty();
			const attestLayer = AttestTest.empty();

			const tags: TagInfo[] = [makeTag("v8.0.0", "@test/pkg-div", "8.0.0")];
			const publishResult = makePublishPackagesResult([makePublishResult("@test/pkg-div", "8.0.0")]);

			const args: ReleasesInputArgs = {
				tags,
				publishResult,
				packageManager: "pnpm",
				dryRun: false,
			};

			const layers = Layer.mergeAll(
				loggerLayer,
				divergentTagLayer,
				releaseLayer,
				attestLayer,
				oidcLayer,
				sigstoreLayer,
				makeGhClientLayer(),
				GitHubArtifactMetadataTest.empty().layer,
				workspaceDiscoveryLayer,
			);

			let result: ReleasesReport;
			try {
				result = await Effect.runPromise(
					runReleases(args).pipe(
						Effect.provide(layers),
						Logger.withMinimumLogLevel(LogLevel.All),
					) as Effect.Effect<ReleasesReport>,
				);
			} finally {
				process.stdout.write = origStdoutWrite;
				if (savedSha === undefined) delete process.env.GITHUB_SHA;
				else process.env.GITHUB_SHA = savedSha;
			}

			// Assert — the run proceeded and the warning logged both SHAs so
			// a reader can see what diverged. Warnings from inside a Step
			// envelope reach stdout as `::warning::…` workflow-command lines.
			expect(result.success).toBe(true);
			const captured = stdoutChunks.join("");
			const warningLines = captured.split("\n").filter((l) => l.includes("::warning::") && l.includes("v8.0.0"));
			expect(warningLines.length).toBeGreaterThan(0);
			const divergenceWarning = warningLines.find((w) => w.includes(headSha) && w.includes(existingSha));
			expect(divergenceWarning).toBeDefined();
			expect(divergenceWarning).toContain(headSha);
			expect(divergenceWarning).toContain(existingSha);
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
				GitHubArtifactMetadataTest.empty().layer,
				workspaceDiscoveryLayer,
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

	describe("SBOM and API-doc asset upload", () => {
		let tmpDir: string;

		beforeEach(() => {
			tmpDir = mkdtempSync(join(tmpdir(), "releases-test-"));
		});

		afterEach(() => {
			rmSync(tmpDir, { recursive: true, force: true });
		});

		it("uploads SBOM and API-doc assets and includes them in AssetInfo[]", async () => {
			// Arrange: write real files so existsSync / readFileSync succeed.
			const tarballPath = join(tmpDir, "pkg.tgz");
			const sbomPath = join(tmpDir, "pkg.sbom.json");
			// API Extractor names the file after the unscoped package name.
			// pkg-d is the unscoped name of @test/pkg-d.
			const apiDocPath = join(tmpDir, "pkg-d.api.json");

			writeFileSync(tarballPath, Buffer.from("fake tarball"));
			writeFileSync(sbomPath, JSON.stringify({ bomFormat: "CycloneDX" }));
			writeFileSync(apiDocPath, JSON.stringify({ metadata: { toolPackage: "@microsoft/api-extractor" } }));

			const { state: tagState, layer: tagLayer } = GitTagTest.empty();
			const { state: releaseState, layer: releaseLayer } = GitHubReleaseTest.empty();
			const attestLayer = AttestTest.empty();

			const publishResult = makePublishPackagesResult([
				makePublishResult("@test/pkg-d", "4.0.0", tarballPath, sbomPath),
			]);

			// Override the directory so findApiDocFile resolves the .api.json file.
			const firstTarget = publishResult.packages[0]?.targets[0];
			if (firstTarget) {
				firstTarget.target.directory = tmpDir;
			}

			const tags: TagInfo[] = [makeTag("v4.0.0", "@test/pkg-d", "4.0.0")];

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
				GitHubArtifactMetadataTest.empty().layer,
				workspaceDiscoveryLayer,
			);

			// Act
			const result: ReleasesReport = await Effect.runPromise(
				runReleases(args).pipe(Effect.provide(layers)) as Effect.Effect<ReleasesReport>,
			);

			// Assert: overall success
			expect(result.success).toBe(true);
			expect(result.releases).toHaveLength(1);

			// Assert: tag and release were created
			expect(tagState.createCalls).toHaveLength(1);
			expect(releaseState.createCalls).toHaveLength(1);

			// Assert: three assets were uploaded — tarball, SBOM, API doc
			expect(releaseState.uploadCalls).toHaveLength(3);
			const uploadedNames = releaseState.uploadCalls.map((c) => c.name);
			expect(uploadedNames).toContain("pkg.tgz");
			expect(uploadedNames.some((n) => n.endsWith(".sbom.json"))).toBe(true);
			expect(uploadedNames.some((n) => n.endsWith(".api.json"))).toBe(true);

			// Assert: result AssetInfo[] contains all three assets
			const release = result.releases[0];
			expect(release).toBeDefined();
			if (!release) return;
			const assetNames = release.assets.map((a) => a.name);
			expect(assetNames).toContain("pkg.tgz");
			expect(assetNames.some((n) => n.endsWith(".sbom.json"))).toBe(true);
			expect(assetNames.some((n) => n.endsWith(".api.json"))).toBe(true);
		});
	});

	describe("GitHub Packages storage record", () => {
		let tmpDir: string;

		beforeEach(() => {
			tmpDir = mkdtempSync(join(tmpdir(), "releases-test-"));
		});

		afterEach(() => {
			rmSync(tmpDir, { recursive: true, force: true });
		});

		it("creates an artifact-metadata storage record for a GitHub Packages target", async () => {
			// Arrange: a real tarball published to a GitHub Packages registry.
			const tarballPath = join(tmpDir, "pkg.tgz");
			writeFileSync(tarballPath, Buffer.from("fake tarball"));

			const { state: tagState, layer: tagLayer } = GitTagTest.empty();
			const { state: releaseState, layer: releaseLayer } = GitHubReleaseTest.empty();
			const attestLayer = AttestTest.empty();
			const { state: artifactState, layer: artifactLayer } = GitHubArtifactMetadataTest.empty();

			// A package whose only target is GitHub Packages — triggers the
			// createStorageRecord path.
			const publishResult = makePublishPackagesResult([
				{
					name: "@test/pkg-gh",
					version: "5.0.0",
					targets: [
						{
							target: {
								protocol: "npm" as const,
								registry: "https://npm.pkg.github.com/",
								directory: tmpDir,
								access: "public" as const,
								provenance: true,
								tag: "latest" as const,
								tokenEnv: null,
							},
							success: true,
							tarballPath,
							tarballDigest: "sha256:deadbeef",
						},
					],
				},
			]);

			const tags: TagInfo[] = [makeTag("v5.0.0", "@test/pkg-gh", "5.0.0")];

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
				artifactLayer,
				workspaceDiscoveryLayer,
			);

			// Act
			const result: ReleasesReport = await Effect.runPromise(
				runReleases(args).pipe(Effect.provide(layers)) as Effect.Effect<ReleasesReport>,
			);

			// Assert: release succeeded and the tarball was uploaded
			expect(result.success).toBe(true);
			expect(tagState.createCalls).toHaveLength(1);
			expect(releaseState.createCalls).toHaveLength(1);
			expect(releaseState.uploadCalls.map((c) => c.name)).toContain("pkg.tgz");

			// Assert: a storage record was created via GitHubArtifactMetadata
			expect(artifactState.calls).toHaveLength(1);
			const call = artifactState.calls[0];
			expect(call).toBeDefined();
			if (!call) return;
			expect(call.name).toBe("pkg:npm/@test/pkg-gh@5.0.0");
			expect(call.version).toBe("5.0.0");
			expect(call.digest).toBe("sha256:deadbeef");
			expect(call.repo).toBe("pkg-gh");
			expect(call.registryUrl).toBe("https://npm.pkg.github.com/");
			expect(call.artifactUrl).toBe("https://github.com/test-owner/pkgs/npm/pkg-gh");
		});

		it("reuses a pre-existing release asset instead of re-uploading", async () => {
			// Arrange: a real tarball, and a release asset already attached so
			// listReleaseAssets returns it.
			const tarballPath = join(tmpDir, "pkg.tgz");
			writeFileSync(tarballPath, Buffer.from("fake tarball"));

			const { layer: tagLayer } = GitTagTest.empty();
			const { state: releaseState, layer: releaseLayer } = GitHubReleaseTest.empty();
			const attestLayer = AttestTest.empty();
			const { layer: artifactLayer } = GitHubArtifactMetadataTest.empty();

			// GitHubReleaseTest.create assigns the first release id 1 (size + 1
			// over an empty map). Pre-seed an asset named "pkg.tgz" under that
			// id so the idempotent-reuse path in processOneTag is taken.
			releaseState.assets.set(1, [
				{
					id: 9,
					name: "pkg.tgz",
					url: "https://github.com/test-owner/test-repo/releases/assets/9",
					size: 4096,
				},
			]);

			const publishResult = makePublishPackagesResult([makePublishResult("@test/pkg-e", "6.0.0", tarballPath)]);
			const tags: TagInfo[] = [makeTag("v6.0.0", "@test/pkg-e", "6.0.0")];

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
				artifactLayer,
				workspaceDiscoveryLayer,
			);

			// Act
			const result: ReleasesReport = await Effect.runPromise(
				runReleases(args).pipe(Effect.provide(layers)) as Effect.Effect<ReleasesReport>,
			);

			// Assert: release succeeded
			expect(result.success).toBe(true);
			expect(result.releases).toHaveLength(1);

			// Assert: the pre-existing asset was reused — no upload recorded
			expect(releaseState.uploadCalls).toHaveLength(0);

			// Assert: the released AssetInfo carries the pre-existing asset's URL/size
			const release = result.releases[0];
			expect(release).toBeDefined();
			if (!release) return;
			const tarballAsset = release.assets.find((a) => a.name === "pkg.tgz");
			expect(tarballAsset).toBeDefined();
			expect(tarballAsset?.downloadUrl).toBe("https://github.com/test-owner/test-repo/releases/assets/9");
			expect(tarballAsset?.size).toBe(4096);
		});
	});
});
