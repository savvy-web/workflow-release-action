# Integration Test

Trigger the Release workflow on the integration repo in dry-run mode and tail the logs.

## Steps

1. Trigger the workflow:

```bash
gh workflow run release.yml --repo savvy-web/workflow-integration --ref main -f dry_run=true
```

1. Wait a moment for the run to start, then get the run ID:

```bash
gh run list --repo savvy-web/workflow-integration --workflow=release.yml --limit=1 --json databaseId --jq '.[0].databaseId'
```

1. Watch the run logs in real-time:

```bash
gh run watch <RUN_ID> --repo savvy-web/workflow-integration
```

Or view the full logs after completion:

```bash
gh run view <RUN_ID> --repo savvy-web/workflow-integration --log
```

## Quick one-liner

```bash
gh workflow run release.yml --repo savvy-web/workflow-integration --ref main -f dry_run=true && sleep 3 && gh run watch $(gh run list --repo savvy-web/workflow-integration --workflow=release.yml --limit=1 --json databaseId --jq '.[0].databaseId') --repo savvy-web/workflow-integration
```
