# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Repository Overview

Private repository for **shared GitHub Actions, reusable workflows, and GitHub project management automation** (`@savvy-web/workflow-release-action`).

1. **Shared GitHub Actions** - Reusable composite actions for CI/CD
2. **Reusable Workflows** - Standardized templates for PR validation, releases
3. **GitHub Project Management** - Automation for GitHub Projects, issues, routing
4. **Internal Tooling** - Scripts and utilities for GitHub operations

## Design Documentation

Load design docs when working on the relevant subsystem:

- `@.claude/design/release-action/architecture.md` - Three-phase workflow, module dependency graph, entry points, shared infrastructure
- `@.claude/design/release-action/integration.md` - Multi-registry publishing, OIDC auth, SBOM/NTIA compliance, publish summaries
- `@.claude/design/release-action/testing.md` - Test strategy, mock factory patterns, coverage map, specialized testing patterns

## Workflow Release Action

TypeScript-based GitHub Action (~17,000 lines across 45 source files) for automated release management with changesets.

**Three-phase workflow:**

1. **Phase 1 (Branch Management)** - Push to `main` triggers changeset detection, creates/updates `changeset-release/main` branch and release PR
2. **Phase 2 (Validation)** - Push to release branch triggers build validation, publish dry-runs, release notes preview, and sticky comment updates
3. **Phase 3 (Publishing)** - Merge of release PR triggers multi-registry publishing, GitHub releases, and SBOM generation

For full architecture, module dependency graph, and per-module documentation: `@.claude/design/release-action/architecture.md`

### Action Inputs

| Input | Required | Default | Description |
| ----- | -------- | ------- | ----------- |
| `token` | Yes | - | GitHub App token |
| `release-branch` | No | `changeset-release/main` | Release branch name |
| `target-branch` | No | `main` | Target branch for release PR |
| `package-manager` | No | `pnpm` | Package manager (`npm`, `pnpm`, `yarn`, `bun`) |
| `version-command` | No | `{pm} ci:version` | Custom version command |
| `pr-title-prefix` | No | `chore: release` | Release PR title prefix |
| `dry-run` | No | `false` | Dry-run mode |
| `registry-tokens` | No | - | Custom registry tokens (`registry=token` per line) |

### Authentication Model

| Registry | Method | Notes |
| -------- | ------ | ----- |
| **npm** | OIDC | Trusted publishing, no token needed |
| **JSR** | OIDC | Trusted publishing, no token needed |
| **GitHub Packages** | GitHub App token | Uses `token` input |
| **Custom registries** | `registry-tokens` | Format: `https://registry.example.com/=<TOKEN>` |

For full integration details: `@.claude/design/release-action/integration.md`

### Integration Testing

Use `savvy-web/workflow-integration` to test from feature branches:

1. Make changes and run tests: `pnpm ci:test`
2. Build: `pnpm build` (updates `dist/main.js`)
3. Push to feature branch
4. Trigger: `gh workflow run release.yml --repo savvy-web/workflow-integration --ref main`
5. Watch: `gh run list --repo savvy-web/workflow-integration --limit 1`

## Common Commands

### Linting and Formatting

```bash
pnpm lint              # Biome checks (no auto-fix)
pnpm lint:fix          # Biome with safe auto-fix
pnpm lint:fix:unsafe   # Biome with unsafe fixes
pnpm lint:md           # Markdown linting
pnpm lint:md:fix       # Markdown auto-fix
```

### Type Checking

```bash
pnpm typecheck         # Run tsgo --noEmit via Turbo
```

`tsgo` is the TypeScript native preview build, invoked via Turbo for caching.

### Testing

```bash
pnpm test                              # Run all tests
pnpm test path/to/test.test.ts         # Specific test file
pnpm test --watch                      # Watch mode
pnpm test --coverage                   # With coverage report
pnpm ci:test                           # CI mode with coverage
```

### Git Workflow

```bash
pnpm ci:version        # changeset version && biome format --write .
```

### Pre-commit Hooks

Husky with lint-staged processes staged files on commit:

- `package.json` sorted and formatted with Biome
- TypeScript/JavaScript checked with Biome
- Markdown linted with `markdownlint-cli2`
- Shell scripts have executable bits removed
- YAML formatted with Prettier, validated with `yaml-lint`
- TypeScript changes trigger `tsgo --noEmit`

Hooks skip in CI (`GITHUB_ACTIONS=1`) and during rebase/squash (except final commit).

## Code Quality Standards

### Biome Configuration

Strict rules enforced (see `biome.jsonc`):

- Tabs, width 2 | Line width 120
- Lexicographic import ordering
- Forced `.js` extensions in imports
- Separated type imports (`separatedType` style)
- `node:` protocol required for Node.js imports
- Prefer `type` over `interface`
- Explicit types required for exports (except tests/scripts)
- No import cycles | No unused variables (`ignoreRestSiblings: true`)

### TypeScript Configuration

- Module: ESNext with bundler resolution | Target: ES2022 | Strict mode
- `resolveJsonModule` enabled | Vitest globals available

### Markdown Linting

Use `markdownlint-cli2` with config at `lib/configs/.markdownlint-cli2.jsonc`. Excludes `node_modules` and `dist`.

### Commit Messages

Conventional Commits format enforced via commitlint (`@commitlint/config-conventional`, 300 char body). PR titles and commit messages validated in CI.

## File Naming Conventions

- Lowercase filenames preferred
- Always use explicit `.js` extensions in imports
- `.jsonc` for JSON with comments
- `.ts` for source, `.test.ts` for tests

## Shared GitHub Actions

Reusable composite actions live in `.github/actions/`:

| Action | Description |
| ------ | ----------- |
| **release** | Release environment setup and orchestration |

## Reusable Workflows

Workflows live in `.github/workflows/`:

| Workflow | File | Purpose |
| -------- | ---- | ------- |
| **Claude Code** | `claude.yml` | Enables @claude mentions in issues/PRs |
| **Project Listener** | `project-listener.yml` | Reusable workflow for adding items to GitHub Projects |
| **Release** | `release.yml` | Release workflow for this repository |

This repository uses the **simple release workflow** (private repo, no NPM packages).

## Project Structure

```text
.
├── .changeset/              # Changeset configuration
├── .claude/                 # Claude Code configuration
│   ├── commands/            # Custom slash commands
│   └── design/              # Design documentation
├── .github/                 # GitHub workflows and actions
│   ├── actions/             # Reusable composite actions
│   ├── ISSUE_TEMPLATE/      # Issue templates
│   └── workflows/           # CI/CD workflows
├── .husky/                  # Git hooks
├── src/                     # Main action source code
│   ├── types/               # Type definitions
│   └── utils/               # Utility modules
├── __tests__/               # Test files and utilities
├── biome.jsonc              # Biome configuration
├── tsconfig.json            # TypeScript configuration
└── turbo.json               # Turborepo configuration
```

## Adding New Workflows/Actions

### TypeScript Actions (Preferred)

Write action logic in TypeScript for type safety and testability. Create in `.github/actions/action-name/` with `action.yml`.

### Reusable Workflows

Create in `.github/workflows/` with `workflow_call` trigger. Document required secrets and inputs.

**Path syntax:**

- **Within this repository:** `./.github/workflows/...`
- **From other repositories:** `savvy-web/workflow-release-action/.github/workflows/...@main`

## Turborepo Configuration

- Daemon enabled | Strict environment mode
- Global passthrough: `GITHUB_ACTIONS`, `GITHUB_OUTPUT`
- `//#typecheck:all` (root, cached) | `typecheck` (package-level, depends on root)

## Environment Variables

Strict environment mode in Turbo. Declare new env vars in `turbo.json` under `globalPassThroughEnv` or task-specific `env`.

## Custom Claude Commands

Available in `.claude/commands/`:

- `/lint` - Fix linting errors
- `/typecheck` - Fix TypeScript errors
- `/tsdoc` - Add/update TSDoc documentation
- `/fix-issue` - Find issue, create branch, fix, test
- `/pr-review` - Review bot comments on PR
- `/build-fix` - Fix build errors
- `/test-fix` - Fix failing tests
- `/turbo-check` - Check Turbo configuration
- `/package-setup` - Set up new workspace package

## GitHub App Configuration

Use GitHub App tokens (not PATs) for workflows.

**Required App permissions:**

- Repository: Actions (read), Checks (read/write), Contents (read/write), Issues (read/write), Pull Requests (read/write)
- Organization: Projects (read/write)

**Required secrets:**

| Secret | Purpose |
| ------ | ------- |
| `APP_ID` | GitHub App ID |
| `APP_PRIVATE_KEY` | GitHub App private key (PEM) |
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude Code integration |
| `CLAUDE_REVIEW_PAT` | User context operations (thread resolution) |
| `NPM_TOKEN` | NPM publishing (standard workflow only) |

## Important Notes

1. Never commit secrets (`.env` and credentials excluded from git)
2. Shell scripts are not executable (`chmod -x` enforced via lint-staged)
3. Biome is authoritative for all formatting decisions
4. Use changesets for package version management
5. GitHub App tokens preferred over PATs
6. GraphQL required for ProjectsV2 (REST only supports legacy Projects)
7. Track active work in GitHub issues
