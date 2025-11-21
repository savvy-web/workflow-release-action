# TypeScript GitHub Actions Development Guide

This document provides guidance for developing and testing TypeScript-based GitHub Actions in this repository.

## Table of Contents

* [Overview](#overview)
* [Shared Utilities](#shared-utilities)
  * [Shared Types](#shared-types)
  * [Shared Test Utilities](#shared-test-utilities)
* [Writing TypeScript Actions](#writing-typescript-actions)
  * [Action Structure](#action-structure)
  * [Using Core Summary Methods](#using-core-summary-methods)
  * [Environment Variables](#environment-variables)
  * [Input Validation](#input-validation)
  * [Error Handling](#error-handling)
* [Testing TypeScript Actions](#testing-typescript-actions)
  * [Test Structure](#test-structure)
  * [Using Shared Test Utilities](#using-shared-test-utilities)
  * [Mock Patterns](#mock-patterns)
  * [Coverage Requirements](#coverage-requirements)
  * [Running Tests](#running-tests)
* [Common Patterns](#common-patterns)
  * [GitHub Check Runs](#github-check-runs)
  * [Sticky Comments](#sticky-comments)
  * [Package Validation](#package-validation)

## Overview

All TypeScript actions in this repository use `actions/github-script@v8` to execute at runtime. This eliminates the need for a build step and provides full TypeScript type safety.

**Key Benefits:**

* No build step required (TypeScript runs directly via github-script)
* Full IDE autocomplete and type checking
* Easy testing with Vitest
* Shared utilities reduce code duplication

## Shared Utilities

### Shared Types

All common TypeScript interfaces are defined in [`.github/actions/shared/types.ts`](.github/actions/shared/types.ts).

**Import shared types:**

```typescript
import type { AsyncFunctionArguments, ValidationResult, PackageValidationResult } from "../shared/types.js";
```

**Available Types:**

* `AsyncFunctionArguments` - Standard parameters for all actions (see detailed documentation below)
* `ValidationResult` - Single check validation result
* `PackageValidationResult` - Package publish validation result

#### AsyncFunctionArguments Interface

The `AsyncFunctionArguments` interface defines the parameters that `actions/github-script@v8` passes to action handlers. It matches the official github-script type definition.

**Official Type Definition:**

Our shared type is based on the official github-script type definition:

```typescript
export interface AsyncFunctionArguments {
  /** GitHub Actions context */
  context: Context;
  /** GitHub Actions core module for logging and setting outputs */
  core: typeof core;
  /** GitHub API client (Octokit instance) */
  github: InstanceType<typeof GitHub>;
  /** GitHub API client (alias for github) */
  octokit: InstanceType<typeof GitHub>;
  /** GitHub Actions exec module for running commands */
  exec: typeof exec;
  /** GitHub Actions glob module for file pattern matching */
  glob: typeof glob;
  /** GitHub Actions io module for file operations */
  io: typeof io;
}
```

**Reference:** [actions/github-script type definition](https://github.com/actions/github-script/blob/main/types/async-function.d.ts)

**Key Points:**

1. **All modules are always provided** - Even if your action doesn't use them, `actions/github-script@v8` passes all modules to your handler
2. **Use destructuring to access only what you need** - You can destructure just the modules you need from the parameters
3. **Types are required, not optional** - All properties are required in the interface because github-script always provides them

**Using Only What You Need:**

You don't need to use all the modules - just destructure what your action needs:

```typescript
// Only need core and context
export default async ({ core, context }: AsyncFunctionArguments): Promise<void> => {
  core.info(`Running in ${context.repo.owner}/${context.repo.repo}`);
};

// Need core, exec, and github
export default async ({ core, exec, github, context }: AsyncFunctionArguments): Promise<void> => {
  await exec.exec("git", ["status"]);
  const repo = await github.rest.repos.get({
    owner: context.repo.owner,
    repo: context.repo.repo,
  });
  core.info(`Repository: ${repo.data.full_name}`);
};
```

**Passing External Modules:**

You can pass additional npm packages to your action handler beyond the standard github-script modules. This is essential when your action needs library-specific functionality like JSON parsing, workspace detection, or AI SDKs.

**When to Use External Modules:**

Use external modules when:

1. Your action needs functionality from npm packages (e.g., `jsonc-parser`, `workspace-tools`, `@anthropic-ai/sdk`)
2. The package provides APIs that can't be replicated with standard Node.js modules
3. You want to avoid reimplementing complex logic (e.g., JSONC parsing with comments)

**Two Patterns for External Modules:**

##### Pattern 1: Extending Shared Types (Recommended)

When you only need a few modules from the base `AsyncFunctionArguments`, use `Pick<>` to extend:

```typescript
import type { parse as parseJsonc } from "jsonc-parser";
import type { AsyncFunctionArguments as BaseAsyncFunctionArguments } from "../shared/types.js";

// Extend base types with external module
interface AsyncFunctionArguments extends Pick<BaseAsyncFunctionArguments, "core"> {
  /** JSONC parser function for parsing Biome config files */
  parse: typeof parseJsonc;
}

export default async ({ core, parse }: AsyncFunctionArguments, version?: string): Promise<void> => {
  const config = parse(configContent);
  core.setOutput("version", config.$schema);
};
```

**Why use `Pick<>`?**

* Maintains consistency with shared types
* Documents precisely which base modules you use
* Easier to refactor if shared types change

##### Pattern 2: Full Custom Interface

When your action's interface is significantly different, define a complete custom interface:

```typescript
import type Anthropic from "@anthropic-ai/sdk";
import type { GitHub } from "@actions/github/lib/utils";
import type { Context } from "@actions/github/lib/context";

interface AsyncFunctionArguments {
  core: typeof import("@actions/core");
  github: InstanceType<typeof GitHub>;
  context: Context;
  Anthropic: typeof Anthropic; // External SDK
}

export default async ({ core, github, context, Anthropic }: AsyncFunctionArguments): Promise<void> => {
  const apiKey = process.env.CLAUDE_OAUTH_TOKEN;
  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    messages: [{ role: "user", content: "Generate PR description" }],
  });

  core.setOutput("description", response.content);
};
```

**Real-World Examples:**

##### Example 1: JSONC Parser Module

```typescript
// .github/actions/biome/detect-biome-version.ts
import type { parse as parseJsonc } from "jsonc-parser";
import type { AsyncFunctionArguments as BaseAsyncFunctionArguments } from "../shared/types.js";

interface AsyncFunctionArguments extends Pick<BaseAsyncFunctionArguments, "core"> {
  parse: typeof parseJsonc;
}

export default async ({ core, parse }: AsyncFunctionArguments, providedVersion?: string): Promise<void> => {
  const content = await readFile("biome.jsonc", "utf-8");
  const config = parse(content); // Handles JSON with comments
  const version = extractVersionFromSchema(config.$schema);
  core.setOutput("version", version);
};
```

Action YAML:

```yaml
- uses: actions/github-script@v8
  with:
    script: |
      const { parse } = await import("jsonc-parser");
      const { default: detectBiomeVersion } = await import('${{ github.workspace }}/.github/actions/biome/detect-biome-version.ts');
      await detectBiomeVersion({ core, parse }, '${{ inputs.version }}');
```

##### Example 2: Workspace Tools Module

```typescript
// .github/actions/setup-release/detect-repo-type.ts
import type { AsyncFunctionArguments as BaseAsyncFunctionArguments } from "../shared/types.js";

interface AsyncFunctionArguments extends Pick<BaseAsyncFunctionArguments, "core"> {
  workspaceTools: typeof import("workspace-tools");
}

export default async ({ core, workspaceTools }: AsyncFunctionArguments): Promise<void> => {
  const workspaces = workspaceTools.getWorkspaces(process.cwd());
  const isMonorepo = Object.keys(workspaces).length > 1;
  core.setOutput("repo-type", isMonorepo ? "monorepo" : "single-package");
};
```

Action YAML:

```yaml
- uses: actions/github-script@v8
  with:
    script: |
      const workspaceTools = await import("workspace-tools");
      const { default: detectRepoType } = await import('${{ github.workspace }}/.github/actions/setup-release/detect-repo-type.ts');
      await detectRepoType({ core, workspaceTools });
```

##### Example 3: Anthropic SDK with OAuth

```typescript
// .github/actions/setup-release/generate-pr-description.ts
import type Anthropic from "@anthropic-ai/sdk";
import type { GitHub } from "@actions/github/lib/utils";
import type { Context } from "@actions/github/lib/context";

interface AsyncFunctionArguments {
  core: typeof import("@actions/core");
  github: InstanceType<typeof GitHub>;
  context: Context;
  Anthropic: typeof Anthropic; // SDK class, not instance
}

export default async ({ core, github, context, Anthropic }: AsyncFunctionArguments): Promise<void> => {
  const apiKey = process.env.CLAUDE_OAUTH_TOKEN;
  if (!apiKey) {
    core.setFailed("CLAUDE_OAUTH_TOKEN is required");
    return;
  }

  // Instantiate SDK inside handler
  const anthropic = new Anthropic({ apiKey });

  // Use SDK to generate content
  const response = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
    messages: [{ role: "user", content: "Generate a PR description based on commits" }],
  });

  core.setOutput("description", response.content[0].text);
};
```

Action YAML:

```yaml
env:
  CLAUDE_OAUTH_TOKEN: ${{ secrets.CLAUDE_OAUTH_TOKEN }}
steps:
  - uses: actions/github-script@v8
    with:
      script: |
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const { default: generatePRDescription } = await import('${{ github.workspace }}/.github/actions/setup-release/generate-pr-description.ts');
        await generatePRDescription({ core, github, context, Anthropic });
```

**Important Notes on External Modules:**

1. **Pass classes, not instances**: Pass `Anthropic` (the class), not `new Anthropic()`. This allows the handler to instantiate with proper configuration.
2. **Use OAuth tokens in secrets**: For AI SDKs, use OAuth tokens via `secrets.CLAUDE_OAUTH_TOKEN`, not API keys.
3. **Import in YAML, not TS**: Import external modules in the YAML script block, not at the top of your TypeScript file.
4. **Handle module errors**: External modules may not be installed in all environments - handle import failures gracefully.

**Testing External Modules:**

When testing actions with external modules, create custom mock interfaces and use `as never` casts:

```typescript
import { vi } from "vitest";
import type { parse as parseJsonc } from "jsonc-parser";

interface MockArgs {
  core: MockCore;
  parse: typeof parseJsonc; // Type matches the real module
}

describe("detectBiomeVersion", () => {
  let mockCore: MockCore;
  let mockParse: ReturnType<typeof vi.fn>;
  let mockArgs: MockArgs;

  beforeEach(() => {
    mockCore = createMockCore();
    mockParse = vi.fn(); // Mock function with same signature
    mockArgs = {
      core: mockCore as never,
      parse: mockParse as never, // Cast to bypass type checking
    };
  });

  it("should parse JSONC config", async () => {
    mockParse.mockReturnValueOnce({ $schema: "https://biomejs.dev/schemas/2.3.6/schema.json" });

    await detectBiomeVersion(mockArgs as never); // Cast entire args object

    expect(mockParse).toHaveBeenCalled();
    expect(mockCore.setOutput).toHaveBeenCalledWith("version", "2.3.6");
  });
});
```

**Why use `as never` casts?**

* TypeScript can't perfectly match mock types to real module types
* `as never` bypasses type checking while maintaining test safety
* Runtime behavior is correct even though TypeScript can't verify it
* Alternative is verbose type assertions that don't add value

### Shared Test Utilities

Common test utilities are defined in [`__tests__/test-utils.ts`](__tests__/test-utils.ts).

**Import test utilities:**

```typescript
import {
  type MockCore,
  type MockExec,
  type MockGithub,
  type MockContext,
  createMockCore,
  createMockExec,
  createMockGithub,
  createMockContext,
  createMockAsyncFunctionArguments,
  setupTestEnvironment,
  cleanupTestEnvironment,
  suppressConsoleOutput,
} from "./utils/github-mocks.js";
import type { AsyncFunctionArguments } from "../.github/actions/shared/types.js";
```

#### Recommended Testing Pattern

**Good Pattern (Using Shared Utilities):**

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import myAction from "../.github/actions/my-action/my-action.js";
import { createMockAsyncFunctionArguments, createMockCore, type MockCore } from "./utils/github-mocks.js";
import type { AsyncFunctionArguments } from "../.github/actions/shared/types.js";

describe("myAction", () => {
  let mockCore: MockCore;
  let mockArgs: AsyncFunctionArguments;
  let mockGithub: {
    rest: {
      checks: { create: ReturnType<typeof vi.fn> };
      issues: { get: ReturnType<typeof vi.fn> };
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockCore = createMockCore();

    mockGithub = {
      rest: {
        checks: {
          create: vi.fn().mockResolvedValue({
            data: { id: 12345, html_url: "https://github.com/..." },
          }),
        },
        issues: {
          get: vi.fn(),
        },
      },
    };

    mockArgs = createMockAsyncFunctionArguments({
      core: mockCore as never,
      github: mockGithub as never,
      context: {
        repo: { owner: "test-owner", repo: "test-repo" },
        sha: "abc123",
      } as never,
    });
  });

  it("should execute successfully", async () => {
    mockGithub.rest.issues.get.mockResolvedValue({
      data: { title: "Test Issue", state: "open" },
    });

    await myAction(mockArgs);

    expect(mockCore.setOutput).toHaveBeenCalledWith("result", "success");
    expect(mockGithub.rest.checks.create).toHaveBeenCalled();
  });
});
```

**Anti-pattern (Verbose Manual Mocks):**

```typescript
// ❌ DO NOT USE - Repetitive and error-prone
describe("myAction", () => {
  let mockCore: { /* manual mock definition */ };
  let mockGithub: { /* manual mock definition */ };
  let mockContext: { /* manual mock definition */ };

  beforeEach(() => {
    // Manual mock setup for every property
    mockCore = {
      setOutput: vi.fn(),
      info: vi.fn(),
      notice: vi.fn(),
      // ... 10+ more methods
      summary: {
        addHeading: vi.fn().mockReturnThis(),
        addRaw: vi.fn().mockReturnThis(),
        // ... missing stringify()! Tests will fail!
      },
    };

    mockGithub = { /* ... */ };
    mockContext = { /* ... */ };
  });

  it("should execute successfully", async () => {
    // ❌ Verbose and repetitive - must pass all 7 arguments
    await myAction({
      core: mockCore as never,
      github: mockGithub as never,
      octokit: mockGithub as never,
      exec: {} as never,
      glob: {} as never,
      io: {} as never,
      context: mockContext as never,
    });
  });
});
```

**Benefits of Shared Utilities:**

1. **Less Repetition** - Single line: `await myAction(mockArgs)` instead of 7 arguments
2. **Type Safety** - Helper ensures all required properties are present
3. **Consistency** - All tests use the same mock behavior
4. **Easy Overrides** - Only override what you need for each test
5. **Correct Mocks** - Shared mocks include `stringify()` and other essential methods
6. **Maintainability** - Fix bugs once in test-utils.ts, all tests benefit

**Key Points:**

* **Always use `createMockAsyncFunctionArguments()`** for passing arguments to actions
* **Extract specific mocks** (`mockCore`, `mockGithub`) when you need to set expectations
* **Override only what you need** - Pass overrides to `createMockAsyncFunctionArguments()`
* **Use shared types** - Import `MockCore`, `AsyncFunctionArguments` from test-utils

## Writing TypeScript Actions

### Action Structure

**Minimal Action Template:**

```typescript
import type * as core from "@actions/core";
import type { Context } from "@actions/github/lib/context";
import type { GitHub } from "@actions/github/lib/utils";
import type { AsyncFunctionArguments } from "../shared/types.js";

/**
 * Main action entrypoint
 */
export default async ({ core, github, context }: AsyncFunctionArguments): Promise<void> => {
 try {
  // Your action logic here
  core.info("Action started");

  // Set outputs
  core.setOutput("result", "success");
  core.notice("✓ Action completed successfully");
 } catch (error) {
  /* v8 ignore next -- @preserve */
  core.setFailed(`Action failed: ${error instanceof Error ? error.message : String(error)}`);
 }
};
```

**Composite Action Definition (action.yml):**

```yaml
name: My TypeScript Action
description: An action written in TypeScript
outputs:
  result:
    description: Action result
    value: ${{ steps.run.outputs.result }}

runs:
  using: composite
  steps:
    - name: Run TypeScript action
      id: run
      uses: actions/github-script@v8
      with:
        script: |
          const { default: script } = await import('${{ github.workspace }}/.github/actions/my-action/my-action.ts');
          await script({ core, github, context });
```

### Using Core Summary Methods

The `core.summary` API provides methods for creating rich job summaries with tables, headings, and code blocks.

**Available Methods:**

* `addHeading(text, level)` - Add heading (level 1-6)
* `addRaw(text)` - Add raw Markdown text
* `addEOL()` - Add end-of-line (newline)
* `addTable(rows)` - Add Markdown table
* `addCodeBlock(code, lang)` - Add code block
* `write()` - Write summary to file (returns Promise)

**Example:**

```typescript
await core.summary
 .addHeading("Validation Results", 2)
 .addRaw("All checks passed!")
 .addEOL()
 .addHeading("Details", 3)
 .addTable([
  [
   { data: "Check", header: true },
   { data: "Status", header: true },
   { data: "Details", header: true },
  ],
  ["Build", "✅ Passed", "All packages built successfully"],
  ["Lint", "✅ Passed", "No linting errors found"],
 ])
 .write();
```

**Important:** All summary methods except `write()` return `this` for method chaining. Always call `write()` at the end to persist the summary.

#### Building Check Details with core.summary

When creating GitHub check runs, use `core.summary` methods with `stringify()` to build the check details Markdown.

**Good Pattern:**

```typescript
// Build check details using core.summary methods
const checkSummaryBuilder = core.summary
  .addHeading("Validation Results", 2)
  .addEOL()
  .addTable([
    [
      { data: "Package", header: true },
      { data: "Version", header: true },
      { data: "Status", header: true },
    ],
    ["@myorg/package-a", "1.0.0", "✅ Ready"],
    ["@myorg/package-b", "2.0.0", "✅ Ready"],
  ]);

if (hasErrors) {
  checkSummaryBuilder
    .addEOL()
    .addHeading("Errors", 3)
    .addEOL()
    .addCodeBlock(errorLog, "text");
}

if (dryRun) {
  checkSummaryBuilder
    .addEOL()
    .addEOL()
    .addRaw("---")
    .addEOL()
    .addRaw("**Mode**: Dry Run (Preview Only)");
}

const checkDetails = checkSummaryBuilder.stringify();

// Use checkDetails in check run
await github.rest.checks.create({
  owner: context.repo.owner,
  repo: context.repo.repo,
  name: "Validation",
  head_sha: context.sha,
  status: "completed",
  conclusion: success ? "success" : "failure",
  output: {
    title: "Validation Summary",
    summary: checkDetails,
  },
});
```

**Anti-pattern (DO NOT USE):**

```typescript
// ❌ Hand-written markdown with template literals
const checkDetails = `
## Validation Results

| Package | Version | Status |
|---------|---------|--------|
${packages.map(pkg => `| ${pkg.name} | ${pkg.version} | ✅ Ready |`).join("\n")}

${hasErrors ? `
### Errors

\`\`\`
${errorLog}
\`\`\`
` : ""}

${dryRun ? "\n---\n**Mode**: Dry Run (Preview Only)" : ""}
`.trim();
```

**Why avoid hand-written Markdown?**

1. **No type safety** - Easy to make formatting mistakes
2. **Harder to maintain** - Nested template literals are difficult to read
3. **Inconsistent** - Different actions might format things differently
4. **Error-prone** - Easy to forget `.trim()` or introduce extra whitespace
5. **Less testable** - Harder to verify correct structure in tests

**Benefits of core.summary:**

1. **Type-safe** - IDE autocomplete and compile-time checks
2. **Consistent** - Same API across all actions
3. **Chainable** - Clean, readable method chains
4. **Conditional** - Easy to add/remove sections based on conditions
5. **Testable** - Mocks can track method calls and build actual output

### Environment Variables

**Reading Environment Variables:**

```typescript
const prNumber = process.env.PR_NUMBER;
const dryRun = process.env.DRY_RUN === "true";
```

**Validating Required Variables:**

```typescript
if (!process.env.PR_NUMBER) {
 core.setFailed("PR_NUMBER environment variable is required");
 return;
}

const prNumber = Number.parseInt(process.env.PR_NUMBER, 10);
if (Number.isNaN(prNumber) || prNumber <= 0) {
 core.setFailed(`Invalid PR_NUMBER: ${process.env.PR_NUMBER}. Must be a positive integer.`);
 return;
}
```

### Input Validation

**Comprehensive Input Validation Pattern:**

```typescript
export default async ({ core, github, context }: AsyncFunctionArguments): Promise<void> => {
 try {
  const validationsJson = process.env.VALIDATIONS;

  // 1. Check required fields
  if (!validationsJson) {
   core.setFailed("VALIDATIONS environment variable is required");
   return;
  }

  // 2. Parse JSON
  const validations: ValidationResult[] = JSON.parse(validationsJson);

  // 3. Validate structure
  if (!Array.isArray(validations) || validations.length === 0) {
   core.setFailed("VALIDATIONS must be a non-empty array");
   return;
  }

  // 4. Validate individual items
  for (const validation of validations) {
   if (
    typeof validation.name !== "string" ||
    typeof validation.success !== "boolean" ||
    typeof validation.checkId !== "number"
   ) {
    core.setFailed(
     `Invalid validation result structure: ${JSON.stringify(validation)}. Expected: { name: string, success: boolean, checkId: number, message?: string }`,
    );
    return;
   }
  }

  // Proceed with validated data
  // ...
 } catch (error) {
  /* v8 ignore next -- @preserve */
  core.setFailed(`Action failed: ${error instanceof Error ? error.message : String(error)}`);
 }
};
```

### Error Handling

**Standard Error Handling Pattern:**

```typescript
try {
 // Action logic
} catch (error) {
 /* v8 ignore next -- @preserve */
 core.setFailed(`Action failed: ${error instanceof Error ? error.message : String(error)}`);
}
```

**Why use `/* v8 ignore next -- @preserve */`?**

The ternary operator's non-Error branch (`String(error)`) is difficult to test in practice because:

1. JavaScript/TypeScript errors are almost always `Error` instances
2. Testing the `String(error)` path requires throwing non-Error values, which is rare

The v8 ignore comment tells the coverage tool to skip the next line, preventing false coverage failures.

## Testing TypeScript Actions

### Test Structure

**Standard Test File Template:**

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
 type MockCore,
 type MockGithub,
 type MockContext,
 cleanupTestEnvironment,
 createMockCore,
 createMockGithub,
 createMockContext,
 setupTestEnvironment,
} from "./utils/github-mocks.js";
import myAction from "../.github/actions/my-action/my-action.js";

describe("myAction", () => {
 let mockCore: MockCore;
 let mockGithub: MockGithub;
 let mockContext: MockContext;

 beforeEach(() => {
  setupTestEnvironment();

  mockCore = createMockCore();
  mockGithub = createMockGithub();
  mockContext = createMockContext();

  // Setup environment variables
  delete process.env.MY_VAR;
 });

 afterEach(() => {
  cleanupTestEnvironment();
 });

 describe("happy path", () => {
  it("should execute successfully with valid inputs", async () => {
   process.env.MY_VAR = "test-value";

   await myAction({
    core: mockCore as never,
    github: mockGithub as never,
    context: mockContext as never,
   });

   expect(mockCore.setOutput).toHaveBeenCalledWith("result", "success");
   expect(mockCore.notice).toHaveBeenCalledWith("✓ Action completed successfully");
  });
 });

 describe("error handling", () => {
  it("should handle errors gracefully", async () => {
   // Test error scenarios
  });
 });
});
```

### Using Shared Test Utilities

**Basic Setup:**

```typescript
beforeEach(() => {
 setupTestEnvironment();

 mockCore = createMockCore();
 mockGithub = createMockGithub();
 mockContext = createMockContext();
});

afterEach(() => {
 cleanupTestEnvironment();
});
```

**With Console Output Suppression:**

```typescript
beforeEach(() => {
 setupTestEnvironment({ suppressOutput: true });
 // ... rest of setup
});
```

**Custom Mock Configurations:**

```typescript
// Custom GitHub check/comment IDs
mockGithub = createMockGithub({
 checkId: 999,
 checkUrl: "https://github.com/my-org/my-repo/runs/999",
 commentId: 123,
 commentUrl: "https://github.com/my-org/my-repo/issues/1#issuecomment-123",
});

// Custom context values
mockContext = createMockContext({
 owner: "my-org",
 repo: "my-repo",
 sha: "abc123def456",
});

// Custom exec return value
mockExec = createMockExec(1); // Returns exit code 1
```

### Mock Patterns

**Overriding Mock Return Values:**

```typescript
it("should handle specific scenario", async () => {
 // Override default mock behavior
 vi.mocked(mockGithub.rest.issues.createComment).mockResolvedValueOnce({
  data: {
   id: 456,
   html_url: "https://github.com/owner/repo/pull/789#issuecomment-456",
  },
 } as never);

 await myAction({
  core: mockCore as never,
  github: mockGithub as never,
  context: mockContext as never,
 });

 expect(mockGithub.rest.issues.createComment).toHaveBeenCalled();
});
```

**Testing Exec with Listeners:**

```typescript
it("should capture build output", async () => {
 mockExec.exec.mockImplementation(async (command, args, options) => {
  // Simulate stdout output
  if (options?.listeners?.stdout) {
   options.listeners.stdout(Buffer.from("Build successful"));
  }
  return 0;
 });

 await myAction({
  core: mockCore as never,
  exec: mockExec as never,
  github: mockGithub as never,
  context: mockContext as never,
 });

 expect(mockExec.exec).toHaveBeenCalled();
});
```

### Testing Retry Logic with Fake Timers

Actions that implement retry logic with exponential backoff should use Vitest fake timers to avoid actually waiting for delays during tests. This makes tests run instantly instead of waiting for real timeouts.

**Pattern for retry tests:**

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
      .mockRejectedValueOnce(new Error("Network error"))
      .mockRejectedValueOnce(new Error("Timeout"))
      .mockResolvedValueOnce({ data: "success" });

    // Start the action and advance timers
    const actionPromise = myAction(mockArgs);
    await vi.advanceTimersByTimeAsync(60000); // Advance 60 seconds to cover all retries
    await actionPromise;

    // Verify retries happened
    expect(mockApiCall).toHaveBeenCalledTimes(3);
    expect(mockCore.setOutput).toHaveBeenCalledWith("result", "success");

    vi.useRealTimers(); // Clean up (also in afterEach as safety)
  });

  it("should fail after exhausting retries", async () => {
    vi.useFakeTimers();

    mockApiCall.mockRejectedValue(new Error("Persistent error"));

    const actionPromise = myAction(mockArgs);
    await vi.advanceTimersByTimeAsync(60000);
    await actionPromise;

    expect(mockApiCall).toHaveBeenCalledTimes(4); // Initial + 3 retries
    expect(mockCore.warning).toHaveBeenCalledWith(
      expect.stringContaining("Failed after retries")
    );

    vi.useRealTimers();
  });
});
```

**Key points:**

* Use `vi.useFakeTimers()` at the start of each retry test (not globally in `beforeEach`)
* Use `vi.advanceTimersByTimeAsync(milliseconds)` instead of `vi.runAllTimersAsync()` for more reliable timer advancement
* Set the timeout high enough to cover all retry delays (60000ms / 60 seconds is usually sufficient for exponential backoff with max 30s delays)
* Always call `vi.useRealTimers()` at the end of each test AND in `afterEach()` to prevent timer state from affecting other tests
* Never use `vi.restoreAllMocks()` in `afterEach()` if you have module-level mocks that need to persist (like SDK mocks)

**Why not use fake timers globally?**

Using `vi.useFakeTimers()` in `beforeEach()` affects ALL async operations, not just `setTimeout`. This can break normal Promise resolution and cause tests to hang or fail. Only apply fake timers to specific tests that need them.

### Coverage Requirements

**Minimum Coverage Thresholds:**

* Statement coverage: 90%
* Branch coverage: 90%
* Line coverage: 90%

**Aim for 100% coverage when possible.** Use `/* v8 ignore next -- @preserve */` only for truly untestable edge cases.

**Coverage Tips:**

1. Test all code paths (if/else, switch cases, ternary operators)
2. Test both Error and non-Error exceptions where applicable
3. Test all input validation scenarios (missing, invalid, edge cases)
4. Test all output scenarios (success, failure, dry-run)
5. Verify all `setOutput` calls and their values

### Running Tests

**Run All Tests:**

```bash
pnpm test
```

**Run Specific Test File:**

```bash
pnpm test __tests__/my-action.test.ts
```

**Run Tests in Watch Mode:**

```bash
pnpm test --watch
```

**View Coverage Report:**

Coverage reports are automatically generated in `coverage/` directory after running tests. Open `coverage/index.html` in a browser to view detailed coverage information.

**Test Output:**

The test command (`pnpm test`) runs with:

* `--run` flag (non-watch mode)
* `--reporter=verbose` (detailed test output)
* Coverage enabled by default

## Common Patterns

### GitHub Check Runs

**Creating Check Runs:**

```typescript
const { data: checkRun } = await github.rest.checks.create({
 owner: context.repo.owner,
 repo: context.repo.repo,
 name: "My Check",
 head_sha: context.sha,
 status: "completed",
 conclusion: success ? "success" : "failure",
 output: {
  title: "Check Summary",
  summary: "Detailed results...",
 },
});

core.setOutput("check_id", checkRun.id.toString());
```

**Check Conclusions:**

* `success` - All validations passed
* `failure` - One or more validations failed
* `neutral` - Check completed but result is neutral
* `action_required` - User action required (e.g., resolve conflicts)

### Sticky Comments

**Creating/Updating Sticky Comments:**

```typescript
const identifierMarker = `<!-- sticky-comment-id: ${commentIdentifier} -->`;
const commentBody = `## My Comment\n\nContent here\n\n${identifierMarker}`;

const { data: comments } = await github.rest.issues.listComments({
 owner: context.repo.owner,
 repo: context.repo.repo,
 issue_number: prNumber,
 per_page: 100,
});

const existingComment = comments.find((comment) => comment.body?.includes(identifierMarker));

if (existingComment) {
 // Update existing
 await github.rest.issues.updateComment({
  owner: context.repo.owner,
  repo: context.repo.repo,
  comment_id: existingComment.id,
  body: commentBody,
 });
} else {
 // Create new
 await github.rest.issues.createComment({
  owner: context.repo.owner,
  repo: context.repo.repo,
  issue_number: prNumber,
  body: commentBody,
 });
}
```

### Package Validation

**Validating NPM Package Publish:**

```typescript
const publishCmd = packageManager === "yarn" ? "yarn" : "npm";
const publishArgs = packageManager === "yarn" ? ["publish", "--dry-run"] : ["publish", "--dry-run", "--provenance", "--json"];

let publishStdout = "";
let publishStderr = "";

const exitCode = await exec.exec(publishCmd, publishArgs, {
 cwd: packagePath,
 ignoreReturnCode: true,
 listeners: {
  stdout: (data: Buffer): void => {
   publishStdout += data.toString();
  },
  stderr: (data: Buffer): void => {
   publishStderr += data.toString();
  },
 },
});

if (exitCode !== 0) {
 // Handle specific error cases
 if (publishError.includes("E403")) {
  return { canPublish: false, message: "Permission denied" };
 }
 if (publishError.includes("Cannot publish over existing version")) {
  return { canPublish: false, message: "Version conflict" };
 }
}
```

## Best Practices

1. **Always use shared types** - Import from `.github/actions/shared/types.ts`
2. **Always use shared test utilities** - Import from `__tests__/test-utils.ts`
3. **Write comprehensive tests** - Aim for 100% coverage
4. **Validate all inputs** - Check required fields, types, and structure
5. **Use core.summary for output** - Create rich job summaries with tables
6. **Handle errors gracefully** - Always use try-catch with `core.setFailed()`
7. **Set clear outputs** - Use descriptive output names and values
8. **Document your actions** - Use TSDoc comments for all functions
9. **Test all code paths** - Cover happy path, errors, and edge cases
10. **Run tests before committing** - Ensure `pnpm test` passes

## Additional Resources

* [CLAUDE.md](CLAUDE.md) - Repository-wide Claude Code guidance
* [Shared Types](.github/actions/shared/types.ts) - Type definitions
* [Test Utilities](__tests__/test-utils.ts) - Testing utilities
* [Example Actions](.github/actions/setup-release/) - Reference implementations
