# Publish-chain Effect services — design

**Date:** 2026-05-16
**Status:** Approved — ready for implementation planning

## Problem

The release action's three-phase workflow is half-migrated to Effect. The
entry points (`pre.ts`/`main.ts`/`post.ts`) and the Phase-1 modules are
Effect-based; the Phase-2/3 publish chain — 21 modules, ~12,500 lines — is
still plain imperative `async` functions that call `src/utils/_actions-compat.ts`,
a hand-rolled shim reimplementing the `@actions/core`/`exec`/`github` surface.
`main.ts` reaches the chain through 7 dynamic `import()` seams.

The shim exists only because the migration is incomplete. Worse, an inventory
of `@savvy-web/github-action-effects` 1.1.1 and `workspaces-effect` shows a
large fraction of the publish chain *reimplements capabilities those libraries
now provide* — topological sort, changeset analysis, npm registry queries,
package publishing, workspace discovery, publishability detection.

We want to finish the migration: turn the publish chain into a small set of
proper Effect services + layers (the model is the existing `src/services/attest/`
service), reusing the ecosystem instead of rebuilding it, and delete the shim.

## Decisions

1. **Service-oriented, library-grade.** The publish chain becomes a small set
   of Effect services under `src/services/publish/`, each a `Context.Tag` +
   `Live` layer + `Test` layer + `index.ts` barrel, with `Data.TaggedError`
   errors — matching `src/services/attest/` exactly. Service interfaces carry
   no repo-specific coupling, so they can be upstreamed to
   `@savvy-web/github-action-effects` later (this repo dogfoods them first).
2. **Maximal reuse — do not rebuild what the ecosystem provides.** Adopt the
   library and `workspaces-effect` services for every commodity capability;
   copy the silk-specific pieces from the sibling `pnpm-config-dependency-action`
   repo; build only the genuinely action-specific orchestration.
3. **Adopt `PackagePublish` fully.** Delete `publish-target.ts`; the `Publish`
   orchestration service composes `PackagePublish` (`setupAuth`/`pack`/`publish`/
   `verifyIntegrity`) directly. Maximal dogfooding of the library on the real
   publish path.
4. **Idempotency becomes orchestration policy.** The re-run safety currently
   inside `publish-target.ts` (skip already-published-identical, fail on
   content mismatch, pack on demand) relocates to the `Publish` service as
   explicit policy, composed from `NpmRegistry.getVersions` +
   `PackagePublish.verifyIntegrity`. It is not lost — it moves from buried
   imperative code to a named, tested policy step.
5. **Collapse the dynamic-import seam.** Once the chain is Effect-native and
   `_actions-compat.ts` is deleted, the original reason for the 7 dynamic
   `import()`s (keeping the `@actions/*`/undici graph out of the static bundle)
   is gone. `main.ts` composes the publish services statically into `MainLive`.
   The heavy `@sigstore/sign` + `@cyclonedx/cyclonedx-library` deps stay
   separately lazy — `attest-runner.ts` already dynamic-imports those,
   independent of this boundary.
6. **TDD per service.** Each new service is built test-first against the
   in-memory test layers the ecosystem ships (`PackagePublishTest`,
   `ChangesetAnalyzerTest`, `GitHubClientTest`, `CheckRunTest`,
   `workspaces-effect` test layers, the existing `AttestTest`/`SbomTest`).
   This closes the chain's current coverage gap — 16 of the 21 modules have
   no tests today.
7. **`src/services/attest/` is kept as-is.** It is already a correct Effect
   service. The publish services consume it through its `Attest` tag.

## Reuse map

Disposition of every current publish-chain module.

### Delete — the library/`workspaces-effect` already provides it

| Module | Replaced by |
| --- | --- |
| `topological-sort.ts` | `workspaces-effect` `TopologicalSorter` (`sort`/`sortSubset`/`levels`) |
| `find-package-path.ts` | `workspaces-effect` `WorkspaceDiscovery` (`getPackage`/`listPackages`) |
| `get-changeset-status.ts` | `ChangesetAnalyzer` (`parseAll`) + `ChangesetConfig` (copied — see below) |
| `detect-copyright-year.ts` | `NpmRegistry.getPackageInfo` |
| `resolve-targets.ts`, `silk-publishability.ts` | `publishability.ts` (copied — see below) |
| `publish-target.ts`, `dry-run-publish.ts`, `registry-auth.ts` | `PackagePublish` (`setupAuth`/`pack`/`publish`/`verifyIntegrity`); the `Publish` service composes them |
| `_actions-compat.ts` | nothing — deleted at the end; every consumer is ported |

### Copy — from `pnpm-config-dependency-action/src/services/`

These are silk-specific Effect services already built, tested, and runtime-agnostic
in the sibling repo. Copy them verbatim (with their `.test.ts` files):

| File | What it provides |
| --- | --- |
| `publishability.ts` | `SilkPublishabilityDetectorLive` — a `Layer` overriding `workspaces-effect`'s `PublishabilityDetector` tag with silk rules (`publishConfig.targets`, shorthand expansion, access inheritance). Also `PublishabilityDetectorAdaptiveLive` (dispatches on changeset mode). |
| `changeset-config.ts` | `ChangesetConfig` service — reads `.changeset/config.json`, exposes `mode` (`silk`/`vanilla`/`none`) and `versionPrivate`. |

### Keep — already correct

| Module | Notes |
| --- | --- |
| `src/services/attest/*` | The Attest service (`Attest`/`Sbom`/`SigstoreSigner`/`OidcTokenIssuer` + Live + Test layers). Consumed by the publish services through its tags. |
| `determine-tag-strategy.ts` | Pure functions — strip the `_actions-compat` logging calls, keep as a pure helper. |
| SBOM-metadata helpers (`infer-sbom-metadata.ts`, `enhance-sbom-metadata.ts`) | Pure — strip the shim, keep. |
| `release-summary-helpers.ts` | Pure — strip the shim, keep. |

### Reduce — markdown/reporting

| Module | Notes |
| --- | --- |
| `generate-publish-summary.ts`, `generate-release-notes-preview.ts`, `generate-sbom-preview.ts` | Mostly pure markdown building. Rebuild on the library's `ReportBuilder`/`GithubMarkdown`; the residual pure logic stays as helpers used by the `Validation`/`Publish` services. |

### Rewrite — as the new action-specific services

| Module(s) | Becomes |
| --- | --- |
| `validate-publish.ts` + the preview modules | the `Validation` service |
| `publish-packages.ts` | the `Publish` service |
| `create-github-releases.ts` | the `Releases` service |
| `create-attestation.ts`, `attest-runner.ts` | reduced to thin callers of the `Attest` service; the storage-record call moves into `Releases`/`Publish` |
| `detect-released-packages.ts` | folded into the `Publish` service (it composes `GitHubClient`) |

## The new services

All under `src/services/publish/`, each file-per-concern like `src/services/attest/`:
`service.ts` (tag + interface), `live.ts` (Live layer), `testing.ts` (Test layer +
state), `index.ts` (barrel). Errors are `Data.TaggedError` with a `reason`
discriminator.

### `Validation` service — Phase 2

**What it does:** orchestrates release validation on the release branch.
Build validation, publish dry-run (`PackagePublish` in dry-run mode), SBOM
preview (via the `Sbom`/`Attest` service), release-notes preview, and the
unified `CheckRun`.

**Interface (sketch):**

```text
Validation {
  readonly validate: (input: ValidationInput) => Effect<ValidationResult, ValidationError, R>
}
```

**Depends on:** `CommandRunner`, `PackagePublish`, `NpmRegistry`, `Sbom`,
`ChangesetAnalyzer`, `ChangesetConfig`, `PublishabilityDetector`,
`WorkspaceDiscovery`, `CheckRun`, `ActionLogger`.

**Error:** `ValidationError` (`reason`: `"build"` | `"dry-run"` | `"sbom"` | `"check-run"`).

### `Publish` service — Phase 3 core

**What it does:** the multi-registry publish. Detects released packages
(composing `GitHubClient` for PR/commit detection), resolves each package's
targets via `PublishabilityDetector`, orders packages with `TopologicalSorter`,
and for each package:

1. **Idempotency policy** — `NpmRegistry.getVersions(name)`; if the version
   exists, `PackagePublish.verifyIntegrity(name, version, digest)`: identical →
   skip (`status: "skipped"`, `skipReason: "already-published-identical"`);
   mismatch → fail (`status: "failed"`); absent → proceed.
2. **Publish** — `PackagePublish.setupAuth` then `PackagePublish.publish`.
3. **Attest** — `Attest.provenance` + `Attest.sbom` for the published artifact.
4. **Collect** — results gathered with `ErrorAccumulator` so one package's
   failure does not abort the batch.

**Interface (sketch):**

```text
Publish {
  readonly run: (input: PublishInput) => Effect<PublishResult, PublishError, R>
}
```

**Depends on:** `PackagePublish`, `NpmRegistry`, `Attest`, `PublishabilityDetector`,
`TopologicalSorter`, `WorkspaceDiscovery`, `ChangesetAnalyzer`, `GitHubClient`,
`CommandRunner`, `ActionLogger`.

**Error:** `PublishError` (`reason`: `"detect"` | `"resolve"` | `"publish"` | `"attest"`).

### `Releases` service — Phase 3 tail

**What it does:** creates the git tags and GitHub releases for the published
packages, uploads release assets, and attaches the release-asset attestation
and the artifact-metadata storage record.

**Interface (sketch):**

```text
Releases {
  readonly create: (input: ReleasesInput) => Effect<ReleasesResult, ReleasesError, R>
}
```

**Depends on:** `GitTag`, `GitHubRelease`, `Attest`, `GitHubClient`,
`ActionLogger`; the pure `determine-tag-strategy` helper.

**Error:** `ReleasesError` (`reason`: `"tag"` | `"release"` | `"asset"` | `"storage-record"`).

Kept separate from `Publish` for independent testability; `main.ts`'s
publishing phase runs `Publish` then `Releases` in sequence.

## Layer composition

`main.ts`'s `MainLive` composes the publish services statically alongside the
existing layers. The publish services' `Live` layers are provided their
dependencies (the library services, `workspaces-effect`'s `WorkspacesLive`,
the silk `PublishabilityDetector` override, the `Attest` service layers) via
`Layer.provide`. The three phase handlers in `main.ts` (`runBranchManagement`,
`runValidation`, `runPublishing`) `yield*` the services directly — no
`Effect.tryPromise` wrappers, no dynamic `import()`.

`workspaces-effect`'s `PublishabilityDetector` tag is satisfied by the copied
`SilkPublishabilityDetectorLive` (or `PublishabilityDetectorAdaptiveLive`),
provided over `WorkspacesLive`, so any code yielding `PublishabilityDetector`
gets silk semantics.

## Error handling

Each service exposes one `Data.TaggedError` with a `reason` discriminator,
matching `AttestError`. Errors from the library services, `workspaces-effect`,
and `CommandRunner` are caught at the service boundary and wrapped into the
owning service's error so callers pattern-match a single tag per service.
Phase-3 publish failures remain non-fatal per package (the `ErrorAccumulator`
pattern) and surface in the structured `result` output; `main.ts` still calls
`outputs.setFailed(...)` when a phase has failures.

## Testing

TDD per service. Each new service is built test-first:

- `Validation` / `Publish` / `Releases` — tested against `PackagePublishTest`,
  `ChangesetAnalyzerTest`, `NpmRegistry` test layer, `GitHubClientTest`,
  `CheckRunTest`, `GitTagTest`/`GitHubReleaseTest`, the `workspaces-effect`
  test layers, and the existing `AttestTest`/`SbomTest`.
- Each new service ships its own `Test` layer (state + `layer(state)`) so the
  three `main.ts` phase handlers can be tested without real I/O.
- The copied `publishability.ts` / `changeset-config.ts` bring their
  sibling-repo `.test.ts` files.
- The idempotency policy in `Publish` gets explicit cases: version absent →
  publish; identical → skip; mismatch → fail.

This closes the current gap where 16 of 21 publish-chain modules are untested.

## Sequencing

Leaf-first, so each step is independently verifiable:

1. Add `workspaces-effect`'s `WorkspacesLive`; copy `publishability.ts` +
   `changeset-config.ts` (+ tests) from `pnpm-config-dependency-action`.
2. Replace the commodity modules with library services — delete
   `topological-sort.ts`, `find-package-path.ts`, `get-changeset-status.ts`,
   `detect-copyright-year.ts`, `resolve-targets.ts`, `silk-publishability.ts`.
3. Build the `Validation` service (TDD); rewrite the preview modules onto
   `ReportBuilder`.
4. Build the `Publish` service (TDD); adopt `PackagePublish`; delete
   `publish-target.ts`, `dry-run-publish.ts`, `registry-auth.ts`.
5. Build the `Releases` service (TDD); rewrite `create-github-releases.ts`
   thin; reduce `create-attestation.ts` / `attest-runner.ts` to `Attest`
   callers.
6. Wire the three `main.ts` phase handlers to compose the services with
   static imports into `MainLive`.
7. Delete `_actions-compat.ts` and any remaining dead modules; full
   verification (typecheck, lint, tests, build) + an integration run.

## Out of scope

- Upstreaming the publish services into `@savvy-web/github-action-effects`.
  The services are *designed* to be upstreamable (no repo-specific coupling),
  but the move itself is a separate effort after this repo dogfoods them.
- Upstreaming the idempotency policy into `PackagePublish`. Noted as a
  candidate; not part of this work.
- Changes to the `ReleaseOutput` schema or the action's output contract —
  the publish services produce the same internal result shapes the existing
  `toPublishingOutput` / `toValidationOutput` projections already consume.
- The silk `PublishabilityDetector` rules themselves — copied as-is from the
  sibling repo, not redesigned.
