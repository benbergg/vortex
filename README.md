# Vortex

让 LLM 直接驱动你正在用的本地 Chrome — 一套面向 AI Agent 的浏览器自动化协议与工具链。

不是另一个 Playwright（无头、独立浏览器），而是接管**用户已登录的真实浏览器会话**，做 Cookie/插件/历史都在的真实操作，适合：抓登录后才能看到的内容、跑日常 Web 任务、半监督的 RPA。

## 架构

```
LLM (Claude Code / OpenClaw / 自写客户端)
    │
    │ MCP / HTTP / WS
    ▼
┌─────────────────────────┐
│  @bytenew/vortex-mcp    │  MCP server（stdio）
│  @bytenew/vortex-cli    │  命令行
│  OpenClaw vortex plugin │  远程调用入口
└────────────┬────────────┘
             │  ws / http
             ▼
┌─────────────────────────┐
│  @bytenew/vortex-server │  本地桥接
└────────────┬────────────┘
             │  Native Messaging (stdio)
             ▼
┌─────────────────────────┐
│ @bytenew/vortex-extension│ Chrome 扩展（MV3）
└─────────────────────────┘
             │
             ▼
       真实 Chrome 页面
```

## 子项目

| 包 | 作用 | README |
|----|------|--------|
| [`@bytenew/vortex-shared`](packages/shared) | 共享类型 / action 名 / 错误码 | [README](packages/shared/README.md) |
| [`@bytenew/vortex-extension`](packages/extension) | Chrome 扩展（MV3）— 真正执行浏览器操作 | [README](packages/extension/README.md) |
| [`@bytenew/vortex-server`](packages/server) | 本地桥接服务（NM ↔ HTTP/WS ↔ relay） | [README](packages/server/README.md) |
| [`@bytenew/vortex-cli`](packages/cli) | 命令行客户端 — 终端直调 action | [README](packages/cli/README.md) |
| [`@bytenew/vortex-mcp`](packages/mcp) | MCP server — 接 Claude Code 等 LLM 工具 | [README](packages/mcp/README.md) |

完整设计：[`docs/DESIGN.md`](docs/DESIGN.md)（架构图、协议、关键设计决策、安全模型、路线图）。

外部（独立仓库）：
- [`vortex-browser-plugin`](https://github.com/bytenew/vortex-browser-plugin) — OpenClaw 插件，让远程 OpenClaw 实例控制本地浏览器

## 快速上手（接 Claude Code）

```bash
# 1. 装 server
npm i -g @bytenew/vortex-server

# 2. 装扩展（dev 模式）
git clone <this-repo> && cd vortex
pnpm install && pnpm -r build
# Chrome 扩展页 → 加载 packages/extension/dist/

# 3. 装 NM host（让扩展能拉起 server，详见 server README）

# 4. 注册到 Claude Code
claude mcp add vortex --scope user -- npx -y @bytenew/vortex-mcp
```

打开 Claude Code 后让它调 `mcp__vortex__vortex_tab_list`，应能看到当前所有标签页。

## 能力一览（共 **35 个工具**）

按模块分组：tab、page、dom、content、js、keyboard、mouse、capture、console、network、storage、file、frames。

详见 [`packages/mcp/README.md`](packages/mcp/README.md)。

## 开发

```bash
pnpm install
pnpm -r build              # 全量构建
pnpm --filter <pkg> dev    # 单包 watch
```

每个子包 README 有独立的调试/构建指引。

## License

MIT
