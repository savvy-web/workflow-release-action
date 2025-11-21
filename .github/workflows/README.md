# Reusable Workflows Documentation

This directory contains reusable GitHub Actions workflows for Savvy Web Systems projects.

## Table of Contents

* [validate.yml](#validateyml---pr-validation) - Comprehensive PR validation
* [claude.yml](#claudeyml---claude-code-integration) - AI-assisted code review
* [release.yml](#releaseyml---automated-releases) - Changesets-based release automation
* [org-issue-router.yml](#org-issue-routeryml---organization-issue-routing) - Organization-wide issue/PR routing
* [project-listener.yml](#project-listeneryml---project-management) - Single-repo project routing

---

## validate.yml - PR Validation

Comprehensive pull request validation with linting, testing, commit verification, and automated code review.

### Features

* **PR Title Validation** - Conventional Commits format
* **Commit Message Validation** - All commits checked for conventional format
* **Code Quality** - Biome linting with GitHub Actions reporter
* **Type Checking** - TypeScript validation
* **Tests** - CI test execution
* **Claude Code Review** - Automated AI review with advanced features

### Usage

```yaml
name: Validate PR

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  validate:
    uses: savvy-web/github-readme-private/.github/workflows/validate.yml@main
    secrets: inherit
```

### Required Secrets

| Secret | Description |
| -------- | ------------- |
| `APP_ID` | GitHub App ID for check runs |
| `APP_PRIVATE_KEY` | GitHub App private key (PEM format) |
| `CLAUDE_CODE_OAUTH_TOKEN` | OAuth token for Claude Code integration |
| `CLAUDE_REVIEW_PAT` | Personal access token for review operations |

### Features in Detail

#### Check Run Management

Creates all check runs upfront for immediate PR feedback, even before jobs complete:

* PR Title
* Conventional Commits
* Lint (Biome)
* Tests
* Claude Code Review

#### Retry Logic

Handles transient API errors with exponential backoff:

* Retries on 500-series errors
* Maximum 3 attempts
* Exponential backoff (2s, 4s, 8s)

#### Concurrency Control

Automatically cancels old workflow runs when new commits are pushed:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

#### Cleanup Job

Resolves orphaned check runs when workflows are cancelled:

* Runs on `cancelled()` condition
* Marks incomplete checks as cancelled
* Prevents stale "pending" checks

#### Claude Review Features

* **Skip logic** - Skips version-only PRs (CHANGELOG.md, package.json versions)
* **Sticky comments** - Updates in place, no spam
* **Force-push detection** - Provides fresh review after rebase
* **Thread management** - Resolves fixed issues automatically
* **Validation awareness** - Considers check results in review

### Customization

To adapt this workflow for your repository:

1. Copy the workflow file
2. Adjust validation checks (keep/remove as needed)
3. Update check names if necessary
4. Configure GitHub App permissions
5. Set required secrets

### Example: Custom Validation

```yaml
name: Custom Validation

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  # Use shared validation
  validate:
    uses: savvy-web/github-readme-private/.github/workflows/validate.yml@main
    secrets: inherit

  # Add custom checks
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: savvy-web/github-readme-private/.github/actions/node@main
      - run: pnpm audit
      - run: pnpm run security-scan
```

---

## claude.yml - Claude Code Integration

Enables `@claude` mentions in issues and PRs for on-demand AI assistance.

### Features

* Responds to `@claude` mentions in issues and PR comments
* Sticky comments (updates in place)
* Progress tracking
* Read-only permissions for safety

### Usage

```yaml
name: Claude Code

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  pull_request_review:
    types: [submitted]
  issues:
    types: [opened, assigned]

jobs:
  claude:
    uses: savvy-web/github-readme-private/.github/workflows/claude.yml@main
    secrets:
      CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
```

### Required Secrets

| Secret | Description |
| -------- | ------------- |
| `CLAUDE_CODE_OAUTH_TOKEN` | OAuth token from Claude Code setup |

### Triggers

The workflow activates when:

1. **Issue comments** - Any comment containing `@claude`
2. **PR review comments** - Code review comments with `@claude`
3. **PR reviews** - Review summaries mentioning `@claude`
4. **Issue events** - Issues opened/assigned with `@claude` in title/body

### Permissions

The workflow uses minimal permissions:

* `contents: read` - Read repository code
* `pull-requests: write` - Comment on PRs
* `issues: write` - Comment on issues
* `actions: read` - Access CI results for context

### Example Interactions

**In an issue:**

```markdown
@claude Can you help me understand why the build is failing?
```

**In a PR comment:**

```markdown
@claude This code looks complex. Can you suggest simplifications?
```

**In a code review:**

```markdown
@claude Review this security implementation for vulnerabilities.
```

---

## release.yml - Automated Releases

Automated release management using Changesets for versioning and changelog generation.

### Features

* Detects changesets automatically
* Creates/updates release PRs
* Generates changelogs
* Creates GitHub releases
* Supports npm publishing (optional)

### Usage

```yaml
name: Release

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  release:
    uses: savvy-web/github-readme-private/.github/workflows/release.yml@main
    secrets: inherit
```

### Required Secrets

| Secret | Description |
| -------- | ------------- |
| `APP_ID` | GitHub App ID |
| `APP_PRIVATE_KEY` | GitHub App private key |
| `NPM_TOKEN` | (Optional) For npm publishing |

### How It Works

1. **Changeset Detection** - Scans `.changeset/*.md` files
2. **Version Calculation** - Determines next version using semver
3. **Release PR Creation** - Creates PR with version bumps and changelogs
4. **Release Generation** - Creates GitHub release when PR is merged

### Creating a Changeset

```bash
# Run the changeset CLI
pnpm changeset

# Answer prompts:
# - Which packages to version?
# - What type of change? (major/minor/patch)
# - Summary of changes?
```

This creates a file in `.changeset/`:

```markdown
---
"@savvy-web/package-name": minor
---

Add new feature for user authentication
```

### Version Calculation

The workflow uses this logic:

1. Primary: Changesets status JSON
2. Fallback: Semver increment based on release type
3. Special handling for `0.0.0` (first release)

### Manual Publish (Disabled)

The workflow includes a commented-out publish job. To enable:

1. Uncomment the `publish` job
2. Configure npm provenance
3. Set `NPM_TOKEN` secret

---

## org-issue-router.yml - Organization Issue Routing

Automatically routes issues and PRs to GitHub Projects across all organization repositories.

### Features

* Organization-wide automation
* Custom property-based routing
* Duplicate detection
* Client-specific routing (optional)

### Setup

**1. Deploy to `workflow-release-action` repository:**

```yaml
name: Route Issues to Projects

on:
  issues:
    types: [opened, reopened]
  pull_request:
    types: [opened, reopened]

jobs:
  route:
    uses: savvy-web/github-readme-private/.github/workflows/org-issue-router.yml@main
    secrets: inherit
```

**2. Configure GitHub App permissions:**

* **Organization Permissions:**
  * Projects: Read & Write

**3. Set repository custom properties:**

| Property | Type | Description | Example |
| ---------- | ------ | ------------- | --------- |
| `project-tracking` | boolean | Enable auto-routing | `true` |
| `project-number` | string | Organization project number | `"1"` |
| `client-id` | string | (Optional) Client identifier | `"acme-corp"` |

**Access:** Organization Settings → Repository defaults → Custom properties

### How It Works

1. Reads repository custom properties
2. Checks if `project-tracking` is enabled
3. Gets organization project by number
4. Adds issue/PR to project using GraphQL API
5. Handles duplicates gracefully

### Example: Multi-Project Routing

Set different project numbers per repository:

* **Internal tools:** `project-number: "1"`
* **Client projects:** `project-number: "2"` + `client-id: "client-name"`
* **Open source:** `project-tracking: false` (disabled)

### Troubleshooting

**Issue not added to project:**

* Verify `project-tracking` is set to `true`
* Check project number is correct
* Ensure GitHub App has organization Projects permissions
* Check project is not closed

**Duplicate errors:**

These are expected and harmless - the workflow detects and skips items already in the project.

---

## project-listener.yml - Project Management

Reusable workflow for adding issues/PRs to a specific GitHub Project (single-repository alternative to org-issue-router).

### Features

* Simpler setup than org-issue-router
* Hardcoded for `savvy-web` organization
* Verbose error messages
* Project status validation

### Usage

```yaml
name: Add to Project

on:
  issues:
    types: [opened, reopened]
  pull_request:
    types: [opened, reopened]

jobs:
  add-to-project:
    uses: savvy-web/github-readme-private/.github/workflows/project-listener.yml@main
    secrets: inherit
```

### Required Secrets

| Secret | Description |
| -------- | ------------- |
| `APP_ID` | GitHub App ID |
| `APP_PRIVATE_KEY` | GitHub App private key |

### Configuration

The workflow is currently hardcoded to:

* **Organization:** `savvy-web`
* **Project number:** `1`

To customize, fork the workflow and update the GraphQL query.

### When to Use

Use `project-listener.yml` when:

* You need per-repository control
* You want explicit workflow configuration
* You don't need organization-wide automation

Use `org-issue-router.yml` when:

* You manage many repositories
* You want dynamic, property-based routing
* You need different projects per repository

---

## Common Patterns

### Combining Workflows

```yaml
name: CI/CD

on:
  pull_request:
    types: [opened, synchronize, reopened]
  push:
    branches: [main]

jobs:
  # Validate PRs
  validate:
    if: github.event_name == 'pull_request'
    uses: savvy-web/github-readme-private/.github/workflows/validate.yml@main
    secrets: inherit

  # Add to project
  add-to-project:
    if: github.event_name == 'pull_request'
    uses: savvy-web/github-readme-private/.github/workflows/project-listener.yml@main
    secrets: inherit

  # Release on main
  release:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    uses: savvy-web/github-readme-private/.github/workflows/release.yml@main
    secrets: inherit
```

### Custom Validation + Shared Workflows

```yaml
name: Full CI

on: [pull_request]

jobs:
  # Shared validation
  validate:
    uses: savvy-web/github-readme-private/.github/workflows/validate.yml@main
    secrets: inherit

  # Custom tests
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: savvy-web/github-readme-private/.github/actions/node@main
      - run: pnpm test:e2e

  # Custom security scan
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: savvy-web/github-readme-private/.github/actions/node@main
      - run: pnpm audit
      - run: pnpm run snyk-test
```

### Branch Protection

Configure these workflows as required status checks:

**Settings → Branches → Branch protection rules:**

* Require status checks:
  * `validate / PR Title`
  * `validate / Conventional Commits`
  * `validate / Lint`
  * `validate / Tests`
  * `validate / Claude Code Review`

---

## Helper Scripts

The `.github/scripts/` directory contains helper utilities used by workflows:

* **`minimize-claude-threads.sh`** - Collapses resolved Claude review threads
* **`resolve-claude-threads.sh`** - Resolves fixed issue threads
* **`create-check-run.sh`** - Creates GitHub check runs with retry logic

These are internal and called automatically by workflows.

---

## Security Best Practices

1. **Use GitHub Apps** - Preferred over personal access tokens
2. **Minimal permissions** - Grant only what each workflow needs
3. **Secrets management** - Store sensitive data in GitHub Secrets
4. **Token masking** - Sensitive values are masked in logs
5. **Read-only defaults** - Override permissions only when necessary

---

## Troubleshooting

### Workflow Not Triggering

**Check:**

1. Workflow file is in `.github/workflows/`
2. YAML syntax is valid (`yamllint`)
3. Triggers match event types
4. Repository permissions allow workflows

### Check Runs Not Created

**Common causes:**

* GitHub App missing `checks: write` permission
* API rate limit exceeded (use GitHub App, not PAT)
* Network errors (check retry logic)

### Claude Not Responding

**Verify:**

1. `CLAUDE_CODE_OAUTH_TOKEN` is set and valid
2. `@claude` is mentioned in comment/issue
3. Workflow has `issues: write` or `pull-requests: write` permission
4. Token has not expired

### Release PR Not Created

**Check:**

1. Changesets exist in `.changeset/*.md`
2. `APP_ID` and `APP_PRIVATE_KEY` are configured
3. GitHub App has `contents: write` permission
4. No conflicting release PRs exist

---

## Contributing

When adding new reusable workflows:

1. **Create in `.github/workflows/`** with descriptive name
2. **Add `workflow_call` trigger** for reusability
3. **Document all inputs/secrets** in this README
4. **Test in a real repository** before merging
5. **Create changeset** for documentation updates
6. **Add usage examples** to README.md

---

## License

Private - Savvy Web Systems © 2024
