---
allowed-tools: Bash(pnpm typecheck,pnpm lint), Read, Edit, MultiEdit, TodoWrite
description: Fix TypeScript errors in repo
---

# MANDATORY PROCESS (LOOP UNTIL ALL ERRORS FIXED)

1. **STEP 1 - Create TodoWrite tracking:**

   ```bash
   TodoWrite with items: ["Run pnpm typecheck", "Fix manual errors", "Verify final lint", "Loop if needed"]
   ```

2. **STEP 2 - Fix manual errors (ONLY if step 1 shows errors):**
   Mark appropriate step complete in TodoWrite.

3. **STEP 3 - Ensure changes conform to linits standard (ONLY if step 2 shows errors):**:**

   ```bash
   pnpm lint
   ```

   * **If NO errors:** Mark all steps complete and STOP ✅
   * **If ERRORS remain:** Continue to Step 4

4. **STEP 4 - Manual fixes (ONLY if step 3 shows errors):**
   Use Read/Edit/MultiEdit to fix remaining errors. Be sure to watchout for:
      * `lint/suspicious/noExplicitAny` We want to be strict about type checking. Use types from packages where appropriate. In tests we may need to extend or extract types. When reusing, make the types shareable.

**Key insight**: Don't use `??` when the left side has a default value or is guaranteed not to be null/undefined. Use `||` for empty string checks and `??` only for actual null/undefined checks.
