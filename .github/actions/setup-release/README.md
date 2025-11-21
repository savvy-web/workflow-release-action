# Setup Release Environment

A composite action that sets up the environment for release workflows including GitHub App token generation, repository checkout, and Node.js setup.

## Usage

```yaml
steps:
  - name: Setup release environment
    id: setup
    uses: savvy-web/workflow-release-action/.github/actions/setup-release@main
    with:
      app-id: ${{ secrets.APP_ID }}
      app-private-key: ${{ secrets.APP_PRIVATE_KEY }}
      package-manager: pnpm
```

## Inputs

| Input              | Description                                          | Required | Default                        |
| ------------------ | ---------------------------------------------------- | -------- | ------------------------------ |
| `app-id`           | GitHub App ID for authentication                     | Yes      | -                              |
| `app-private-key`  | GitHub App private key for authentication            | Yes      | -                              |
| `node-version`     | Node.js version to use                               | No       | `""` (uses .nvmrc or default)  |
| `package-manager`  | Package manager to use (npm, pnpm, yarn, bun)       | No       | `pnpm`                         |
| `turbo-token`      | Turbo cache token                                    | No       | `""`                           |
| `turbo-team`       | Turbo team name                                      | No       | `""`                           |

## Outputs

| Output                       | Description                                                                 |
| ---------------------------- | --------------------------------------------------------------------------- |
| `token`                      | Generated GitHub App token for use in subsequent steps                      |
| `is-single-private-package`  | `true` if this is a single-package private repo requiring manual tag creation |
| `package-manager`            | Detected package manager name (npm, pnpm, yarn, bun)                        |

## What It Does

This action performs four key setup steps:

1. **GitHub App Token Generation** - Generates a short-lived token with permissions for:
   * `actions:write` - For workflow operations
   * `contents:write` - For creating commits and tags
   * `pull-requests:write` - For creating/updating release PRs
   * `issues:write` - For issue management

2. **Repository Checkout** - Checks out the repository using the generated token for authenticated git operations

3. **Node.js Setup** - Sets up Node.js environment with:
   * Package manager installation and caching
   * Dependency installation
   * Optional Turbo cache configuration
   * Biome linter setup

4. **Repository Type Detection** - Analyzes the repository structure to determine if manual tag creation is needed:
   * Reads `packageManager` field from root `package.json` (e.g., `pnpm@10.20.0` → `pnpm`)
   * Checks if root package has `"private": true`
   * Detects workspace packages using the configured package manager:
     * pnpm: `pnpm ls -r --depth -1 --json` (counts packages, > 1 = workspace)
     * npm: `npm query ".workspace"` (counts workspaces, > 0 = workspace)
     * yarn: `yarn workspaces list --json` (counts lines, > 1 = workspace)
     * bun: Checks `package.json` workspaces field (no native list command yet)
   * Checks `.changeset/config.json` for `privatePackages.tag` setting
   * Outputs `is-single-private-package=true` when all conditions are met:
     * Root package is private
     * No workspace packages (only root package)
     * Changesets configured to tag private packages

This detection helps workflows conditionally handle tag creation for single-package private repos, where changesets creates scoped tags (e.g., `@org/pkg@1.0.0`) but simple semver tags (e.g., `1.0.0`) are preferred.

## Why Use This?

* **Centralized Setup** - Single action for all release workflow setup needs
* **GitHub App Benefits** - Better rate limits and security vs. PATs
* **Consistent Environment** - Same setup across all release workflows
* **Reusable Token** - Token output can be used in subsequent steps

## Example with Token Output

```yaml
steps:
  - name: Setup release environment
    id: setup
    uses: savvy-web/workflow-release-action/.github/actions/setup-release@main
    with:
      app-id: ${{ secrets.APP_ID }}
      app-private-key: ${{ secrets.APP_PRIVATE_KEY }}

  - name: Use token in another step
    run: gh pr list
    env:
      GH_TOKEN: ${{ steps.setup.outputs.token }}
```

## Example with Repository Type Detection

```yaml
steps:
  - name: Setup release environment
    id: setup
    uses: savvy-web/workflow-release-action/.github/actions/setup-release@main
    with:
      app-id: ${{ secrets.APP_ID }}
      app-private-key: ${{ secrets.APP_PRIVATE_KEY }}

  - name: Run changesets
    id: changesets
    uses: ./.github/actions/run-changesets
    with:
      github-token: ${{ steps.setup.outputs.token }}
      publish-command: pnpm changeset publish
      create-github-releases: false

  - name: Create simple semver tag
    if: steps.changesets.outputs.published == 'true' && steps.setup.outputs.is-single-private-package == 'true'
    run: |
      VERSION=$(node -p "require('./package.json').version")
      git tag "$VERSION"
      git push origin "$VERSION"
      gh release create "$VERSION" --title "v$VERSION" --notes-file CHANGELOG.md
    env:
      GH_TOKEN: ${{ steps.setup.outputs.token }}
```

## Required Secrets

Your repository or organization must have these secrets configured:

* `APP_ID` - Your GitHub App's ID
* `APP_PRIVATE_KEY` - Your GitHub App's private key (PEM format)

## GitHub App Permissions

Your GitHub App must have these repository permissions:

* **Actions**: Read & Write
* **Contents**: Read & Write
* **Pull Requests**: Read & Write
* **Issues**: Read & Write
