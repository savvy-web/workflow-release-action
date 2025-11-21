# Biome Setup Action

A reusable composite action that automatically detects and installs the correct Biome version from your repository's configuration file.

## Features

* **Automatic version detection** from `biome.jsonc` or `biome.json` (prefers `.jsonc`)
* **Parses `$schema` field** to extract the semver version
* **Manual version override** via optional `version` input
* **Installs Biome** using `biomejs/setup-biome@v2`
* **Falls back to `latest`** with warning annotation if config not found
* **Provides outputs** for detected version and config file

## Inputs

| Name      | Description                                                                                        | Required | Default         |
| --------- | -------------------------------------------------------------------------------------------------- | -------- | --------------- |
| `version` | Biome version to install. If provided, skips config file detection and uses this version directly. | No       | *(auto-detect)* |

## Outputs

| Name          | Description                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------- |
| `version`     | The Biome version that was installed (either provided, detected from config, or `latest`)                            |
| `config-file` | The Biome config file that was detected (`biome.jsonc`, `biome.json`, or empty if not found or version was provided) |

## Usage

### Automatic Version Detection (Recommended)

The action will automatically detect the Biome version from your `biome.jsonc` or `biome.json` file by parsing the `$schema` field:

```yaml
- uses: savvy-web/workflow-release-action/.github/actions/biome@main
```

**Example config file:**

```jsonc
{
  "$schema": "https://biomejs.dev/schemas/2.3.6/schema.json",
  // ... rest of config
}
```

The action will extract `2.3.6` from the schema URL and install that specific version.

### Manual Version Override

If you need to use a specific version regardless of the config file:

```yaml
- uses: savvy-web/workflow-release-action/.github/actions/biome@main
  with:
    version: 2.3.6
```

### Using Outputs

```yaml
- name: Setup Biome
  id: biome
  uses: savvy-web/workflow-release-action/.github/actions/biome@main

- name: Display Biome version
  run: |
    echo "Biome version: ${{ steps.biome.outputs.version }}"
    echo "Config file: ${{ steps.biome.outputs.config-file }}"
```

## Behavior

The action follows this logic:

1. **If `version` input is provided:**
   * Use the provided version directly
   * Skip config file detection
   * Install specified version

2. **If no `version` input:**
   * Look for `biome.jsonc` first, then `biome.json`
   * Parse the `$schema` field to extract version
   * Install the detected version

3. **If no config file found or version cannot be parsed:**
   * Fall back to `latest`
   * Emit a GitHub Actions warning annotation

## Integration with Node.js Action

The Node.js setup action ([`../.github/actions/node`](../node/)) automatically runs this Biome action after installing dependencies, so you typically don't need to call it separately unless you want to use Biome without the full Node.js setup.

## Example Workflows

### Standalone Usage

```yaml
name: Lint

on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: savvy-web/workflow-release-action/.github/actions/biome@main
      - run: biome ci .
```

### With Version Override

```yaml
- uses: savvy-web/workflow-release-action/.github/actions/biome@main
  with:
    version: latest # Always use the latest version
```

### Integrated with Node.js Setup

```yaml
- uses: savvy-web/workflow-release-action/.github/actions/node@main
  # Biome is automatically set up after dependencies install
- run: biome ci .
```

## Troubleshooting

### Warning: "No Biome config file found"

If you see this warning, ensure you have either `biome.jsonc` or `biome.json` in your repository root. Alternatively, provide the `version` input explicitly.

### Warning: "Could not parse version from $schema"

Ensure your Biome config file's `$schema` field follows this format:

```jsonc
{
  "$schema": "https://biomejs.dev/schemas/X.Y.Z/schema.json",
}
```

Where `X.Y.Z` is a valid semver version (e.g., `2.3.6`).
