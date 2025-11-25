---
allowed-tools: Bash(git branch:*), Bash(pnpm test:*), Bash(pnpm lint:*), Bash(pnpm build:*), Bash(gh api:*), Read, Edit, Write, TodoWrite, mcp__github__get_me, mcp__github__search_pull_requests, mcp__github__pull_request_read, mcp__github__add_comment_to_pending_review, mcp__github__pull_request_review_write, mcp__github__create_issue, mcp__github__add_issue_comment, mcp__github__issue_read
description: Review and process automated bot comments on the current branch's pull request
---

# pr-review command

Review and process automated bot comments on the current branch's pull request.

## Usage

```bash
/pr-review [pr-number]
```

**Arguments:**

* `pr-number` (optional): Specific PR number to review. If not provided, automatically detects PR from current branch.

## Task

You are tasked with reviewing and processing automated bot comments on a GitHub pull request. Follow these steps:

### 1. Identify the PR to Review

**If PR number is provided:**

* Use the provided PR number directly
* Use the GitHub MCP server's `pull_request_read` method with `method: "get"` to fetch PR details
* Display the PR number, title, and URL to the user

**If no PR number is provided (auto-detect):**

* Get the current branch name using `git branch --show-current`
* Use the GitHub MCP server to search for PRs with `head:BRANCH_NAME` in the repository
* If no PR is found, inform the user and exit
* Display the PR number, title, and URL to the user

### 2. Fetch PR Comments

* Use the GitHub MCP server's `pull_request_read` method with `method: "get_review_comments"` to get all review comments
* Filter comments to find those authored by `savvy-web-bot`
* If no bot comments are found, inform the user and exit
* Display a summary of bot comments found (count and general topics)

### 3. Create Initial Todo List

Use `TodoWrite` to create a todo item for analyzing each comment found. Set all to `pending` status initially.

### 4. Analyze Each Bot Comment

For each `savvy-web-bot[bot]` comment (mark as `in_progress` in todo list before analyzing):

Analyze its content and determine:

* **Type of feedback:**
  * Code quality issue (e.g., type safety, best practices)
  * Bug or potential error
  * Performance suggestion
  * Style/formatting issue
  * Documentation suggestion
  * Security concern
  * Positive feedback/acknowledgment
  * Spam/off-topic (should be hidden)

* **Severity:**
  * Critical: Must fix (security, bugs, breaking issues)
  * High: Should fix (important improvements)
  * Medium: Nice to have (quality improvements)
  * Low: Optional (minor style suggestions)
  * N/A: Positive feedback (no action needed)

* **Action required:**
  * Fix the issue in code
  * Acknowledge as valid (positive feedback)
  * Hide as off-topic/outdated/spam
  * Defer to separate issue (complex changes)

### 5. Process Comments

For each bot comment, in order of severity (critical first):

#### For fixable issues (critical, high, medium)

1. Read the relevant code file(s) mentioned in the comment using `Read` tool
2. Analyze the suggestion and determine if it's valid
3. If valid and straightforward:
   * Make the necessary code changes using `Edit` tool
   * Mark the todo as `completed` immediately after making changes
   * Add verification todos if needed
4. If valid but complex:
   * Keep the todo as `pending` with a note
   * Consider creating a GitHub issue for tracking

#### For positive feedback comments

* Mark the todo as `completed`
* Do NOT hide these comments - they provide context

#### For comments to hide (rare)

* Use the GitHub API via `gh api` to hide comments that are:
  * Spam
  * Off-topic
  * Outdated (already fixed in another way)
  * Duplicate
* Select the appropriate reason: `OUTDATED`, `OFF_TOPIC`, `SPAM`, `DUPLICATE`, or `RESOLVED`
* Mark the todo as `completed` after hiding

### 6. Verification

After making code changes:

* Run relevant tests. There is generally a helper you can run for each package, eg `pnpm test:generators` is equal to `pnpm vitest --run --project='@savvy-web/generators'`
* Run linting: `pnpm lint`
* Ensure builds pass: `pnpm build`

### 7. Create or Update Changeset

If code changes were made that affect package functionality:

* Create a changeset file in `.changeset/` directory with a descriptive filename (e.g., `refactor-helper-functions.md`)
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
  * Use `patch` for bug fixes and refactors, `minor` for new features, `major` for breaking changes
  * Omit implementation details that don't affect users of the package

### 8. Provide Summary

Give the user a concise summary:

* **Fixed:** List of issues that were automatically fixed
* **Hidden:** List of comments that were hidden (with reasons)
* **Deferred:** List of issues that need manual review
* **Next Steps:** Recommended actions (commit changes, respond to comments, etc.)

## Important Notes

* **NEVER hide or resolve comments without analyzing them first**
* **ALWAYS verify fixes by running tests and builds before marking items complete**
* **For critical/security issues, always ask the user before making changes if there's any uncertainty**
* **Prefer GitHub MCP server tools over `gh` CLI** - only use `gh api` when MCP tools don't provide the needed functionality (e.g., hiding comments)
* **Be conservative with hiding comments** - when in doubt, leave them visible
* **Follow all project conventions** from CLAUDE.md (lowercase filenames, strict typing, no `cd` commands)
* **Use TodoWrite proactively** - create todos at the start for each comment to analyze, update status as you work
* **Mark todos complete immediately** - don't batch completions, mark each task done right after finishing it
* **Positive feedback comments** - don't hide them, they provide valuable context about what was done well

## Tools to Use

### Required Tools

**Git Operations:**

* `Bash` - Get current branch: `git branch --show-current`

**GitHub MCP Server:**

* `mcp__github__get_me` - Get authenticated user info (for repo context)
* `mcp__github__search_pull_requests` - Find the PR for the current branch
  * Use query: `head:BRANCH_NAME`
  * Set `owner` and `repo` parameters
* `mcp__github__pull_request_read` - Get PR details and comments
  * `method: "get"` - Get basic PR details
  * `method: "get_review_comments"` - Get all review comments
  * `method: "get_reviews"` - Get review summaries (optional)

**File Operations:**

* `Read` - Read source files mentioned in comments
* `Edit` - Make code changes to address comments
* `Write` - Create new files if needed (rare)

**Task Management:**

* `TodoWrite` - Track progress through comment analysis and fixes

**Verification:**

* `Bash` - Run tests: `pnpm test --project @savvy-web/package-name --coverage=false`
* `Bash` - Run linting: `pnpm lint`
* `Bash` - Run builds: `pnpm build` (if changes are significant)

### Optional Tools (for advanced workflows)

**Comment Management:**

* `Bash` with `gh api` - Hide comments (use sparingly):

  ```bash
  gh api repos/{owner}/{repo}/pulls/comments/{comment_id} -X PATCH -f state=hidden -f hidden_reason=REASON
  ```

* `mcp__github__add_comment_to_pending_review` - Add responses to comments (requires pending review)
* `mcp__github__pull_request_review_write` - Create/submit/delete reviews

**Issue Tracking (for deferred items):**

* `mcp__github__create_issue` - Create issues for complex items that need separate PRs
* `mcp__github__add_issue_comment` - Add context to existing issues

## Example Workflow

```bash
# Auto-detect PR from current branch
/pr-review

# Review a specific PR by number
/pr-review 123

# Claude's workflow:
# 1. "Found PR #123 for branch fix/issue-41-changelog-markdown-syntax"
# 2. "Found 5 comments from savvy-web-bot[bot]"
# 3. "Analyzing comments... 2 critical, 2 medium, 1 low"
# 4. [Makes fixes for critical issues]
# 5. [Runs tests and verifies]
# 6. [Hides outdated comments]
# 7. "Summary: Fixed 2 issues, hidden 1 outdated comment, 2 require manual review"
```

## Hiding Comments via GitHub API

To hide a comment, use the GitHub CLI with the API:

```bash
gh api repos/{owner}/{repo}/pulls/comments/{comment_id} -X PATCH -f state=hidden -f hidden_reason=OUTDATED
```

Valid `hidden_reason` values:

* `OUTDATED` - Comment is no longer relevant
* `OFF_TOPIC` - Comment is not relevant to the changes
* `SPAM` - Comment is spam
* `DUPLICATE` - Comment duplicates another comment
* `RESOLVED` - The issue has been resolved
