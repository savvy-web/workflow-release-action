# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a private repository for creating **shared GitHub Actions, reusable workflows, and internal GitHub project management automation** (`@savvy-web/workflow-release-action`). It serves as a central location for GitHub-related automation tools used across Savvy Web Systems projects.

**Primary purposes:**

1. **Shared GitHub Actions** - Reusable composite actions for common CI/CD tasks
2. **Reusable Workflows** - Standardized workflow templates for PR validation, releases, etc.
3. **GitHub Project Management** - Automation for managing GitHub Projects, issues, and routing
4. **Internal Tooling** - Scripts and utilities for GitHub-related operations

## Active Development: Setup Flow Action

**Tracking Issue:** [#9 - Implement setup-flow TypeScript action](https://github.com/savvy-web/workflow-release-action/issues/9)

The `setup-flow` action is being refactored from `actions/github-script@v8` inline scripts to direct TypeScript modules. This provides better type safety, testability, and maintainability.

**When working on this feature:**

1. Consult issue #9 for current status and architecture decisions
2. Update the issue with progress as modules are completed
3. Follow the type-safe patterns established in `src/utils/` and `__tests__/`

**Current status:** Core utility modules implemented with 85%+ test coverage. See issue #9 for detailed progress.

### Integration Testing

The `savvy-web/workflow-integration` repository is set up to test the release action from feature branches.

**Key points:**

* The integration repo references `savvy-web/workflow-release-action@feature/setup-flow` directly
* Changes pushed to `feature/setup-flow` are immediately testable (no need to merge to main)
* The integration repo has a changeset file and packages configured with `publishConfig.access: public`

**Iteration workflow:**

1. Make changes to action code in this repo
2. Run tests: `pnpm ci:test`
3. Build: `pnpm build` (updates `dist/main.js`)
4. Push to `feature/setup-flow` branch
5. Trigger workflow on integration repo to test

```bash
# Trigger release workflow on integration repo
gh workflow run release.yml --repo savvy-web/workflow-integration --ref main

# Watch the run
gh run list --repo savvy-web/workflow-integration --limit 1
gh run watch <run-id> --repo savvy-web/workflow-integration

# View logs for debugging
gh run view <run-id> --repo savvy-web/workflow-integration --log
```

**Debugging tips:**

* The action logs show package discovery, changeset status, and publish config detection
* Look for "Running:" lines to see exact commands being executed
* Check "Changeset status file contents" to verify changeset detection
* The "📦 Discovered X package(s)" section shows what packages were found and their publish strategies

**Technical stack:**

* **Package manager:** pnpm 10.20.0 (enforced via `packageManager` field)
* **Build system:** Turborepo with strict environment mode
* **Node.js version:** 24.11.0 (specified in `.nvmrc`)
* **Linting:** Biome 2.3.6 with strict rules
* **Testing:** Vitest 4.0.8 with globals enabled
* **Type checking:** TypeScript with native preview build (`@typescript/native-preview`)
* **Workspace packages:** Located in `pkgs/*` for TypeScript/JavaScript utilities

## Common Commands

### Linting and Formatting

```bash
# Run Biome checks (no auto-fix)
pnpm lint

# Run Biome with auto-fix (safe fixes only)
pnpm lint:fix

# Run Biome with unsafe fixes (use with caution)
pnpm lint:fix:unsafe

# Lint markdown files
pnpm lint:md

# Fix markdown files
pnpm lint:md:fix
```

### Type Checking

```bash
# Run type checking across all packages
pnpm typecheck

# This runs: turbo run typecheck:all --log-prefix=none
# Which executes: tsgo --noEmit
```

**Note:** `tsgo` is an alias/wrapper for the TypeScript native preview build. It's invoked via Turbo for caching.

### Testing

```bash
pnpm ci:test
```

### Git Workflow

```bash
# Prepare changeset for release
pnpm ci:version
# This runs: changeset version && biome format --write .
```

### Pre-commit Hooks

The repository uses Husky with lint-staged for pre-commit validation. When you commit:

1. **Staged files are automatically processed:**
   * `package.json` files are sorted with `sort-package-json` and formatted with Biome
   * TypeScript/JavaScript files are checked and fixed with Biome
   * Markdown files are linted and fixed with `markdownlint-cli2`
   * Shell scripts have executable bits removed (`chmod -x`)
   * YAML files are formatted with Prettier and validated with `yaml-lint`
   * TypeScript changes trigger a full typecheck with `tsgo --noEmit`

2. **Hooks are skipped in:**
   * CI environments (`GITHUB_ACTIONS=1`)
   * During rebase/squash operations (except final commit)

3. **Git client compatibility:**
   * Pre-commit hook re-execs with zsh for GUI clients (GitKraken)
   * Sources `.zshenv` and NVM to ensure pnpm is available

## Code Quality Standards

### Biome Configuration

The project enforces strict Biome rules (see `biome.jsonc`):

* **Indentation:** Tabs, width 2
* **Line width:** 120 characters
* **Import organization:** Lexicographic order with `source.organizeImports`
* **Import extensions:** Forced `.js` extensions (`useImportExtensions`)
* **Import types:** Separated type imports (`useImportType` with `separatedType` style)
* **Node.js imports:** Must use `node:` protocol (`useNodejsImportProtocol`)
* **Type definitions:** Prefer `type` over `interface` (`useConsistentTypeDefinitions`)
* **Explicit types:** Required for exports (`useExplicitType` - except in tests/scripts)
* **No import cycles:** Enforced (`noImportCycles`)
* **No unused variables:** Error level with `ignoreRestSiblings: true`

### TypeScript Configuration

Base `tsconfig.json` settings:

* **Module system:** ESNext with bundler resolution
* **Target:** ES2022
* **Strict mode:** Enabled
* **Library:** ES2022
* **JSON imports:** Enabled (`resolveJsonModule`)
* **Global types:** Vitest globals available

### Markdown Linting

* Uses `markdownlint-cli2` with `.markdownlint.json` config
* Excludes `node_modules` and `dist` directories

### Commit Message Standards

* **Format:** Conventional Commits (enforced via commitlint)
* **Config:** `@commitlint/config-conventional` with extended body length (300 chars)
* **Validation:** Both PR titles and individual commit messages are validated in CI

## File Naming Conventions

Based on Biome configuration and common patterns:

* **Lowercase filenames:** Preferred (inferred from strict linting)
* **Extensions:** Always use explicit `.js` extensions in imports
* **Config files:** `.jsonc` for JSON with comments (e.g., `biome.jsonc`)
* **TypeScript:** `.ts` for source, `.test.ts` for tests

## Shared GitHub Actions

This repository provides several reusable GitHub Actions. Each action has its own documentation with usage examples and implementation details.

| Action | Description | Documentation |
| ------ | ----------- | ------------- |
| **node** | Node.js development environment setup with package manager detection, dependency caching, and Turbo/Biome configuration | [CLAUDE.md](.github/actions/node/CLAUDE.md) \| [README.md](.github/actions/node/README.md) |
| **biome** | Automatic Biome version detection and installation from repository configuration | [CLAUDE.md](.github/actions/biome/CLAUDE.md) \| [README.md](.github/actions/biome/README.md) |
| **setup-release** | Complete release environment setup with GitHub App token generation and Node.js configuration | [CLAUDE.md](.github/actions/setup-release/CLAUDE.md) \| [README.md](.github/actions/setup-release/README.md) |
| **check-changesets** | Lightweight changeset file detection for conditional release workflows | [CLAUDE.md](.github/actions/check-changesets/CLAUDE.md) \| [README.md](.github/actions/check-changesets/README.md) |
| **run-changesets** | Configurable changesets execution with NPM publishing and GitHub release support | [CLAUDE.md](.github/actions/run-changesets/CLAUDE.md) \| [README.md](.github/actions/run-changesets/README.md) |

**For general guidance on developing TypeScript actions, see [TYPESCRIPT_ACTIONS.md](TYPESCRIPT_ACTIONS.md).**

## Reusable Workflows

### Organization Issue Router (`.github/workflows/org-issue-router.yml`)

**Purpose:** Automatically routes issues and PRs across the organization to GitHub Projects based on repository custom properties.

**Triggers:** Issues/PRs opened or reopened in any organization repository

**How it works:**

1. Reads repository custom properties (`project-tracking`, `client-id`, `project-number`)
2. If `project-tracking` is enabled, adds issue/PR to specified organization project
3. Uses GraphQL API to add items to ProjectsV2
4. Handles duplicate detection gracefully
5. Provides detailed error messages for permission issues

**Required repository properties:**

* `project-tracking` (boolean) - Enable auto-routing
* `project-number` (string) - Organization project number (default: 1)
* `client-id` (string, optional) - For client-specific routing

**Usage:** Place in `workflow-release-action` repository for organization-wide activation

### Project Listener (`.github/workflows/project-listener.yml`)

**Purpose:** Reusable workflow for adding issues/PRs to GitHub Projects (called from other workflows)

**Triggers:** `workflow_call` (reusable workflow)

**Similar to org-issue-router but:**

* Hardcoded for `savvy-web` organization
* Designed to be called from other workflows
* More verbose error messages for troubleshooting
* Checks if project is closed before adding items

**Usage:**

```yaml
jobs:
  add-to-project:
    uses: savvy-web/github-readme-private/.github/workflows/project-listener.yml@main
    secrets: inherit
```

### Claude Code Workflow (`.github/workflows/claude.yml`)

**Purpose:** Enables @claude mentions in issues and PRs for on-demand assistance

**Triggers:**

* Issue comments with `@claude`
* PR review comments with `@claude`
* PR reviews with `@claude`
* Issues opened/assigned with `@claude` in title/body

**Features:**

* Uses `anthropics/claude-code-action@v1`
* Sticky comments (updates in place)
* Progress tracking
* Read-only permissions (contents, PRs, issues) + actions:read for CI results

**Usage:** Add to repositories where Claude assistance is desired

### PR Validation Workflow (`.github/workflows/validate.yml`)

**Purpose:** Comprehensive PR validation for this repository (reference implementation)

**Validation checks:**

1. **PR Title Validation** - Conventional commits format
2. **Conventional Commits** - All commit messages validated
3. **Code Quality** - `biome ci .` with GitHub Actions reporter
4. **Tests** - `pnpm ci:test` execution
5. **Claude Code Review** - Automated review with advanced features

**Workflow architecture:**

* Creates all check runs upfront for immediate PR feedback
* Uses GitHub App token (not PAT) for better rate limits
* Retry logic for transient API errors (500-series, exponential backoff)
* Concurrency control (cancels old runs when new commits pushed)
* Cleanup job resolves orphaned checks when cancelled

**Claude review features:**

* Skips version-only PRs (CHANGELOG.md, package.json versions, deleted changesets)
* Sticky comments (updates in place, no spam)
* Force-push detection (provides fresh review after rebase)
* Thread management (resolves fixed issues, tracks pending)
* Validation awareness (considers check results in review)
* Helper scripts in `.github/scripts/` for thread resolution/minimization

**Permissions strategy:**

* Minimal default permissions (contents:read)
* Jobs override with specific needs
* GitHub App provides elevated permissions where needed

### Release Workflows

This repository provides two reusable release workflows built on modular shared actions. Choose the workflow that matches your project's needs.

#### Standard Release Workflow (`.github/workflows/release-standard.yml`)

**Purpose:** Multi-package releases with NPM publishing

**Use when:**

* Publishing packages to NPM
* Managing monorepos with multiple packages
* Need NPM provenance support
* Want per-package GitHub releases

**Usage in your repository:**

```yaml
name: Release

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  release:
    uses: savvy-web/workflow-release-action/.github/workflows/release-standard.yml@main
    with:
      dry-run: false  # Set to true for testing, false for production
    secrets:
      APP_ID: ${{ secrets.APP_ID }}
      APP_PRIVATE_KEY: ${{ secrets.APP_PRIVATE_KEY }}
      NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**Features:**

* **Safe by default** - Runs in dry-run mode (`dry-run: true`) to prevent accidental publishing
* NPM publishing with provenance support (id-token:write)
* Per-package GitHub releases (for monorepos)
* Configurable version and publish commands
* Automatic version detection in PR titles
* Skips workflow when no changesets exist
* Clear warnings when running in dry-run vs production mode

**Important:** The workflow defaults to `dry-run: true` for safety. To actually publish to NPM, explicitly set `dry-run: false` in the workflow call.

**Inputs:** See [.github/workflows/release-standard.yml](.github/workflows/release-standard.yml) for all available inputs.

#### Simple Release Workflow (`.github/workflows/release-simple.yml`)

**Purpose:** Single-package releases with GitHub releases only (no NPM publishing)

**Use when:**

* Private repositories or GitHub Actions
* Single-package repositories
* Don't need NPM publishing
* Want GitHub releases for version tracking

**Usage in your repository:**

```yaml
name: Release

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  release:
    uses: savvy-web/workflow-release-action/.github/workflows/release-simple.yml@main
    secrets:
      APP_ID: ${{ secrets.APP_ID }}
      APP_PRIVATE_KEY: ${{ secrets.APP_PRIVATE_KEY }}
```

**Features:**

* GitHub releases only (no NPM publishing)
* Automatic version detection in PR titles
* Uses echo as no-op publish command
* Skips workflow when no changesets exist
* Perfect for private repos and non-NPM packages

**Inputs:** See [.github/workflows/release-simple.yml](.github/workflows/release-simple.yml) for all available inputs.

**This repository uses:** The simple release workflow since it's a private repository with no NPM packages.

#### How Both Workflows Work

1. **Check for changesets** - Determines if release is needed
2. **Setup environment** - Generates GitHub App token, checks out repo, installs dependencies
3. **Run changesets** - Creates release PR or publishes when PR is merged
4. **Create GitHub releases** - Automatic release creation with CHANGELOG notes

**Version Commands:**

Both workflows support custom version commands (defaults to `pnpm ci:version`):

```json
{
  "scripts": {
    "ci:version": "changeset version && biome format --write ."
  }
}
```

**Publish Commands:**

* **Standard workflow:** Should build and publish packages (e.g., `pnpm ci:publish`)
* **Simple workflow:** Uses echo as no-op since no NPM publishing needed

**Required Secrets:**

* `APP_ID` - GitHub App ID
* `APP_PRIVATE_KEY` - GitHub App private key
* `NPM_TOKEN` - Only for standard workflow with NPM publishing

### Workflow Standard Label Sync (`.github/workflows/workflow-standard-sync.yml`)

**Purpose:** Syncs standard workflow labels to repositories with the `workflow: standard` custom property

**Triggers:**

* Manual workflow dispatch (`workflow_dispatch`)

**How it works:**

1. Checks out repository to access `.github/labels.json`
2. Loads standard label definitions from `.github/labels.json`
3. Queries organization for all repositories with custom property `workflow: standard`
4. For each repository:
   * Fetches existing labels
   * Creates missing default labels from labels file
   * Updates existing default labels to match file definitions
   * Preserves any custom labels (not in defaults)
5. Reports custom labels in action output and console
6. Generates summary with statistics

**Features:**

* **Dry-run mode** - Preview changes without applying them
* **Non-destructive** - Preserves custom labels (unless removal is enabled)
* **Custom label removal** - Optional removal of labels not in standard definitions
* **Rate limiting** - Automatic rate limit monitoring and throttling
* **Enhanced comparison** - Detects and reports label name casing differences
* **Error tracking** - Tracks partial failures per repository
* **Detailed reporting** - Per-repository statistics and summaries
* **File-based configuration** - Labels defined in `.github/labels.json`
* **GitHub App authentication** - Better rate limits and security

**Required repository setup:**

* Repository must have custom property `workflow` set to `standard`
* GitHub App needs:
  * Repository `contents:read` permission (to checkout and read labels file)
  * Repository `administration:write` permission for target repositories
* This repository must contain `.github/labels.json` with standard label definitions

**Usage:**

1. Navigate to Actions tab in this repository
2. Select "Sync Workflow Standard Repository Labels"
3. Click "Run workflow"
4. **Optional:** Check "Preview changes without applying them (dry-run mode)" to preview changes
5. **Optional:** Check "Remove custom labels that don't match org defaults" to delete non-standard labels
6. Click "Run workflow" button
7. Review the job summary for results and custom labels

**Dry-run mode:**

* Enable to preview what changes would be made without applying them
* Useful for testing and verification before actual sync
* Shows all operations that would be performed (creates, updates, removals)
* Displays detailed change information (name casing, colors, descriptions)

**Remove custom labels:**

* When enabled, deletes labels that are not in the standard label definitions
* Respects dry-run mode (shows what would be deleted without actually removing)
* Useful for enforcing strict label standardization across repositories
* Reports removed labels in both console output and job summary
* **Use with caution** - this permanently deletes custom labels not in `.github/labels.json`

**Customizing default labels:**

Labels are defined in [`.github/labels.json`](.github/labels.json). To customize:

1. Edit `.github/labels.json` to add, remove, or modify labels
2. Each label must have `name`, `description`, and `color` (6-character hex code without `#`)
3. Commit and push changes to main branch
4. Run the workflow to sync changes to repositories with `workflow: standard`

**Standard labels included:**

* `ai` - AI/ML related features (purple)
* `automated` - Automated changes from bots/CI (blue)
* `bug` - Something isn't working (red)
* `breaking` - Breaking changes (dark red)
* `ci` - CI/CD related (green)
* `dependencies` - Dependency updates (blue)
* `docs` - Documentation (blue)
* `duplicate` - Duplicate issue/PR (gray)
* `enhancement` - New features (light blue)
* `good first issue` - Newcomer-friendly (purple)
* `help wanted` - Needs attention (teal)
* `invalid` - Invalid issue (yellow)
* `performance` - Performance improvements (orange)
* `question` - Questions/discussions (pink)
* `refactor` - Code refactoring (blue)
* `security` - Security-related (red)
* `test` - Testing improvements (blue)
* `wontfix` - Won't be addressed (white)

## Turborepo Configuration

From `turbo.json`:

* **Daemon:** Enabled for faster builds
* **Environment mode:** Strict (only declared env vars are available)
* **Global passthrough env vars:** `GITHUB_ACTIONS`, `GITHUB_OUTPUT`
* **Tasks:**
  * `//#typecheck:all` - Root-level typecheck task (cached, errors-only logs)
  * `typecheck` - Package-level task (depends on root typecheck, not cached)

## Project Structure

```text
.
├── .changeset/              # Changeset configuration for versioning
├── .claude/                 # Claude Code configuration
│   └── commands/           # Custom slash commands
├── .github/                 # GitHub workflows and actions
│   ├── actions/            # Reusable composite actions
│   ├── ISSUE_TEMPLATE/     # Issue templates
│   └── workflows/          # CI/CD workflows
├── .husky/                  # Git hooks
├── .vscode/                 # VS Code configuration
├── pkgs/                    # Workspace packages (empty, ready for additions)
├── profile/                 # GitHub profile README (README.md: "Savvy Web Systems")
├── biome.jsonc              # Biome linter/formatter configuration
├── commitlint.config.ts     # Commit message linting rules
├── lint-staged.config.js    # Pre-commit file processing
├── package.json             # Root package with workspace scripts
├── pnpm-workspace.yaml      # pnpm workspace configuration
├── tsconfig.json            # Base TypeScript configuration
└── turbo.json               # Turborepo configuration
```

## Using These Workflows in Other Repositories

### Setting Up Organization-Wide Issue Routing

1. **In your organization's `workflow-release-action` repository:**
   * Copy `.github/workflows/org-issue-router.yml`
   * Ensure GitHub App has `Organization permissions > Projects: Read & Write`

2. **On target repositories, set custom properties:**

   ```bash
   # Via GitHub UI: Settings > Custom properties
   project-tracking: true
   project-number: 1  # Your organization project number
   client-id: acme-corp  # Optional, for client-specific routing
   ```

3. **Issues/PRs will automatically route to the specified project**

### Adding Claude Code to a Repository

Copy `.github/workflows/claude.yml` to enable @claude mentions:

```bash
# In target repository
mkdir -p .github/workflows
cp path/to/this-repo/.github/workflows/claude.yml .github/workflows/
```

Configure secrets:

* `CLAUDE_CODE_OAUTH_TOKEN` - From Claude Code setup

### Adapting the PR Validation Workflow

The `validate.yml` workflow is a reference implementation. To adapt:

1. **Copy the workflow** to your repository
2. **Customize validation checks** (keep/remove PR title, commitlint, lint, tests, Claude)
3. **Update check names** if needed
4. **Configure GitHub App** with appropriate permissions
5. **Set required secrets:**
   * `APP_ID` / `APP_PRIVATE_KEY` - GitHub App credentials
   * `CLAUDE_CODE_OAUTH_TOKEN` - For Claude review
   * `CLAUDE_REVIEW_PAT` - Personal access token for review operations

### Using the Release Workflows

See the [Release Workflows](#release-workflows) section for detailed documentation on both `release-standard.yml` and `release-simple.yml`.

**IMPORTANT - Path Syntax:**

* **Within this repository**: Use local path `./.github/workflows/...`
* **From other repositories**: Use full GitHub URL `savvy-web/workflow-release-action/.github/workflows/...@main`

See [release.yml](.github/workflows/release.yml) for a working example in this repository.

## Adding New Shared Workflows/Actions

When adding new shared workflows or actions to this repository:

### Writing TypeScript Actions (Best Practice)

**PREFERRED APPROACH:** Write action logic in TypeScript using `actions/github-script@v8` for better type safety, maintainability, and developer experience.

**📖 For comprehensive documentation, see [TYPESCRIPT_ACTIONS.md](TYPESCRIPT_ACTIONS.md) which covers:**

* Action structure and templates
* Using shared types and test utilities
* Core summary methods for rich outputs
* Testing patterns and coverage requirements
* Error handling and validation
* Real-world examples and best practices

### Traditional Composite Actions

For actions that primarily orchestrate other actions or run shell commands:

1. **For GitHub Actions (composite actions):**
   * Create in `.github/actions/action-name/`
   * Include `action.yml` with clear inputs/outputs documentation
   * Use composite run steps (shell: bash)
   * Make reusable and parameterized
   * Consider TypeScript approach above for complex logic

2. **For reusable workflows:**
   * Create in `.github/workflows/`
   * Use `workflow_call` trigger
   * Document required secrets and inputs
   * Consider organization-wide vs. repository-specific use cases

3. **Testing:**
   * Test in this repository first
   * Create a changeset for documentation updates
   * Update CLAUDE.md with usage examples
   * Add Vitest tests for TypeScript action logic

4. **Documentation:**
   * Add to this CLAUDE.md file
   * Include usage examples
   * Document required secrets/permissions
   * Note any GitHub App permission requirements

## Adding Utility Packages

When creating TypeScript/JavaScript utilities in `pkgs/`:

1. **Package structure:**
   * Follow monorepo conventions
   * Use scoped name: `@savvy-web/package-name`
   * Include `package.json` with proper exports

2. **TypeScript setup:**
   * Extend from root `tsconfig.json`
   * Use `.js` extensions in imports
   * Enable strict type checking

3. **Scripts to add:**
   * `typecheck` - For Turbo orchestration
   * `test` - For testing (if applicable)
   * `build` - For building (if applicable)

4. **Common use cases:**
   * GitHub API helpers
   * Project management utilities
   * Shared workflow logic (if complex enough to warrant testing)

## Running Single Tests

Based on Vitest configuration:

```bash
# Run specific test file
pnpm test path/to/test.test.ts

# Run tests with watch mode
pnpm test --watch

# Run tests with coverage
pnpm test --coverage
```

## Test Utilities and Mocking

Tests use type-safe mock factories from `__tests__/utils/`:

* **`github-mocks.ts`** - Factory functions for creating properly typed mocks
* **`test-types.ts`** - TypeScript interfaces for mock types

### Key Patterns

1. **No `any` types** - Use `createMockOctokit()` instead of manual mock objects
2. **Factory functions** - `createMockOctokit()`, `createMockCore()`, `createMockExec()`, etc.
3. **Type-safe assertions** - Use `as unknown as Type` pattern for Octokit mock

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

**See [**tests**/CLAUDE.md](__tests__/CLAUDE.md) for comprehensive testing documentation.**

## Environment Variables

The repository uses strict environment mode in Turbo. When adding new environment variables:

1. Declare them in `turbo.json` under `globalPassThroughEnv` or task-specific `env`
2. Document them in package README if user-facing

## Custom Claude Commands

Available slash commands in `.claude/commands/`:

* `/lint` - Fix linting errors
* `/typecheck` - Fix TypeScript errors
* `/tsdoc` - Add/update TSDoc documentation
* `/fix-issue` - Find GitHub issue, create branch, fix, and test
* `/pr-review` - Review automated bot comments on PR
* `/build-fix` - Fix build errors
* `/test-fix` - Fix failing tests
* `/turbo-check` - Check Turbo configuration
* `/package-setup` - Set up new package in workspace

## GitHub App Configuration

The workflows in this repository rely on a GitHub App for authentication (preferred over PATs):

**Required App permissions:**

* **Repository permissions:**
  * Actions: Read (for Claude to access CI results)
  * Checks: Read & Write (for creating/updating check runs)
  * Contents: Read & Write (for checkout and release operations)
  * Issues: Read & Write (for issue routing and comments)
  * Pull Requests: Read & Write (for PR validation and comments)
  * Statuses: Write (optional, for legacy status API)

* **Organization permissions:**
  * Projects: Read & Write (for issue/PR routing to organization projects)

**Required secrets:**

* `APP_ID` - GitHub App ID
* `APP_PRIVATE_KEY` - GitHub App private key (PEM format)
* `CLAUDE_CODE_OAUTH_TOKEN` - OAuth token for Claude Code integration
* `CLAUDE_REVIEW_PAT` - Personal Access Token for operations requiring user context (e.g., resolving threads)
* `NPM_TOKEN` - For publishing packages (if using publish workflows)

**Why GitHub App over PAT:**

* Better rate limits (5,000 requests/hour per repo vs. 5,000/hour total)
* Granular permissions (no access to unnecessary scopes)
* Automatic token expiration (1 hour) for security
* Can act as the app identity rather than a specific user
* Does not count against user's seat

## Important Notes

1. **Never commit secrets:** The repository excludes `.env` and credentials files from git
2. **Shell scripts are not executable:** `chmod -x` is enforced via lint-staged to prevent permission issues
3. **Biome is authoritative:** All formatting decisions defer to Biome configuration
4. **Changesets for versioning:** Use changesets for package version management
5. **GitHub App authentication:** Workflows use GitHub App tokens (not PAT) for most operations
6. **Organization-wide workflows:** Place in `workflow-release-action` repository for automatic deployment across all repos
7. **Repository custom properties:** Used for dynamic routing and configuration (see org-issue-router workflow)
8. **GraphQL for Projects:** ProjectsV2 requires GraphQL API; REST API only supports legacy Projects (Classic)
9. **Track active work in issues:** When working on features tracked by GitHub issues, consult and update the issue with progress. See [Active Development](#active-development-setup-flow-action) for current work.
