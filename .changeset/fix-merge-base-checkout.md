---
"@savvy-web/workflow-release-action": patch
---

## Bug Fixes

Fix merge base checkout failure in Phase 2 validation by using `git checkout --force` and removing `silent: true` to surface git errors in logs
