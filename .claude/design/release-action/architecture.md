---
title: Release Action Architecture
category: architecture
status: current
completeness: 95
last-synced: 2026-02-08
module: release-action
---

## Table of Contents

- [Overview](#overview)
- [Current State](#current-state)
  - [Entry Points](#entry-points)
  - [Phase Detection](#phase-detection)
  - [Phase 1: Release Branch Management](#phase-1-release-branch-management)
  - [Phase 2: Release Validation](#phase-2-release-validation)
  - [Phase 3: Release Publishing](#phase-3-release-publishing)
  - [Phase 3a: Issue Closing](#phase-3a-issue-closing)
  - [Module Dependency Graph](#module-dependency-graph)
  - [Shared Infrastructure](#shared-infrastructure)
  - [Type System](#type-system)
- [Rationale](#rationale)
  - [Why Three Phases?](#why-three-phases)
  - [Why API Commits?](#why-api-commits)
  - [Why Recreate vs Rebase?](#why-recreate-vs-rebase)
  - [Why Pre-validate All Targets?](#why-pre-validate-all-targets)
  - [Why Topological Sorting?](#why-topological-sorting)
- [Key Design Patterns](#key-design-patterns)
  - [State Management](#state-management)
  - [Error Handling Strategy](#error-handling-strategy)
  - [GitHub API Usage](#github-api-usage)
  - [Dry-Run Mode](#dry-run-mode)
- [File Reference](#file-reference)

## Overview

The `workflow-release-action` is a TypeScript GitHub Action implementing a
three-phase automated release workflow for monorepos and single-package
repositories using changesets. It runs as a Node.js 24 action
(`runs.using: node24`) with `pre`, `main`, and `post` lifecycle hooks,
declared in `action.yml`.

The action automates the full release lifecycle: detecting pending changes,
managing a release branch and PR, validating builds and registry readiness,
publishing to multiple registries (npm, JSR, GitHub Packages, custom), creating
Git tags and GitHub releases with attestations, and closing linked issues. All
operations produce GitHub Check Runs for rich CI feedback and post sticky
comments on the release PR for at-a-glance status.

The codebase totals approximately 17,000 lines of TypeScript across 3 entry
points, 38 utility modules, and 4 type definition files.

## Current State

### Entry Points

Three lifecycle scripts correspond to the GitHub Actions `pre`, `main`, and
`post` execution stages:

- **`src/pre.ts`** (79 lines) -- Pre-action setup. Generates a GitHub App
  installation token via `createAppToken()` using the `app-id` and
  `private-key` inputs. Validates token permissions via
  `checkTokenPermissions()`. Saves the token, expiration time, installation ID,
  app slug, and optional `github-token` (for GitHub Packages fallback) to
  Actions state for use by the main and post scripts. Failures here call
  `setFailed()` to abort the workflow.

- **`src/main.ts`** (1,043 lines) -- Main orchestrator. Auto-detects the
  package manager via `detectRepoType()`, reads action inputs, retrieves the
  token from state, and calls `detectWorkflowPhase()` to determine which phase
  to run. Routes execution to one of four phase handlers via a `switch`
  statement:
  - `runPhase1BranchManagement()` -- creates or updates the release branch
  - `runPhase2Validation()` -- validates builds, publishing, and release notes
  - `runPhase3Publishing()` -- publishes packages, creates tags and releases
  - `runCloseLinkedIssues()` -- closes issues linked to the release PR

- **`src/post.ts`** (50 lines) -- Post-action cleanup. Logs total execution
  duration, then conditionally revokes the GitHub App installation token.
  Skips revocation if the token is a legacy token, if `skip-token-revoke` is
  true, or if the token has already expired. Errors are emitted as warnings
  (not failures) so they never fail the overall workflow.

### Phase Detection

**`detect-workflow-phase.ts`** (411 lines)

The phase router determines which phase to execute based on GitHub event
context. It exports both an async version (with API calls for release commit
detection) and a synchronous lightweight version for quick checks.

Detection priority order:

1. **Explicit phase** -- If the `phase` input is provided, skip detection and
   use it directly. This supports the `workflow-control-action` pattern where
   phase is pre-determined.

2. **Phase 3a (close-issues)** -- `pull_request` event where the release PR
   (`changeset-release/main` to `main`) was merged. Detected from event
   payload without API calls.

3. **Phase 3 (publishing)** -- Push to main with a release commit. Detection
   uses a two-strategy approach with retry logic:
   - **Primary**: Query `listPullRequestsAssociatedWithCommit` to find a
     merged PR from the release branch.
   - **Fallback**: Query recently closed PRs from the release branch and
     match `merge_commit_sha` against the current commit. This handles cases
     where the branch is auto-deleted before the association API returns
     results.
   - **Retry**: 3 attempts with 5-second delays between attempts to handle
     GitHub API eventual consistency after PR merge.

4. **Phase 2 (validation)** -- Push to the release branch
   (`changeset-release/main`).

5. **Phase 1 (branch-management)** -- Push to main that is not a release
   commit.

6. **None** -- Any other branch or event. Logs a skip message and exits.

### Phase 1: Release Branch Management

Triggers on push to `main` (non-release commits). Three sequential steps:

- **`detect-publishable-changes.ts`** (467 lines) -- Runs
  `changeset status --output=json` to find pending changesets. Builds a
  package map from `workspace-tools`, reads each package's `package.json` to
  check for `publishConfig.access` or publish targets. Separates packages into
  two categories: publishable (have registry targets) and version-only (have
  changesets but no publish targets -- receive version bumps and GitHub
  releases only). Creates a GitHub Check Run summarizing discovered packages.

- **`get-changeset-status.ts`** (236 lines) -- Wraps the changeset status
  command with fallback logic. If changesets have already been consumed (after
  a version command), checks out the merge base between the release branch and
  target branch to retrieve the original changeset state.

- **`check-release-branch.ts`** (158 lines) -- Checks whether the
  `changeset-release/main` branch exists (via `repos.getBranch` REST API,
  handling 404) and whether an open PR exists from that branch to the target
  branch. Creates a Check Run reporting findings.

- **`create-release-branch.ts`** (504 lines) -- Creates a new branch from
  `origin/{targetBranch}`, runs the changeset version command, creates a
  signed API commit (see `create-api-commit.ts`), links issues found in
  changeset files via GraphQL mutations, and opens a PR with standard labels.
  Includes retry logic with exponential backoff for API operations.

- **`update-release-branch.ts`** (835 lines) -- Recreates the branch from
  main rather than rebasing (avoids merge conflicts entirely). Collects linked
  issues from changesets BEFORE running the version command (since version
  consumes changesets). Creates an API commit with the main branch HEAD as
  parent (effectively rebasing onto main). Handles PR reopening if the branch
  was previously deleted.

### Phase 2: Release Validation

Triggers on push to the release branch. Creates all validation Check Runs
upfront for immediate visibility, then runs steps sequentially:

- **`link-issues-from-commits.ts`** (626 lines) -- Gets commits since the
  last release tag via `compareCommitsWithBasehead`. Extracts issue references
  using patterns like `closes #N`, `fixes #N`, `resolves #N`. Queries
  GraphQL for PR-linked issues (via `closingIssuesReferences`). Creates
  cross-reference comments on linked issues.

- **`validate-builds.ts`** (232 lines) -- Runs the build command (e.g.,
  `pnpm ci:build`). Parses stdout and stderr for TypeScript errors
  (`TS\d{4}:` pattern) and generic error patterns. Creates a Check Run with
  annotations (capped at 50 per GitHub API limit).

- **`validate-publish.ts`** (360 lines) -- Multi-registry dry-run validation
  for each package. For each package: resolves publish targets via
  `resolveTargets()`, sets up authentication via `setupRegistryAuth()`,
  pre-validates (directory exists, `package.json` present) via
  `preValidateTarget()`, then runs `dryRunPublish()`. Version conflicts
  (package already published at that version) are treated as non-errors.
  Handles version-only packages that have no publish targets.

- **`generate-release-notes-preview.ts`** (460 lines) -- Extracts the latest
  version section from each package's `CHANGELOG.md` file. Creates a Check
  Run with a formatted preview of all pending release notes.

- **`generate-sbom-preview.ts`** (471 lines) -- Generates Software Bill of
  Materials previews for each package. Validates NTIA compliance via
  `validate-ntia-compliance.ts`. Creates a Check Run with SBOM details.

- **`create-validation-check.ts`** (128 lines) -- Creates a unified Check Run
  aggregating results from all validation steps into a single status table.

- **`update-sticky-comment.ts`** (120 lines) -- Posts or updates a PR comment
  using the `<!-- sticky-comment-id: release-validation -->` HTML marker for
  idempotent updates. Contains validation results table, publish summary,
  version-only package list, and release notes preview link.

- **`cleanup-validation-checks.ts`** (151 lines) -- On workflow failure, marks
  any incomplete Check Runs as failed with the error message. Prevents
  orphaned "in progress" checks.

### Phase 3: Release Publishing

Triggers on merge of the release PR to main. Creates publishing Check Runs
upfront, then runs steps sequentially:

- **`detect-released-packages.ts`** (303 lines) -- Two detection strategies:
  1. **From PR**: Gets files changed in the merged PR via `pulls.listFiles`,
     reads old and new `package.json` versions from the PR diff.
  2. **From commit**: Compares `HEAD~1` with `HEAD` to find version changes.
  Infers bump type (major, minor, patch) from version comparison.

- **`publish-packages.ts`** (756 lines) -- The core publishing engine.
  Pre-validates ALL targets across ALL packages before publishing any single
  package (fail-early strategy). Sorts packages in topological order via
  `topological-sort.ts`. For each package, resolves targets, sets up auth,
  builds, and calls `publishToTarget()`. Collects results including tarball
  paths, provenance URLs, and attestation details.

- **`publish-target.ts`** (776 lines) -- Handles publishing a single package
  to a single registry. Packs the tarball (`npm pack`), verifies tarball
  integrity via SHA-512 hash, uploads to the registry. Supports four registry
  types:
  - **npm** (npmjs.org): OIDC trusted publishing or token-based auth
  - **JSR** (jsr.io): OIDC trusted publishing via `jsr publish`
  - **GitHub Packages**: GitHub App token auth
  - **Custom registries**: Token from `custom-registries` input

- **`determine-tag-strategy.ts`** (215 lines) -- Decides between single-tag
  (`v1.0.0`) for single-package repos or fixed versioning groups, and
  per-package tags (`@scope/pkg@1.0.0`) for independent versioning in
  monorepos. Also determines the overall release type (major, minor, patch)
  from changeset bump types.

- **`create-github-releases.ts`** (761 lines) -- Creates GitHub releases for
  each tag. Extracts release notes from `CHANGELOG.md` files. Uploads tarball
  assets from the publish step. Creates attestations (provenance, SBOM,
  per-asset) via `create-attestation.ts`.

- **`create-attestation.ts`** (1,180 lines) -- Generates npm provenance
  attestations and CycloneDX SBOM attestations via the GitHub Attestations
  API (`@actions/attest`). Enhances SBOM metadata via
  `enhance-sbom-metadata.ts`. The largest single module in the codebase.

- **`generate-publish-summary.ts`** (1,055 lines) -- Generates detailed
  markdown summaries for publish results. Three summary types: normal
  publish results, pre-validation failure summaries, and build failure
  summaries. Used for both Check Run output and job summary.

### Phase 3a: Issue Closing

- **`close-linked-issues.ts`** (265 lines) -- Queries the merged PR's
  `closingIssuesReferences` via GraphQL (up to 50 issues). For each linked
  issue, posts a comment noting the release and closes the issue. Creates a
  Check Run summarizing results.

- **`run-close-linked-issues.ts`** (48 lines) -- Thin wrapper that calls
  `closeLinkedIssues()` and sets action outputs (`closed_issues_count`,
  `failed_issues_count`, `closed_issues`).

### Module Dependency Graph

Key dependency flows between modules:

```text
main.ts
  |
  +-- detect-workflow-phase.ts (routing)
  |
  +-- Phase 1 chain:
  |     detect-publishable-changes.ts
  |       +-- get-changeset-status.ts
  |       +-- find-package-path.ts
  |       +-- release-summary-helpers.ts
  |     check-release-branch.ts
  |     create-release-branch.ts
  |       +-- create-api-commit.ts
  |       +-- parse-changesets.ts
  |     update-release-branch.ts
  |       +-- create-api-commit.ts
  |       +-- parse-changesets.ts
  |
  +-- Phase 2 chain:
  |     link-issues-from-commits.ts
  |     validate-builds.ts
  |     validate-publish.ts
  |       +-- resolve-targets.ts
  |       +-- registry-auth.ts
  |       +-- pre-validate-target.ts
  |       +-- dry-run-publish.ts
  |       +-- registry-utils.ts
  |     generate-release-notes-preview.ts
  |     generate-sbom-preview.ts
  |       +-- infer-sbom-metadata.ts
  |       +-- validate-ntia-compliance.ts
  |     create-validation-check.ts
  |     update-sticky-comment.ts
  |     cleanup-validation-checks.ts
  |
  +-- Phase 3 chain:
  |     detect-released-packages.ts
  |       +-- find-package-path.ts
  |     publish-packages.ts
  |       +-- topological-sort.ts
  |       +-- resolve-targets.ts
  |       +-- registry-auth.ts
  |       +-- publish-target.ts
  |       +-- pre-validate-target.ts
  |       +-- load-release-config.ts
  |     determine-tag-strategy.ts
  |       +-- release-summary-helpers.ts
  |     create-github-releases.ts
  |       +-- create-attestation.ts
  |       +-- enhance-sbom-metadata.ts
  |     generate-publish-summary.ts
  |     close-linked-issues.ts
  |
  +-- Cross-cutting:
        create-api-commit.ts (Phase 1: create/update branch)
        registry-auth.ts (Phase 2: validate, Phase 3: publish)
        registry-utils.ts (Phase 2: validate, Phase 3: publish)
        resolve-targets.ts (Phase 2: validate, Phase 3: publish)
        find-package-path.ts (Phase 1: detect, Phase 3: detect)
        release-summary-helpers.ts (Phase 1: detect, Phase 3: tags)
        logger.ts (all phases)
        summary-writer.ts (all phases)
```

### Shared Infrastructure

- **`logger.ts`** (162 lines) -- Structured workflow logging using emoji-based
  state indicators and phase markers. Provides methods for phase headers,
  step groups (wrapping `@actions/core` startGroup/endGroup), context
  logging, success/warning/error messages, and skip/no-action messages.
  All methods are constants on a frozen object.

- **`summary-writer.ts`** (125 lines) -- Type-safe markdown generation using
  the `ts-markdown` library. Provides methods for tables, key-value tables,
  bulleted lists, headings, code blocks, sections, and multi-section document
  building. Writes to the GitHub Actions job summary.

- **`topological-sort.ts`** (150 lines) -- Implements Kahn's algorithm for
  sorting packages in dependency order. Uses `workspace-tools` to build the
  dependency graph. Returns sorted package names with dependencies first,
  or reports circular dependency errors.

- **`create-api-commit.ts`** (326 lines) -- Creates Git commits via the
  GitHub REST API (blob, tree, commit, ref update). Produces automatically
  GPG-signed commits when authenticated as a GitHub App. Handles file
  additions, modifications, and deletions. Used by both
  `create-release-branch.ts` and `update-release-branch.ts`.

- **`create-app-token.ts`** (211 lines) -- Generates GitHub App installation
  tokens using `@octokit/auth-app`. Supports scoped permissions. Exports
  `isTokenExpired()` and `revokeAppToken()` for post-action cleanup.

- **`check-token-permissions.ts`** (105 lines) -- Detects token type
  (GitHub App, fine-grained PAT, classic PAT, GITHUB_TOKEN) by inspecting
  the token prefix and querying the API. Logs diagnostic information about
  the authenticated identity.

- **`find-package-path.ts`** (106 lines) -- Resolves package names to
  filesystem paths using `workspace-tools`. Caches the workspace map to
  avoid repeated filesystem operations across multiple lookups.

- **`detect-repo-type.ts`** (289 lines) -- Detects whether the repository is
  a monorepo or single-package repo. Auto-detects the package manager from
  the `packageManager` field in `package.json` or lockfile presence
  (`pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, `package-lock.json`). Reads
  changeset configuration for ignore patterns and private package handling.

- **`parse-changesets.ts`** (246 lines) -- Parses changeset YAML frontmatter
  from `.changeset/*.md` files. Extracts package names, bump types, and
  summary descriptions. Used during branch creation to link issues.

- **`release-summary-helpers.ts`** (282 lines) -- Package discovery and
  workspace analysis utilities. Provides changeset config reading
  (fixed/linked groups), workspace package info retrieval, and package
  group classification.

- **`registry-utils.ts`** (149 lines) -- Registry URL utilities including
  display name generation, package view URL construction, npm registry
  detection, and GitHub Packages registry detection.

- **`resolve-targets.ts`** (208 lines) -- Reads `publishConfig` from each
  package's `package.json` and resolves it into a list of `ResolvedTarget`
  objects (one per registry). Handles npm, JSR, GitHub Packages, and custom
  registries. Maps registry URLs to environment variable names for auth.

- **`registry-auth.ts`** (523 lines) -- Sets up authentication for each
  registry type. Creates/modifies `.npmrc` files with auth tokens. Supports
  OIDC token exchange for npm and JSR, GitHub App token for GitHub Packages,
  and explicit tokens for custom registries. Validates registry availability
  with health checks (10-second timeout).

- **`pre-validate-target.ts`** (238 lines) -- Pre-publication validation for
  a single target. Checks that the package directory exists, `package.json`
  is present and parseable, the version field exists, and the tarball can
  be created.

- **`dry-run-publish.ts`** (217 lines) -- Executes `npm publish --dry-run`
  against each target registry. Parses output for errors vs. warnings.
  Treats "version already published" as a non-error (idempotent).

- **`load-release-config.ts`** (377 lines) -- Loads release configuration
  from the SBOM config input, environment variables, and package-level
  settings. Merges supplier, copyright, and license metadata for SBOM
  generation.

- **`infer-sbom-metadata.ts`** (289 lines) -- Infers SBOM metadata from
  `package.json` fields (license, author, repository, homepage). Falls back
  to repository-level defaults when package-level metadata is incomplete.

- **`validate-ntia-compliance.ts`** (256 lines) -- Validates that generated
  SBOMs meet NTIA (National Telecommunications and Information
  Administration) minimum elements for software transparency.

- **`enhance-sbom-metadata.ts`** (247 lines) -- Enriches CycloneDX SBOM
  documents with supplier information, copyright notices, and lifecycle
  metadata from the release configuration.

- **`detect-copyright-year.ts`** (142 lines) -- Detects copyright year ranges
  from LICENSE files, existing copyright notices, and Git history. Used by
  SBOM metadata generation.

### Type System

- **`types/publish-config.ts`** (334 lines) -- Comprehensive type definitions
  for the multi-registry publishing system: `PublishTarget`,
  `ResolvedTarget`, `PublishResult`, `PackagePublishValidation`,
  `AuthSetupResult`, `PrePackedTarball`, and related types.

- **`types/shared-types.ts`** (69 lines) -- Shared interfaces used across
  modules: `ValidationResult` and `PackageValidationResult`.

- **`types/sbom-config.ts`** (328 lines) -- Type definitions for SBOM
  configuration: `SBOMConfig`, `EnhancedCycloneDXDocument`, NTIA compliance
  types, and supplier/copyright metadata types.

- **`types/global.d.ts`** (7 lines) -- Global type augmentations for the
  Vitest testing globals.

## Rationale

### Why Three Phases?

The three-phase approach separates concerns by execution context:

1. **Branch management** runs on every push to main. It is fast (no builds)
   and creates/updates the release PR as a staging area.
2. **Validation** runs on the release branch. Build compilation, dry-run
   publishing, and SBOM generation can be slow without blocking pushes to
   main. The release PR provides a visible gate for review.
3. **Publishing** only runs after the release PR is merged. This gating
   ensures human approval before packages reach registries.

This separation also means that validation failures never block development
on main, and publishing failures are isolated from the validation context.

### Why API Commits?

Using the GitHub REST API to create commits (blob, tree, commit, ref update)
instead of `git push` provides several benefits:

- **Automatic GPG signing**: Commits created by a GitHub App are
  automatically signed and marked as "verified" in the GitHub UI.
- **Atomic operations**: Branch creation and commit happen as API calls,
  avoiding race conditions with concurrent pushes.
- **No git credentials on runner**: The runner never needs git push
  access -- only the API token is used.
- **DCO compliance**: The commit message can include a
  `Signed-off-by` footer for Developer Certificate of Origin compliance.

### Why Recreate vs Rebase?

The `update-release-branch.ts` module recreates the release branch from main
instead of performing a `git rebase`:

- **Avoids merge conflicts entirely**: The release branch contains only
  machine-generated changes (changeset version bumps and CHANGELOG updates).
  There is never a reason to preserve manual commits on it.
- **Simpler error handling**: Rebase can fail partway through, leaving the
  branch in a broken state. Recreation is atomic -- it either succeeds
  completely or fails without side effects.
- **Deterministic output**: The branch always reflects the current state of
  main plus the version command output. No accumulated history.

### Why Pre-validate All Targets?

The `publish-packages.ts` module pre-validates ALL targets across ALL packages
before publishing any single package. This prevents partial publishes where
some packages succeed and others fail, leaving registries in an inconsistent
state. For monorepos with inter-package dependencies, a partial publish could
mean dependent packages reference versions that do not exist on some
registries.

### Why Topological Sorting?

Packages are published in dependency order (dependencies before dependents)
so that registries like JSR and npm can resolve inter-package dependencies
at publish time. Without topological sorting, a package referencing
`@org/dep@2.0.0` could be published before `@org/dep@2.0.0` exists on the
registry, causing the publish to fail or the package to be installed with
a stale dependency.

## Key Design Patterns

### State Management

GitHub Actions state (`core.saveState()` / `core.getState()`) passes data
between the `pre`, `main`, and `post` lifecycle hooks within a single action
run. State is stored as strings and includes:

- `token` -- The generated GitHub App installation token
- `expiresAt` -- Token expiration time (ISO 8601)
- `installationId` -- GitHub App installation ID
- `appSlug` -- GitHub App URL-friendly name
- `skipTokenRevoke` -- Whether to skip token revocation
- `tokenType`, `tokenLogin`, `appName` -- Token identity metadata
- `packageManager` -- Auto-detected package manager
- `githubToken` -- Optional fallback token for GitHub Packages

### Error Handling Strategy

Errors are handled differently depending on the execution context:

- **Pre-action**: Fatal. Calls `setFailed()` immediately because the token is
  required for all subsequent operations.
- **Post-action**: Non-fatal. Emits `warning()` so that token revocation
  failures never fail the overall workflow.
- **Phase handlers**: Each phase wraps its execution in try/catch. On failure,
  incomplete Check Runs are cleaned up via `cleanupValidationChecks()`, then
  `setFailed()` is called with context about which phase failed.
- **Network operations**: Retry logic with exponential backoff for transient
  API failures. The release commit detection retries 3 times with 5-second
  delays.
- **Non-critical operations**: Sticky comment updates and issue closing use
  try/catch with warnings. Their failure does not fail the workflow since the
  primary operations (validation or publishing) already succeeded.

### GitHub API Usage

The action uses three GitHub API communication patterns:

- **REST API** (`octokit.rest.*`): Standard CRUD operations -- Check Runs,
  branch queries, PR listing, file comparisons, release creation, asset
  uploads.
- **GraphQL API**: Complex queries requiring nested data that REST cannot
  efficiently provide. Used for `closingIssuesReferences` on PRs (linked
  issues) and branch protection mutations.
- **Check Runs**: Primary CI feedback mechanism. Each validation step and
  publishing step creates a Check Run with structured output (title, summary,
  annotations). Check Runs are created upfront in "queued" status and updated
  as steps progress, giving immediate visibility in the PR UI.
- **Attestations**: `@actions/attest` library for npm provenance (Sigstore
  SLSA) and CycloneDX SBOM attestations via the GitHub Attestations API.

### Dry-Run Mode

When `dry-run: true` is set, the action executes a parallel path that
validates without mutations:

- Package manager commands run with `--dry-run` flags
- Git branch and commit operations are skipped
- Check Run names are prefixed with the test tube emoji
- Registry publish commands use `npm publish --dry-run`
- Output and summaries are clearly marked as dry-run results
- All validation logic runs identically to production mode

This allows testing the full workflow without creating branches, PRs, tags,
releases, or publishing to any registry.

## File Reference

| File | Lines | Description |
| :--- | ----: | :---------- |
| `src/pre.ts` | 79 | Pre-action: GitHub App token generation and permission validation |
| `src/main.ts` | 1,043 | Main orchestrator: phase detection and routing |
| `src/post.ts` | 50 | Post-action: token revocation and cleanup |
| `src/types/global.d.ts` | 7 | Global type augmentations for Vitest |
| `src/types/shared-types.ts` | 69 | ValidationResult and PackageValidationResult interfaces |
| `src/types/publish-config.ts` | 334 | Multi-registry publishing type definitions |
| `src/types/sbom-config.ts` | 328 | SBOM configuration and CycloneDX types |
| `src/utils/check-release-branch.ts` | 158 | Check if release branch and PR exist |
| `src/utils/check-token-permissions.ts` | 105 | Token type detection and diagnostic logging |
| `src/utils/cleanup-validation-checks.ts` | 151 | Mark incomplete Check Runs as failed on error |
| `src/utils/close-linked-issues.ts` | 265 | Close issues linked to merged release PR |
| `src/utils/create-api-commit.ts` | 326 | GitHub API commits (auto-signed by App) |
| `src/utils/create-app-token.ts` | 211 | GitHub App installation token generation |
| `src/utils/create-attestation.ts` | 1,180 | npm provenance and CycloneDX SBOM attestations |
| `src/utils/create-github-releases.ts` | 761 | GitHub releases with tarball assets and attestations |
| `src/utils/create-release-branch.ts` | 504 | Create release branch, version, commit, and PR |
| `src/utils/create-validation-check.ts` | 128 | Unified Check Run aggregating all validations |
| `src/utils/detect-copyright-year.ts` | 142 | Copyright year detection from LICENSE/git history |
| `src/utils/detect-publishable-changes.ts` | 467 | Changeset detection and package discovery |
| `src/utils/detect-released-packages.ts` | 303 | Detect version bumps from PR diff or commit |
| `src/utils/detect-repo-type.ts` | 289 | Monorepo/single-repo and package manager detection |
| `src/utils/detect-workflow-phase.ts` | 411 | Phase routing based on GitHub event context |
| `src/utils/determine-tag-strategy.ts` | 215 | Single vs per-package tag strategy selection |
| `src/utils/dry-run-publish.ts` | 217 | Dry-run publish validation per registry |
| `src/utils/enhance-sbom-metadata.ts` | 247 | Enrich CycloneDX SBOMs with supplier/copyright |
| `src/utils/find-package-path.ts` | 106 | Workspace package path resolution with caching |
| `src/utils/generate-publish-summary.ts` | 1,055 | Markdown summaries for publish results |
| `src/utils/generate-release-notes-preview.ts` | 460 | CHANGELOG extraction and preview Check Run |
| `src/utils/generate-sbom-preview.ts` | 471 | SBOM preview generation and NTIA validation |
| `src/utils/get-changeset-status.ts` | 236 | Changeset status with merge-base fallback |
| `src/utils/infer-sbom-metadata.ts` | 289 | Infer SBOM metadata from package.json fields |
| `src/utils/link-issues-from-commits.ts` | 626 | Extract and cross-reference issues from commits |
| `src/utils/load-release-config.ts` | 377 | Load SBOM/release config from inputs and env |
| `src/utils/logger.ts` | 162 | Structured emoji-based workflow logging |
| `src/utils/parse-changesets.ts` | 246 | Changeset YAML frontmatter parsing |
| `src/utils/pre-validate-target.ts` | 238 | Pre-publication target validation |
| `src/utils/publish-packages.ts` | 756 | Core publishing engine with topological sort |
| `src/utils/publish-target.ts` | 776 | Single-package single-registry publish handler |
| `src/utils/registry-auth.ts` | 523 | Multi-registry auth setup (OIDC, token, .npmrc) |
| `src/utils/registry-utils.ts` | 149 | Registry URL utilities and display helpers |
| `src/utils/release-summary-helpers.ts` | 282 | Package discovery and workspace analysis |
| `src/utils/resolve-targets.ts` | 208 | publishConfig to ResolvedTarget resolution |
| `src/utils/run-close-linked-issues.ts` | 48 | Thin wrapper for close-linked-issues |
| `src/utils/summary-writer.ts` | 125 | Type-safe markdown via ts-markdown |
| `src/utils/topological-sort.ts` | 150 | Kahn's algorithm for dependency ordering |
| `src/utils/update-release-branch.ts` | 835 | Recreate release branch from main |
| `src/utils/update-sticky-comment.ts` | 120 | Idempotent PR comment management |
| `src/utils/validate-builds.ts` | 232 | Build validation with error annotation |
| `src/utils/validate-ntia-compliance.ts` | 256 | NTIA minimum elements SBOM validation |
| `src/utils/validate-publish.ts` | 360 | Multi-registry dry-run publish validation |
