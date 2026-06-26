#!/usr/bin/env bash
set -euo pipefail

message="${1:-}"

if [ -z "$message" ]; then
  echo "Usage: ./auto-push.sh \"commit message\""
  exit 1
fi

node --check app.js
git diff --check
git add -A

if git diff --cached --quiet; then
  echo "No changes to commit."
  exit 0
fi

git diff --cached --check
git commit -m "$message"
git push origin "$(git branch --show-current)"
