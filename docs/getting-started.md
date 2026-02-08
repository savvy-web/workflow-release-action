# Getting Started

## Prerequisites

- A GitHub repository using [changesets](https://github.com/changesets/changesets) for version management
- A [GitHub App](https://docs.github.com/en/apps/creating-github-apps) with the required permissions (see below)
- Node.js project with a supported package manager (npm, pnpm, yarn, or bun)

## GitHub App Permissions

Your GitHub App needs these repository permissions:

| Permission | Access | Purpose |
| --- | --- | --- |
| Contents | Read & Write | Checkout, create branches, tags, and releases |
| Pull Requests | Read & Write | Create and update release PRs |
| Checks | Read & Write | Create validation check runs |
| Issues | Read & Write | Link and close issues from releases |
| Packages | Read & Write | Publish to GitHub Packages |
| Attestations | Write | Create build provenance attestations |

The workflow also requires these GitHub Actions permissions:

```yaml
permissions:
  contents: write
  pull-requests: write
  checks: write
  id-token: write      # OIDC publishing (npm, JSR)
  packages: write      # GitHub Packages
  attestations: write  # Provenance attestations
  issues: write        # Close linked issues
```

## Required Secrets

| Secret | Required | Description |
| --- | --- | --- |
| `APP_ID` | Yes | GitHub App ID |
| `APP_PRIVATE_KEY` | Yes | GitHub App private key (PEM format) |

## Installation

### Single Workflow (Recommended)

The simplest setup uses one workflow file that handles all three release phases automatically. The action detects which phase to run based on the trigger context.

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    branches:
      - main
      - changeset-release/main
  pull_request:
    branches: [main]
    types: [closed]
  workflow_dispatch:
    inputs:
      dry_run:
        description: Run in dry-run mode
        required: false
        type: boolean
        default: true

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

permissions:
  contents: write
  pull-requests: write
  checks: write
  id-token: write
  packages: write
  attestations: write
  issues: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: savvy-web/workflow-release-action@main
        with:
          app-id: ${{ secrets.APP_ID }}
          private-key: ${{ secrets.APP_PRIVATE_KEY }}
          dry-run: ${{ inputs.dry_run || 'false' }}
```

### Split Workflows (Advanced)

For more control, you can split each phase into its own workflow. See the [examples/](./examples/) directory for per-phase workflow files:

- [release-branch.yml](./examples/release-branch.yml) -- Triggered on push to `main`
- [release-validate.yml](./examples/release-validate.yml) -- Triggered on push to `changeset-release/main`
- [release-publish.yml](./examples/release-publish.yml) -- Triggered when the release PR is merged

## What Happens Next

Once the workflow is configured:

1. Add changeset files to your PRs with `npx changeset` (or `pnpm changeset`)
2. Merge PRs to `main`
3. The action creates a release branch and opens a release PR
4. The release PR is validated (builds, dry-run publish)
5. Merge the release PR to publish packages and create GitHub releases

See [How It Works](./how-it-works.md) for a detailed explanation of each phase.
