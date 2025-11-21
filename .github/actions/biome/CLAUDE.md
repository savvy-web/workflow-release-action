# Biome Setup Action

A standalone composite action that automatically detects and installs the correct Biome version from your repository's configuration file. Can be used independently or as part of the Node.js setup action.

## Quick Start

```yaml
# Automatic version detection
- uses: savvy-web/workflow-release-action/.github/actions/biome@main

# Or with explicit version
- uses: savvy-web/workflow-release-action/.github/actions/biome@main
  with:
    version: 2.3.6
```

## Usage Notes

The Node.js setup action automatically runs this Biome action after installing dependencies, so you typically don't need to call it separately.

## Full Documentation

See [README.md](README.md) for complete documentation, including:

* Version detection logic
* All available inputs and outputs
* Usage examples
* Integration with other actions

## Development

This action uses TypeScript for version detection logic:

* Action definition: [`action.yml`](action.yml)
* TypeScript logic: [`detect-biome-version.ts`](detect-biome-version.ts)
* Tests: [`../../../__tests__/detect-biome-version.test.ts`](../../../__tests__/detect-biome-version.test.ts)

For general guidance on developing TypeScript actions in this repository, see:

* [TYPESCRIPT_ACTIONS.md](../../../TYPESCRIPT_ACTIONS.md) - TypeScript action development guide
* [Main CLAUDE.md](../../../CLAUDE.md) - Repository-wide guidance
