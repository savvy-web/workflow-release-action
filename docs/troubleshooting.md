# Troubleshooting

## Common Issues

### "Installation not allowed to Create organization package"

The GitHub App needs the **Packages: Write** repository permission. Update the app's permissions in GitHub Settings > Developer Settings > GitHub Apps.

Alternatively, pass a `github-token` with `packages: write` permission:

```yaml
- uses: savvy-web/workflow-release-action@main
  with:
    app-id: ${{ secrets.APP_ID }}
    private-key: ${{ secrets.APP_PRIVATE_KEY }}
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

### OIDC Publishing Fails for New Packages

OIDC trusted publishing to npm requires the package to already exist on npmjs.com. For first-time publishes, provide an npm token:

```yaml
- uses: savvy-web/workflow-release-action@main
  with:
    app-id: ${{ secrets.APP_ID }}
    private-key: ${{ secrets.APP_PRIVATE_KEY }}
    npm-token: ${{ secrets.NPM_TOKEN }}
```

After the first publish, you can configure OIDC trusted publishing on npmjs.com and remove the token.

### Release Branch Has Merge Conflicts

When the action detects conflicts while updating the release branch, it sets the `has_conflicts` output to `true`. Resolve the conflicts manually:

```bash
git checkout changeset-release/main
git rebase main
# Resolve conflicts
git rebase --continue
git push --force-with-lease
```

### No Phase Detected (Action Does Nothing)

The action uses context clues to determine which phase to run. If none match, it exits early. Check that:

- Your workflow triggers include both `main` and `changeset-release/main` branches
- The release PR was merged (not just closed) for Phase 3
- There are pending changeset files in `.changeset/` for Phase 1

You can also set the phase explicitly:

```yaml
- uses: savvy-web/workflow-release-action@main
  with:
    app-id: ${{ secrets.APP_ID }}
    private-key: ${{ secrets.APP_PRIVATE_KEY }}
    phase: branch-management
```

### Token Permission Diagnostics

The action logs token permissions in the pre-action phase. Check the workflow logs for:

- Token type (Bot for GitHub Apps, User for PATs)
- App name and installation ID
- Available permissions

These logs help diagnose authentication issues across different registries.

### Build Validation Fails

Phase 2 runs `pnpm build` (or your configured package manager's build command). If validation fails:

1. Check the workflow logs for the specific build error
2. Fix the issue on the release branch or on `main` (the action will rebase on next push)
3. The validation check on the PR will update automatically

### Changeset Version Command Fails

The default version command is `{package-manager} ci:version`. If your project uses a different script, set the `version-command` input:

```yaml
- uses: savvy-web/workflow-release-action@main
  with:
    app-id: ${{ secrets.APP_ID }}
    private-key: ${{ secrets.APP_PRIVATE_KEY }}
    version-command: "pnpm changeset version"
```
