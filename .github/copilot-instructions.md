# Copilot Coding Agent Instructions

## Repository Overview

This is a **private GitHub Actions and Workflows repository** (`@savvy-web/workflow-release-action`) that provides shared GitHub Actions, reusable workflows, and internal project automation for Savvy Web Systems projects. **This repository contains NO application code or packages to build** - it only contains GitHub Actions composite actions (YAML) and workflow definitions.

**Key Characteristics:**

* **Type:** GitHub Actions & Workflows repository (infrastructure as code)
* **Languages:** YAML (GitHub Actions), Shell scripts, TypeScript configuration
* **Size:** ~253MB with dependencies installed
* **Package Manager:** pnpm 10.20.0 (strictly enforced)
* **Node.js Version:** 24.11.0 (specified in `.nvmrc`)
* **No Build Output:** This repository does not produce artifacts or packages

## Critical: Bootstrap & Environment Setup

### Initial Setup (ALWAYS run these first)

**You MUST install pnpm globally before running any commands:**

```bash
npm install -g pnpm@10.20.0
```

**Then install dependencies:**

```bash
pnpm install
```

**Installation takes ~8-10 seconds.** Dependencies MUST be installed before running any validation commands.

### Node.js Version

The repository requires **Node.js 24.11.0** as specified in `.nvmrc`. If using nvm:

```bash
nvm install
nvm use
```

## Validation Commands (Run in This Order)

### 1. Linting (Biome)

**Always run linting before committing changes:**

```bash
pnpm lint           # Check only, no fixes
pnpm lint:fix       # Apply safe fixes
pnpm lint:fix:unsafe # Apply all fixes (use with caution)
```

**Expected Output:** "Checked X files in Yms. No fixes applied." (if clean)

**Scope:** Checks TypeScript, JavaScript, JSON, JSONC files using Biome 2.3.14
**Time:** ~200ms with no issues
**Failures:** Will exit with code 1 and show errors if any issues found

### 2. Markdown Linting

**Check Markdown files for formatting issues:**

```bash
pnpm lint:md        # Check only
pnpm lint:md:fix    # Apply fixes
```

**Known Issues:** Some instruction files have existing linting errors - these are acceptable for now.

**Scope:** All `*.md` and `*.mdx` files excluding node_modules and dist
**Time:** ~500ms
**Configuration:** `.markdownlint.json` and `.markdownlint-cli2.jsonc`

### 3. Type Checking

**IMPORTANT:** The `pnpm typecheck` command has a known issue with Turbo configuration. Instead, run:

```bash
pnpm exec tsgo --noEmit
```

**This works correctly** and validates TypeScript types using the native TypeScript compiler preview.

**DO NOT RUN:** `pnpm typecheck` - it fails due to Turbo v2.6.1 not recognizing `daemon`, `envMode`, and `globalPassThroughEnv` keys in `turbo.json`.

**Expected Output:** Silent output (no errors) means success
**Time:** ~1-2 seconds
**Scope:** All TypeScript files based on `tsconfig.json`

### 4. Tests

**Run tests with:**

```bash
pnpm ci:test
```

**Current Behavior:** This is a **placeholder** that only echoes "✓ All tests passed". There are no actual tests in this repository since it contains only GitHub Actions definitions.

## Pre-commit Hooks

The repository uses **Husky with lint-staged** for automatic validation before commits:

**What runs automatically on commit:**

1. `package.json` files - Sorted with `sort-package-json` and formatted with Biome
2. TypeScript/JavaScript files - Checked and fixed with Biome
3. Markdown files - Linted and fixed with `markdownlint-cli2`
4. Shell scripts - Executable bits removed (`chmod -x`)
5. YAML files - Formatted with Prettier and validated with `yaml-lint`
6. TypeScript changes - Triggers full typecheck with `tsgo --noEmit`

**Hooks are skipped when:**

* Running in CI (`GITHUB_ACTIONS=1`)
* During rebase/squash operations (except final commit)

**Important:** The pre-commit hook re-execs with zsh for GUI git clients (GitKraken) and sources `.zshenv` and NVM to ensure pnpm is available.

## Project Structure

```text
.
├── .changeset/              # Changeset configuration for versioning
├── .claude/                 # Claude Code configuration & custom commands
├── .github/
│   ├── actions/            # Composite actions (node, biome, setup-release, etc.)
│   ├── ISSUE_TEMPLATE/     # Issue templates
│   ├── instructions/       # File-specific linting instructions
│   ├── scripts/            # Helper scripts for workflows
│   └── workflows/          # Reusable workflows (validate, release, claude, etc.)
├── .husky/                  # Git hooks (pre-commit, commit-msg, etc.)
├── .vscode/                 # VS Code settings
├── profile/                 # GitHub profile README
├── biome.jsonc              # Biome linter/formatter configuration
├── commitlint.config.ts     # Commit message linting rules
├── lint-staged.config.js    # Pre-commit file processing configuration
├── package.json             # Root package with workspace scripts
├── pnpm-workspace.yaml      # pnpm workspace configuration
├── tsconfig.json            # Base TypeScript configuration
└── turbo.json               # Turborepo configuration (has known issues)
```

### Key Files & Their Purpose

* **`.github/actions/`** - Composite GitHub Actions (reusable action steps)
  * `node/` - Node.js setup with package manager detection and caching
  * `biome/` - Biome version detection and installation
  * `setup-release/` - Release environment setup (GitHub App token + checkout + Node.js)
  * `check-changesets/` - Detect if changesets exist
  * `run-changesets/` - Execute changesets action

* **`.github/workflows/`** - Reusable workflow definitions
  * `validate.yml` - PR validation (title, commits, lint, tests, Claude review)
  * `release.yml` - Release automation (simple, GitHub releases only)
  * `release-standard.yml` - Release with NPM publishing
  * `release-simple.yml` - Release without NPM publishing
  * `claude.yml` - Claude Code integration (@claude mentions)
  * `org-issue-router.yml` - Organization-wide issue/PR routing
  * `project-listener.yml` - Single-repo issue/PR routing
  * `workflow-standard-sync.yml` - Sync standard labels to repositories

* **Configuration Files:**
  * `biome.jsonc` - Strict Biome rules (tabs, 120 chars, import extensions, etc.)
  * `.markdownlint.json` - Markdown linting rules
  * `commitlint.config.ts` - Conventional Commits validation
  * `lint-staged.config.js` - Pre-commit validation rules
  * `turbo.json` - Turborepo configuration (WARNING: has compatibility issues)

## Code Quality Standards

### Biome Configuration (STRICT)

**Formatting:**

* Indentation: **Tabs** (width 2)
* Line width: **120 characters**
* Format with errors: Enabled

**Import Rules (ENFORCED):**

* Use explicit `.js` extensions in imports (`useImportExtensions`)
* Separate type imports (`useImportType` with `separatedType` style)
* Use `node:` protocol for Node.js imports (`useNodejsImportProtocol`)
* Organize imports lexicographically (`source.organizeImports`)
* No import cycles (`noImportCycles`)

**Type Rules:**

* Prefer `type` over `interface` (`useConsistentTypeDefinitions`)
* Explicit types required for exports (`useExplicitType` - except tests/scripts)
* No unused variables (error level with `ignoreRestSiblings: true`)

**Config Location:** `biome.jsonc`

### TypeScript Configuration

**Settings from `tsconfig.json`:**

* Module: ESNext with bundler resolution
* Target: ES2022
* Strict mode: Enabled
* Library: ES2022
* JSON imports: Enabled
* Types: Vitest globals available

### Commit Message Standards

**Format:** Conventional Commits (enforced via commitlint)

* Types: feat, fix, docs, style, refactor, perf, test, chore, ci, build, revert
* Format: `type(scope): description`
* Config: `@commitlint/config-conventional` with 300 char body length

**Both PR titles AND individual commit messages are validated in CI.**

## Common Errors & Solutions

### Error: "pnpm: command not found"

**Solution:** Install pnpm globally first:

```bash
npm install -g pnpm@10.20.0
```

### Error: "turbo_json_parse_error" (Found unknown key 'daemon')

**Issue:** Turbo 2.6.1 doesn't recognize some keys in `turbo.json`

**Workaround:** Use `pnpm exec tsgo --noEmit` instead of `pnpm typecheck`

**DO NOT modify `turbo.json`** - this is a known issue that will be resolved when Turbo is updated.

### Error: Markdown linting failures in `.github/instructions/` files

**These are expected** - instruction files have intentional format deviations. You can ignore these when running `pnpm lint:md`.

### Error: Pre-commit hook fails in GUI git clients

**Solution:** The hook automatically re-execs with zsh and sources NVM. Ensure:

1. zsh is installed
2. NVM is available in `~/.nvm/nvm.sh`
3. pnpm is available in your PATH

## Making Changes

### Modifying GitHub Actions (Composite Actions)

**Location:** `.github/actions/*/action.yml`

**Steps:**

1. Edit the `action.yml` file
2. Update the corresponding `README.md` with usage changes
3. Test in a consuming repository by referencing your branch:

   ```yaml
   uses: savvy-web/workflow-release-action/.github/actions/node@your-branch
   ```

4. Run `pnpm lint:fix` to format YAML
5. Run `pnpm dlx prettier --write .github/actions/*/action.yml`
6. Run `pnpm dlx yaml-lint .github/actions/*/action.yml`

### Modifying Workflows

**Location:** `.github/workflows/*.yml`

**Steps:**

1. Edit the workflow file
2. Run `pnpm lint:fix` (Biome doesn't process YAML, but good practice)
3. Format with Prettier: `pnpm dlx prettier --write .github/workflows/*.yml`
4. Validate with yaml-lint: `pnpm dlx yaml-lint .github/workflows/*.yml`
5. Test the workflow by triggering it (manual dispatch or PR)

**Important:** Workflows in this repository are used by other repositories. Breaking changes require coordination.

### Modifying TypeScript/JavaScript Files

**Steps:**

1. Make your changes
2. Run `pnpm lint:fix` to auto-fix issues
3. Run `pnpm exec tsgo --noEmit` to check types
4. If hooks are set up, changes will auto-format on commit

### Modifying Markdown Files

**Steps:**

1. Edit the Markdown file
2. Run `pnpm lint:md:fix` to auto-fix issues
3. Review any remaining errors (some may be intentional)

## File-Specific Instructions

The repository has **instruction files** in `.github/instructions/` that provide additional context for specific file types:

* `BIOME.instructions.md` - For TypeScript/JavaScript/JSON files
* `MARKDOWN.instructions.md` - For Markdown files
* `YAML.instructions.md` - For YAML files

**These should be consulted when modifying files of these types.**

## GitHub Actions CI/CD

### PR Validation Workflow

**File:** `.github/workflows/validate.yml`

**Runs on:** Pull requests (opened, synchronize, reopened, edited)

**Checks performed:**

1. **PR Title Validation** - Conventional Commits format
2. **Conventional Commits** - All commit messages validated
3. **Code Quality** - `biome ci .` with GitHub Actions reporter
4. **Tests** - `pnpm ci:test` execution (currently placeholder)
5. **Claude Code Review** - Automated review (if configured)

**How it works:**

* Creates all check runs upfront for immediate PR feedback
* Uses GitHub App token for better rate limits
* Retry logic for transient API errors
* Concurrency control (cancels old runs on new commits)

**Required Secrets:**

* `APP_ID` - GitHub App ID
* `APP_PRIVATE_KEY` - GitHub App private key
* `CLAUDE_CODE_OAUTH_TOKEN` - Claude Code integration
* `CLAUDE_REVIEW_PAT` - Personal access token for review operations

### Release Workflow

**File:** `.github/workflows/release.yml` (uses `release-simple.yml`)

**Runs on:** Push to main, manual workflow dispatch

**What it does:**

1. Checks for changesets in `.changeset/*.md`
2. Creates/updates release PR with version bumps
3. Generates CHANGELOG entries
4. Creates GitHub releases when PR is merged

**This repository uses the simple release workflow** (no NPM publishing).

## Trust These Instructions

**These instructions have been validated by running actual commands and inspecting output.** If you encounter discrepancies:

1. First, verify you've run `pnpm install` after cloning
2. Check Node.js version matches `.nvmrc` (24.11.0)
3. Verify pnpm version is 10.20.0
4. Only perform additional searches if the information is incomplete or incorrect

## Common Gotchas

1. **Don't use `pnpm typecheck`** - use `pnpm exec tsgo --noEmit` instead
2. **Always install pnpm globally first** before running any commands
3. **This repository has no build step** - it's infrastructure only
4. **YAML files must be formatted with Prettier**, not Biome
5. **Pre-commit hooks require zsh** for GUI git clients
6. **Turbo configuration has known issues** - avoid modifying `turbo.json`
7. **Markdown linting has expected failures** in instruction files
8. **Test command is a placeholder** - don't expect real tests

## Quick Reference

**Start working:**

```bash
npm install -g pnpm@10.20.0
pnpm install
```

**Before committing:**

```bash
pnpm lint:fix
pnpm exec tsgo --noEmit
pnpm lint:md:fix
```

**Format YAML (actions/workflows):**

```bash
pnpm dlx prettier --write .github/**/*.yml
pnpm dlx yaml-lint .github/**/*.yml
```

**Check everything:**

```bash
pnpm lint && pnpm exec tsgo --noEmit && pnpm lint:md
```
