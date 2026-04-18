#!/usr/bin/env bash
# vortex-bench 本地 CI 脚本。
#
# 前置条件（必须在宿主机满足；GitHub Actions 标准 runner 目前跑不起来）：
#   1. Chrome 已开启，vortex 扩展已加载并处于激活状态
#   2. vortex-server 已起（监听 localhost:6800）
#   3. shell 环境含 ZHIPU_API_KEY（或 ANTHROPIC_API_KEY）
#
# 用法：
#   ./packages/vortex-bench/scripts/bench-ci.sh [scenarios-root]
# 默认 scenarios-root = packages/vortex-bench/scenarios/v1（L0 + L1）
#
# 产物：
#   packages/vortex-bench/reports/ci-<timestamp>.json   本次跑数据
#   stdout                                               MD 报告卡 + diff
# 退出码：
#   0 无 critical 回退；2 有 critical 回退；其他非零 = 运行异常

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$REPO_ROOT"

SCEN_ROOT="${1:-packages/vortex-bench/scenarios/v1}"
BASELINE="packages/vortex-bench/reports/baseline.json"
TS="$(date +%Y%m%d-%H%M%S)"
REPORT="ci-${TS}.json"

echo "[bench-ci] building vortex-bench..."
pnpm -F @bytenew/vortex-bench build >/dev/null

echo "[bench-ci] pinging vortex-server..."
if ! curl -sS --max-time 2 http://localhost:6800/ping >/dev/null 2>&1; then
  # 非所有 vortex-server 都暴露 /ping HTTP，软检测即可
  echo "[bench-ci] warn: localhost:6800 unreachable via HTTP GET. If extension+server are up via WS, ignore."
fi

echo "[bench-ci] running scenarios under $SCEN_ROOT..."
REPORT_NAME="$REPORT" node packages/vortex-bench/dist/index.js run "$SCEN_ROOT"
echo
echo "[bench-ci] diff against baseline..."
set +e
node packages/vortex-bench/dist/index.js diff "$BASELINE" "packages/vortex-bench/reports/$REPORT"
code=$?
set -e

echo
if [ $code -eq 0 ]; then
  echo "[bench-ci] ✅ no critical regressions"
elif [ $code -eq 2 ]; then
  echo "[bench-ci] 🔴 CRITICAL regressions detected"
else
  echo "[bench-ci] unexpected exit $code from diff"
fi
exit $code
