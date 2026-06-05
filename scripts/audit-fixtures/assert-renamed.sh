#!/usr/bin/env bash
# 改名完成判据:全仓不应再有 @bytenew/vortex- 引用(忽略 node_modules/dist/.worktrees)
set -euo pipefail
HITS=$(grep -rl "@bytenew/vortex-" \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.mjs" \
  --include="*.json" --include="*.md" . 2>/dev/null \
  | grep -v node_modules | grep -v '/dist/' | grep -v '.worktrees' || true)
if [ -n "$HITS" ]; then
  echo "FAIL: 仍有 @bytenew/vortex- 引用:"; echo "$HITS"; exit 1
fi
echo "PASS: 改名干净"
