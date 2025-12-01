# __tests__/CLAUDE.md

Unit testing strategy, mocking patterns, and coverage requirements for workflow-release-action.

__See also:__ [Root CLAUDE.md](../CLAUDE.md) for repository overview | [src/CLAUDE.md](../src/CLAUDE.md) for source code architecture.

## Testing Strategy

This action uses __unit tests__ with Vitest for fast, isolated testing of individual utility functions. All external dependencies (GitHub API, exec, file system) are mocked to ensure tests are:

- __Fast__ - No network requests or file system operations
- __Reliable__ - No flaky tests due to external dependencies
- __Isolated__ - Each test runs independently

## Test Organization

```text
__tests__/
├── check-release-branch.test.ts      # Release branch detection tests
├── detect-publishable-changes.test.ts # Changeset status parsing tests
├── update-sticky-comment.test.ts     # PR comment management tests
├── validate-builds.test.ts           # Build validation tests
└── utils/
    ├── github-mocks.ts               # Shared mock factory functions
    └── test-types.ts                 # Type definitions for mocks
```

## Running Tests

```bash
# Run all tests with coverage
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run specific test file
pnpm test __tests__/check-release-branch.test.ts

# View coverage report
open coverage/index.html
```

## Coverage Requirements

Configured in [vitest.config.ts](../vitest.config.ts):

```json
{
  "branches": 85,
  "functions": 85,
  "lines": 85,
  "statements": 85
}
```

## Type-Safe Mocking Strategy

### Core Principle: No `any` Types

__Never use `any` types in tests.__ This ensures type safety and catches errors at compile time.

```typescript
// ❌ WRONG - Using 'any' type
const mockOctokit = { rest: { checks: { create: vi.fn() } } } as any;

// ✅ CORRECT - Using proper types
const mockOctokit = createMockOctokit();
```

### Mock Factory Functions

Use the factory functions in `utils/github-mocks.ts` for consistent, type-safe mock creation:

```typescript
import { createMockOctokit, setupTestEnvironment, cleanupTestEnvironment } from "./utils/github-mocks.js";
import type { MockOctokit } from "./utils/test-types.js";

describe("my-feature", () => {
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

### Available Mock Factories

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

### MockOctokit Type Structure

The `MockOctokit` interface in `test-types.ts` defines all available mock methods:

```typescript
export interface MockOctokit {
  rest: {
    checks: {
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    repos: {
      getBranch: ReturnType<typeof vi.fn>;
    };
    pulls: {
      list: ReturnType<typeof vi.fn>;
    };
    issues: {
      listComments: ReturnType<typeof vi.fn>;
      createComment: ReturnType<typeof vi.fn>;
      updateComment: ReturnType<typeof vi.fn>;
    };
  };
}
```

__Important:__ All properties are required (not optional) to ensure mocks are properly initialized. This prevents issues with optional chaining not setting up mocks correctly.

## Common Mocking Patterns

### Mocking GitHub API Calls

```typescript
// Mock successful branch check
mockOctokit.rest.repos.getBranch.mockResolvedValue({
  data: { name: "release/main", commit: { sha: "abc123" } },
});

// Mock branch not found
mockOctokit.rest.repos.getBranch.mockRejectedValue(new Error("Not Found"));

// Mock PR list
mockOctokit.rest.pulls.list.mockResolvedValue({
  data: [{ number: 123, title: "Release PR", state: "open" }],
});

// Mock check creation
mockOctokit.rest.checks.create.mockResolvedValue({ data: { id: 12345 } });
```

### Mocking @actions/exec

```typescript
import * as exec from "@actions/exec";
import type { ExecOptionsWithListeners } from "./utils/test-types.js";

vi.mock("@actions/exec");

// Mock successful execution with stdout
vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
  if (options?.listeners?.stdout) {
    options.listeners.stdout(Buffer.from(JSON.stringify({ releases: [], changesets: [] })));
  }
  return 0;
});

// Mock execution with stderr (error output)
vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
  if (options?.listeners?.stderr) {
    options.listeners.stderr(Buffer.from("Error: Build failed\n"));
  }
  throw new Error("Build failed");
});
```

### Mocking File System Operations

```typescript
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

vi.mock("node:fs");
vi.mock("node:fs/promises");

// Mock file existence
vi.mocked(existsSync).mockReturnValue(true);

// Mock file read with dynamic content based on path
vi.mocked(readFile).mockImplementation(async (path) => {
  const pathStr = String(path);
  if (pathStr.includes("pkg-a")) {
    return JSON.stringify({ name: "@test/pkg-a", publishConfig: { access: "public" } });
  }
  return '{"name": "@test/unknown"}';
});
```

### Mocking @actions/core

```typescript
import * as core from "@actions/core";

vi.mock("@actions/core");

beforeEach(() => {
  // Mock inputs
  vi.mocked(core.getInput).mockImplementation((name: string) => {
    if (name === "token") return "test-token";
    if (name === "package-manager") return "pnpm";
    return "";
  });

  // Mock boolean inputs
  vi.mocked(core.getBooleanInput).mockImplementation((name: string) => {
    if (name === "dry-run") return false;
    return false;
  });

  // Mock core.summary for check run output
  const mockSummary = {
    addHeading: vi.fn().mockReturnThis(),
    addEOL: vi.fn().mockReturnThis(),
    addTable: vi.fn().mockReturnThis(),
    addRaw: vi.fn().mockReturnThis(),
    addCodeBlock: vi.fn().mockReturnThis(),
    write: vi.fn().mockResolvedValue(undefined),
    stringify: vi.fn().mockReturnValue(""),
  };
  Object.defineProperty(core, "summary", { value: mockSummary, writable: true });
});
```

### Mocking GitHub Context

```typescript
import { context, getOctokit } from "@actions/github";

vi.mock("@actions/github");

beforeEach(() => {
  // Mock repository context
  Object.defineProperty(vi.mocked(context), "repo", {
    value: { owner: "test-owner", repo: "test-repo" },
    writable: true,
  });

  // Mock commit SHA
  Object.defineProperty(vi.mocked(context), "sha", { value: "abc123", writable: true });

  // Mock Octokit
  const mockOctokit = createMockOctokit();
  vi.mocked(getOctokit).mockReturnValue(mockOctokit as unknown as ReturnType<typeof getOctokit>);
});
```

## Testing Retry Logic with Fake Timers

Functions that implement retry logic with exponential backoff should use Vitest fake timers to avoid actually waiting for delays during tests. This makes tests run instantly instead of waiting for real timeouts.

### Pattern for Retry Tests

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("retry logic", () => {
  // Always reset timers in afterEach to prevent state bleeding between tests
  afterEach(() => {
    vi.useRealTimers(); // Reset to real timers after each test
  });

  it("should retry on transient failures", async () => {
    vi.useFakeTimers(); // Enable fake timers for this test

    // Setup mocks to fail then succeed
    mockApiCall
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockRejectedValueOnce(new Error("Timeout"))
      .mockResolvedValueOnce({ data: "success" });

    // Start the action and advance timers
    const actionPromise = myAction(mockArgs);
    await vi.advanceTimersByTimeAsync(60000); // Advance 60 seconds to cover all retries
    const result = await actionPromise;

    // Verify retries happened
    expect(mockApiCall).toHaveBeenCalledTimes(3);
    expect(result.success).toBe(true);
  });

  it("should fail after exhausting retries", async () => {
    vi.useFakeTimers();

    mockApiCall.mockRejectedValue(new Error("ETIMEDOUT: Persistent error"));

    const actionPromise = myAction(mockArgs);

    // Catch rejection in a controlled way to avoid unhandled rejection errors
    let caughtError: Error | null = null;
    actionPromise.catch((e: Error) => {
      caughtError = e;
    });

    await vi.advanceTimersByTimeAsync(60000); // Advance time to cover all retries
    await vi.runAllTimersAsync(); // Ensure all timers complete

    expect(caughtError).not.toBeNull();
    expect(caughtError?.message).toContain("ETIMEDOUT");
  });
});
```

### Key Points

| Guideline | Reason |
| --------- | ------ |
| Use `vi.useFakeTimers()` at the start of each retry test (not globally in `beforeEach`) | Global fake timers affect ALL async operations, not just `setTimeout`, which can break normal Promise resolution |
| Use `vi.advanceTimersByTimeAsync(milliseconds)` instead of `vi.runAllTimersAsync()` | More reliable timer advancement for exponential backoff |
| Set timeout to 60000ms (60 seconds) | Sufficient to cover all retry delays with exponential backoff up to 30s |
| Always call `vi.useRealTimers()` in `afterEach()` | Prevents timer state from affecting other tests |
| For expected rejections, use `.catch()` pattern | Avoids "Unhandled Rejection" errors in test output |

### Why Not Use Fake Timers Globally?

Using `vi.useFakeTimers()` in `beforeEach()` affects ALL async operations, not just `setTimeout`. This can break normal Promise resolution and cause tests to hang or fail. Only apply fake timers to specific tests that need them.

### Real-World Example

From [create-release-branch.test.ts](create-release-branch.test.ts):

```typescript
it("should retry on ECONNRESET errors", async () => {
  vi.useFakeTimers(); // Enable fake timers for retry test

  let versionCallCount = 0;
  vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
    if (cmd === "pnpm" && args?.[0] === "ci:version") {
      versionCallCount++;
      if (versionCallCount === 1) {
        throw new Error("ECONNRESET: Connection reset by peer");
      }
      return 0;
    }
    if (cmd === "git" && args?.includes("status") && args?.includes("--porcelain")) {
      if (options?.listeners?.stdout) {
        options.listeners.stdout(Buffer.from("M package.json\n"));
      }
    }
    return 0;
  });

  const actionPromise = createReleaseBranch();
  await vi.advanceTimersByTimeAsync(60000); // Advance time to cover all retries
  const result = await actionPromise;

  expect(result.created).toBe(true);
  expect(versionCallCount).toBe(2);
  expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("ECONNRESET"));
});
```

### Performance Improvement

Using fake timers dramatically improves test execution time:

| Without Fake Timers | With Fake Timers |
| ------------------- | ---------------- |
| ~14.5s (waiting for real delays) | ~2.4s (instant timer advancement) |

## Test File Template

```typescript
import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { myFunction } from "../src/utils/my-module.js";
import { cleanupTestEnvironment, createMockOctokit, setupTestEnvironment } from "./utils/github-mocks.js";
import type { MockOctokit } from "./utils/test-types.js";

// Mock all external dependencies at the top
vi.mock("@actions/core");
vi.mock("@actions/github");

describe("my-module", () => {
  let mockOctokit: MockOctokit;

  beforeEach(() => {
    setupTestEnvironment({ suppressOutput: true });

    // Mock core.summary
    const mockSummary = {
      addHeading: vi.fn().mockReturnThis(),
      addEOL: vi.fn().mockReturnThis(),
      addTable: vi.fn().mockReturnThis(),
      addRaw: vi.fn().mockReturnThis(),
      write: vi.fn().mockResolvedValue(undefined),
      stringify: vi.fn().mockReturnValue(""),
    };
    Object.defineProperty(core, "summary", { value: mockSummary, writable: true });

    // Setup octokit mock
    mockOctokit = createMockOctokit();
    vi.mocked(getOctokit).mockReturnValue(mockOctokit as unknown as ReturnType<typeof getOctokit>);
    Object.defineProperty(vi.mocked(context), "repo", {
      value: { owner: "test-owner", repo: "test-repo" },
      writable: true,
    });
    Object.defineProperty(vi.mocked(context), "sha", { value: "abc123", writable: true });
  });

  afterEach(() => {
    cleanupTestEnvironment();
  });

  it("should do X when Y", async () => {
    // Arrange - Setup specific mock behavior
    mockOctokit.rest.repos.getBranch.mockResolvedValue({
      data: { name: "main", commit: { sha: "abc123" } },
    });

    // Act - Call the function under test
    const result = await myFunction();

    // Assert - Verify results and mock calls
    expect(result.success).toBe(true);
    expect(mockOctokit.rest.repos.getBranch).toHaveBeenCalledWith({
      owner: "test-owner",
      repo: "test-repo",
      branch: "main",
    });
  });

  it("should handle errors gracefully", async () => {
    // Arrange
    mockOctokit.rest.repos.getBranch.mockRejectedValue(new Error("Not Found"));

    // Act
    const result = await myFunction();

    // Assert
    expect(result.success).toBe(false);
  });
});
```

## Testing Best Practices

### 1. Test All Code Paths

Cover all branches, switch cases, and error handling:

```typescript
describe("checkReleaseBranch", () => {
  it("should detect when branch does not exist", async () => {
    mockOctokit.rest.repos.getBranch.mockRejectedValue(new Error("Not Found"));
    const result = await checkReleaseBranch("release/main", "main", false);
    expect(result.exists).toBe(false);
  });

  it("should detect when branch exists with open PR", async () => {
    mockOctokit.rest.repos.getBranch.mockResolvedValue({ data: { name: "release/main" } });
    mockOctokit.rest.pulls.list.mockResolvedValue({
      data: [{ number: 123, state: "open" }],
    });
    const result = await checkReleaseBranch("release/main", "main", false);
    expect(result.exists).toBe(true);
    expect(result.hasOpenPr).toBe(true);
  });
});
```

### 2. Use Descriptive Test Names

Test names should describe the scenario and expected outcome:

```typescript
// ✅ Good - Clear scenario and expectation
it("should skip packages with type 'none' in changeset status", async () => {});
it("should create new comment when no existing sticky comment found", async () => {});

// ❌ Bad - Vague or unclear
it("should work", async () => {});
it("test error", async () => {});
```

### 3. Use Arrange-Act-Assert Pattern

```typescript
it("should detect publishable changes", async () => {
  // Arrange - Setup test data and mocks
  const changesetStatus = {
    releases: [{ name: "@test/pkg", newVersion: "1.0.0", type: "minor" }],
    changesets: [],
  };
  vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
    options?.listeners?.stdout?.(Buffer.from(JSON.stringify(changesetStatus)));
    return 0;
  });

  // Act - Execute the function under test
  const result = await detectPublishableChanges("pnpm", false);

  // Assert - Verify results
  expect(result.hasChanges).toBe(true);
  expect(result.packages).toHaveLength(1);
});
```

### 4. Test Edge Cases

Cover empty inputs, malformed data, and boundary conditions:

```typescript
describe("edge cases", () => {
  it("should handle empty changeset releases array", async () => {
    vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
      options?.listeners?.stdout?.(Buffer.from(JSON.stringify({ releases: [], changesets: [] })));
      return 0;
    });

    const result = await detectPublishableChanges("pnpm", false);
    expect(result.hasChanges).toBe(false);
  });

  it("should handle malformed JSON from changeset", async () => {
    vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
      options?.listeners?.stdout?.(Buffer.from("invalid json"));
      return 0;
    });

    const result = await detectPublishableChanges("pnpm", false);
    expect(result.packages).toEqual([]);
  });
});
```

## Debugging Tests

### View Test Output

```bash
# Run with verbose output
pnpm test --reporter=verbose

# Run single test file
pnpm test __tests__/check-release-branch.test.ts --reporter=verbose
```

### Debug Mock Calls

```typescript
// Log all calls to a mock
console.log(mockOctokit.rest.repos.getBranch.mock.calls);

// Check if mock was called with specific args
expect(mockOctokit.rest.repos.getBranch).toHaveBeenCalledWith({
  owner: "test-owner",
  repo: "test-repo",
  branch: "release/main",
});

// Check number of calls
expect(mockOctokit.rest.repos.getBranch).toHaveBeenCalledTimes(1);
```

## Common Issues

### "Mock not being called"

__Issue:__ Test expects mock to be called but it isn't

__Solution:__ Ensure the mock is set up before the function is called, and the function actually uses the mocked module:

```typescript
beforeEach(() => {
  mockOctokit = createMockOctokit();
  vi.mocked(getOctokit).mockReturnValue(mockOctokit as unknown as ReturnType<typeof getOctokit>);
});
```

### "Optional chaining prevents mock setup"

__Issue:__ Using `?.` when setting up mocks prevents them from being configured

```typescript
// ❌ WRONG - Optional chaining short-circuits if property is undefined
mockOctokit.rest.repos?.getBranch.mockResolvedValue({ data: {} });

// ✅ CORRECT - Use factory function that ensures all properties exist
mockOctokit = createMockOctokit();
mockOctokit.rest.repos.getBranch.mockResolvedValue({ data: {} });
```

### "Type error with mock return value"

__Issue:__ TypeScript complains about mock return value types

__Solution:__ Use `as unknown as Type` pattern:

```typescript
vi.mocked(getOctokit).mockReturnValue(mockOctokit as unknown as ReturnType<typeof getOctokit>);
```

### "Coverage not meeting threshold"

__Issue:__ Tests pass but coverage is below threshold

__Solution:__

1. Run `pnpm test` to see coverage report
2. Look at uncovered line numbers in the output
3. Add tests for those code paths

## Related Documentation

- [Root CLAUDE.md](../CLAUDE.md) - Repository overview
- [src/CLAUDE.md](../src/CLAUDE.md) - Source code architecture
- [Vitest Documentation](https://vitest.dev/) - Testing framework
- [Vitest Mocking](https://vitest.dev/guide/mocking.html) - Mocking guide
