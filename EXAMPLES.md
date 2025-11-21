# Usage Examples

This document provides examples of how to use the workflow-release-action in your GitHub workflows.

## Basic Usage

The simplest way to use this action:

```yaml
name: Release

on:
  push:
    branches: [main]

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - name: Setup release environment
        uses: savvy-web/workflow-release-action@main
        with:
          app-id: ${{ secrets.APP_ID }}
          app-private-key: ${{ secrets.APP_PRIVATE_KEY }}
```

## With Specific Package Manager

Specify which package manager to use:

```yaml
- name: Setup release environment
  uses: savvy-web/workflow-release-action@main
  with:
    app-id: ${{ secrets.APP_ID }}
    app-private-key: ${{ secrets.APP_PRIVATE_KEY }}
    package-manager: pnpm
```

## With Turbo Cache

Enable Turbo remote cache for faster builds:

```yaml
- name: Setup release environment
  uses: savvy-web/workflow-release-action@main
  with:
    app-id: ${{ secrets.APP_ID }}
    app-private-key: ${{ secrets.APP_PRIVATE_KEY }}
    turbo-token: ${{ secrets.TURBO_TOKEN }}
    turbo-team: ${{ secrets.TURBO_TEAM }}
```

## Using Generated Token

Use the GitHub App token in subsequent steps:

```yaml
- name: Setup release environment
  id: setup
  uses: savvy-web/workflow-release-action@main
  with:
    app-id: ${{ secrets.APP_ID }}
    app-private-key: ${{ secrets.APP_PRIVATE_KEY }}

- name: Create release
  run: gh release create v1.0.0
  env:
    GH_TOKEN: ${{ steps.setup.outputs.token }}
```

## Conditional Steps Based on Repository Type

Run different steps based on whether the repo is a single-package private repo:

```yaml
- name: Setup release environment
  id: setup
  uses: savvy-web/workflow-release-action@main
  with:
    app-id: ${{ secrets.APP_ID }}
    app-private-key: ${{ secrets.APP_PRIVATE_KEY }}

- name: Run changesets (monorepo)
  if: steps.setup.outputs.is-single-private-package != 'true'
  run: pnpm changeset publish
  env:
    GITHUB_TOKEN: ${{ steps.setup.outputs.token }}

- name: Create semver tag (single package)
  if: steps.setup.outputs.is-single-private-package == 'true'
  run: |
    VERSION=$(node -p "require('./package.json').version")
    git tag "$VERSION"
    git push origin "$VERSION"
  env:
    GH_TOKEN: ${{ steps.setup.outputs.token }}
```

## Complete Release Workflow

A complete workflow that sets up, validates, and creates releases:

```yaml
name: Release

on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: false

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    steps:
      - name: Setup release environment
        id: setup
        uses: savvy-web/workflow-release-action@main
        with:
          app-id: ${{ secrets.APP_ID }}
          app-private-key: ${{ secrets.APP_PRIVATE_KEY }}
          package-manager: pnpm
          turbo-token: ${{ secrets.TURBO_TOKEN }}
          turbo-team: ${{ secrets.TURBO_TEAM }}

      - name: Build
        run: pnpm build

      - name: Test
        run: pnpm test

      - name: Create Release PR or Publish
        uses: changesets/action@v1
        with:
          publish: pnpm changeset publish
          version: pnpm changeset version
          commit: "chore: version packages"
          title: "chore: version packages"
        env:
          GITHUB_TOKEN: ${{ steps.setup.outputs.token }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## Using with Different Node.js Versions

Specify a custom Node.js version:

```yaml
- name: Setup release environment
  uses: savvy-web/workflow-release-action@main
  with:
    app-id: ${{ secrets.APP_ID }}
    app-private-key: ${{ secrets.APP_PRIVATE_KEY }}
    node-version: "20.x"
```

Note: If you have an `.nvmrc` file, it will be used automatically unless `node-version` is specified.

## Accessing Package Manager Output

Use the detected package manager in subsequent steps:

```yaml
- name: Setup release environment
  id: setup
  uses: savvy-web/workflow-release-action@main
  with:
    app-id: ${{ secrets.APP_ID }}
    app-private-key: ${{ secrets.APP_PRIVATE_KEY }}

- name: Run build with detected package manager
  run: ${{ steps.setup.outputs.package-manager }} run build
```

## Required Secrets

All examples require these secrets to be configured in your repository or organization:

* `APP_ID` - Your GitHub App ID
* `APP_PRIVATE_KEY` - Your GitHub App private key (PEM format)

Optional secrets for Turbo cache:

* `TURBO_TOKEN` - Turbo remote cache token
* `TURBO_TEAM` - Turbo team slug

## GitHub App Setup

To use this action, you need to create a GitHub App with the following permissions:

**Repository Permissions:**

* Actions: Read & Write
* Contents: Read & Write
* Pull Requests: Read & Write
* Issues: Read & Write

**Steps to Create:**

1. Go to GitHub Settings → Developer settings → GitHub Apps
2. Click "New GitHub App"
3. Set the required permissions
4. Generate a private key
5. Install the app on your repositories
6. Add the App ID and Private Key as secrets
