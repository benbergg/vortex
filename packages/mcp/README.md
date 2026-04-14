# @bytenew/vortex-mcp

通过 MCP（Model Context Protocol）把 Claude Code 接到本地 Chrome — 让 Claude 直接驱动你正在用的浏览器：导航、点击、填表、截图、抓 DOM、读 console/network、跑 JS 等共 **64 个工具**。

底层基于 [Vortex](https://github.com/bytenew/vortex) 浏览器自动化套件：vortex Chrome 扩展 ↔ vortex-server（本地 WS）↔ 本 MCP server（stdio） ↔ Claude Code。

---

## 前置条件

1. **安装 Vortex Chrome 扩展并登录**（让扩展接管当前浏览器）
2. **运行 vortex-server**（本地 WebSocket，监听 6800 端口）

   ```bash
   # 通过 npm 全局安装
   npm i -g @bytenew/vortex-server

   # 或在 vortex 仓库里
   pnpm --filter @bytenew/vortex-server build
   node packages/server/dist/bin/vortex-server.js
   ```

   正常启动后会监听 `ws://localhost:6800/ws`，扩展会自动连上。

3. **Node ≥ 18**（MCP server 用 ESM）

---

## 在 Claude Code 中全局添加

Claude Code 通过 `claude mcp add` 注册 MCP server，加 `--scope user` 让所有项目共享。

### 推荐：通过 npx 拉取（无需本地构建）

```bash
claude mcp add vortex \
  --scope user \
  -- npx -y @bytenew/vortex-mcp
```

### 已本地构建 / 开发模式

```bash
# 1. 构建
cd /path/to/vortex/packages/mcp
pnpm install && pnpm build

# 2. 注册（指向 dist/src/server.js）
claude mcp add vortex \
  --scope user \
  -- node /absolute/path/to/vortex/packages/mcp/dist/src/server.js
```

### 自定义端口/超时

```bash
claude mcp add vortex \
  --scope user \
  --env VORTEX_PORT=6800 \
  --env VORTEX_TIMEOUT_MS=60000 \
  -- npx -y @bytenew/vortex-mcp
```

| 环境变量 | 默认 | 说明 |
|---------|------|------|
| `VORTEX_PORT` | `6800` | 本地 vortex-server WS 端口 |
| `VORTEX_TIMEOUT_MS` | `30000` | 单次工具调用超时（毫秒） |

### 验证

```bash
claude mcp list
# 应看到：
#   vortex: npx -y @bytenew/vortex-mcp - ✓ Connected
```

或在 Claude Code 会话内输入 `/mcp` 查看连接状态，再让 Claude 调用 `mcp__vortex__vortex_tab_list` 等工具。

---

## 手动编辑配置（可选）

`claude mcp add` 实际写入 `~/.claude.json` 的 `mcpServers` 段。直接编辑等价：

```json
{
  "mcpServers": {
    "vortex": {
      "command": "npx",
      "args": ["-y", "@bytenew/vortex-mcp"],
      "env": {
        "VORTEX_PORT": "6800",
        "VORTEX_TIMEOUT_MS": "30000"
      }
    }
  }
}
```

---

## 工具一览（64 个，按模块分组）

| 模块 | 工具前缀 | 典型用途 |
|------|---------|---------|
| **tab** | `vortex_tab_*` | list / create / close / activate / get_info |
| **page** | `vortex_page_*` | navigate / reload / back / forward / wait / wait_for_network_idle / info |
| **dom** | `vortex_dom_*` | query / query_all / click / fill / type / select / scroll / hover / get_attribute / wait_for_mutation |
| **content** | `vortex_content_*` | get_text / get_html / get_element_text / get_accessibility_tree / get_computed_style |
| **js** | `vortex_js_*` | evaluate / evaluate_async / call_function |
| **keyboard** | `vortex_keyboard_*` | press / shortcut |
| **capture** | `vortex_capture_*` | screenshot / element / gif_start / gif_frame / gif_stop |
| **console** | `vortex_console_*` | get_logs / get_errors / clear |
| **network** | `vortex_network_*` | get_logs / get_errors / filter / get_response_body / clear |
| **storage** | `vortex_storage_*` | get/set/delete cookies、local/session storage |
| **file** | `vortex_file_*` | upload / download / get_downloads |

---

## 移除

```bash
claude mcp remove vortex --scope user
```

---

## 故障排查

| 现象 | 原因 / 处理 |
|------|------------|
| `Failed to connect to vortex-server at localhost:6800` | vortex-server 没启动，或端口被占用。先 `lsof -iTCP:6800 -sTCP:LISTEN` 确认 |
| 工具调用一直 timeout | 扩展没连上 server。打开 Chrome 扩展页确认 vortex 状态；或调高 `VORTEX_TIMEOUT_MS` |
| 截图返回过大被截断 | 大于 500KB 的图片自动转存为本地文件并返回路径（不影响 Claude 阅读） |
| `claude mcp list` 显示 ✗ Failed | 用 `claude mcp get vortex` 看错误，或手动跑 `npx -y @bytenew/vortex-mcp` 看 stderr |

---

## License

MIT
