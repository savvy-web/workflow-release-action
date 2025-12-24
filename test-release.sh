#!/usr/bin/env bash
set -e

echo "🗑️  Deleting origin/changeset-release/main branch..."
git push origin --delete changeset-release/main || echo "Branch may not exist, continuing..."

echo ""
echo "🔄 Re-running workflow job 20050827817..."
gh run rerun 20050827817 --repo savvy-web/workflow-integration

echo ""
echo "✅ Done! Watch the run at:"
echo "https://github.com/savvy-web/workflow-integration/actions/runs/20050827817"
