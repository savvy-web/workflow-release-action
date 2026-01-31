# Simplify Module Code

Invoke the `code-simplifier:code-simplifier` agent to review and simplify the module codebase.

## Scope

Review all TypeScript source files in `src/`. Focus on the public API surface first, then internal implementation. Check of dead code and remove. Ensure proper use of TypeScript best practives such as proper use of access modifiers.

## Output Mode

Make changes directly. Run `pnpm run typecheck` and `pnpm run test` after changes to verify correctness.

## Priority (highest to lowest)

1. API clarity and simplicity
2. TSDoc completeness
3. Code organization (class structure)
4. Internal implementation cleanliness

## Custom Instructions

### Class-Based API Pattern

Prefer class-based APIs with static methods to co-locate related logic, helpers, and constants. Minimize free-floating functions.

```typescript
// Preferred: co-located static methods and constants
export class ActionBuilder {
  static readonly DEFAULT_TIMEOUT = 30000;

  static create(config: ActionConfig): ActionBuilder {
    return new ActionBuilder(config);
  }

  private static validateConfig(config: ActionConfig): void {
    // validation logic
  }
}

// Avoid: scattered functions and constants
export const DEFAULT_TIMEOUT = 30000;
export function createActionBuilder(config: ActionConfig): ActionBuilder { /* ... */ }
function validateConfig(config: ActionConfig): void { /* ... */ }
```

### Versioning Freedom

Check `package.json`. If version is below `1.0.0`:

- No backward compatibility requirements
- No `@deprecated` annotations needed
- Freely restructure the API
- Document breaking changes in changesets only

### TSDoc Standards (API Extractor)

Document in **strict TSDoc** format:

- Document all interface properties, even if names seem self-explanatory
- Use `@remarks` for deeper discussion of appropriate use, edge cases, or design rationale
- Provide `@example` blocks with **complete, runnable TypeScript programs**
- Separate type and value imports in examples
- Clearly mark values and methods with `@public` `@internal` `@beta` `@alpha` tags to clearly define the api

```typescript
/**
 * Configuration options for building GitHub Actions.
 *
 * @remarks
 * The `timeout` property applies to the entire action execution, not individual steps.
 * For step-level timeouts, configure each step separately.
 *
 * @example
 * ```typescript
 * import { ActionBuilder } from '@savvy-web/github-action-builder';
 * import type { ActionConfig } from '@savvy-web/github-action-builder';
 *
 * const config: ActionConfig = {
 *   name: 'my-action',
 *   timeout: 60000,
 * };
 *
 * const builder = ActionBuilder.create(config);
 * ```
 */
export interface ActionConfig {
  /** The unique identifier for this action. */
  name: string;

  /**
   * Maximum execution time in milliseconds.
   *
   * @defaultValue 30000
   */
  timeout?: number;
}
```

### Package Entry Point

The main `index.ts` should have a `@packageDocumentation` block and export only what users need:

- Export primary classes and their configuration types
- Export utility classes only if independently useful
- Keep business logic internal (no export)
- Bin exports are separate entry points

### Type Export Rules

- Define types where they're used, export from that file only
- The main `index.ts` re-exports from implementation files (single source of truth)
- Never re-export types through intermediate barrel files
- Prefer `export type { Foo }` over `export { type Foo }` for type-only exports
