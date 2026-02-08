# Configuration Reference

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `app-id` | Yes | -- | GitHub App ID for authentication |
| `private-key` | Yes | -- | GitHub App private key (PEM format) |
| `github-token` | No | `""` | GitHub token for GitHub Packages publishing. Use when the GitHub App lacks `packages:write` permission. Typically `secrets.GITHUB_TOKEN` |
| `skip-token-revoke` | No | `"false"` | Skip token revocation in post-action (tokens expire after 1 hour anyway) |
| `release-branch` | No | `changeset-release/main` | Name of the release branch |
| `target-branch` | No | `main` | Target branch for the release PR |
| `version-command` | No | `""` | Custom version command (defaults to auto-detected `{package-manager} ci:version`) |
| `pr-title-prefix` | No | `chore: release` | Prefix for the release PR title |
| `dry-run` | No | `"false"` | Run in dry-run mode (preview only, no actual changes) |
| `phase` | No | `""` | Explicitly set the workflow phase, skipping automatic detection. Values: `branch-management`, `validation`, `publishing`, `close-issues`, `none` |
| `npm-token` | No | `""` | NPM access token for publishing to npmjs.org. Only needed for first-time publish or when OIDC is not configured |
| `sbom-config` | No | `""` | SBOM metadata configuration (JSON) for NTIA-compliant SBOM generation |
| `custom-registries` | No | `""` | Custom registries with authentication (one per line). Format: `https://registry.example.com/_authToken=<token>` |

## Outputs

### Token Outputs

| Output | Description |
| --- | --- |
| `token` | Generated GitHub App installation token |
| `installation-id` | GitHub App installation ID |
| `app-slug` | GitHub App slug (URL-friendly name) |

### Phase 1: Branch Management Outputs

| Output | Description |
| --- | --- |
| `has_changes` | Whether releasable changes were detected |
| `publishable_packages` | JSON array of packages with registry publish targets |
| `version_only_packages` | JSON array of version-only packages (GitHub release only) |
| `releasable_packages` | JSON array of all releasable packages |
| `release_branch_exists` | Whether the release branch exists |
| `release_branch_has_open_pr` | Whether there is an open PR for the release branch |
| `release_pr_number` | PR number if a release PR exists |
| `release_branch_created` | Whether a new release branch was created |
| `release_branch_updated` | Whether the release branch was updated |
| `has_conflicts` | Whether the branch update resulted in merge conflicts |

### Phase 2: Validation Outputs

| Output | Description |
| --- | --- |
| `linked_issues` | JSON array of linked issues from commits |
| `builds_passed` | Whether all builds passed validation |
| `npm_publish_ready` | Whether packages are ready for npm publish |
| `github_packages_ready` | Whether packages are ready for GitHub Packages |

### Phase 3: Publishing Outputs

| Output | Description |
| --- | --- |
| `released_packages` | JSON array of released packages with name, version, and targets |
| `release_type` | Type of release (`major`, `minor`, or `patch`) |
| `release_tags` | JSON array of created git tags |
| `package_count` | Number of packages released |
| `publish_results` | JSON array of publish results per package and target |
| `success` | Whether the release was fully successful |

## Authentication Model

The action uses a tiered approach for multi-registry publishing:

| Registry | Method | Configuration |
| --- | --- | --- |
| npm | OIDC trusted publishing | No token needed (requires package to exist). Fallback: `npm-token` input |
| JSR | OIDC trusted publishing | No configuration needed |
| GitHub Packages | GitHub App token | Uses the generated token automatically |
| Custom registries | `custom-registries` input | Format: `https://registry.example.com/_authToken=<token>` |

### npm OIDC Setup

For OIDC trusted publishing to npm, your workflow needs `id-token: write` permission and the package must already exist on npmjs.com with your repository trusted. For first-time publishes, use the `npm-token` input.

### Custom Registry Format

Pass one registry per line in the `custom-registries` input:

```yaml
custom-registries: |
  https://registry.example.com/_authToken=${{ secrets.CUSTOM_NPM_TOKEN }}
  https://other-registry.com/_authToken=${{ secrets.OTHER_TOKEN }}
```

## SBOM Configuration

Provide SBOM metadata as a JSON string:

```yaml
sbom-config: |
  {
    "sbom": {
      "supplier": {
        "name": "Your Company",
        "url": "https://company.com",
        "contact": { "email": "security@company.com" }
      },
      "copyright": { "holder": "Your Company LLC" }
    }
  }
```

This can also be set via the `SILK_RELEASE_SBOM_TEMPLATE` environment variable. The input takes precedence.
