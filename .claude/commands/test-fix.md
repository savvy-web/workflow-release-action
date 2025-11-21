# Fix Test Issues

Run tests and fix any failing tests in the codebase.

1. Run `pnpm test` to identify failing tests
2. Analyze test failures and fix the underlying issues
3. Run `pnpm test` again to ensure all tests pass
4. If coverage is below thresholds, improve test coverage
5. Provide a summary of fixes applied

## Coverage Improvement Guidelines

When coverage is below the required threshold, you can use v8 ignore comments **sparingly** and **appropriately**:

### ✅ **APPROPRIATE** uses of v8 ignore comments

* **Pure re-exports**: Code that simply re-exports from other modules

  ```typescript
  /* v8 ignore start */
  export * from "./utils/helper.js";
  export * from "./plugins/plugin.js";
  /* v8 ignore stop */
  ```

* **Configuration objects**: Static configuration that doesn't contain logic
* **Type-only imports and exports**: TypeScript type definitions
* **Extremely rare error conditions**: Edge cases that are nearly impossible to test in practice

### ❌ **AVOID** ignoring

* **Business logic**: Core functionality should always be tested
* **Error handling**: Most error paths should be tested as they may indicate deeper issues
* **Conditional logic**: Branches and decision points in the code
* **Complex transformations**: Data processing and manipulation logic
* **Public API methods**: Functions that are part of the public interface

### Guidelines

* Use `/* v8 ignore start */` and `/* v8 ignore stop */` comments around ignored blocks
* Add comments explaining why coverage is being ignored
* Be conservative - when in doubt, write tests instead of ignoring coverage
* Review ignored code carefully to ensure it doesn't mask potential issues
