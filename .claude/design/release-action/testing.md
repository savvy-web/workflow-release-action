---
title: Testing Strategy and Infrastructure
category: testing
status: current
completeness: 90
last-synced: 2026-02-08
module: release-action
---

## Table of Contents

- [Overview](#overview)
- [Current State](#current-state)
  - [Test Framework Configuration](#test-framework-configuration)
  - [Mock Factory Pattern](#mock-factory-pattern)
  - [Standard Test Setup Pattern](#standard-test-setup-pattern)
  - [Specialized Testing Patterns](#specialized-testing-patterns)
  - [Test Coverage Map](#test-coverage-map)
  - [Coverage Gaps](#coverage-gaps)
  - [Test Best Practices](#test-best-practices)
  - [Test Commands](#test-commands)
- [Rationale](#rationale)
  - [Why 85% Coverage Threshold?](#why-85-coverage-threshold)
  - [Why Type-Safe Mocks?](#why-type-safe-mocks)
  - [Why Factory Functions Over Direct Mocking?](#why-factory-functions-over-direct-mocking)
  - [Why 240s Test Timeout?](#why-240s-test-timeout)
  - [Why Exclude Certain Modules from Coverage?](#why-exclude-certain-modules-from-coverage)
- [File Reference](#file-reference)

## Overview

The project uses Vitest 4.0.8 with a comprehensive test suite of 38 test
files (~23,192 lines) covering 37+ utility modules. Tests enforce type-safe
mocking with zero `any` types and maintain 85%+ coverage per file via the
V8 provider. All external dependencies (GitHub API, exec, file system) are
mocked to ensure tests are fast, reliable, and isolated.

## Current State

### Test Framework Configuration

Vitest is configured in `vitest.config.ts` with the following settings:

- **Include pattern:** `**/__tests__/**/*.test.ts`
- **Exclude patterns:** `**/node_modules/**`, `**/dist/**`
- **Global setup:** `vitest.setup.ts` (currently a placeholder for future
  global setup needs)
- **Test timeout:** 240,000ms (4 minutes) to accommodate network-heavy and
  retry-logic tests
- **Reporters:** `["default"]`
- **Coverage provider:** V8
- **Coverage reporters:** `text`, `json`, `html` (with `report` subdir)
- **Coverage directory:** `./.coverage`
- **Coverage thresholds (per file):**
  - Lines: 85%
  - Functions: 85%
  - Branches: 85%
  - Statements: 85%

Coverage exclusions (4 modules with documented reasons):

| Excluded Module | Reason |
| --------------- | ------ |
| `__tests__/utils/**/*.ts` | Test utilities themselves |
| `src/utils/generate-pr-description.ts` | Anthropic SDK integration |
| `src/utils/create-api-commit.ts` | Complex fs/exec mocking for GitHub API commits |
| `src/utils/publish-target.ts` | Tested indirectly via publish-packages tests |

Test scripts defined in `package.json`:

```bash
pnpm test          # vitest run --pass-with-no-tests
pnpm ci:test       # CI="true" vitest run --coverage
```

### Mock Factory Pattern

All mock factories are centralized in `__tests__/utils/github-mocks.ts`
with type definitions in `__tests__/utils/test-types.ts`.

Core factory functions for GitHub API mocking:

```typescript
createMockOctokit()     // Full Octokit REST + GraphQL API mock
                        // Includes: checks, repos, pulls, issues, git
```

Factory functions for GitHub Actions modules:

```typescript
createMockCore()        // @actions/core (getInput, setOutput, logging)
createMockExec()        // @actions/exec (command execution)
createMockCache()       // @actions/cache (cache save/restore)
createMockToolCache()   // @actions/tool-cache
createMockGlob()        // @actions/glob
createMockHttpClient()  // @actions/http-client
```

Environment management functions:

```typescript
setupTestEnvironment()     // Clear mocks + optionally suppress console output
cleanupTestEnvironment()   // Restore all mocks
suppressConsoleOutput()    // Silence process.stdout/stderr writes
```

Type definitions in `__tests__/utils/test-types.ts`:

- `MockOctokit` -- Typed mock for Octokit REST and GraphQL with required
  (not optional) properties to prevent accidental optional chaining
- `MockCore` -- Typed mock for `@actions/core`
- `MockExec` -- Typed mock for `@actions/exec`
- `MockCache` -- Typed mock for `@actions/cache`
- `MockToolCache` -- Typed mock for `@actions/tool-cache`
- `MockGlob` / `MockGlobber` -- Typed mocks for `@actions/glob`
- `MockHttpClient` -- Typed mock for `@actions/http-client`
- `ExecOptionsWithListeners` -- Extended exec options type for stdout/stderr
  listener testing
- `isMockOctokit()` -- Type guard utility for runtime checks

Key constraint: No `any` types are allowed anywhere in test code. Use the
`as unknown as Type` pattern for Octokit mock casting.

### Standard Test Setup Pattern

Every test file follows this consistent initialization pattern:

```typescript
import {
  createMockOctokit,
  setupTestEnvironment,
  cleanupTestEnvironment,
} from "./utils/github-mocks.js";
import type { MockOctokit } from "./utils/test-types.js";

describe("my-feature", () => {
  let mockOctokit: MockOctokit;

  beforeEach(() => {
    setupTestEnvironment({ suppressOutput: true });
    mockOctokit = createMockOctokit();
    vi.mocked(getOctokit).mockReturnValue(
      mockOctokit as unknown as ReturnType<typeof getOctokit>
    );

    // Setup context properties
    Object.defineProperty(vi.mocked(context), "repo", {
      value: { owner: "test-owner", repo: "test-repo" },
      writable: true,
    });
  });

  afterEach(() => {
    cleanupTestEnvironment();
  });
});
```

External dependencies are mocked at the top of each file before imports
using `vi.mock()`:

```typescript
vi.mock("@actions/core");
vi.mock("@actions/github");
vi.mock("@actions/exec");
```

### Specialized Testing Patterns

#### Exec Mocking with Listeners (stdout/stderr Capture)

Tests that mock `@actions/exec` capture output via listener callbacks. This
pattern is used extensively in tests for modules that shell out to CLI tools
(changesets, git, package managers):

```typescript
vi.mocked(exec.exec).mockImplementation(
  async (cmd, args, options) => {
    if (cmd === "pnpm" && args?.[0] === "ci:version") {
      if (options?.listeners?.stdout) {
        options.listeners.stdout(
          Buffer.from("M package.json\n")
        );
      }
    }
    return 0;
  }
);
```

#### Fake Timers for Retry Logic

Tests for retry-enabled operations use Vitest fake timers to avoid real
delays. Fake timers are enabled per-test (not globally in `beforeEach`)
because global fake timers affect all async operations and can break normal
Promise resolution:

```typescript
it("should retry on ECONNRESET errors", async () => {
  vi.useFakeTimers();
  mockFn.mockRejectedValueOnce(new Error("ECONNRESET"));
  mockFn.mockResolvedValueOnce({ data: "success" });

  const actionPromise = retryableAction();
  await vi.advanceTimersByTimeAsync(60000);
  const result = await actionPromise;

  expect(mockFn).toHaveBeenCalledTimes(2);
});

afterEach(() => {
  vi.useRealTimers(); // Critical: always reset after each test
});
```

Using fake timers improved retry test performance from ~14.5s to ~2.4s.

#### File System Mocking with Dynamic Paths

File system operations are mocked with path-based routing to return
different content based on the requested file:

```typescript
vi.mocked(readFile).mockImplementation(async (path) => {
  const pathStr = String(path);
  if (pathStr.includes("changeset-status"))
    return changesetStatusContent;
  if (pathStr.includes("package.json"))
    return JSON.stringify({ name: "@test/pkg" });
  return "{}";
});
```

#### Workspace Tools Mocking

Workspace-related tests mock the `getWorkspaceInfos` utility to simulate
monorepo package discovery:

```typescript
vi.mocked(getWorkspaceInfos).mockReturnValue([{
  name: "@test/pkg-a",
  path: "/test/workspace/packages/pkg-a",
  packageJson: {
    name: "@test/pkg-a",
    version: "0.0.0",
    publishConfig: { access: "public" },
  },
}]);
```

#### GitHub Context Mocking

The `@actions/github` context object is mocked using `Object.defineProperty`
to set read-only properties like `repo`, `sha`, and `ref`:

```typescript
Object.defineProperty(vi.mocked(context), "repo", {
  value: { owner: "test-owner", repo: "test-repo" },
  writable: true,
});
Object.defineProperty(vi.mocked(context), "sha", {
  value: "abc123",
  writable: true,
});
```

#### Core Summary Mocking

The `core.summary` chainable API is mocked with methods that return `this`
for method chaining:

```typescript
const mockSummary = {
  addHeading: vi.fn().mockReturnThis(),
  addEOL: vi.fn().mockReturnThis(),
  addTable: vi.fn().mockReturnThis(),
  addRaw: vi.fn().mockReturnThis(),
  addCodeBlock: vi.fn().mockReturnThis(),
  write: vi.fn().mockResolvedValue(undefined),
  stringify: vi.fn().mockReturnValue(""),
};
Object.defineProperty(core, "summary", {
  value: mockSummary,
  writable: true,
});
```

### Test Coverage Map

All 38 test files mapped to their source modules and workflow phase:

| Test File | Source Module | Category |
| --------- | ------------ | -------- |
| `check-release-branch.test.ts` | `check-release-branch.ts` | Phase 1 |
| `detect-publishable-changes.test.ts` | `detect-publishable-changes.ts` | Phase 1 |
| `create-release-branch.test.ts` | `create-release-branch.ts` | Phase 1 |
| `update-release-branch.test.ts` | `update-release-branch.ts` | Phase 1 |
| `get-changeset-status.test.ts` | `get-changeset-status.ts` | Phase 1 |
| `link-issues-from-commits.test.ts` | `link-issues-from-commits.ts` | Phase 2 |
| `validate-builds.test.ts` | `validate-builds.ts` | Phase 2 |
| `validate-publish.test.ts` | `validate-publish.ts` | Phase 2 |
| `generate-release-notes-preview.test.ts` | `generate-release-notes-preview.ts` | Phase 2 |
| `create-validation-check.test.ts` | `create-validation-check.ts` | Phase 2 |
| `update-sticky-comment.test.ts` | `update-sticky-comment.ts` | Phase 2 |
| `cleanup-validation-checks.test.ts` | `cleanup-validation-checks.ts` | Phase 2 |
| `detect-released-packages.test.ts` | `detect-released-packages.ts` | Phase 3 |
| `publish-packages.test.ts` | `publish-packages.ts` | Phase 3 |
| `determine-tag-strategy.test.ts` | `determine-tag-strategy.ts` | Phase 3 |
| `create-github-releases.test.ts` | `create-github-releases.ts` | Phase 3 |
| `create-attestation.test.ts` | `create-attestation.ts` | Phase 3 |
| `close-linked-issues.test.ts` | `close-linked-issues.ts` | Phase 3a |
| `topological-sort.test.ts` | `topological-sort.ts` | Infra |
| `registry-utils.test.ts` | `registry-utils.ts` | Infra |
| `registry-auth.test.ts` | `registry-auth.ts` | Infra |
| `resolve-targets.test.ts` | `resolve-targets.ts` | Infra |
| `pre-validate-target.test.ts` | `pre-validate-target.ts` | Infra |
| `dry-run-publish.test.ts` | `dry-run-publish.ts` | Infra |
| `load-release-config.test.ts` | `load-release-config.ts` | Infra |
| `parse-changesets.test.ts` | `parse-changesets.ts` | Infra |
| `find-package-path.test.ts` | `find-package-path.ts` | Infra |
| `detect-workflow-phase.test.ts` | `detect-workflow-phase.ts` | Infra |
| `release-summary-helpers.test.ts` | `release-summary-helpers.ts` | Infra |
| `generate-publish-summary.test.ts` | `generate-publish-summary.ts` | Infra |
| `summary-writer.test.ts` | `summary-writer.ts` | Infra |
| `check-token-permissions.test.ts` | `check-token-permissions.ts` | Infra |
| `create-app-token.test.ts` | `create-app-token.ts` | Infra |
| `check-version-exists.test.ts` | `check-version-exists.ts` | Infra |
| `detect-repo-type.test.ts` | `detect-repo-type.ts` | Infra |
| `detect-copyright-year.test.ts` | `detect-copyright-year.ts` | SBOM |
| `enhance-sbom-metadata.test.ts` | `enhance-sbom-metadata.ts` | SBOM |
| `infer-sbom-metadata.test.ts` | `infer-sbom-metadata.ts` | SBOM |
| `validate-ntia-compliance.test.ts` | `validate-ntia-compliance.ts` | SBOM |

### Coverage Gaps

Source modules without dedicated test files:

| Module | Reason for Gap |
| ------ | -------------- |
| `src/main.ts` | Main action entry point; orchestrates phases |
| `src/pre.ts` | Pre-execution script; thin entry point |
| `src/post.ts` | Post-execution script; thin entry point |
| `src/types/*.ts` | Type definitions with no runtime behavior |
| `src/utils/logger.ts` | Logging utility; trivial wrapper |
| `src/utils/run-close-linked-issues.ts` | Thin CLI wrapper around `close-linked-issues` |
| `src/utils/generate-sbom-preview.ts` | SBOM preview generation |
| `src/utils/generate-pr-description.ts` | Anthropic SDK integration (excluded from coverage) |
| `src/utils/create-api-commit.ts` | GitHub API commit (excluded from coverage) |
| `src/utils/publish-target.ts` | Tested indirectly via publish-packages (excluded) |

Some of these modules are excluded from coverage thresholds in
`vitest.config.ts` and are validated indirectly through higher-level module
tests or through integration testing.

### Test Best Practices

The following practices are enforced across all test files:

1. **Type Safety** -- No `any` types anywhere in test code. Use factory
   functions and the `as unknown as Type` cast pattern.

2. **Arrange-Act-Assert** -- Every test follows the AAA pattern with clear
   separation between setup, execution, and verification.

3. **Descriptive Names** -- Tests use the "should X when Y" naming format
   to clearly communicate the scenario and expected outcome.

4. **Nested Describe Blocks** -- Related scenarios are grouped with nested
   `describe` blocks for logical organization.

5. **Top-Level Mocking** -- `vi.mock()` calls are placed at the top of each
   file before imports to ensure proper hoisting.

6. **Timer Cleanup** -- Any test using `vi.useFakeTimers()` must call
   `vi.useRealTimers()` in its `afterEach` to prevent state leakage.

7. **Error Path Coverage** -- Tests cover both `Error` and non-`Error` throw
   scenarios, along with specific HTTP error codes (404, 500, etc.).

8. **Logging Assertions** -- Tests verify `core.info`, `core.warning`,
   `core.error`, and `core.debug` messages for observability validation.

9. **Call Count Verification** -- Mock call counts and argument shapes are
   verified to ensure correct interaction with dependencies.

10. **Edge Case Coverage** -- Empty inputs, malformed data, boundary
    conditions, and unexpected types are tested explicitly.

### Test Commands

```bash
pnpm test                        # Run all tests (pass with no tests)
pnpm ci:test                     # CI mode with coverage enforcement
pnpm test --watch                # Watch mode for development
pnpm test path/to/test.test.ts   # Run specific test file
```

## Rationale

### Why 85% Coverage Threshold?

The 85% per-file threshold balances thorough testing with pragmatism. Some
modules (API commit creation, direct publishing, Anthropic SDK integration)
are difficult to unit test due to complex I/O dependencies involving
multiple interacting external systems. These are better validated through
integration testing in the `savvy-web/workflow-integration` repository.

The per-file enforcement (via `perFile: true`) prevents high-coverage modules
from masking low-coverage ones, which is a common problem with global
thresholds in projects with many small utility modules.

### Why Type-Safe Mocks?

Type-safe mocks prevent type drift between source and test code. When a
module signature changes (adding a parameter, changing a return type),
tests fail at compile time via `tsgo --noEmit` rather than at runtime. This
catches integration issues early and reduces the debugging cycle.

The `MockOctokit` interface uses required (not optional) properties
specifically to prevent a subtle bug: optional chaining (`?.`) on mock setup
calls silently short-circuits, causing mocks to never be configured.

### Why Factory Functions Over Direct Mocking?

Factory functions like `createMockOctokit()` provide four key benefits:

1. **Consistent initialization** -- Every test starts with the same mock
   shape, eliminating setup bugs.

2. **Proper typing** -- No `any` escape hatches needed; types flow naturally
   through the factory return types.

3. **Single update point** -- When the Octokit API surface changes, only the
   factory function needs updating, not every test file.

4. **Default values** -- Factories provide sensible defaults (e.g.,
   `exec` returns `0`, `checks.create` returns an ID) that reduce
   boilerplate in individual tests.

### Why 240s Test Timeout?

Some tests involve complex async operations with multiple retries and fake
timer advances. The create-release-branch tests, for example, simulate
exponential backoff with up to 60 seconds of fake time advancement. The
generous 240-second timeout prevents flaky failures in CI environments
(where container resource contention can slow execution) while still
catching genuine infinite loops or deadlocks.

### Why Exclude Certain Modules from Coverage?

Three source modules are excluded from coverage thresholds for specific
technical reasons:

- **`generate-pr-description.ts`** -- Integrates with the Anthropic SDK.
  Mocking the SDK's streaming response interface is fragile and provides
  limited confidence. Validated through manual testing and integration runs.

- **`create-api-commit.ts`** -- Requires simultaneously mocking the file
  system, `@actions/exec`, and the GitHub API's tree/blob/commit creation
  flow. The resulting tests would be tightly coupled to implementation
  details. Validated indirectly through `create-release-branch` tests and
  integration testing.

- **`publish-target.ts`** -- Orchestrates multiple publishing strategies
  (npm, JSR, GitHub Packages, custom registries) with OIDC authentication,
  token management, and registry-specific commands. Tested indirectly through
  `publish-packages.test.ts` which exercises all code paths via its caller.

## File Reference

Test infrastructure files:

| File | Purpose |
| ---- | ------- |
| `vitest.config.ts` | Vitest configuration with coverage thresholds |
| `vitest.setup.ts` | Global setup hook (placeholder for future needs) |
| `__tests__/utils/github-mocks.ts` | Mock factory functions and environment helpers |
| `__tests__/utils/test-types.ts` | TypeScript type definitions for all mock shapes |
| `__tests__/CLAUDE.md` | Testing documentation for Claude Code context |

Source entry points (untested, thin orchestration layers):

| File | Purpose |
| ---- | ------- |
| `src/main.ts` | Main action entry point |
| `src/pre.ts` | Pre-execution hook |
| `src/post.ts` | Post-execution hook |

Type definition files (no runtime behavior):

| File | Purpose |
| ---- | ------- |
| `src/types/global.d.ts` | Global type augmentations |
| `src/types/shared-types.ts` | Shared type definitions across modules |
| `src/types/publish-config.ts` | Publishing configuration types |
| `src/types/sbom-config.ts` | SBOM configuration types |
