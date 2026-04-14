#!/bin/bash
# Chrome 启动 NM host 时不加载 shell profile，需要手动加载 nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

DIR="$(cd "$(dirname "$0")" && pwd)"

# Optional: 读取 relay 配置（让 vortex-server 同时连出到 OpenClaw plugin）
# 配置文件: ~/.vortex/relay.env
#   RELAY_URL=wss://your-openclaw-host/vortex
#   RELAY_TOKEN=...
#   SESSION_NAME=home-mac
RELAY_ARGS=()
RELAY_ENV="$HOME/.vortex/relay.env"
if [ -f "$RELAY_ENV" ]; then
  # shellcheck disable=SC1090
  set -a; . "$RELAY_ENV"; set +a
  if [ -n "$RELAY_URL" ] && [ -n "$RELAY_TOKEN" ]; then
    RELAY_ARGS+=(--relay "$RELAY_URL" --token "$RELAY_TOKEN")
    [ -n "$SESSION_NAME" ] && RELAY_ARGS+=(--session-name "$SESSION_NAME")
  fi
fi

exec node "$DIR/dist/bin/vortex-server.js" "${RELAY_ARGS[@]}"
