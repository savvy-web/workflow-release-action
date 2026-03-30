# silk-router Design Specification

## Overview

`savvy-web/silk-router` is a composable GitHub Action that serves as the entry point
for the Silk deployment pipeline. It inspects the GitHub event context, repository
state, and changeset configuration to determine which phase of the release pipeline
should execute next, and computes a structured release plan that downstream actions
can consume without re-deriving.

This is the first action in the Silk rebrand and Effect-TS migration. It replaces
`savvy-web/workflow-control-action` and extracts release plan computation logic from
`savvy-web/workflow-release-action`.

## Context

### Current System

The existing `workflow-control-action` is a ~4-file plain TypeScript action that
detects the workflow phase and does basic changeset file counting. It uses manual
YAML frontmatter regex parsing for changesets and `@actions/core`/`@actions/github`
directly. The release plan computation (target resolution, tag strategy, publishable
package detection) happens later in `workflow-release-action`, duplicating workspace
discovery and changeset analysis.

### Problem

1. Phase detection and release plan computation are split across two actions with
   duplicated work (both scan changesets, both read workspace structure).
2. Downstream actions re-derive information the router could have computed once.
3. The current code is untestable without module-level mocking of `@actions/core`.
4. Target resolution logic in `workflow-release-action` is tightly coupled to the
   publish phase, but the information is useful at routing time.

### Solution

Consolidate phase detection and release plan computation into a single Effect-TS
action with composable service layers. The router computes everything knowable from
the filesystem at detection time and emits a structured release plan as JSON output.
Downstream actions consume this plan rather than re-computing it.

## Architecture

### Three-Layer Model (Silk System)

silk-router is one piece of a larger decomposition:

**Layer 1: Effect Libraries** (npm packages, no GitHub Actions dependency)

- `@savvy-web/github-action-effects` -- GitHub API services, runtime, caching
- `workspaces-effect` -- workspace detection, package discovery, dependency graphs
- `@changesets/*` packages -- changeset reading and release plan assembly
- Future: `@savvy-web/squashsets` -- changeset parsing/formatting

**Layer 2: Composable Actions** (separate repos, thin Effect wrappers)

- `savvy-web/silk-router` -- phase detection + release plan computation (this spec)
- `savvy-web/silk-branch-action` -- release branch + PR lifecycle management
- `savvy-web/silk-publish-action` -- multi-registry npm publishing + provenance
- `savvy-web/silk-release-action` -- GitHub Releases + attestations + SBOM

**Layer 3: Reusable Workflows** (in `savvy-web/.github`)

- `silk-release.yml` -- dispatcher (replaces `release.yml`)
- `silk-branch.yml`, `silk-validate.yml`, `silk-publish.yml` -- phase pipelines

### Migration Strategy

- New `silk-*` repos coexist with existing `workflow-*` repos
- The `workflow-*` actions continue operating on `main` undisturbed
- Consumer repos migrate by changing one `uses:` line in their release workflow
- Each silk action can be tested independently via the dev branch pipeline

## Action Interface

### Inputs

| Input | Required | Default | Description |
| ----- | -------- | ------- | ----------- |
| `app-id` | Yes | - | GitHub App ID for token generation |
| `app-private-key` | Yes | - | GitHub App private key (PEM) |
| `target-branch` | No | `main` | The trunk branch |
| `release-branch` | No | `changeset-release/main` | The release PR branch |

The action uses GitHub App authentication rather than the default `GITHUB_TOKEN`.
App tokens provide better rate limits, clearer audit trails in the git history,
and bot-attributed API calls. The token is generated at the start of the main
step, saved to action state, and revoked in the post step.

### Outputs

| Output | Type | Description |
| ------ | ---- | ----------- |
| `next-phase` | string | Which silk action runs next |
| `reason` | string | Human-readable explanation for logs/summaries |
| `release-plan` | JSON string | Full release plan (see schema below) |
| `trigger` | JSON string | Event context for downstream actions |

#### `next-phase` Values

| Value | Meaning |
| ----- | ------- |
| `silk-branch` | Create or update release branch and PR |
| `silk-validate` | Run validation checks on open PR |
| `silk-publish` | Publish packages to registries |
| `silk-release` | Create GitHub Releases + attestations |
| `close-issues` | Close linked issues from merged release PR |
| `skip` | No action needed |

#### `release-plan` Schema

```json
{
  "releases": [
    {
      "workspace": "@savvy-web/foobar",
      "path": "packages/foo",
      "type": "minor",
      "oldVersion": "1.2.0",
      "newVersion": "1.3.0",
      "registries": [
        {
          "as": "foobar",
          "source": "packages/foo/dist/npm",
          "registry": {
            "id": "npm",
            "name": "npm",
            "protocol": "npm",
            "params": {
              "registry": "https://registry.npmjs.org",
              "provenance": true
            },
            "artifacts": []
          }
        },
        {
          "as": "@savvy-web/foobar",
          "source": "packages/foo/dist/github",
          "registry": {
            "id": "github",
            "name": "GitHub Packages",
            "protocol": "npm",
            "params": {
              "registry": "https://npm.pkg.github.com",
              "provenance": true
            },
            "artifacts": []
          }
        },
        {
          "as": "@savvy-web/foobar",
          "source": "packages/foo/dist/github",
          "registry": {
            "id": "jsr",
            "name": "JSR",
            "protocol": "jsr",
            "params": {},
            "artifacts": []
          }
        }
      ]
    }
  ],
  "tagStrategy": "scoped",
  "changesetCount": 3,
  "bump": "minor"
}
```

Key design points:

- **`workspace`**: The workspace-internal package name (from package.json `name`)
- **`as`**: The published name per registry (may differ -- unscoped on npm, scoped on
  GitHub Packages/JSR)
- **`source`**: Build output directory to publish from (different builds produce
  different outputs for different targets)
- **`registry.protocol`**: Discriminates parameter shapes (`npm`, `jsr`, future `cargo`)
- **`registry.params`**: Protocol-specific configuration
- **`registry.artifacts`**: Empty at router time, populated by downstream publish/release
  actions as the plan flows through the pipeline
- **`tagStrategy`**: `"single"` (one semver tag) or `"scoped"` (package@semver per
  release). Resolved from workspace structure + changeset config + publishConfig
  interaction. Logic extracted from existing `determine-tag-strategy.ts`.

This schema represents what `workflow-release-action` already computes today across
`resolve-targets.ts`, `publish-packages.ts`, `detect-publishable-changes.ts`, and
`determine-tag-strategy.ts`. The extraction consolidates scattered logic into a
single structured output.

#### `trigger` Schema

```json
{
  "event": "push",
  "branch": "main",
  "pr_number": 0,
  "is_merged": false,
  "sha": "abc123"
}
```

## Effect Service Architecture

### Services

```text
GitHubEventContext        Reads GITHUB_* env vars and event payload
PullRequestDetector       Queries API for associated PRs, release commit detection
ChangesetReader           Reads .changeset/ using @changesets/read and
                          @changesets/config programmatically (no CLI).
                          Optional: absent .changeset/ dir means "no changesets"
ReleasePlanAssembler      Computes full release plan using @changesets/assemble-release-plan
                          + workspace discovery + target resolution.
                          Handles three modes: Silk changesets, standard changesets,
                          no changesets (version-only from package.json)
PublishabilityDetector    From workspaces-effect, with Silk layer swap for
                          publishConfig.targets resolution
TargetResolver            Resolves per-package publish targets (name, source dir,
                          registry, protocol, params) from publishConfig.targets
                          interaction with workspace and changeset config
TagStrategyResolver       Determines single vs scoped tag strategy from workspace
                          structure + changeset config + publishConfig
PhaseResolver             Pure decision logic: context + PR state + changesets -> phase
SummaryWriter             Job summary markdown and GitHub Actions job summary
```

### Layer Composition

```typescript
// Main step layer
AppLayer = Layer.mergeAll(
  // From @savvy-web/github-action-effects
  GitHubClientLive,         // REST/GraphQL via Octokit
  GitHubAppLive,            // App token generation + revocation

  // From workspaces-effect
  WorkspacesLive,           // workspace root, PM detection, package discovery
  PublishabilityDetectorLive, // swapped to SilkPublishabilityDetectorLive
                              // when publishConfig.targets is detected

  // Domain services (new, in this action)
  GitHubEventContextLive,
  PullRequestDetectorLive,
  ChangesetReaderLive,
  ReleasePlanAssemblerLive,
  TargetResolverLive,
  TagStrategyResolverLive,
  PhaseResolverLive,
  SummaryWriterLive,
)

// Post step layer (minimal -- just token revocation)
PostLayer = Layer.mergeAll(
  GitHubAppLive,
)
```

Note: No `CommandRunnerLive` or `ActionCacheLive` needed. The router only
requires checkout (handled by the workflow) and reads from the filesystem
and GitHub API. No caching -- the action is fast and stateless.

### Token Lifecycle

The main step uses `GitHubApp.withToken` from `github-action-effects`:

1. Read `app-id` and `app-private-key` via `Config` API
2. `GitHubApp.generateToken(appId, privateKey)` creates an
   installation token
3. Token is saved to `ActionState` for the post step
4. `GitHubClientLive` is provided with the generated token
5. On main step completion (success or failure), control passes to
   the post step
6. Post step reads token from `ActionState`, calls
   `GitHubApp.revokeToken` unconditionally
7. Revocation errors are logged as warnings, never failures

This follows the same pattern as `workflow-release-action`'s current
`pre.ts`/`post.ts` and `pnpm-config-dependency-action`'s
`GitHubApp.withToken` usage, but consolidated into `main`/`post`
(no pre step needed since the router does nothing before token
generation).

The Silk layer swap for `PublishabilityDetector` is determined at startup in
`layers/app.ts`. The `makeAppLayer` function reads the root (or first workspace)
`package.json`, checks for the presence of `publishConfig.targets`. If found, it
provides `SilkPublishabilityDetectorLive` (which understands the targets array). If
absent, it provides the default `PublishabilityDetectorLive` from `workspaces-effect`
(single-target behavior). This detection runs once at layer construction time, not
per-package.

### Entry Points

```text
src/main.ts      Main step: generates GitHub App token, saves to state,
                 runs detection pipeline, sets outputs, writes job summary.
                 Bootstrap via Action.run(program, { layer: AppLayer }).

src/post.ts      Post step: reads token from ActionState, revokes it via
                 GitHubApp.revokeToken. Runs unconditionally (even after
                 fatal errors in main). Revocation failures are warnings,
                 never failures.

src/program.ts   The actual detection and plan computation logic. Fully
                 testable via layer substitution.
```

### Source Structure

```text
src/
  main.ts
  post.ts
  program.ts
  layers/
    app.ts                    AppLayer composition + Silk detection
  services/
    github-event-context.ts   GitHubEventContext service + live layer
    pull-request-detector.ts  PullRequestDetector service + live layer
    changeset-reader.ts       ChangesetReader service + live layer
    release-plan-assembler.ts ReleasePlanAssembler service + live layer
    target-resolver.ts        TargetResolver service + live layer (extracted from
                              workflow-release-action resolve-targets.ts)
    tag-strategy-resolver.ts  TagStrategyResolver service + live layer (extracted
                              from workflow-release-action determine-tag-strategy.ts)
    phase-resolver.ts         PhaseResolver service + live layer
    summary-writer.ts         SummaryWriter service + live layer
  schemas/
    release-plan.ts           Effect Schema for the release plan JSON output
    trigger.ts                Effect Schema for the trigger JSON output
    phase.ts                  Schema.Literal for next-phase enum
    registry.ts               Registry, protocol, params discriminated union
  errors/
    errors.ts                 Schema.TaggedError definitions
```

## Phase Detection Logic

Priority order (preserved from current `workflow-control-action`):

1. PR event + release PR merged -> `close-issues`
2. PR event + release PR open -> `silk-validate`
3. Push to target branch + commit from merged release PR -> `silk-publish` or
   `silk-release` (determined by release plan: if publishable packages exist,
   `silk-publish`; if only GitHub Releases needed, `silk-release`)
4. Push to release branch -> `silk-validate`
5. Push to target branch + not a release commit -> `silk-branch`
6. Everything else -> `skip`

### Release Commit Detection

The current `workflow-release-action` uses a two-strategy detection with
retry for push-to-main events (GitHub API eventual consistency).
Strategy 1: query `listPullRequestsAssociatedWithCommit`. Strategy 2:
query closed PRs with `merge_commit_sha` match.

Commit message pattern matching has proven unreliable, especially during
auto-merge scenarios where GitHub's event propagation can lag. The router must
not fall back to pattern matching. Instead, it retries the API-based detection
with exponential backoff and fails hard if the phase cannot be determined:

```typescript
const isReleaseCommit = yield* PullRequestDetector.isReleaseCommit(sha).pipe(
  Effect.retry(
    Schedule.exponential("2 seconds").pipe(
      Schedule.compose(Schedule.recurs(5)),
      Schedule.union(Schedule.spaced("3 seconds"))
    )
  ),
  // No fallback to commit message matching -- fail if API cannot resolve
  Effect.mapError(() => new PhaseDetectionError({
    message: "Could not determine if commit is a release commit after retries",
    sha,
  }))
)
```

The retry schedule gives GitHub up to ~30 seconds to propagate event data,
which covers the worst auto-merge cases observed in production.

## Target Resolution

### What Gets Extracted

The following logic from `workflow-release-action` is extracted into silk-router
services:

| Source File | Lines | Extracted To |
| ----------- | ----- | ------------ |
| `resolve-targets.ts` | ~350L | `TargetResolver` service |
| `determine-tag-strategy.ts` | ~200L | `TagStrategyResolver` service |
| `detect-publishable-changes.ts` | ~250L (partial) | `ReleasePlanAssembler` service |
| `detect-repo-type.ts` | ~100L | Replaced by `workspaces-effect` |

### PublishabilityDetector Layer Swap

```text
Default (from workspaces-effect):
  Reads publishConfig.{access, registry, directory}
  Returns 0 or 1 PublishTarget per package

Silk (provided by silk-router when publishConfig.targets detected):
  Reads publishConfig.targets[]
  Resolves per-target: name (as), source directory, registry, protocol, params
  Returns N PublishTarget per package
  Understands npm, jsr protocols
  Resolves provenance per target
  Handles scoped/unscoped name transforms
```

### Tag Strategy Resolution

Extracted from `determine-tag-strategy.ts`. The resolution depends on:

- **Single-package repo**: Always `"single"` strategy (tag: `v1.2.3`)
- **Monorepo with one release**: `"single"` if the changeset config allows it
- **Monorepo with multiple releases**: `"scoped"` (tag: `@scope/name@1.2.3`)
- **Changeset config overrides**: `commit` and `tag` fields in `.changeset/config.json`

The existing logic handles all these cases. The extraction wraps it in an Effect
service with typed inputs and outputs.

## Changeset Integration

### Three Modes

The router handles repos at different levels of changeset adoption:

1. **Silk changesets** (`@savvy-web/changesets` in use): Full release plan with
   `@changesets/read` + `@changesets/assemble-release-plan`. The
   `@savvy-web/changesets/changelog` formatter is not consumed here -- the router
   only evaluates changesets, it does not generate changelogs. Changelog generation
   is the responsibility of the branch management and release actions.

2. **Standard changesets** (vanilla `@changesets/cli` config, no `@savvy-web`):
   Same `@changesets/*` programmatic API, same release plan computation. The only
   difference is that `@savvy-web`-specific changelog formatting is not expected.
   The release plan schema is identical.

3. **No changesets** (no `.changeset/` directory): The router still detects phase
   from the git/PR context. The `release-plan` output has `changesetCount: 0` and
   `releases` is populated from `package.json` version fields only (single-package
   repos) or empty (monorepos with no changeset tooling). A default GitHub Release
   can still be created from a version bump commit even without changesets.

### Programmatic API (No CLI)

silk-router uses `@changesets/*` packages directly instead of invoking the
`changeset` CLI:

```typescript
import readChangesets from "@changesets/read"
import readConfig from "@changesets/config"
import assembleReleasePlan from "@changesets/assemble-release-plan"
```

This eliminates the requirement for the changesets CLI to be installed on the
runner. The packages are bundled into `dist/main.js` by `github-action-builder`.

### ChangesetReader Service

```typescript
class ChangesetReader extends Context.Tag("silk-router/ChangesetReader")<
  ChangesetReader,
  {
    readonly read: (cwd: string) => Effect<ReadonlyArray<NewChangeset>, ChangesetReadError>
    readonly config: (cwd: string) => Effect<Option<Config>, ChangesetConfigError>
    readonly releasePlan: (cwd: string) => Effect<ReleasePlan, ReleasePlanError>
  }
>() {}
```

`config` returns `Option<Config>` -- `Option.none()` when no `.changeset/`
directory exists. The `ReleasePlanAssembler` uses this to select the appropriate
mode (changeset-driven vs version-only).

The live layer wraps the `@changesets/*` async APIs in `Effect.tryPromise`.
Test layers provide canned changeset data without filesystem access.

## Job Summary

The router writes a rich GitHub Actions job summary using `GithubMarkdown` from
`github-action-effects`. The summary serves as the primary human-readable output
of the routing decision.

### Summary Contents

- **Phase detected**: The `next-phase` value with the human-readable reason
- **Trigger context**: Event type, branch, PR number if applicable
- **Changeset summary** (when changesets present):
  - Count of changesets and highest bump type
  - Table of releases: package name, bump type, old version -> new version
- **Publish targets** (when Silk mode detected):
  - Per-package table of registries with published-as name, protocol, source dir
- **Tag strategy**: Single or scoped, with example tag format
- **Repository info**: Workspace type (single/monorepo), package manager, package count

The summary is written via `ActionOutputs.writeSummary()` which maps to
`$GITHUB_STEP_SUMMARY`. It renders as GitHub-flavored markdown directly in the
workflow run UI.

The `SummaryWriter` service is responsible for composing this output. It consumes
the same `ReleasePlan` schema that is emitted as the `release-plan` output, so the
human-readable summary and machine-readable output are always consistent.

## Testing Strategy

### Approach

All testing uses Effect layer substitution. No `vi.mock()` on any module. Each
service has a `*Test` layer that provides canned responses.

### Test Matrix

| Service | Test approach | Key scenarios |
| ------- | ------------ | ------------- |
| `PhaseResolver` | Pure function, no services needed | All 6 phase outcomes, edge cases |
| `ChangesetReader` | `FileSystem` test layer with fixture dirs | Silk changesets, standard changesets, no `.changeset/` dir, malformed files |
| `PullRequestDetector` | `GitHubClientTest` layer | PR found, not found, API retry |
| `TargetResolver` | Pure + `PublishabilityDetector` test layer | Single target, multi-target, scoped/unscoped names |
| `TagStrategyResolver` | Pure function | Single pkg, monorepo, config overrides |
| `ReleasePlanAssembler` | Composed test layers | Full plan assembly with fixtures |
| `ReleasePlanAssembler` (no changesets) | Composed test layers | Version-only plan from package.json |
| `program.ts` | Full test layer stack | Integration: event -> phase + release plan |

### Fixture Strategy

Changeset fixtures as directories with `.changeset/config.json` and `.changeset/*.md`
files. Package fixtures as `package.json` files with various `publishConfig` shapes
(no targets, single target, multi-target, scoped/unscoped).

## Logging

### Buffered Logging Pattern

The router uses the `ActionLogger.withBuffer` pattern from
`github-action-effects`, as established in `workflow-runtime-action`:

- **Normal mode**: `Effect.log` (Info level) produces clean,
  human-readable output organized into named log groups. Verbose
  details (API responses, full changeset contents, schema decode
  steps) are logged at `Effect.logDebug` and suppressed.
- **Debug mode** (`RUNNER_DEBUG=1`): All log levels pass through
  immediately, including debug output. This is toggled by re-running
  the workflow with debug logging enabled in GitHub Actions UI.
- **On failure**: The buffer is flushed before the error, giving the
  full diagnostic trail even in normal mode. This means users see
  clean output on success but full context on failure without needing
  to re-run with debug enabled.

### Log Groups

Each major step of the pipeline runs inside a named
`ActionLogger.group()`:

```text
Detect configuration       workspace type, PM, changeset mode
Read changesets            changeset count, bump type, release list
Resolve publish targets    per-package registry resolution
Compute release plan       assembled plan summary
Detect phase               event context, phase decision, reason
Write summary              job summary generation
```

## Local Testing with act

The action supports local testing via [nektos/act](https://github.com/nektos/act)
for fast iteration without pushing to GitHub. The bootstrap repo template
provides the `act` configuration, including:

- `.actrc` with runner image and default event settings
- Event payload fixtures for push-to-main, PR opened, PR merged
- Secret/variable injection via `.env` or `.secrets` files
- The `action.config.ts` `persistLocal` setting builds the action to
  `.github/actions/local/` which `act` can consume directly

This enables a tight local dev loop: edit source -> `pnpm build` ->
`act push` -> see routing output, without waiting for GitHub runners.

## Build System

Uses `@savvy-web/github-action-builder`:

- Two entry points: `src/main.ts` -> `dist/main.js`, `src/post.ts` ->
  `dist/post.js`
- All dependencies bundled (including `@changesets/*`,
  `workspaces-effect`)
- `action.yml` declares `runs.using: node24`, `runs.main: dist/main.js`,
  `runs.post: dist/post.js`
- `action.config.ts` configures both entries and enables minification

## What This Spec Does NOT Cover

- The reusable workflow changes (`silk-release.yml` etc.) -- separate spec
- The other silk actions (`silk-branch`, `silk-publish`, `silk-release`) -- separate specs
- Changes to `workspaces-effect` `PublishabilityDetector` -- the Silk layer is
  implemented in silk-router, not upstreamed to the library (yet)
- The `@savvy-web/squashsets` library extraction -- future work
- JSR protocol params definition -- to be designed when JSR publishing is implemented
