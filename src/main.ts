/**
 * Main-action entry point.
 *
 * @remarks
 * Skeleton state during the @actions/* → @savvy-web/github-action-effects
 * migration. Routes to one of four phase handlers — `branch-management`,
 * `validation`, `publishing`, `close-issues` — each currently stubbed.
 *
 * Phase detection that previously used `@actions/github`'s `context` and
 * `getOctokit` will move into a `detectWorkflowPhase` Effect that yields
 * `GitHubClient` + `ActionEnvironment`. Until that lands, the skeleton
 * trusts the `phase` input and falls through to a no-op when absent.
 */

import { FetchHttpClient, FileSystem } from "@effect/platform";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import {
	Action,
	ActionEnvironment,
	ActionLogger,
	ActionOutputs,
	ActionState,
	ActionStateLive,
	AttestLive,
	ChangesetAnalyzer,
	ChangesetAnalyzerLive,
	CheckRun,
	CheckRunLive,
	CommandRunner,
	CommandRunnerLive,
	GitBranchLive,
	GitCommitLive,
	GitHubArtifactMetadataLive,
	GitHubClient,
	GitHubCommitLive,
	GitHubContentLive,
	GitHubGraphQLLive,
	GitHubIssueLive,
	GitHubReleaseLive,
	GitHubToken,
	GitTagLive,
	NpmRegistryLive,
	OidcTokenIssuerLive,
	PackagePublishLive,
	PullRequestCommentLive,
	PullRequestLive,
	SbomLive,
	SigstoreSignerLive,
	Step,
} from "@savvy-web/github-action-effects";
import { Config, Effect, Layer, Option } from "effect";
import { ReleaseLive } from "./release/layers.js";
import { detectReleases, runBuildAndSbom, runPublishTargets } from "./release/publish.js";
import { runReleases } from "./release/releases.js";
import {
	buildPublishValidationSummary,
	buildReleaseNotesPreviewSummary,
	buildSbomPreviewSummary,
	buildValidationComment,
} from "./release/report.js";
import type {
	PublishPackagesResult,
	ReleaseInfo,
	ValidationFinding,
	ValidationPackageResult,
} from "./release/types.js";
import { runValidation as runValidationEffect } from "./release/validation.js";
import { toBranchManagementOutput, toPublishingOutput, toValidationOutput } from "./schema/projections.js";
import type { ValidationOutput } from "./schema/release-output.js";
import { ReleaseOutput } from "./schema/release-output.js";
import { GithubPackagesTokenState, STATE_KEYS } from "./state.js";
import type { ResolvedSBOMMetadata } from "./types/sbom-config.js";
import { checkReleaseBranch } from "./utils/check-release-branch.js";
import { cleanupValidationChecks } from "./utils/cleanup-validation-checks.js";
import { closeLinkedIssues } from "./utils/close-linked-issues.js";
import { createReleaseBranch } from "./utils/create-release-branch.js";
import { createValidationCheck } from "./utils/create-validation-check.js";
import { deriveCheckConclusion } from "./utils/derive-check-conclusion.js";
import type { WorkflowPhase } from "./utils/detect-workflow-phase.js";
import { detectWorkflowPhase } from "./utils/detect-workflow-phase.js";
import type { TagInfo } from "./utils/determine-tag-strategy.js";
import { determineTagStrategy } from "./utils/determine-tag-strategy.js";
import { linkIssuesFromCommits } from "./utils/link-issues-from-commits.js";
import type { ConfigSource } from "./utils/load-release-config.js";
import { updateReleaseBranch } from "./utils/update-release-branch.js";
import { updateStickyComment } from "./utils/update-sticky-comment.js";
import { validateBuilds } from "./utils/validate-builds.js";

// ---------------------------------------------------------------------------
// Phase handlers (stubs — populated as the migration progresses)
// ---------------------------------------------------------------------------

/**
 * Read `packageManager` from `./package.json` and reduce it to one of the
 * four package-manager names the release pipeline supports. Falls back to
 * `pnpm` when the field is missing or unrecognised.
 *
 * @internal
 */
// Detection order mirrors the shell helper the release pipeline used before
// this migration: prefer the explicit `packageManager` field in
// `package.json`, then fall back to a lockfile probe (pnpm > yarn > bun),
// and finally `"npm"`. Defaulting to `"npm"` on a no-signal repo is honest —
// the prior `"pnpm"` default risked invoking a manager the workspace does
// not actually use.
const detectPackageManager = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;

	// 1. Read `package.json`'s `packageManager` field if present.
	const readResult = yield* Effect.either(fs.readFileString("package.json"));
	if (readResult._tag === "Right") {
		try {
			const parsed = JSON.parse(readResult.right) as { packageManager?: string };
			const raw = parsed.packageManager ?? "";
			const name = raw.split("@")[0];
			if (name === "npm" || name === "pnpm" || name === "yarn" || name === "bun") return name;
		} catch {
			// fall through to lockfile detection
		}
	}

	// 2. Lockfile fallback. Probe in pnpm > yarn > bun order; first hit wins.
	// `fs.exists` returns `Effect<boolean, PlatformError>`; treat errors as
	// "doesn't exist" so a transient FS issue cannot flip the chosen manager.
	const exists = (path: string) => fs.exists(path).pipe(Effect.catchAll(() => Effect.succeed(false)));

	if (yield* exists("pnpm-lock.yaml")) return "pnpm" as const;
	if (yield* exists("yarn.lock")) return "yarn" as const;
	if (yield* exists("bun.lock")) return "bun" as const;

	return "npm" as const;
});

/**
 * Emit a {@link ReleaseOutput} as the structured `result` action output plus
 * the five convenience scalars. `result` is Schema-encoded; the scalars mirror
 * the most-wanted facts so a consumer need not parse JSON.
 *
 * @param outputs - The `ActionOutputs` service instance.
 * @param output - The phase-projected release output to emit.
 * @param scalars - The convenience scalar values for this phase. `packageCount`
 *   is the count of packages relevant to this phase — the changeset count for
 *   branch-management, the validated-package count for validation, and the
 *   total published-package count for publishing — so its meaning differs per
 *   phase.
 * @internal
 */
const emitReleaseOutput = (
	outputs: ActionOutputs["Type"],
	output: ReleaseOutput,
	scalars: { readonly packageCount: number; readonly releasePrNumber: number | null },
): Effect.Effect<void> =>
	Effect.gen(function* () {
		yield* outputs
			.setJson("result", output, ReleaseOutput)
			.pipe(
				Effect.catchAll((e) =>
					Effect.logWarning(`Failed to emit structured "result" output: ${e instanceof Error ? e.message : String(e)}`),
				),
			);
		yield* outputs.set("phase", output.phase);
		yield* outputs.set("status", output.status);
		yield* outputs.set("succeeded", output.succeeded ? "true" : "false");
		yield* outputs.set("package-count", String(scalars.packageCount));
		yield* outputs.set("release-pr-number", scalars.releasePrNumber === null ? "" : String(scalars.releasePrNumber));
	});

const runBranchManagement = Effect.gen(function* () {
	const packageManager = yield* detectPackageManager;

	yield* Step.groupStep(
		"Phase 1: Release Branch Management",
		Effect.gen(function* () {
			const releaseBranch = yield* Config.string("release-branch").pipe(Config.withDefault("changeset-release/main"));
			const targetBranch = yield* Config.string("target-branch").pipe(Config.withDefault("main"));
			const dryRun = yield* Config.boolean("dry-run").pipe(Config.withDefault(false));
			yield* Effect.logInfo(`Detected package manager: ${packageManager}`);
			const branchCheck = yield* checkReleaseBranch(releaseBranch, targetBranch, dryRun);

			// Read changeset bump types before the version command consumes them.
			// parseAll returns one entry per .changeset/*.md file; aggregate to
			// one entry per package, taking the highest bump across all changesets.
			const analyzer = yield* ChangesetAnalyzer;
			const parsedChangesets = yield* analyzer.parseAll().pipe(
				Effect.catchAll(() =>
					Effect.succeed(
						[] as Array<{
							id: string;
							packages: Array<{ name: string; bump: "major" | "minor" | "patch" }>;
							summary: string;
						}>,
					),
				),
			);
			const bumpRank = { patch: 0, minor: 1, major: 2 } as const;
			const packageBumps = new Map<string, "major" | "minor" | "patch">();
			for (const cs of parsedChangesets) {
				for (const pkg of cs.packages) {
					const current = packageBumps.get(pkg.name);
					if (current === undefined || bumpRank[pkg.bump] > bumpRank[current]) {
						packageBumps.set(pkg.name, pkg.bump);
					}
				}
			}
			const changesets = Array.from(packageBumps.entries()).map(([name, bumpType]) => ({ name, bumpType }));

			let created = false;
			let updated = false;
			let hasConflicts = false;
			let prNumber: number | null = branchCheck.prNumber;

			if (branchCheck.exists) {
				yield* Effect.logInfo("Release branch exists — running update flow");
				const updateResult = yield* updateReleaseBranch(packageManager);
				updated = updateResult.success;
				hasConflicts = updateResult.hadConflicts;
				prNumber = updateResult.prNumber ?? prNumber;
			} else {
				yield* Effect.logInfo("Release branch does not exist — running create flow");
				const createResult = yield* createReleaseBranch(packageManager);
				created = createResult.created;
				prNumber = createResult.prNumber ?? prNumber;
			}

			const output = toBranchManagementOutput({
				releaseBranchName: releaseBranch,
				existed: branchCheck.exists,
				created,
				updated,
				hasConflicts,
				releasePr:
					prNumber === null
						? null
						: {
								number: prNumber,
								// runBranchManagement does not yield ActionEnvironment, so the
								// repository slug is read straight from the env var here.
								url: `https://github.com/${process.env.GITHUB_REPOSITORY ?? ""}/pull/${prNumber}`,
								action: branchCheck.exists ? "updated" : "created",
							},
				changesets,
				dryRun,
			});
			const outputs = yield* ActionOutputs;
			yield* emitReleaseOutput(outputs, output, { packageCount: changesets.length, releasePrNumber: prNumber });
		}),
	);
});

/**
 * Phase 2 validation orchestrator. Runs the migrated Effect steps
 * inline; defers publish / release-notes / SBOM validation to the
 * existing imperative helpers.
 */
const runValidation = Effect.gen(function* () {
	const logger = yield* ActionLogger;
	const outputs = yield* ActionOutputs;
	const env = yield* ActionEnvironment;
	const client = yield* GitHubClient;

	const releaseBranch = yield* Config.string("release-branch").pipe(Config.withDefault("changeset-release/main"));
	const targetBranch = yield* Config.string("target-branch").pipe(Config.withDefault("main"));
	const dryRun = yield* Config.boolean("dry-run").pipe(Config.withDefault(false));
	// `strict-warnings` escalates warning-severity findings to `failure` on
	// the per-step AND unified check-run conclusions, letting auto-merge gates
	// (branch protection, Mergify, …) hold on warnings. Default `false`
	// preserves the existing advisory-warning semantics.
	const strictWarnings = yield* Config.boolean("strict-warnings").pipe(Config.withDefault(false));
	const packageManager = yield* detectPackageManager;
	const { repository, sha } = yield* env.github;
	const [owner, repo] = repository.split("/");

	yield* Step.groupStep(
		"Phase 2: Validation",
		Effect.gen(function* () {
			yield* Effect.logDebug(`Detected package manager: ${packageManager}`);

			// Changesets needs full history + a LOCAL ref for the target branch
			// to compute the diff between the release branch and main. The
			// checkout step in the wrapping workflow may only have shallow
			// history of changesets-release/main and an origin/main remote
			// ref; fetch+set up a local ref before any changeset-aware step
			// runs.
			yield* Effect.logDebug("Fetching git history for changeset comparison");
			const runner = yield* CommandRunner;
			const shallow = yield* runner
				.execCapture("git", ["rev-parse", "--is-shallow-repository"])
				.pipe(Effect.catchAll(() => Effect.succeed({ stdout: "false\n", stderr: "", exitCode: 0 })));
			if (shallow.stdout.trim() === "true") {
				yield* Effect.logDebug("Repository is shallow, fetching full history");
				yield* Effect.either(runner.exec("git", ["fetch", "--unshallow", "origin"]));
			}
			yield* Effect.either(runner.exec("git", ["fetch", "origin", `${targetBranch}:${targetBranch}`]));
			yield* Effect.logDebug(`Fetched ${targetBranch} as a local ref`);

			// Step 1 — link issues from commits (migrated).
			const issuesResult = yield* logger.group(
				"Link issues from commits",
				linkIssuesFromCommits.pipe(
					Effect.catchAll((e) =>
						Effect.gen(function* () {
							yield* Effect.logWarning(`linkIssuesFromCommits failed: ${String(e)}`);
							return {
								linkedIssues: [] as Array<{ number: number; title: string }>,
								commits: [],
								checkId: 0,
								htmlUrl: "",
							};
						}),
					),
				),
			);
			yield* Effect.logInfo(`✅ Link issues — ${issuesResult.linkedIssues.length} issue(s) linked`);

			// Step 2 — validate builds (migrated).
			const buildResult = yield* logger.group(
				"Validate builds",
				validateBuilds(packageManager).pipe(
					Effect.catchAll((e) =>
						Effect.gen(function* () {
							yield* Effect.logError(`validateBuilds failed: ${String(e)}`);
							return { success: false, errors: String(e), checkId: 0, htmlUrl: "" };
						}),
					),
				),
			);
			yield* Effect.logInfo(buildResult.success ? "✅ Build validation — passed" : "❌ Build validation — failed");

			// Steps 3-5 — publish / release-notes / SBOM validation via Effect.
			const publishCheckId = 0;
			let publishReadyTargets = 0;
			let publishTotalTargets = 0;
			let publishOk = true;
			let npmReady = false;
			let githubPackagesReady = false;
			let reportPackages: ReadonlyArray<{ name: string; version: string; ready: boolean }> = [];
			// Build-centric per-package validation results — the input to the
			// build-centric ValidationOutput projection.
			let validationPackages: ReadonlyArray<ValidationPackageResult> = [];
			let sbomOk = true;
			let sbomSummary = "SBOM Preview skipped";
			// Structured findings produced by the publish dry-run + SBOM/NTIA checks
			// inside `runValidationEffect`; the build finding is appended below.
			let reportFindings: ReadonlyArray<ValidationFinding> = [];
			// Per-build resolved sbom-config metadata, keyed by
			// `${pkg.name}:${build.directory}`. Debug-only; fed into the SBOM Preview
			// check-run summary so config-or-mapping bugs are immediately visible.
			// `null` indicates `runValidationEffect` was not reached (build failure).
			let resolvedSbomConfig: ReadonlyMap<string, ResolvedSBOMMetadata> | null = null;
			// The source the `sbom-config` was loaded from this run (`input` /
			// `local` / `variable` / `none`). Surfaced on the SBOM Preview
			// check-run summary; `null` until `runValidationEffect` reports it.
			let sbomConfigSource: ConfigSource | null = null;

			if (buildResult.success) {
				yield* Effect.logInfo("Validate publishing");
				const report = yield* runValidationEffect({ packageManager, targetBranch, dryRun }).pipe(
					Effect.catchAll((e) =>
						Effect.gen(function* () {
							const message =
								e instanceof Error
									? `${e.message}\n${String((e as Error & { stack?: string }).stack ?? "")}`
									: String(e);
							yield* Effect.logWarning(`runValidation failed: ${message}`);
							return null;
						}),
					),
				);
				if (report !== null) {
					publishReadyTargets = report.readyTargets;
					publishTotalTargets = report.totalTargets;
					publishOk = report.publishOk;
					npmReady = report.npmReady;
					githubPackagesReady = report.githubPackagesReady;
					reportPackages = report.packages;
					validationPackages = report.validationPackages;
					sbomOk = report.sbomOk;
					sbomSummary = report.sbomSummary;
					reportFindings = report.findings;
					resolvedSbomConfig = report.resolvedSbomConfig;
					sbomConfigSource = report.sbomConfigSource;
				}
				yield* Effect.logInfo(
					publishOk
						? `✅ Publish validation — ${publishReadyTargets}/${publishTotalTargets} target(s) ready`
						: `❌ Publish validation — ${publishReadyTargets}/${publishTotalTargets} target(s) ready`,
				);
				yield* Effect.logInfo(`✅ Release notes — ${reportPackages.length} package(s) ready`);
				yield* Effect.logInfo(sbomOk ? `✅ SBOM preview — ${sbomSummary}` : `❌ SBOM preview — ${sbomSummary}`);
			} else {
				yield* Effect.logWarning("Builds failed, skipping publish validation");
			}

			// Step 6 — unified validation check (migrated).
			// Aggregate the structured findings across every Phase-2 check. The
			// publish dry-run + SBOM/NTIA findings come from `runValidationEffect`;
			// the build finding is derived here from `buildResult`.
			//
			// Honesty note: Link-Issues and Release-Notes contribute no findings.
			// `LinkIssuesResult` exposes no failure signal (the step always
			// completes its check as `success` and `main.ts` degrades any thrown
			// error to an empty result), and there is no rich release-notes module
			// on `dev` — no missing-CHANGELOG / notes-extraction signal exists.
			const findings: ValidationFinding[] = [];
			if (!buildResult.success) {
				findings.push({
					severity: "error",
					check: "Build Validation",
					scope: null,
					message: buildResult.errors.trim() || "Build failed",
				});
			}
			findings.push(...reportFindings);

			// Conclusion-per-check rule used for the three new per-step check runs
			// AND propagated into the unified Release Validation Summary check's
			// per-row `success` field below — so the unified conclusion and the
			// per-step conclusions agree on strict-warnings escalation.
			//
			// Build-failed cascade — when Build Validation fails, `runValidation`
			// is skipped so the downstream Publish / Release Notes / SBOM checks
			// emit no findings. The helper reports `failure` for those rows so
			// the conclusion does not lie about steps that never ran.
			const conclusionFor = (checkName: string): "success" | "failure" | "neutral" =>
				deriveCheckConclusion(checkName, findings, buildResult.success, strictWarnings);

			// Translate a conclusion into the boolean shape the unified check
			// run consumes. `neutral` (warning, non-strict) counts as success for
			// the unified table — preserves the prior "warnings are advisory"
			// semantics. `failure` (errors, or warnings under strict mode) flips
			// the row to failed.
			const successFor = (checkName: string): boolean => conclusionFor(checkName) !== "failure";

			const checkResults = [
				{
					name: "Link Issues from Commits",
					success: successFor("Link Issues from Commits"),
					checkId: 0,
					message: `${issuesResult.linkedIssues.length} issue(s) linked`,
				},
				{
					name: "Build Validation",
					success: buildResult.success,
					checkId: buildResult.checkId,
					message: buildResult.success ? "Build passed" : "Build failed",
				},
				{
					name: "Publish Validation",
					success: buildResult.success && publishOk && successFor("Publish Validation"),
					checkId: publishCheckId,
					message:
						publishTotalTargets === 0 ? "No targets" : `${publishReadyTargets}/${publishTotalTargets} target(s) ready`,
				},
				{
					name: "Release Notes Preview",
					success: successFor("Release Notes Preview"),
					checkId: 0,
					message: `${reportPackages.length} package(s) ready`,
				},
				{
					name: "SBOM Preview",
					success: sbomOk && successFor("SBOM Preview"),
					checkId: 0,
					message: sbomSummary,
				},
			];

			// Derive the 3-state checks-table icon per row from the findings the
			// check produced: any error → ❌, else any warning → ⚠️, else ✅. The
			// `hardFailed` flag covers checks whose failure is not also a finding
			// (e.g. a publish failure when the build itself passed).
			const statusFor = (checkName: string, hardFailed: boolean): "pass" | "warning" | "error" => {
				const own = findings.filter((f) => f.check === checkName);
				if (hardFailed || own.some((f) => f.severity === "error")) return "error";
				if (own.some((f) => f.severity === "warning")) return "warning";
				return "pass";
			};
			const buildUrl = buildResult.htmlUrl !== "" ? buildResult.htmlUrl : null;
			const linkIssuesUrl = issuesResult.htmlUrl !== "" ? issuesResult.htmlUrl : null;

			// Project the canonical ValidationOutput. The unified Release Validation
			// Summary check is created at the end (after the per-step checks and the
			// final `validationOutput`) so its body can carry the full structured
			// `result` JSON in a collapsed block. `checkRun` is `null` here — the
			// unified URL is not yet known, and the body JSON should not self-
			// reference the very page it lives on. The emitted `result` is shallow-
			// patched below once the unified check exists, so consumers see the
			// real `{url, conclusion}` in the action output.
			const projectValidation = (
				checks: ReadonlyArray<ValidationOutput["validation"]["checks"][number]>,
			): ValidationOutput =>
				toValidationOutput({
					buildsPassed: buildResult.success,
					packageCount: reportPackages.length,
					npmReady,
					githubPackagesReady,
					totalTargets: publishTotalTargets,
					readyTargets: publishReadyTargets,
					checks,
					findings,
					validationPackages,
					checkRun: null,
					dryRun,
				});

			// Placeholder checks — `Link Issues from Commits` and `Build Validation`
			// carry their own per-step check URLs (or `null` when unavailable); the
			// remaining three rows are filled in once their per-step check runs
			// exist.
			const placeholderChecks: ReadonlyArray<ValidationOutput["validation"]["checks"][number]> = [
				{
					name: "Link Issues from Commits",
					status: statusFor("Link Issues from Commits", false),
					outcome: `${issuesResult.linkedIssues.length} issue(s) linked`,
					url: linkIssuesUrl,
				},
				{
					name: "Build Validation",
					status: statusFor("Build Validation", !buildResult.success),
					outcome: buildResult.success ? "Build passed" : "Build failed",
					url: buildUrl,
				},
				{
					name: "Publish Validation",
					status: statusFor("Publish Validation", !buildResult.success || !publishOk),
					outcome:
						publishTotalTargets === 0 ? "No targets" : `${publishReadyTargets}/${publishTotalTargets} target(s) ready`,
					url: null,
				},
				{
					name: "Release Notes Preview",
					status: statusFor("Release Notes Preview", false),
					outcome: `${reportPackages.length} package(s) ready`,
					url: null,
				},
				{
					name: "SBOM Preview",
					status: statusFor("SBOM Preview", !buildResult.success || !sbomOk),
					outcome: sbomSummary,
					url: null,
				},
			];

			// Draft projection over the placeholder rows — feeds the per-step
			// summary builders below. The per-step URLs for Publish / Release
			// Notes / SBOM are filled in further down.
			const summaryDraftOutput = projectValidation(placeholderChecks);

			// Create the three per-step check runs after the canonical object is
			// known — each summary is rendered from `summaryDraftOutput.validation`.
			const checksSvc = yield* CheckRun;

			const createPerStepCheck = (
				title: string,
				conclusion: "success" | "failure" | "neutral",
				summary: string,
			): Effect.Effect<string> =>
				Effect.gen(function* () {
					const created = yield* checksSvc.create(title, sha).pipe(
						Effect.catchAll((e) =>
							Effect.gen(function* () {
								yield* Effect.logWarning(`Failed to create check run "${title}": ${e.message}`);
								return null;
							}),
						),
					);
					if (created === null) {
						return "";
					}
					yield* checksSvc
						.complete(created.id, conclusion, { title, summary })
						.pipe(Effect.catchAll((e) => Effect.logWarning(`Failed to complete check run "${title}": ${e.message}`)));
					return created.htmlUrl;
				});

			const publishSummary = buildPublishValidationSummary(summaryDraftOutput.validation);
			const releaseNotesSummary = buildReleaseNotesPreviewSummary(summaryDraftOutput.validation);
			const sbomSummaryMd = buildSbomPreviewSummary(
				summaryDraftOutput.validation,
				resolvedSbomConfig,
				sbomConfigSource,
			);

			const publishTitle = dryRun ? "🧪 Publish Validation (Dry Run)" : "📦 Publish Validation";
			const releaseNotesTitle = dryRun ? "🧪 Release Notes Preview (Dry Run)" : "📋 Release Notes Preview";
			const sbomTitle = dryRun ? "🧪 SBOM Preview (Dry Run)" : "🔏 SBOM Preview";

			const publishCheckUrl = yield* createPerStepCheck(
				publishTitle,
				conclusionFor("Publish Validation"),
				publishSummary,
			);
			const releaseNotesCheckUrl = yield* createPerStepCheck(
				releaseNotesTitle,
				conclusionFor("Release Notes Preview"),
				releaseNotesSummary,
			);
			const sbomCheckUrl = yield* createPerStepCheck(sbomTitle, conclusionFor("SBOM Preview"), sbomSummaryMd);

			// Fill in the Publish / Release Notes / SBOM rows with each check's
			// real htmlUrl. Build / Link rows keep their existing values (own
			// per-step URL or `null`).
			const urlFor = (placeholder: string | null, real: string): string | null => (real !== "" ? real : placeholder);
			const checkRows: ReadonlyArray<ValidationOutput["validation"]["checks"][number]> = placeholderChecks.map(
				(row) => {
					if (row.name === "Publish Validation") return { ...row, url: urlFor(row.url, publishCheckUrl) };
					if (row.name === "Release Notes Preview") return { ...row, url: urlFor(row.url, releaseNotesCheckUrl) };
					if (row.name === "SBOM Preview") return { ...row, url: urlFor(row.url, sbomCheckUrl) };
					return row;
				},
			);

			// Final summary line.
			const passedCount = checkResults.filter((r) => r.success).length;
			yield* Effect.logInfo(
				passedCount === checkResults.length
					? `Release validation: ✅ ${passedCount}/${checkResults.length} checks passed`
					: `Release validation: ❌ ${passedCount}/${checkResults.length} checks passed — failed: ${checkResults
							.filter((r) => !r.success)
							.map((r) => r.name)
							.join(", ")}`,
			);

			// Provisional projection over the final per-step URLs — used to build
			// the JSON block in the check-run body. `checkRun` is `null` here so
			// the body JSON does not self-reference the very page it lives on; the
			// emitted `result` is patched below with the now-known unified URL.
			const provisionalOutput = projectValidation(checkRows);

			// Build the collapsed JSON block surfacing the full structured `result`
			// action output inside the unified check-run page — the downstream-
			// consumer artifact is no longer hidden behind the action's outputs.
			const jsonBlock = [
				"",
				"<details>",
				"<summary>📦 Full structured output (<code>result</code> action output)</summary>",
				"",
				"```json",
				JSON.stringify(provisionalOutput, null, 2),
				"```",
				"",
				"</details>",
			].join("\n");

			const unified = yield* logger.group("Validation check", createValidationCheck(checkResults, dryRun, jsonBlock));
			yield* Effect.logInfo(`✅ Validation check — conclusion: ${unified.success ? "success" : "failure"}`);
			const unifiedUrl = unified.htmlUrl !== "" ? unified.htmlUrl : undefined;

			// Patch the emitted result with the now-known unified check URL /
			// conclusion. The one-line divergence between the body JSON
			// (`checkRun: null`) and the emitted `result` (`checkRun: { url,
			// conclusion }`) is intentional — the body JSON should not self-
			// reference the very page it lives on, but the `result` action output
			// must carry the unified check URL for downstream consumers.
			const validationOutput: ValidationOutput = {
				...provisionalOutput,
				validation: {
					...provisionalOutput.validation,
					checkRun:
						unified.htmlUrl !== ""
							? { url: unified.htmlUrl, conclusion: unified.success ? "success" : "failure" }
							: null,
				},
			};

			// Step 7 — sticky comment on the release PR (migrated).
			const prsResult = yield* Effect.either(
				client.rest<ReadonlyArray<{ number: number }>>("pulls.list.validation", (octokit) =>
					(
						octokit as {
							rest: {
								pulls: {
									list: (params: {
										owner: string;
										repo: string;
										state: "open";
										head: string;
										base: string;
									}) => Promise<{ data: ReadonlyArray<{ number: number }> }>;
								};
							};
						}
					).rest.pulls.list({
						owner,
						repo,
						state: "open",
						head: `${owner}:${releaseBranch}`,
						base: targetBranch,
					}),
				),
			);
			if (prsResult._tag === "Right" && prsResult.right.length > 0) {
				const pr = prsResult.right[0];
				// Redesigned Phase-2 comment: a worst-state header icon, the 3-state
				// checks table, the findings table (rendered only when non-empty),
				// the build-grouped "What will be released" forecast, and a
				// release-notes link. Rendered straight from the canonical
				// ValidationOutput's `validation` payload — no parallel comment input.
				const commentBody = buildValidationComment(validationOutput.validation, {
					...(unifiedUrl !== undefined && { releaseNotesUrl: unifiedUrl }),
					dryRun,
				});
				yield* logger.group(
					"Update PR comment",
					updateStickyComment(pr.number, commentBody, "release-validation").pipe(
						Effect.catchAll((e) =>
							Effect.gen(function* () {
								yield* Effect.logWarning(`Failed to update sticky comment: ${String(e)}`);
								return { commentId: 0 };
							}),
						),
					),
				);
				yield* Effect.logInfo(`✅ Sticky comment updated on PR #${pr.number}`);
			} else {
				yield* Effect.logInfo("Sticky comment update skipped — no open PR found for release branch");
			}

			// Emit the structured `result` action output for Phase 2.
			yield* emitReleaseOutput(outputs, validationOutput, {
				packageCount: reportPackages.length,
				// Phase 2 runs on a push to the release branch; the release PR number is not
				// in the event payload and resolving it would need an extra API lookup, so
				// the release-pr-number scalar is left empty for the validation phase.
				releasePrNumber: null,
			});
		}).pipe(
			Effect.catchAll((e) =>
				Effect.gen(function* () {
					yield* Effect.logError(`Phase 2 failed: ${String(e)}`);
					yield* cleanupValidationChecks([], `Phase 2 failed: ${String(e)}`, dryRun).pipe(
						Effect.catchAll(() => Effect.succeed({ cleanedUp: 0, failed: 0, errors: [] })),
					);
					return yield* Effect.fail(e);
				}),
			),
		),
	);
});

/**
 * Phase 3 publishing orchestrator. Delegates to the Effect-based
 * {@link detectReleases}, {@link runBuildAndSbom}, and {@link runPublishTargets}
 * programs from `src/release/publish.ts` and the {@link runReleases} program
 * from `src/release/releases.ts`.
 */
const runPublishing = (mergedReleasePRNumber: number | undefined) =>
	Step.groupStep(
		"Phase 3: Publishing",
		Effect.gen(function* () {
			const logger = yield* ActionLogger;
			const outputs = yield* ActionOutputs;
			const runner = yield* CommandRunner;

			const targetBranch = yield* Config.string("target-branch").pipe(Config.withDefault("main"));
			const dryRun = yield* Config.boolean("dry-run").pipe(Config.withDefault(false));
			const packageManager = yield* detectPackageManager;

			const emitPublishing = (
				publishResult: PublishPackagesResult,
				tags: ReadonlyArray<TagInfo>,
				releases: ReadonlyArray<ReleaseInfo>,
				tagShas: Record<string, string>,
			) =>
				emitReleaseOutput(outputs, toPublishingOutput({ publishResult, tags, releases, tagShas, dryRun }), {
					packageCount: publishResult.totalPackages,
					releasePrNumber: mergedReleasePRNumber !== undefined ? mergedReleasePRNumber : null,
				});

			// ── Prelude (detail) ───────────────────────────────────────────────────
			yield* Effect.logDebug(`Detected package manager: ${packageManager}`);
			const shallow = yield* runner
				.execCapture("git", ["rev-parse", "--is-shallow-repository"])
				.pipe(Effect.catchAll(() => Effect.succeed({ stdout: "false\n", stderr: "", exitCode: 0 })));
			if (shallow.stdout.trim() === "true") {
				yield* Effect.either(runner.exec("git", ["fetch", "--unshallow", "origin"]));
			}
			yield* Effect.either(runner.exec("git", ["fetch", "origin", `${targetBranch}:${targetBranch}`]));

			const args = { packageManager, targetBranch, dryRun, mergedReleasePRNumber };

			// ── Step 1: Detect released packages ───────────────────────────────────
			// `detectReleases` wraps itself in Step.withStep, which emits its own
			// success line on completion. No extra info line here.
			const detected = yield* detectReleases(args);

			if (detected.length === 0) {
				const empty: PublishPackagesResult = {
					success: true,
					packages: [],
					totalPackages: 0,
					successfulPackages: 0,
					totalTargets: 0,
					successfulTargets: 0,
				};
				yield* emitPublishing(empty, [], [], {});
				yield* Effect.logInfo("Release publishing: ✅ nothing to publish");
				return;
			}

			// ── Step 2: Determine tag strategy ─────────────────────────────────────
			const tagStrategy = yield* logger.group(
				"Tag strategy",
				Effect.gen(function* () {
					// `DetectedRelease` carries no `targets`, and `determineTagStrategy`
					// only reads `name`/`version` — so the empty `targets` array is safe.
					// Tag strategy (Step 2) runs on the full detected set before any
					// publishing, making every detected package a tag candidate; that is
					// correct because a publish failure (Step 4) aborts releases (Step 5)
					// before a single tag is ever created.
					const strategy = determineTagStrategy(
						detected.map((d) => ({ name: d.name, version: d.version, targets: [] })),
					);
					yield* Effect.logDebug(`tag strategy: ${strategy.strategy}, ${strategy.tags.length} tag(s)`);
					return strategy;
				}),
			);
			const tagStrategyLabel = tagStrategy.strategy === "multiple" ? "per-package tags" : "single shared tag";
			yield* Effect.logInfo(`✅ ${tagStrategy.tags.length} tag(s) to create — ${tagStrategyLabel}`);

			// ── Step 3: Build & SBOM (fail-fast gate) ──────────────────────────────
			// `runBuildAndSbom` wraps itself in Step.withStep; its success line emits
			// from the step on completion.
			const buildSbom = yield* runBuildAndSbom(detected, args);
			if (!buildSbom.ok) {
				const detail =
					buildSbom.buildError !== undefined
						? `build failed — ${buildSbom.buildError}`
						: `SBOM generation failed for ${buildSbom.sbomFailures.join(", ")}`;
				yield* Effect.logError(`❌ Build & SBOM — ${detail}; aborting before publish`);
				const failed: PublishPackagesResult = {
					success: false,
					packages: [],
					totalPackages: detected.length,
					successfulPackages: 0,
					totalTargets: 0,
					successfulTargets: 0,
					...(buildSbom.buildError !== undefined ? { buildError: buildSbom.buildError } : {}),
				};
				yield* emitPublishing(failed, [], [], {});
				yield* Effect.logInfo("Release publishing: ❌ aborted at Build & SBOM — nothing published");
				yield* outputs.setFailed("Phase 3 aborted at Build & SBOM");
				return;
			}

			// ── Step 4: Publish to registries ──────────────────────────────────────
			const publishResult = yield* runPublishTargets(detected, args, buildSbom.sbomPaths);
			if (!publishResult.success) {
				yield* Effect.logError(
					`❌ Published ${publishResult.successfulTargets}/${publishResult.totalTargets} target(s) — aborting before releases`,
				);
				yield* emitPublishing(publishResult, [], [], {});
				yield* Effect.logInfo("Release publishing: ❌ failed at Publish");
				yield* outputs.setFailed("Publishing failed");
				return;
			}
			yield* Effect.logInfo(`✅ Published ${publishResult.successfulTargets}/${publishResult.totalTargets} target(s)`);

			// ── Step 5: Create releases ────────────────────────────────────────────
			// `runReleases` wraps itself in Step.withStep.
			const releasesResult = yield* runReleases({
				tags: tagStrategy.tags,
				publishResult,
				packageManager,
				dryRun,
			}).pipe(
				Effect.catchAll((e) =>
					Effect.gen(function* () {
						yield* Effect.logWarning(`runReleases failed: ${String(e)}`);
						return { success: false, releases: [] as ReleaseInfo[], errors: [String(e)] };
					}),
				),
			);
			yield* Effect.logInfo(
				releasesResult.success
					? `✅ Created ${releasesResult.releases.length} release(s)`
					: `❌ Created ${releasesResult.releases.length} release(s) — ${releasesResult.errors.length} error(s)`,
			);

			// ── Follow-on: close linked issues ─────────────────────────────────────
			if (mergedReleasePRNumber !== undefined) {
				const closeResult = yield* logger.group(
					"Close linked issues",
					closeLinkedIssues(mergedReleasePRNumber, dryRun).pipe(
						Effect.catchAll((e) =>
							Effect.gen(function* () {
								yield* Effect.logWarning(`closeLinkedIssues failed: ${String(e)}`);
								return null;
							}),
						),
					),
				);
				yield* Effect.logInfo(
					closeResult === null ? "❌ Close linked issues — failed" : `✅ ${closeResult.closedCount} issue(s) closed`,
				);
			}

			// ── Emit outputs + final summary ───────────────────────────────────────
			const tagShas: Record<string, string> = {};
			for (const tag of tagStrategy.tags) {
				const rev = yield* runner
					.execCapture("git", ["rev-parse", tag.name])
					.pipe(Effect.catchAll(() => Effect.succeed({ stdout: "", stderr: "", exitCode: 1 })));
				tagShas[tag.name] = rev.stdout.trim();
			}
			yield* emitPublishing(publishResult, tagStrategy.tags, releasesResult.releases, tagShas);

			yield* Effect.logInfo(
				`Release publishing: ✅ ${publishResult.successfulPackages} package(s), ${releasesResult.releases.length} release(s)`,
			);
		}),
	);

/**
 * Read the merged-PR number from the GitHub event payload.
 *
 * @remarks
 * Phase 3a only runs on a `pull_request` event where the release PR was
 * merged. `phaseResult.payload.pull_request.number` was previously read
 * from `@actions/github`'s `context.payload`. With github-action-effects
 * we read the event file ourselves via `ActionEnvironment` + `FileSystem`.
 */
const readEventPullRequestNumber = Effect.gen(function* () {
	const env = yield* ActionEnvironment;
	const fs = yield* FileSystem.FileSystem;

	const pathOpt = yield* env.getOptional("GITHUB_EVENT_PATH");
	if (Option.isNone(pathOpt) || pathOpt.value === "") return Option.none<number>();

	const result = yield* Effect.either(fs.readFileString(pathOpt.value));
	if (result._tag === "Left") return Option.none<number>();

	try {
		const parsed = JSON.parse(result.right) as { pull_request?: { number?: number } };
		const num = parsed.pull_request?.number;
		return typeof num === "number" ? Option.some(num) : Option.none<number>();
	} catch {
		return Option.none<number>();
	}
});

const runCloseIssues = Effect.gen(function* () {
	const logger = yield* ActionLogger;
	const dryRun = yield* Config.boolean("dry-run").pipe(Config.withDefault(false));

	yield* logger.group(
		"Phase 3a: Close Linked Issues",
		Effect.gen(function* () {
			const prNumber = yield* readEventPullRequestNumber;
			if (Option.isNone(prNumber)) {
				yield* Effect.logWarning("No pull_request number in event payload; skipping close-issues phase");
				return;
			}
			yield* closeLinkedIssues(prNumber.value, dryRun);
		}),
	);
});

// ---------------------------------------------------------------------------
// Main program
// ---------------------------------------------------------------------------

export const main = Effect.gen(function* () {
	const state = yield* ActionState;

	// The installation token provisioned by pre.ts is read back here and
	// bridged into the `STATE_token` env var so the imperative publish helpers
	// (tokens.ts) can read it via `process.env.STATE_token`.
	// `process.env.GITHUB_TOKEN` is intentionally never set.
	const installationToken = yield* GitHubToken.read();
	process.env.STATE_token = installationToken.token;

	// Bridge the optional workflow-issued `github-token` (saved by pre.ts as
	// `githubPackagesToken`) into the `STATE_githubToken` env var so
	// `registry-auth.setupRegistryAuth` can prefer it for GitHub Packages
	// publishing. Without this bridge, tokens.ts's `packagesToken()` reads
	// empty and falls back to the App installation token — which may not
	// carry org-level `packages:read` even when the workflow's
	// `secrets.GITHUB_TOKEN` does.
	const pkgToken = yield* state.getOptional(STATE_KEYS.githubPackagesToken, GithubPackagesTokenState);
	if (Option.isSome(pkgToken)) {
		process.env.STATE_githubToken = pkgToken.value.token;
	}

	// Identity diagnostics — the App identity resolved by `provision`.
	if (installationToken.appName !== undefined || installationToken.appSlug !== undefined) {
		yield* Effect.logInfo(`Using GitHub App token (${installationToken.appName ?? installationToken.appSlug})`);
	}

	// Routing.
	const releaseBranch = yield* Config.string("release-branch").pipe(Config.withDefault("changeset-release/main"));
	const targetBranch = yield* Config.string("target-branch").pipe(Config.withDefault("main"));
	const explicitInput = yield* Config.string("phase").pipe(Config.withDefault(""));
	const explicitPhase = explicitInput !== "" ? (explicitInput as WorkflowPhase) : undefined;

	const phaseResult = yield* detectWorkflowPhase({
		releaseBranch,
		targetBranch,
		...(explicitPhase !== undefined && { explicitPhase }),
	});

	yield* Effect.logInfo(`Phase: ${phaseResult.phase} — ${phaseResult.reason}`);

	switch (phaseResult.phase) {
		case "branch-management":
			yield* runBranchManagement;
			return;
		case "validation":
			yield* runValidation;
			return;
		case "publishing":
			yield* runPublishing(phaseResult.mergedReleasePRNumber);
			return;
		case "close-issues":
			yield* runCloseIssues;
			return;
		default:
			yield* Effect.logInfo(`No-op phase: ${phaseResult.reason}`);
			return;
	}
});

// ---------------------------------------------------------------------------
// Layer composition and execution
// ---------------------------------------------------------------------------

/**
 * The composite domain layer for the main action. `Action.run` injects
 * `ActionLogger`, `ActionOutputs`, `ActionEnvironment`, `ActionState`, and
 * `ActionsConfigProvider`; everything else is wired here.
 *
 * The main action's `GitHubClient` is built from the App installation token
 * that `pre.ts` persisted to `ActionState`, via the library-native
 * `GitHubToken.client()` layer — no `process.env.GITHUB_TOKEN` involved.
 * `GitHubToken.client()` needs `ActionState`; `Action.run`'s `layer` option
 * requires a self-contained layer, so `ActionStateLive` (backed by
 * `NodeFileSystem`) is provided here. `Layer.orDie` turns a missing or
 * unreadable token into a fatal defect rather than a partial boot.
 */
const actionStateLayer = ActionStateLive.pipe(Layer.provide(NodeFileSystem.layer));
const githubClient = GitHubToken.client().pipe(Layer.provide(actionStateLayer), Layer.orDie);
const githubGraphQL = GitHubGraphQLLive.pipe(Layer.provide(githubClient));
const githubApiBase = Layer.merge(githubClient, githubGraphQL);

const releaseLive = ReleaseLive.pipe(Layer.provide(Layer.merge(NodeFileSystem.layer, NodePath.layer)), Layer.orDie);
const npmRegistryLive = NpmRegistryLive.pipe(Layer.provide(CommandRunnerLive));
const packagePublishLive = PackagePublishLive.pipe(Layer.provide(Layer.merge(CommandRunnerLive, npmRegistryLive)));

const oidcTokenIssuerLive = OidcTokenIssuerLive.pipe(Layer.provide(FetchHttpClient.layer));
const sigstoreSignerLive = SigstoreSignerLive.pipe(Layer.provide(oidcTokenIssuerLive));
const attestLive = AttestLive.pipe(
	Layer.provide(Layer.mergeAll(sigstoreSignerLive, oidcTokenIssuerLive, githubClient, SbomLive)),
);

export const MainLive = Layer.mergeAll(
	githubClient,
	githubGraphQL,
	CheckRunLive.pipe(Layer.provide(githubClient)),
	PullRequestLive.pipe(Layer.provide(githubApiBase)),
	PullRequestCommentLive.pipe(Layer.provide(githubClient)),
	GitHubIssueLive.pipe(Layer.provide(githubApiBase)),
	GitHubReleaseLive.pipe(Layer.provide(githubClient)),
	GitHubArtifactMetadataLive.pipe(Layer.provide(githubClient)),
	GitTagLive.pipe(Layer.provide(githubClient)),
	GitBranchLive.pipe(Layer.provide(githubClient)),
	GitCommitLive.pipe(Layer.provide(githubClient)),
	GitHubCommitLive.pipe(Layer.provide(githubClient)),
	GitHubContentLive.pipe(Layer.provide(githubClient)),
	CommandRunnerLive,
	NodeFileSystem.layer,
	ChangesetAnalyzerLive.pipe(Layer.provide(NodeFileSystem.layer)),
	releaseLive,
	npmRegistryLive,
	packagePublishLive,
	SbomLive,
	oidcTokenIssuerLive,
	sigstoreSignerLive,
	attestLive,
);

/* v8 ignore next 3 -- entry-point guard, only runs in GitHub Actions */
if (process.env.GITHUB_ACTIONS) {
	await Action.run(main, { layer: MainLive });
}
