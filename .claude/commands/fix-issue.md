---
allowed-tools: Bash(git remote:*), Bash(git branch:*), Bash(git checkout:*), Bash(pnpm test:*), Bash(pnpm lint:*), Bash(pnpm lint:fix*), Bash(pnpm build:*), Read, Edit, Write, TodoWrite, Glob, Grep, mcp__github__get_me, mcp__github__get_issue, mcp__github__get_issue_comments, mcp__github__create_issue, mcp__github__add_issue_comment, mcp__github__issue_read
description: Find a GitHub issue, create a branch, fix the issue, test it, and prepare for PR submission
---

# fix-issue command

Find a GitHub issue, create a branch, fix the issue, test it, and prepare for PR submission.

## Usage

```bash
/fix-issue <issue-number> [owner/repo]
```

If `owner/repo` is not provided, the command will attempt to infer it from the current git repository's remote URL.

## Task

You are tasked with fixing a GitHub issue end-to-end. Follow these steps:

### 0. Determine Repository

* If `owner/repo` is provided as a parameter, use it
* Otherwise, run `git remote get-url origin` to get the remote URL
* Parse the owner and repo from the URL (e.g., `git@github.com:owner/repo.git` or `https://github.com/owner/repo.git`)
* If unable to determine the repository, ask the user to provide it

### 1. Fetch and Analyze the Issue

* Use the GitHub MCP server to fetch the issue details for the provided issue number from the determined repository
* Read and understand the issue description, labels, and any comments
* If the issue is unclear or missing information, ask the user for clarification before proceeding
* Summarize your understanding of the issue to the user

### 2. Create a Feature Branch

* Create a new branch from `origin/main` using a descriptive name based on the issue
* Branch naming convention: `fix/issue-<number>-<short-description>` (e.g., `fix/issue-42-typescript-errors`)
* Checkout the new branch

### 3. Plan the Fix

* Use the TodoWrite tool to create a detailed task list for fixing the issue
* Break down the work into specific, actionable steps
* Include steps for:
  * Code changes needed
  * Tests to write or update
  * Documentation updates (if applicable)
  * Verification steps

### 4. Implement the Fix

* Work through your task list systematically
* Mark tasks as `in_progress` before starting and `completed` after finishing
* Follow project conventions:
  * Use lowercase filenames
  * Maintain strict type safety (NEVER use `as any`)
  * Use absolute paths instead of `cd` commands
  * Follow the existing code style

### 5. Write/Update Tests

* Ensure proper test coverage for your changes
* Run tests using: `pnpm test --project @savvy-web/package-name`
* Fix any failing tests
* Verify coverage meets the 90% threshold

### 6. Lint and Format

* Run `pnpm lint:fix` to ensure code meets style standards
* Fix any linting errors that cannot be auto-fixed
* Run `pnpm build` to verify the build succeeds

### 7. Run Full Validation

* Execute `pnpm test` to run all tests
* Execute `pnpm build` to build all packages
* Ensure no type errors exist

### 8. Create Changeset

If the fix affects package functionality (not just tests, docs, or internal tooling):

* Create a changeset file in `.changeset/` directory with a descriptive filename (e.g., `fix-issue-42-typescript-errors.md`)
* Use the format:

  ```markdown
  ---
  "@savvy-web/package-name": patch|minor|major
  ---

  type: brief summary

  Longer description focusing on what changed and why, written for humans. Omit unnecessary technical details.

  * Key change 1
  * Key change 2
  ```

* **Changeset Guidelines:**
  * Not all changes require changesets (documentation-only changes, test-only changes, etc. may not need one)
  * Focus on the **what** and **why** of changes, not the how
  * Write for humans who will read the changelog - be concise and clear
  * Use `patch` for bug fixes, `minor` for new features, `major` for breaking changes
  * Omit implementation details that don't affect users of the package
  * Reference the issue being fixed in the description

### 9. Prepare Summary

* Provide a concise summary of:
  * What was changed and why
  * Any tests added or modified
  * Any potential impacts or considerations
  * Files modified (with line references using Markdown links)

### 10. Next Steps

Inform the user they can now:

* Review the changes
* Run `/commit` to create a commit
* Create a PR with the fixes

## Important Notes

* **DO NOT commit or push automatically** - Wait for user confirmation
* **DO NOT create a PR automatically** - Let the user decide when to create the PR
* If you encounter blockers or uncertainties, ask the user for guidance
* Use the GitHub MCP server tools to interact with GitHub (don't use `gh` CLI unless necessary)
* Follow all project-specific guidelines from CLAUDE.md

## Examples

```bash
# Use current repository (inferred from git remote)
/fix-issue 42

# Explicitly specify repository
/fix-issue 42 savvy-web/workflow
```

This would:

1. Determine the repository (auto-detect or use provided owner/repo)
2. Fetch issue #42 from GitHub
3. Create branch `fix/issue-42-descriptive-name`
4. Analyze the issue and create a fix plan
5. Implement the fix with tests
6. Validate everything works
7. Prepare a summary for the user
