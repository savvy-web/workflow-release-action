# @savvy-web/workflow-release-action

## 1.3.5

### Patch Changes

- 8ec59b0: fix(release): prevent duplicate tag creation in simple release workflow

  Fixed an issue where tags were created at the wrong commit when release PRs were merged. The workflow now skips `changeset publish` for single-private-package repos and uses manual tag creation to ensure tags are created at the correct release commit.

  **Changes:**
  - Added "Determine publish command" step to use no-op for single-private-packages
  - Manual tag creation now only runs when `published == 'true'`
  - Prevents `changeset publish` from creating tags that conflict with manual creation

  **Impact:**
  - Tags will now be created at the release commit (e.g., "chore: release X.X.X")
  - Eliminates duplicate tag errors when release PRs are merged
  - Fixes tag positioning being one commit behind

- 8ec59b0: Added comprehensive Copilot instructions document to guide AI coding agents working in this repository. This enhances developer experience when using GitHub Copilot and similar tools.

  **Changes:**
  - Added `.github/copilot-instructions.md` with detailed repository overview, workflows, and coding standards
  - Added `.github/instructions/.markdownlint.json` to configure Markdown linting for instructions directory
  - Provides context about shared GitHub Actions, reusable workflows, and automation tools

  **Impact:**
  - Improves AI-assisted development with better repository context
  - Standardizes guidance for coding agents across the codebase
  - Complements existing CLAUDE.md with Copilot-specific documentation

## 1.3.4

### Patch Changes

- c5260a8: Fix duplicate tag creation by enabling tag fetching in release workflow

  **Problem:** The release workflow was creating duplicate tags and failing on subsequent runs because tags weren't being fetched during checkout. When the workflow ran a second time (e.g., after a tag push), the `git rev-parse "$VERSION"` check couldn't detect existing tags, causing the workflow to attempt tag creation again.

  **Root Cause:** The `actions/checkout` step in the setup-release action had `fetch-tags: false` (the default), preventing the tag existence check from working correctly.

  **Solution:** Added `fetch-tags: true` to the checkout step in `.github/actions/setup-release/action.yml` to ensure tags are available for existence checks.

  **Impact:** The workflow now correctly skips tag creation when a tag already exists, preventing errors from duplicate tag attempts and allowing safe re-runs of the release workflow.

## 1.3.3

### Patch Changes

- 742a10e: Extract version-specific sections from CHANGELOG for GitHub releases

  GitHub releases now include only the relevant version section from CHANGELOG.md instead of the entire changelog history. The workflow parses the CHANGELOG structure and extracts content between the current version's `## {version}` heading and the next version heading.

  **Changes:**
  - Updated manual tag creation step in `release-simple.yml` to extract version-specific CHANGELOG section using awk
  - Fixed duplicate heading issue by skipping the version heading line in output
  - Added validation for empty changelog sections with fallback message
  - Documented expected CHANGELOG format (changesets-generated with `## version` headings)
  - Awk field-based matching handles whitespace variations robustly
  - GitHub releases now show clean, focused release notes for each version
  - Prevents changelog bloat in release descriptions

  **Edge Cases Handled:**
  - Empty changelog sections: Provides fallback message "No release notes found for this version"
  - Missing version sections: Handled gracefully with validation check
  - Works with standard changesets-generated CHANGELOG format

  **Example:** For version 1.3.2, the release notes will contain only the "## 1.3.2" section, not the full changelog history.

## 1.3.2

### Patch Changes

- b237263: Fix release workflow to create simple semver tags and properly publish releases

  **Root Causes:**
  1. The `check-changesets` job was preventing publish from running after release PR merges
  2. Needed simple semver tags (`1.3.2`) instead of scoped package tags (`@savvy-web/workflow-release-action@1.3.2`)
  3. Manual tag creation was always running, even for multi-package repos where it shouldn't

  **Changes:**
  - Removed `check-changesets` job from both reusable workflows (changesets handles detection internally)
  - Updated `release-simple.yml` to use `pnpm changeset publish`
  - Updated `package.json` `ci:publish` script to run `changeset publish`
  - Fixed `setup-release` action to use full GitHub URL for node action reference
  - Added checkout steps before using local composite actions
  - Added required permissions to main release workflow
  - **Added repository type detection** in `setup-release` action:
    - Detects single-package private repos that need manual tag creation
    - Reads `packageManager` field from root `package.json` to determine which package manager to use
    - Uses package manager's native workspace list commands (e.g., `pnpm ls -r`, `npm query`, `yarn workspaces list`)
    - Checks root `package.json` for `"private": true`
    - Validates `.changeset/config.json` privatePackages settings
    - Outputs `is-single-private-package` flag for conditional tag creation
    - Outputs detected `package-manager` name for use in changeset commands
  - **Made changeset commands package-manager-aware**:
    - Dynamically constructs publish commands based on detected package manager
    - pnpm: `pnpm exec changeset publish`
    - npm: `npx changeset publish`
    - yarn: `yarn exec changeset publish`
    - bun: `bunx changeset publish`
  - **Made GitHub release creation conditional**:
    - Single-package private repos: `create-github-releases: false` (creates simple semver tags manually)
    - Multi-package repos: `create-github-releases: true` (lets changesets create releases per package)
  - **Updated manual tag creation step** to only run for single-package private repos

  **How It Works Now:**
  1. **When changesets exist:** Creates release PR with version bumps
  2. **When release PR merges:**
     - Changesets detects version changes and runs publish
     - Changesets creates scoped tag (`@savvy-web/workflow-release-action@1.3.2`)
     - Workflow creates simple tag (`1.3.2`) and GitHub release with CHANGELOG content

## 1.3.1

### Patch Changes

- a9e963e: Fix release workflow to properly create GitHub releases and tags

  **Root Cause:**
  The `check-changesets` job was preventing the publish step from running when release PRs were merged, because changesets are consumed (deleted) during versioning. The changesets action internally handles detecting release PR merges by checking for version changes.

  **Changes:**
  - Removed `check-changesets` job and its condition from both reusable workflows
  - Updated `release-simple.yml` to use `pnpm changeset publish` as the publish command
  - Updated `package.json` `ci:publish` script to run `changeset publish`
  - Fixed `setup-release` action to use full GitHub URL for node action reference
  - Added initial checkout steps to both reusable workflows before using local composite actions
  - Added `contents: write` and `pull-requests: write` permissions to main release workflow

  **How It Works Now:**
  1. **When changesets exist:** Creates release PR with version bumps
  2. **When release PR merges:** Detects version changes, runs publish command, creates tags and GitHub releases

  **Technical Details:**
  For private packages, `changeset publish` creates the git tag and triggers GitHub release creation without attempting NPM publication.

## 1.3.1

### Patch Changes

- 64fff0b: Fix release workflow to properly create GitHub releases and tags

  The release workflow now runs `changeset publish` instead of a no-op echo command. This ensures that git tags are created and GitHub releases are generated with CHANGELOG content, even for private packages that don't publish to NPM.

  **Changes:**
  - Updated `release-simple.yml` to use `pnpm changeset publish` as the publish command
  - Updated `package.json` `ci:publish` script to run `changeset publish`
  - Fixed `setup-release` action to use full GitHub URL for node action reference
  - Added initial checkout steps to both reusable workflows before using local composite actions
  - Added `contents: write` and `pull-requests: write` permissions to main release workflow

  **Technical Details:**
  The `createGithubReleases` feature in the changesets action only works when `changeset publish` actually executes. For private packages, `changeset publish` creates the git tag and triggers GitHub release creation without attempting NPM publication.

## 1.3.0

### Minor Changes

- 4a79d88: Refactor release workflow into modular shared actions and reusable workflows

  **New Shared Actions:**
  - `setup-release` - Centralized release environment setup (GitHub App token, checkout, Node.js)
  - `check-changesets` - Lightweight changeset detection with count outputs
  - `run-changesets` - Configurable changesets execution with version detection

  **New Reusable Workflows:**
  - `release-standard.yml` - Multi-package releases with NPM publishing
    - Defaults to dry-run mode for safety
    - Explicit opt-in required for production publishing
    - Clear warning banners for dry-run vs production mode
  - `release-simple.yml` - Single-package releases with GitHub releases only
    - Perfect for private repos and GitHub Actions
    - No NPM publishing

  **Breaking Changes:**
  - Simplified `release.yml` to use new `release-simple.yml` reusable workflow
  - All workflows and actions now use local paths (`./.github/...`) instead of full GitHub URLs
  - Other repositories calling these workflows should use full URLs (`savvy-web/workflow-release-action/.github/workflows/...@main`)

## 1.2.0

### Minor Changes

- 7b2c72f: ## New Biome Setup Action

  Introduces a new standalone composite action (`.github/actions/biome`) that automatically detects and installs the Biome version from your repository's configuration file. The Node.js setup action now uses this Biome action automatically.
  - Detects `biome.jsonc` or `biome.json` (prefers `.jsonc`)
  - Parses the `$schema` field to extract the version (e.g., `https://biomejs.dev/schemas/2.3.6/schema.json` → `2.3.6`)
  - Optional `version` input to override auto-detection and specify version explicitly
  - Falls back to `latest` with a warning if no config file or version is found
  - Can be used independently: `uses: savvy-web/workflow-release-action/.github/actions/biome@main`
  - Outputs detected version and config file for downstream steps
  - Comprehensive README documentation with examples and troubleshooting

  ### Workflow Updates
  - Node.js setup action automatically runs Biome setup after dependencies install
  - Removes duplicate Biome setup steps from `release.yml` and `validate.yml` workflows

## 1.1.0

### Minor Changes

- 556da74: # Adds workflow to sync standard labels to repositories with workflow:standard property

  Adds a new workflow_dispatch workflow that syncs standard workflow labels to repositories with the custom property `workflow:standard`.

  ## Key features
  - Loads standard labels from `.github/labels.json` configuration file
  - Queries organization for repositories with `workflow:standard` custom property
  - Creates missing standard labels on target repositories
  - Updates existing labels to match standard definitions
  - Preserves custom labels that are not in the standard definitions (by default)
  - **Optional custom label removal** for enforcing strict standardization
  - **Dry-run mode** for previewing changes without applying them
  - **Rate limiting** with automatic monitoring and throttling
  - **Enhanced label comparison** detecting name casing, color, and description differences
  - **Error accumulation** tracking partial failures per repository
  - Detailed per-repository statistics and comprehensive job summaries

  ## Standard labels included

  The workflow includes 18 standard labels covering common workflow needs: `ai`, `automated`, `bug`, `breaking`, `ci`, `dependencies`, `docs`, `duplicate`, `enhancement`, `good first issue`, `help wanted`, `invalid`, `performance`, `question`, `refactor`, `security`, `test`, and `wontfix`.

## 1.0.0

### Major Changes

- 115f8fe: # Enhance Node.js setup action with improved caching and reliability

  Simplifies the Node.js setup composite action with dedicated package manager steps, integrated Turbo cache support, and more robust version detection. Key improvements include:
  - Fix node version file detection to prevent parameter conflicts
  - Enable pnpm standalone mode for improved reliability
  - Add comprehensive documentation with usage examples and troubleshooting guides
