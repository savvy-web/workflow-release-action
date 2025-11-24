# Release Environment Setup Action

A composite action that sets up the complete environment for release workflows including GitHub App token generation, repository checkout, and Node.js setup with dependencies.

## Quick Start

```yaml
- name: Setup release environment
  id: setup
  uses: savvy-web/workflow-release-action/.github/actions/setup-release@main
  with:
    app-id: ${{ secrets.APP_ID }}
    app-private-key: ${{ secrets.APP_PRIVATE_KEY }}
```

## Key Features

* Generates short-lived GitHub App token with release permissions
* Checks out repository with authenticated token
* Sets up Node.js with package manager and dependencies
* Returns token for use in subsequent steps

## Full Documentation

See [README.md](README.md) for complete documentation, including:

* All available inputs and outputs
* Token usage and permissions
* Integration with release workflows
* Troubleshooting

## Development

This action includes multiple TypeScript utilities:

* Action definition: [`action.yml`](action.yml)
* TypeScript utilities:
  * [`detect-repo-type.ts`](detect-repo-type.ts) - Repository type detection
  * [`detect-publishable-changes.ts`](detect-publishable-changes.ts) - Changeset analysis
  * [`validate-builds.ts`](validate-builds.ts) - Build validation
  * [`validate-publish-npm.ts`](validate-publish-npm.ts) - NPM publish validation
  * [`validate-publish-github-packages.ts`](validate-publish-github-packages.ts) - GitHub Packages validation
  * [`create-validation-check.ts`](create-validation-check.ts) - Unified validation checks
  * [`update-sticky-comment.ts`](update-sticky-comment.ts) - PR comment management
  * And more in this directory

For general guidance on developing TypeScript actions in this repository, see:

* [TYPESCRIPT_ACTIONS.md](../../../TYPESCRIPT_ACTIONS.md) - TypeScript action development guide
* [Main CLAUDE.md](../../../CLAUDE.md) - Repository-wide guidance
