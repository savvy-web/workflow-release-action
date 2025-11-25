# **tests**/CLAUDE.md

Unit testing strategy, mocking patterns, and coverage requirements for workflow-runtime-action.

**See also:** [Root CLAUDE.md](../CLAUDE.md) for repository overview | [**fixtures**/CLAUDE.md](../__fixtures__/CLAUDE.md) for integration testing.

## Testing Strategy

This action uses a **dual testing approach**:

1. **Unit Tests** (this document) - Fast, isolated tests of individual utility functions with Vitest
2. **Fixture Tests** (see [**fixtures**/CLAUDE.md](../__fixtures__/CLAUDE.md)) - Real-world integration tests in GitHub Actions workflows

Unit tests provide fast feedback during development and ensure code coverage thresholds are met.

## Test Organization

```text
__tests__/
├── cache-utils.test.ts       # Dependency caching tests
├── install-biome.test.ts     # Biome installation tests
├── install-bun.test.ts       # Bun installation tests
├── install-deno.test.ts      # Deno installation tests
├── install-node.test.ts      # Node.js installation tests
├── main.test.ts              # Main action orchestration tests
└── utils/
    └── github-mocks.ts       # Shared test utilities
```

## Running Tests

```bash
# Run all tests with coverage
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run specific test file
pnpm test __tests__/install-node.test.ts

# View coverage report
open coverage/index.html
```

## Coverage Requirements

Configured in [../vitest.config.ts](../vitest.config.ts):

```json
{
  "branches": 85,
  "functions": 90,
  "lines": 90,
  "statements": 90
}
```

**Current Coverage:**

* **88% branch coverage** ✅ (exceeds 85% threshold)
* **~95%+ function/line/statement coverage** ✅ (exceeds 90% threshold)

## Mocking Strategy

All external dependencies are mocked using Vitest to ensure tests are:

* **Fast** - No network requests or file system operations
* **Reliable** - No flaky tests due to external dependencies
* **Isolated** - Each test runs independently

### Basic Mock Setup

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import { HttpClient } from "@actions/http-client";
import { readdirSync } from "node:fs";

// Mock all external modules
vi.mock("@actions/core");
vi.mock("@actions/tool-cache");
vi.mock("@actions/http-client");
vi.mock("node:fs");

describe("installNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    vi.mocked(core.info).mockImplementation(() => {});
    vi.mocked(tc.find).mockReturnValue("");
  });

  it("should install Node.js", async () => {
    // Test implementation
  });
});
```

### Type-Safe Mocking

**Never use `any` types.** Always use `as unknown as Type`:

```typescript
// ✅ Correct - Type-safe mock
vi.mocked(readdirSync).mockReturnValue(
  ["node-v20.11.0-linux-x64"] as unknown as ReturnType<typeof readdirSync>
);

// ✅ Correct - Class instance mock
vi.mocked(HttpClient).mockImplementation(
  () => ({ get: mockGet }) as unknown as InstanceType<typeof HttpClient>
);

// ❌ Incorrect - Using 'any'
vi.mocked(readdirSync).mockReturnValue(["file.txt"] as any);
```

This ensures type safety and catches errors at compile time.

## Common Mocking Patterns

### Mocking HTTP Requests

For functions that download binaries from external sources:

```typescript
import * as tc from "@actions/tool-cache";

beforeEach(() => {
  vi.mocked(tc.downloadTool).mockResolvedValue("/tmp/download-path");
  vi.mocked(tc.extractTar).mockResolvedValue("/tmp/extracted-path");
  vi.mocked(tc.cacheDir).mockResolvedValue("/cached/tool/path");
});
```

### Mocking File System Operations

For functions that read or write files:

```typescript
import { existsSync, readFileSync, readdirSync } from "node:fs";

beforeEach(() => {
  // Mock file existence checks
  vi.mocked(existsSync).mockReturnValue(true);

  // Mock file reads
  vi.mocked(readFileSync).mockReturnValue('{"version": "2.3.6"}');

  // Mock directory listings
  vi.mocked(readdirSync).mockReturnValue(
    ["node-v20.11.0-linux-x64"] as unknown as ReturnType<typeof readdirSync>
  );
});
```

### Mocking @actions/tool-cache

For functions that download and cache binaries:

```typescript
import * as tc from "@actions/tool-cache";

beforeEach(() => {
  // Mock tool cache lookup
  vi.mocked(tc.find).mockReturnValue("");

  // Mock downloads
  vi.mocked(tc.downloadTool).mockResolvedValue("/tmp/download");

  // Mock extraction
  vi.mocked(tc.extractTar).mockResolvedValue("/tmp/extracted");
  vi.mocked(tc.extractZip).mockResolvedValue("/tmp/extracted");

  // Mock caching
  vi.mocked(tc.cacheDir).mockResolvedValue("/cached/path");
});
```

### Mocking @actions/core

For action inputs, outputs, and logging:

```typescript
import * as core from "@actions/core";

beforeEach(() => {
  // Mock inputs
  vi.mocked(core.getInput).mockImplementation((name: string) => {
    const inputs: Record<string, string> = {
      "node-version": "20.x",
      "package-manager": "pnpm",
    };
    return inputs[name] || "";
  });

  // Mock outputs
  vi.mocked(core.setOutput).mockImplementation(() => {});

  // Mock logging
  vi.mocked(core.info).mockImplementation(() => {});
  vi.mocked(core.warning).mockImplementation(() => {});
  vi.mocked(core.error).mockImplementation(() => {});
});
```

## Testing Best Practices

### 1. Test All Code Paths

Cover all branches, switch cases, and error handling:

```typescript
describe("installNode", () => {
  it("should handle cached Node.js", async () => {
    vi.mocked(tc.find).mockReturnValue("/cached/node");
    // Test cached path
  });

  it("should download Node.js if not cached", async () => {
    vi.mocked(tc.find).mockReturnValue("");
    vi.mocked(tc.downloadTool).mockResolvedValue("/tmp/download");
    // Test download path
  });

  it("should throw error on download failure", async () => {
    vi.mocked(tc.find).mockReturnValue("");
    vi.mocked(tc.downloadTool).mockRejectedValue(new Error("Network error"));
    // Test error handling
  });
});
```

### 2. Test Configuration Validation

Test validation of package.json devEngines configuration:

```typescript
describe("validateRuntimeConfig", () => {
  it("should validate exact versions", () => {
    const config = { name: "node", version: "24.10.0", onFail: "error" };
    expect(() => validateRuntimeConfig(config, 0)).not.toThrow();
  });

  it("should reject missing onFail", () => {
    const config = { name: "node", version: "24.10.0" };
    expect(() => validateRuntimeConfig(config, 0)).toThrow("onFail must be");
  });

  it("should reject wrong onFail value", () => {
    const config = { name: "node", version: "24.10.0", onFail: "warn" };
    expect(() => validateRuntimeConfig(config, 0)).toThrow('onFail must be "error"');
  });
});
```

### 3. Test Platform Differences

Test platform-specific behavior (Linux tar vs Windows zip):

```typescript
describe("platform-specific extraction", () => {
  it("should use extractTar on Linux", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("linux");
    await installNode({ version: "20.11.0" });
    expect(tc.extractTar).toHaveBeenCalled();
  });

  it("should use extractZip on Windows", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    await installNode({ version: "20.11.0" });
    expect(tc.extractZip).toHaveBeenCalled();
  });
});
```

### 4. Test Error Scenarios

Ensure errors are handled gracefully:

```typescript
describe("error handling", () => {
  it("should throw on download failure", async () => {
    vi.mocked(tc.downloadTool).mockRejectedValue(new Error("Network error"));

    await expect(installNode({ version: "20.11.0" }))
      .rejects.toThrow("Network error");
  });

  it("should throw on extraction failure", async () => {
    vi.mocked(tc.extractTar).mockRejectedValue(new Error("Extraction failed"));

    await expect(installNode({ version: "20.11.0" }))
      .rejects.toThrow("Extraction failed");
  });
});
```

### 5. Test Edge Cases

Cover empty inputs, malformed data, missing configuration:

```typescript
describe("edge cases", () => {
  it("should handle missing devEngines", async () => {
    vi.mocked(readFile).mockResolvedValue("{}");

    await expect(parsePackageJson()).rejects.toThrow("devEngines not found");
  });

  it("should handle malformed package.json", async () => {
    vi.mocked(readFile).mockResolvedValue("invalid json");

    await expect(parsePackageJson()).rejects.toThrow();
  });
});
```

## Test File Structure

Each test file should follow this structure:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import { myFunction } from "../src/utils/my-module.js";

// Mock all external dependencies at the top
vi.mock("@actions/core");
vi.mock("@actions/tool-cache");

describe("myFunction", () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    // Setup default mocks
    vi.mocked(core.info).mockImplementation(() => {});
  });

  describe("happy path", () => {
    it("should do X when Y", async () => {
      // Arrange
      vi.mocked(tc.find).mockReturnValue("/cached");

      // Act
      await myFunction();

      // Assert
      expect(tc.find).toHaveBeenCalledWith("tool", "1.0.0");
    });
  });

  describe("error handling", () => {
    it("should throw when X fails", async () => {
      // Arrange
      vi.mocked(tc.find).mockImplementation(() => {
        throw new Error("Not found");
      });

      // Act & Assert
      await expect(myFunction()).rejects.toThrow("Not found");
    });
  });

  describe("edge cases", () => {
    it("should handle empty input", async () => {
      // Test edge case
    });
  });
});
```

## Debugging Tests

### View Test Output

```bash
# Run with verbose output
pnpm test --reporter=verbose

# Run single test file with output
pnpm test __tests__/install-node.test.ts --reporter=verbose
```

### Debug Mocks

```typescript
// Log mock calls
console.log(vi.mocked(core.info).mock.calls);

// Check if mock was called
expect(core.info).toHaveBeenCalled();

// Check mock call arguments
expect(core.info).toHaveBeenCalledWith("Installing Node.js 20.11.0");

// Check number of calls
expect(core.info).toHaveBeenCalledTimes(3);
```

### Coverage Reports

```bash
# Generate coverage report
pnpm test

# Open HTML report
open coverage/index.html

# View coverage summary
pnpm test --coverage
```

## Common Issues

### "Module not mocked"

**Issue:** Test fails because a module isn't mocked

**Solution:** Add mock at the top of the test file:

```typescript
vi.mock("@actions/core");
vi.mock("node:fs");
```

### "Type error in mock"

**Issue:** TypeScript complains about mock types

**Solution:** Use `as unknown as Type`:

```typescript
vi.mocked(func).mockReturnValue(value as unknown as ReturnType<typeof func>);
```

### "Mock not reset between tests"

**Issue:** Mock state carries over between tests

**Solution:** Clear mocks in `beforeEach`:

```typescript
beforeEach(() => {
  vi.clearAllMocks();
});
```

### "Coverage not meeting threshold"

**Issue:** Tests pass but coverage is below threshold

**Solution:** Add tests for uncovered branches:

1. Run `pnpm test --coverage`
2. Open `coverage/index.html`
3. Find uncovered lines (highlighted in red)
4. Add tests for those code paths

## Related Documentation

* [Root CLAUDE.md](../CLAUDE.md) - Repository overview
* [src/CLAUDE.md](../src/CLAUDE.md) - Source code architecture
* [**fixtures**/CLAUDE.md](../__fixtures__/CLAUDE.md) - Integration testing
* [Vitest Documentation](https://vitest.dev/) - Testing framework
* [Vitest Mocking](https://vitest.dev/guide/mocking.html) - Mocking guide
