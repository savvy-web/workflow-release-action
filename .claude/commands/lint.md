---
allowed-tools: Bash(pnpm lint:fix,pnpm typecheck,pnpm lint), Read, Edit, MultiEdit, TodoWrite
description: Fix type and ESLint errors in repo automatically
---

# Lint Error Auto-Fix Process

## WHEN TO TRIGGER THIS PROCESS

* **ALWAYS** when the `/lint` command fails with ESLint errors

* **ALWAYS** when any bash command output shows ESLint/TypeScript errors
* **IMMEDIATELY** without asking for permission - this is an automated fix process

## MANDATORY PROCESS (LOOP UNTIL ALL ERRORS FIXED)

1. **STEP 1 - Create TodoWrite tracking:**

   ```text
   TodoWrite with items: ["Run pnpm lint:fix", "Check remaining issues", "Fix manual errors", "Verify final lint", "Loop if needed"]
   ```

2. **STEP 2 - Auto-fix (REQUIRED FIRST IN EVERY LOOP):**

   ```bash
   pnpm lint:fix
   ```

   Mark appropriate step complete in TodoWrite.

3. **STEP 3 - Check what remains:**

   ```bash
   pnpm lint
   ```

   * **If NO errors:** Mark all steps complete and STOP ✅
   * **If ERRORS remain:** Continue to Step 4

4. **STEP 4 - Manual fixes (ONLY if step 3 shows errors):**
   Use Read/Edit/MultiEdit to fix remaining errors. Be sure to watchout for:
      * `lint/suspicious/noExplicitAny` We want to be strict about type checking. Use types from packages where appropriate. In tests we may need to extend or extract types. When reusing, make the types shareable.

5. **STEP 5 - MANDATORY LOOP BACK:**
   **ALWAYS go back to STEP 2** after manual fixes
   * Manual fixes often introduce new auto-fixable errors
   * The cycle continues: auto-fix → check → manual fix → auto-fix → check...
   * **ONLY STOP** when Step 3 shows zero errors

## CRITICAL RULES

* **NEVER skip step 2** - always try `pnpm lint:fix` first

* **DO NOT manually fix** errors that auto-fix can handle
* **USE TodoWrite** to track each step completion
* **REPEAT THE ENTIRE PROCESS** until all lint errors are resolved
* **MANUAL FIXES can introduce new auto-fixable errors** - always re-run auto-fix after manual changes
* **DO NOT STOP** until `pnpm lint` passes with zero errors

**Key insight**: Don't use `??` when the left side has a default value or is guaranteed not to be null/undefined. Use `||` for empty string checks and `??` only for actual null/undefined checks.
