---
"@savvy-web/workflow-release-action": minor
---

Add configurable supplier metadata for NTIA-compliant SBOMs

This feature introduces a layered configuration system for SBOM metadata that:

- Auto-infers metadata from package.json (author, repository, bugs, homepage)
- Accepts explicit configuration from `.github/silk-release.json`
- Supports fallback to `SILK_RELEASE_SBOM_TEMPLATE` environment variable
- Merges inferred and configured values (config wins on conflicts)
- Detects copyright start year from npm registry or configuration
- Validates against NTIA minimum elements for SBOM compliance

Configuration lookup order:
1. `.github/silk-release.json` in your repository
2. `SILK_RELEASE_SBOM_TEMPLATE` environment variable (from repo or org variable)

New configuration options:
- `sbom.supplier`: Company name, URL, and contact information
- `sbom.copyright`: Holder name and optional start year
- `sbom.publisher`: Publisher name for the component
- `sbom.documentationUrl`: Documentation URL override

The SBOM preview in validation now includes:
- NTIA compliance status per package (7 required fields)
- License summary
- External references (VCS, issue tracker, documentation)
- Actionable suggestions for missing compliance fields

A JSON Schema is provided for IDE autocomplete support. Reference it in your config:
```json
{
  "$schema": "https://raw.githubusercontent.com/savvy-web/workflow-release-action/main/.github/silk-release.schema.json"
}
```

Fixes #28
