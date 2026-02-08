---
title: Multi-Registry Publishing and Integration
category: integration
status: current
completeness: 90
last-synced: 2026-02-08
module: release-action
---

## Table of Contents

- [Overview](#overview)
- [Current State](#current-state)
  - [Registry Infrastructure](#registry-infrastructure)
  - [Type System](#type-system)
  - [SBOM and Compliance System](#sbom-and-compliance-system)
  - [Publish Summary Generation](#publish-summary-generation)
- [Rationale](#rationale)
- [File Reference](#file-reference)

## Overview

The release action supports publishing to multiple registries simultaneously
with OIDC-first authentication, SBOM generation, and NTIA compliance
validation. This document covers the registry infrastructure, authentication
model, SBOM/compliance system, and the type system that ties them together.

The publishing pipeline follows a strict sequence: resolve targets from
`publishConfig`, authenticate against each registry, pre-validate all
targets, run dry-run publishes, generate SBOM previews, and finally
publish. This all-or-nothing approach prevents partial releases where
some registries succeed and others fail.

## Current State

### Registry Infrastructure

#### Target Resolution (`resolve-targets.ts`, 208 lines)

Converts `publishConfig` in `package.json` to concrete `ResolvedTarget`
objects. The resolution follows four rules:

1. No `publishConfig` + `private: true` -- empty array (not publishable)
2. No `publishConfig` + `private: false` -- default npm with OIDC
3. `publishConfig` without `targets` -- legacy single-npm mode
4. `publishConfig` with `targets` -- resolve each target individually

Shorthand expansion converts string identifiers to full target objects:

- `"npm"` -- `registry.npmjs.org` with OIDC and provenance
- `"github"` -- `npm.pkg.github.com` with `GITHUB_TOKEN`
- `"jsr"` -- `jsr.io` with OIDC
- URL strings -- custom npm-compatible registry with auto-generated
  `tokenEnv` from hostname

Registry-specific defaults are applied for provenance, access level, and
token environment variables. Custom registries generate token env names
by converting the URL hostname to an uppercase identifier (for example,
`https://registry.savvyweb.dev/` becomes `REGISTRY_SAVVYWEB_DEV_TOKEN`).

#### Registry Utilities (`registry-utils.ts`, 149 lines)

URL-safe registry detection using proper hostname parsing via the `URL`
API, not substring matching. This prevents CWE-20 injection attacks where
a malicious URL like `http://evil-npmjs.org` could be misidentified.

The `matchesDomain()` function requires either an exact hostname match or
a valid subdomain match (hostname ends with `.domain`), ensuring that
`registry.npmjs.org` matches `npmjs.org` but `evil-npmjs.org` does not.

Exported functions:

- `isNpmRegistry()` -- detects `npmjs.org` and subdomains
- `isGitHubPackagesRegistry()` -- detects `pkg.github.com` and subdomains
- `isJsrRegistry()` -- detects `jsr.io` and subdomains
- `isCustomRegistry()` -- anything that is not npm, GitHub Packages, or JSR
- `getRegistryType()` -- returns typed enum for a registry URL
- `getRegistryDisplayName()` -- human-readable names for summaries
- `generatePackageViewUrl()` -- web URLs for npm and GitHub Packages

#### Registry Authentication (`registry-auth.ts`, 523 lines)

Multi-registry auth setup with OIDC-first strategy. The module provides
four primary functions:

**`validateRegistriesReachable()`** checks non-OIDC registries using
`npm ping` with a 10-second timeout. Skips well-known OIDC registries
(npm when no `NPM_TOKEN`, JSR) and GitHub Packages. Only tests custom
registries that require token auth.

**`validateTokensAvailable()`** performs OIDC-aware token validation.
JSR and npm (without `NPM_TOKEN`) are skipped because they use OIDC.
GitHub Packages and custom registries must have their `tokenEnv`
environment variable set.

**`generateNpmrc()`** writes `.npmrc` entries for non-OIDC registries.
OIDC registries do not need `.npmrc` auth. The function supports both
raw token values (wrapped with `_authToken=`) and pre-formatted auth
strings (`_authToken=...` or `_auth=...` for htpasswd).

**`setupRegistryAuth()`** orchestrates the complete auth setup:

1. Reads tokens from action state (set by `pre.ts`)
2. Configures `NPM_TOKEN` if provided (disables OIDC for npm)
3. Sets `GITHUB_TOKEN` for GitHub Packages (prefers workflow token
   with `packages:write`, falls back to GitHub App token)
4. Parses `custom-registries` input for custom registry auth
5. Validates token availability across all targets
6. Checks custom registry reachability
7. Generates `.npmrc` with auth entries
8. Masks all secrets via `setSecret()`

Authentication strategy by registry:

| Registry | Method | Token Source |
| --- | --- | --- |
| npm public | OIDC trusted publishing (default) | None (id-token) |
| npm public | Token auth (when NPM_TOKEN set) | `NPM_TOKEN` |
| GitHub Packages | GitHub App or workflow token | `GITHUB_TOKEN` |
| JSR | OIDC natively | None (id-token) |
| Custom registries | `custom-registries` input or App token | Per-registry env |

Custom registries input supports three formats:

- `https://registry.example.com/` -- uses GitHub App token
- `https://registry.example.com/_authToken=TOKEN` -- explicit token
- `https://registry.example.com/_auth=BASE64` -- htpasswd auth

#### Pre-Validation (`pre-validate-target.ts`, 238 lines)

Pre-flight checks run before dry-run publishing to catch configuration
errors early. Each target is validated based on its protocol.

For npm-compatible targets:

- Target directory must exist
- `package.json` must exist and parse as valid JSON
- Package name must match the expected name
- `private: true` is not allowed for publishing
- GitHub Packages requires scoped names (`@org/name`)

For JSR targets:

- Scoped names are required (`@scope/name`)
- `exports` field must be present in `package.json` or `jsr.json`
- Falls back to `jsr.json` when `package.json` is missing

#### Dry-Run Publishing (`dry-run-publish.ts`, 217 lines)

Simulates publishing to test registry readiness without actually
publishing. The module dispatches to protocol-specific implementations.

**`dryRunNpmCompatible()`** runs `npm publish --dry-run` via the package
manager's dlx command (for example, `pnpm dlx npm publish --dry-run`).
This avoids pnpm's strict branch validation that fails on release
branches like `changeset-release/main`. The function:

- Sets registry, provenance, access, and tag flags
- Detects version conflicts ("cannot publish over previously published
  version")
- Extracts package statistics (packed size, unpacked size, file count)
- Reports provenance readiness

**`dryRunJsr()`** runs `jsr publish --dry-run` via the package manager's
dlx equivalent. JSR handles verification internally, so provenance is
always reported as ready.

#### Configuration Loading (`load-release-config.ts`, 377 lines)

Layered configuration with three sources searched in priority order:

1. **Local repository**: `.github/silk-release.json` or
   `.github/silk-release.jsonc` in the repository being released
2. **Action input**: `sbom-config` input parameter (useful for reusable
   workflows where env vars do not propagate through `workflow_call`)
3. **Environment variable**: `SILK_RELEASE_SBOM_TEMPLATE` (for
   organization-wide defaults)

The first configuration found wins. All sources support JSONC (comments
and trailing commas) via the `jsonc-parser` library.

Structural validation includes:

- Type checking for supplier, copyright, publisher, and documentation URL
- Detection of unwrapped SBOM config (a common mistake where users put
  supplier/copyright at root level instead of under an `sbom` key)
- Helpful error messages pointing to the JSON schema

### Type System

#### Publish Configuration Types (`publish-config.ts`, 334 lines)

Core types for the publishing system:

**Protocol and target types:**

- `PublishProtocol` -- `"npm" | "jsr"`
- `PublishTarget` -- full target with registry, directory, access,
  provenance, tag, and tokenEnv
- `TargetShorthand` -- `"npm" | "github" | "jsr"` or URL strings
- `Target` -- union of `PublishTarget | TargetShorthand`
- `PublishConfig` -- the `publishConfig` section of `package.json`
- `ResolvedTarget` -- fully resolved with absolute paths and null-safe
  registry/tokenEnv

**Validation result types:**

- `PreValidationResult` -- directory, package.json, and field validation
- `DryRunResult` -- dry-run output with version conflict detection and
  package stats
- `PackageStats` -- packed size, unpacked size, file count
- `TargetValidationResult` -- combined pre-check and dry-run results per
  target
- `PackagePublishValidation` -- all targets for a package with SBOM
  validation

**Publish result types:**

- `PublishResult` -- actual publish outcome with registry URL, attestation
  URL, tarball digest, and already-published detection
- `AlreadyPublishedReason` -- `"identical" | "different" | "unknown"` for
  distinguishing safe skips from content mismatches
- `PrePackedTarball` -- reusable tarball info for multi-target publishing
  (pack once, publish to all targets with the same digest)
- `NpmVersionInfo` -- package metadata from `npm view`
- `VersionCheckResult` -- version existence check with integrity info
- `AuthSetupResult` -- registry auth setup outcome
- `PackageJson` -- minimal `package.json` interface

#### Shared Types (`shared-types.ts`, 69 lines)

Cross-cutting validation types used across the action:

- `ValidationResult` -- single validation check with name, success,
  checkId, and optional message
- `PackageValidationResult` -- per-package validation status with
  provenance flag

### SBOM and Compliance System

#### SBOM Types (`sbom-config.ts`, 328 lines)

NTIA-compliant SBOM metadata types supporting a layered configuration
system where auto-inferred values from `package.json` serve as defaults
and explicit configuration from `silk-release.json` overrides them.

**Configuration types:**

- `SBOMContact` -- contact name, email, and phone
- `SBOMSupplierConfig` -- required supplier name, organization URLs,
  and contacts (required for NTIA compliance)
- `SBOMCopyrightConfig` -- copyright holder and optional start year
  (auto-detected from npm registry first publication date)
- `SBOMMetadataConfig` -- supplier, copyright, publisher, and
  documentation URL
- `ReleaseConfig` -- top-level wrapper with `sbom` key
- `SBOMExternalReferenceType` -- CycloneDX 1.5 external reference
  type enum (vcs, issue-tracker, website, documentation, and others)
- `SBOMExternalReference` -- type, URL, and optional comment

**Inference and resolution types:**

- `InferredSBOMMetadata` -- auto-detected from `package.json` fields
  (author, repository, bugs, homepage, license)
- `ResolvedSBOMMetadata` -- merged result with supplier, component
  metadata, and author

**CycloneDX document types:**

- `EnhancedCycloneDXMetadata` -- timestamp, supplier, component (with
  PURL), and tools
- `EnhancedCycloneDXComponent` -- component with licenses, external
  references, publisher, and copyright
- `EnhancedCycloneDXDocument` -- full CycloneDX 1.5 SBOM with metadata,
  components, and dependencies

**Compliance types:**

- `NTIAComplianceResult` -- overall compliance with 7 minimum elements
- `NTIAFieldResult` -- individual field check with pass/fail, value, and
  improvement suggestion

#### SBOM Metadata Inference (`infer-sbom-metadata.ts`, 289 lines)

Auto-detects SBOM metadata from `package.json` fields:

**`parseAuthor()`** handles both string format
(`"Name <email> (url)"`) and object format (`{ name, email, url }`).

**`parseRepository()`** normalizes git URLs to HTTPS. Handles
`git+https://`, `git://`, and `git@host:org/repo.git` formats, stripping
the `.git` suffix.

**`parseBugs()`** extracts the issue tracker URL from either a string or
an object with a `url` property.

**`inferSBOMMetadata()`** reads `package.json` from a directory and
returns an `InferredSBOMMetadata` object with author name, author email,
VCS URL, issue tracker URL, documentation URL (homepage), and license.

**`formatCopyright()`** generates a copyright string with year range.
If start year equals current year, only the current year is shown.

**`resolveSBOMMetadata()`** merges inferred and explicit configuration.
Explicit values win. Builds external references from VCS, issue tracker,
documentation, and supplier URLs with deduplication.

#### SBOM Enhancement (`enhance-sbom-metadata.ts`, 247 lines)

Enriches a raw CycloneDX SBOM (from cdxgen) with supplier, publisher,
copyright, and external references.

**`generatePurl()`** creates Package URL identifiers with proper scope
encoding: `pkg:npm/%40scope/name@version`.

**`enhanceSBOMMetadata()`** performs the full enhancement flow:

1. Load config (provided or from `silk-release.json`)
2. Infer metadata from `package.json`
3. Detect copyright year (config override, npm registry, or current year)
4. Merge inferred and explicit config
5. Set supplier information
6. Set component metadata (publisher, copyright, PURL, external refs)
7. Set tool component (`workflow-release-action`)

**`mergeExternalReferences()`** deduplicates by `type:url` key, keeping
existing references when duplicates are found.

**`enhanceSBOMWithMetadata()`** provides a synchronous path for when
resolved metadata is already available (skips async copyright year
detection).

#### Copyright Year Detection (`detect-copyright-year.ts`, 142 lines)

Determines copyright start year with three-level precedence:

1. **Config override** -- `copyright.startYear` in `silk-release.json`
   (most users should not set this)
2. **npm registry** -- first publication date from `npm view <pkg> time`
3. **Current year** -- fallback for new/unpublished packages

**`fetchNpmPackageCreationDate()`** queries the registry for the
`time.created` timestamp. Handles 404 responses gracefully (new packages).

**`extractYearFromDate()`** safely extracts the year from an ISO date
string, falling back to the current year for invalid dates.

#### NTIA Compliance Validation (`validate-ntia-compliance.ts`, 256 lines)

Validates SBOM documents against the 7 NTIA minimum elements:

1. **Supplier Name** -- from `metadata.supplier.name`
2. **Component Name** -- from `metadata.component.name`
3. **Component Version** -- from `metadata.component.version`
4. **Unique Identifier** -- PURL from `metadata.component.purl`
5. **Dependency Relationship** -- presence of components or dependencies
   arrays (an empty dependency list is valid)
6. **Author of SBOM Data** -- from tools, supplier, or component
   publisher
7. **Timestamp** -- from `metadata.timestamp`

Each check returns a `NTIAFieldResult` with pass/fail status, the found
value, and an actionable suggestion for missing fields.

**`formatNTIAComplianceMarkdown()`** generates a markdown compliance
report with a summary header, field results table, and action items for
missing fields.

#### SBOM Preview Generation (`generate-sbom-preview.ts`, 471 lines)

Generates a comprehensive preview during the validation phase for
inclusion in PR check runs. The preview includes:

- Summary table with status, dependencies, components, and NTIA
  compliance percentage per package
- Per-package details with SBOM format version, supplier, and publisher
- External references (VCS, issue-tracker, documentation, website)
- License summary showing the top 10 licenses by component count
- NTIA compliance section with field-by-field analysis
- Component lists grouped by type (library, application, framework) in
  collapsible HTML details elements
- Raw SBOM JSON in a collapsible section for debugging

The function reuses existing SBOM validation results from the publish
validation phase when available, avoiding redundant SBOM generation.

### Publish Summary Generation

#### Summary Functions (`generate-publish-summary.ts`, 1,055 lines)

Generates comprehensive markdown summaries for different stages of the
publish pipeline.

**`generatePublishSummary()`** creates the pre-publish validation
summary. Includes a package summary table with status icons, version
bump types, changeset counts, and aggregate metrics (total packed size,
unpacked size, file count, targets ready). Per-package details are
shown in collapsible sections, expanded by default when errors or
warnings are present. Each target row shows registry, directory, packed
and unpacked sizes, file count, access level, and provenance status.

**`generatePublishResultsSummary()`** creates the post-publish results
summary. Shows overall success/failure with per-package target status
(published, skipped/identical, content mismatch, failed). Failed targets
include categorized error diagnostics with actionable hints.

**`generateBuildFailureSummary()`** creates a summary when the build
step fails, including the error output and troubleshooting steps.

**`generatePreValidationFailureSummary()`** creates a summary when
pre-validation fails (before any publishing is attempted). Includes
target status table, categorized error details with fix suggestions,
integrity comparison for content mismatches, and configuration help
sections specific to the type of registry that failed (custom, GitHub
Packages, or npm).

Error categorization detects and suggests fixes for:

- GitHub Packages permission errors (org packages, `packages:write`)
- OIDC trusted publishing issues (`id-token:write`)
- Authentication vs permission errors (401 vs 403)
- Version conflict detection
- Attestation/provenance errors (`attestations:write`)
- Custom registry auth errors with hostname-specific secret suggestions
- Network errors (timeout, connection refused, DNS failure)
- Content mismatch errors with integrity comparison

## Rationale

### Why OIDC-First Authentication?

OIDC (OpenID Connect) trusted publishing eliminates the need for
long-lived tokens. Tokens are short-lived and scoped to the specific
workflow run, removing the need for secret rotation. Both npm and JSR
support OIDC natively in GitHub Actions. The action falls back to token
auth when OIDC is not available (for example, when `NPM_TOKEN` is
explicitly provided for first-time publishes where OIDC is not yet
configured on npmjs.com).

### Why Pre-Validate All Targets?

The action validates every target for every package before publishing
any of them. This prevents partial releases where some registries
receive the new version and others do not. A partial release creates a
state that is difficult to recover from -- the published versions cannot
be unpublished from npm, and users may encounter inconsistent versions
across registries.

### Why CycloneDX Format?

CycloneDX 1.5 is the most widely supported SBOM format for npm packages.
It supports PURL (Package URL) identifiers natively, which are required
for the NTIA unique identifier minimum element. The format is generated
by cdxgen, which integrates with all major JavaScript package managers.

### Why Layered Configuration?

Multiple configuration sources (repo file, action input, environment
variable) support different organizational needs:

- **Repository-specific config** in `.github/silk-release.json` for
  per-repo supplier/copyright overrides
- **Action input** for reusable workflows where env vars do not propagate
  through `workflow_call` boundaries
- **Environment variable** for organization-wide defaults set as GitHub
  organization variables

The first source found wins, so repository config always overrides
organization defaults.

### Why Version Conflicts Are Not Errors?

A version conflict means the package is already published at that
version. This is expected in retry scenarios (for example, re-running a
failed workflow after one registry succeeded). The action compares
tarball integrity (shasum) to distinguish between safe skips (identical
content) and actual content mismatches (which are errors). This allows
the release of other packages to proceed while safely skipping
already-published ones.

### Why Pack Once for Multi-Target Publishing?

When publishing to multiple registries, the action packs the tarball
once and reuses it for all targets. This ensures every registry receives
identical content with the same SHA-256 digest. This is critical for
attestation linking -- provenance attestations reference a specific
digest, so all targets must share the same tarball to have valid
attestations.

### Why URL-Safe Registry Detection?

Substring matching on URLs is a security issue (CWE-20) because it can
be bypassed with malicious URLs like `http://evil-npmjs.org` (prefix
match) or `http://npmjs.org.evil.com` (suffix match). The registry
utilities parse URLs with the `URL` API and check hostnames via exact
match or proper subdomain match, preventing injection attacks.

## File Reference

### Type Definitions

| File | Lines | Description |
| --- | --- | --- |
| `src/types/publish-config.ts` | 334 | Core publishing types (targets, validation, results) |
| `src/types/sbom-config.ts` | 328 | SBOM metadata, CycloneDX, and NTIA compliance types |
| `src/types/shared-types.ts` | 69 | Cross-cutting validation result types |

### Registry Infrastructure

| File | Lines | Description |
| --- | --- | --- |
| `src/utils/resolve-targets.ts` | 208 | Target resolution from publishConfig |
| `src/utils/registry-utils.ts` | 149 | URL-safe registry detection and display |
| `src/utils/registry-auth.ts` | 523 | Multi-registry auth setup with OIDC |
| `src/utils/pre-validate-target.ts` | 238 | Pre-flight validation per target |
| `src/utils/dry-run-publish.ts` | 217 | Simulated publishing for readiness checks |
| `src/utils/load-release-config.ts` | 377 | Layered configuration loading |

### SBOM and Compliance

| File | Lines | Description |
| --- | --- | --- |
| `src/utils/infer-sbom-metadata.ts` | 289 | Auto-detection from package.json |
| `src/utils/enhance-sbom-metadata.ts` | 247 | SBOM enrichment with PURL and metadata |
| `src/utils/detect-copyright-year.ts` | 142 | Copyright year from npm registry |
| `src/utils/validate-ntia-compliance.ts` | 256 | NTIA 7 minimum elements validation |
| `src/utils/generate-sbom-preview.ts` | 471 | SBOM preview for PR check runs |

### Summary Generation

| File | Lines | Description |
| --- | --- | --- |
| `src/utils/generate-publish-summary.ts` | 1,055 | Pre/post-publish markdown summaries |
