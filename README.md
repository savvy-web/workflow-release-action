# workflow-release-action

A GitHub Action that sets up the environment for release workflows including app token generation, checkout, and Node.js setup.

## Quick Start

```yaml
steps:
  - name: Setup release environment
    id: setup
    uses: savvy-web/workflow-release-action@main
    with:
      app-id: ${{ secrets.APP_ID }}
      app-private-key: ${{ secrets.APP_PRIVATE_KEY }}
      package-manager: pnpm
```

📚 **For more examples, see [EXAMPLES.md](EXAMPLES.md)**

## Inputs

| Input              | Description                                          | Required | Default                       |
| ------------------ | ---------------------------------------------------- | -------- | ----------------------------- |
| `app-id`           | GitHub App ID for authentication                     | Yes      | -                             |
| `app-private-key`  | GitHub App private key for authentication            | Yes      | -                             |
| `node-version`     | Node.js version to use                               | No       | `""` (uses .nvmrc or default) |
| `package-manager`  | Package manager to use (npm, pnpm, yarn, bun)        | No       | `pnpm`                        |
| `turbo-token`      | Turbo cache token                                    | No       | `""`                          |
| `turbo-team`       | Turbo team name                                      | No       | `""`                          |

## Outputs

| Output                      | Description                                                                   |
| --------------------------- | ----------------------------------------------------------------------------- |
| `token`                     | Generated GitHub App token for use in subsequent steps                        |
| `is-single-private-package` | `true` if this is a single-package private repo requiring manual tag creation |
| `package-manager`           | Detected package manager name (npm, pnpm, yarn, bun)                          |

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

4. **Repository Type Detection** - Analyzes the repository structure to determine if manual tag creation is needed

## Example with Token Output

```yaml
steps:
  - name: Setup release environment
    id: setup
    uses: savvy-web/workflow-release-action@main
    with:
      app-id: ${{ secrets.APP_ID }}
      app-private-key: ${{ secrets.APP_PRIVATE_KEY }}

  - name: Use token in another step
    run: gh pr list
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
* **Packages**: Read & Write _(Required for publishing to GitHub Packages)_
* **Attestations**: Write _(Required for creating build provenance attestations)_

### Token Permission Diagnostics

The action automatically checks and logs token permissions in the pre-action phase to help diagnose permission issues. This is especially helpful when encountering errors like:

* `"installation not allowed to Create organization package"` - The GitHub App needs the **Packages: Write** permission
* Permission-related publishing failures

The diagnostic logs include:

* Token type (Bot for GitHub Apps, User for PATs)
* App name and installation ID (for GitHub Apps)
* Helpful guidance on configuring permissions

## Artifact Attestations

This action automatically creates and links cryptographic attestations (provenance) for published packages and release assets, providing supply chain security and verifiability.

### What are Attestations?

Attestations are cryptographically signed statements that link artifacts to their source code and build process. They enable:

* **Verification**: Users can verify that an artifact came from a trusted source
* **Transparency**: Build provenance is recorded and auditable
* **Supply Chain Security**: Prevents tampering and unauthorized modifications

### How Attestations Work

#### For npm and GitHub Packages

* Uses npm's built-in `--provenance` flag (OIDC-based)
* Attestations are automatically created during `npm publish`
* Linked to packages in the registry
* Viewable in the package's "Provenance" section

#### For GitHub Release Assets

* Creates attestations for each uploaded tarball
* Uses the actual artifact's SHA256 digest
* Links appear in the GitHub Release notes
* Can be verified with `gh attestation verify`

### Verifying Attestations

Users can verify attestations using the GitHub CLI:

```bash
# Verify a package from GitHub Packages
gh attestation verify pkg:npm/@scope/package@version -o organization

# Verify a downloaded release asset
gh attestation verify path/to/package.tgz -o organization
```

### Required Workflow Permissions

Your workflow must have these permissions for attestations:

```yaml
permissions:
  id-token: write      # Required for OIDC signing
  contents: write      # Required for creating releases
  attestations: write  # Required for storing attestations
  packages: write      # Required for GitHub Packages
```

## Development

This repository contains additional GitHub Actions and reusable workflows in the `.github/actions/` and `.github/workflows/` directories. See the respective README files for more information.

### Repository Structure

* **Root `action.yml`** - The main release action setup that can be used directly as `uses: savvy-web/workflow-release-action@main`
* **`.github/actions/`** - Individual composite actions that can be used independently:
  * `setup-release/` - The underlying setup components used by the root action
  * `node/` - Node.js environment setup with package manager support
  * `biome/` - Biome linter detection and setup
  * `detect-runtime/` - Runtime environment detection
  * `detect-turbo/` - Turborepo configuration detection
* **`.github/workflows/`** - Reusable workflows for common CI/CD patterns
* **TypeScript Actions** - All actions use TypeScript with `actions/github-script@v8` for type-safe execution without a build step

For detailed information about developing TypeScript actions in this repository, see [TYPESCRIPT_ACTIONS.md](TYPESCRIPT_ACTIONS.md).
