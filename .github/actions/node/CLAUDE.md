# Node.js Setup Action

A comprehensive composite action for setting up Node.js development environments with automatic package manager detection, dependency caching, Turbo build cache configuration, and Biome linter setup.

## Quick Start

```yaml
- uses: savvy-web/workflow-release-action/.github/actions/node@main
  with:
    package_manager: pnpm  # optional, defaults to pnpm
```

## Full Documentation

See [README.md](README.md) for complete documentation, including:

* All available inputs and outputs
* Package manager configuration
* Turbo cache setup
* Biome integration
* Troubleshooting guide

## Development

This action is a composite action defined in [`action.yml`](action.yml).

For general guidance on developing GitHub Actions in this repository, see:

* [TYPESCRIPT_ACTIONS.md](../../../TYPESCRIPT_ACTIONS.md) - TypeScript action development guide
* [Main CLAUDE.md](../../../CLAUDE.md) - Repository-wide guidance
