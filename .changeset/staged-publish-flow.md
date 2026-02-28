---
"@savvy-web/workflow-release-action": patch
---

## Bug Fixes

Staged publish flow with diagnostic logging to prevent half-publishes and improve debuggability.

- Add diagnostic `debug()` logging to built package.json name resolution in both pre-validation and publish loops, making it visible in CI debug logs when the source name is used as fallback
- Implement staged pack-then-publish with abort gate: if any ready target fails to pack, the entire package is aborted before any publishing occurs, preventing partial registry state
- Add stderr capture and warning-level logging to `packAndComputeDigest` for actionable diagnostics when `npm pack` fails
- Elevate pack failure logging from `debug()` to `warning()` with stderr content, exit code, and specific failure reason
