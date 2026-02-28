---
"@savvy-web/workflow-release-action": minor
---

Use per-target built package name for registry version checks and SBOM validation

When a package publishes to multiple registries with different names (e.g., `my-pkg` for npm vs `@scope/my-pkg` for GitHub Packages), the release action now reads the built `package.json` in each target's directory to resolve the authoritative package name. This fixes incorrect version existence checks on registries where the published name differs from the source name, and removes the spurious "Package name mismatch" warning during Phase 2 pre-validation.
