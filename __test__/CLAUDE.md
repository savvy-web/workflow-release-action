# __tests__/CLAUDE.md

Unit testing patterns and infrastructure for workflow-release-action.

__See also:__ [Root CLAUDE.md](../CLAUDE.md) | [src/CLAUDE.md](../src/CLAUDE.md)

__For comprehensive testing documentation:__ `@../.claude/design/release-action/testing.md` -- covers mock factory internals, all specialized patterns (exec listeners, fake timers, filesystem, workspace-tools, GitHub context, core.summary), complete coverage map (38 test files), and coverage gap analysis.

## Running Tests

```bash
pnpm test                                        # All tests with coverage
pnpm test --watch                                # Watch mode
pnpm test __tests__/check-release-branch.test.ts # Specific file
pnpm ci:test                                     # CI mode
```

## Coverage Requirements

85% threshold for branches, functions, lines, and statements (configured in `vitest.config.ts`).

## Mock Factory Functions

Use factories from `utils/github-mocks.ts` for type-safe mock creation. Never use `any` types.

| Function | Purpose |
| -------- | ------- |
| `createMockOctokit()` | GitHub Octokit client with REST API methods |
| `createMockCore()` | @actions/core module (inputs, outputs, logging) |
| `createMockExec()` | @actions/exec module |
| `createMockCache()` | @actions/cache module |
| `createMockToolCache()` | @actions/tool-cache module |
| `createMockGlob()` | @actions/glob module |
| `createMockHttpClient()` | @actions/http-client module |
| `setupTestEnvironment()` | Initialize test environment |
| `cleanupTestEnvironment()` | Clean up after tests |

## Standard Test Setup

Use this pattern for all test files:

```typescript
import { cleanupTestEnvironment, createMockOctokit, setupTestEnvironment } from "./utils/github-mocks.js";
import type { MockOctokit } from "./utils/test-types.js";

vi.mock("@actions/core");
vi.mock("@actions/github");

describe("module-name", () => {
  let mockOctokit: MockOctokit;

  beforeEach(() => {
    setupTestEnvironment({ suppressOutput: true });
    mockOctokit = createMockOctokit();
    vi.mocked(getOctokit).mockReturnValue(mockOctokit as unknown as ReturnType<typeof getOctokit>);
  });

  afterEach(() => {
    cleanupTestEnvironment();
  });
});
```

## Key Testing Rules

- Never use `any` types -- use `createMockOctokit()` and typed factories
- Use Arrange-Act-Assert pattern
- Use descriptive test names: `"should X when Y"`
- Cover all code paths (branches, switch cases, error handling)
- Use `as unknown as Type` pattern for Octokit mock casting
- All MockOctokit properties are required (not optional) to prevent chaining issues
- For retry logic, use `vi.useFakeTimers()` per-test (not globally) with `vi.advanceTimersByTimeAsync(60000)`
- Always call `vi.useRealTimers()` in `afterEach` when using fake timers

## Common Issues

__Mock not called:__ Ensure mock setup happens before function call and `vi.mocked(getOctokit)` is configured in `beforeEach`.

__Optional chaining breaks mocks:__ Use `mockOctokit.rest.repos.getBranch` not `mockOctokit.rest.repos?.getBranch`. Factory ensures all properties exist.

__Type error with mock return:__ Use `as unknown as ReturnType<typeof getOctokit>` pattern.

__Coverage below threshold:__ Run `pnpm test`, check uncovered line numbers, add tests for those paths.
