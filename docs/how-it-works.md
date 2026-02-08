# How It Works

The action implements a three-phase release workflow. It automatically detects which phase to run based on the trigger context (branch, event type, commit message), or you can explicitly set the phase with the `phase` input.

## Phase 1: Branch Management

**Triggers:** Push to `main` (non-release commits)

When new commits land on `main` that include changeset files, the action:

1. Scans for changeset files and identifies packages with pending releases
2. Categorizes packages as publishable (registry targets) or version-only (GitHub release only)
3. Checks if the release branch (`changeset-release/main`) already exists
4. If no branch exists: creates the branch, runs the version command, and opens a release PR
5. If the branch exists: rebases it onto `main` to incorporate new changes, detecting conflicts

The release PR title uses the configured prefix (default: `chore: release`) and lists the pending version bumps.

## Phase 2: Validation

**Triggers:** Push to `changeset-release/main` branch

When the release branch is updated (from Phase 1 or manual commits), the action validates the release:

1. Extracts issue references from commit messages and links them to the release
2. Runs `pnpm build` (or the configured package manager) to verify all packages compile
3. Performs a dry-run publish to each configured registry (npm, JSR, GitHub Packages, custom)
4. Generates a preview of CHANGELOG entries that will be created
5. Creates a unified check run on the PR showing all validation results
6. Posts or updates a sticky comment on the release PR with a validation summary

## Phase 3: Publishing

**Triggers:** Merge of release PR to `main`

When the release PR is merged, the action detects the merge and publishes:

1. Identifies which packages had version bumps by analyzing the PR diff
2. Publishes each package to all configured registries using the appropriate authentication (OIDC for npm/JSR, tokens for GitHub Packages and custom registries)
3. Creates artifact attestations for published packages (provenance)
4. Determines the tag strategy -- single tag for single-package repos, per-package tags for monorepos
5. Creates GitHub releases with auto-generated release notes from CHANGELOGs
6. Optionally generates SBOMs for published packages

## Phase Detection

The action determines the phase automatically:

| Context | Phase |
| --- | --- |
| Push to `main`, no associated merged release PR | Branch Management |
| Push to `changeset-release/main` | Validation |
| Push to `main` with merged release PR detected | Publishing |
| PR closed/merged from `changeset-release/main` | Publishing |
| `phase` input set explicitly | The specified phase |

You can override automatic detection by setting the `phase` input to `branch-management`, `validation`, `publishing`, `close-issues`, or `none`.

## Dry-Run Mode

Setting `dry-run: "true"` prevents any persistent changes:

- **Phase 1:** Shows what branch/PR would be created without creating them
- **Phase 2:** Runs validation but does not update PR comments or check runs
- **Phase 3:** Simulates publishing without actually pushing to registries, creating tags, or GitHub releases

This is useful for testing your workflow configuration before going live.
