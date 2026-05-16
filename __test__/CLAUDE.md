# __test__/CLAUDE.md

Unit testing patterns and infrastructure for workflow-release-action.

__See also:__ [Root CLAUDE.md](../CLAUDE.md) | [src/CLAUDE.md](../src/CLAUDE.md)

__For comprehensive testing documentation:__ `@../.claude/design/release-action/testing.md` -- covers test-layer patterns, all specialized patterns (exec listeners, fake timers, filesystem, workspaces-effect sync APIs, GitHub context, core.summary), attest test layers (`AttestTest`/`SbomTest`), complete coverage map, and coverage gap analysis.

## Running Tests

```bash
pnpm test                                        # All tests with coverage
pnpm test --watch                                # Watch mode
pnpm test __test__/check-release-branch.test.ts # Specific file
pnpm ci:test                                     # CI mode
```

## Coverage Requirements

85% threshold for branches, functions, lines, and statements (configured in `vitest.config.ts`).

## Test Utilities

`utils/github-mocks.ts` provides three environment helpers — there are no hand-rolled Octokit or `@actions/*` mock factories (the migration removed them):

| Function | Purpose |
| -------- | ------- |
| `setupTestEnvironment({ suppressOutput })` | Clear all mocks; optionally silence stdout/stderr. Call in `beforeEach()` |
| `cleanupTestEnvironment()` | Restore all mocks. Call in `afterEach()` |
| `suppressConsoleOutput()` | Silence stdout/stderr directly |

## Mocking Strategy

__Effect code__ (entry points, migrated utilities) -- use the in-memory test layers from `@savvy-web/github-action-effects/testing` (`ActionOutputsTest`, `ActionStateTest`, `GitHubClientTest`, `GitHubAppTest`, `CheckRunTest`, `GitBranchTest`, `PullRequestTest`, the `CommandRunner` test layer, ...). Provide the layer to the effect under test and inspect the recorded state.

__Attest service__ -- use `AttestTest` / `SbomTest` from `src/services/attest/testing.ts`. These record calls without performing cryptographic work.

__Imperative publish-chain code__ (modules still calling `src/utils/_actions-compat.ts`) -- mock Node builtins (`vi.mock("node:fs")`, ...) and use `setupTestEnvironment` / `cleanupTestEnvironment`.

```typescript
import { afterEach, beforeEach, describe, it } from "vitest";
import { cleanupTestEnvironment, setupTestEnvironment } from "./utils/github-mocks.js";

describe("module-name", () => {
  beforeEach(() => setupTestEnvironment({ suppressOutput: true }));
  afterEach(() => cleanupTestEnvironment());
});
```

## Key Testing Rules

- Never use `any` types
- Use Arrange-Act-Assert pattern
- Use descriptive test names: `"should X when Y"`
- Cover all code paths (branches, switch cases, error handling)
- For retry logic, use `vi.useFakeTimers()` per-test (not globally) with `vi.advanceTimersByTimeAsync(60000)`
- Always call `vi.useRealTimers()` in `afterEach` when using fake timers

## Common Issues

__Mock not called:__ Ensure the `vi.mock(...)` call is hoisted above imports and the subject imports the exact mocked path.

__Coverage below threshold:__ Run `pnpm test`, check uncovered line numbers, add tests for those paths.
