# @vortex-browser/extension

Vortex Chrome 扩展（Manifest V3）。承载所有浏览器侧能力，通过 Native Messaging 与 `vortex-server` 通信，由 server 把 action 请求路由到对应 handler。

## 模块

```
src/
├── background.ts          # service worker：NM 连接 + dispatch
├── content.ts             # content script：DOM 注入辅助
├── lib/
│   ├── router.ts          # ActionRouter：维护 action → handler 表
│   ├── debugger-manager.ts  # CDP debugger 接管 / 释放
│   ├── tab-utils.ts       # 活动 tab / frame 解析
│   └── iframe-offset.ts
└── handlers/
    ├── tab.ts             # tab.list / create / close / activate / getInfo
    ├── page.ts            # page.navigate / reload / back / forward / wait / info / waitForNetworkIdle
    ├── dom.ts             # dom.query / click / fill / type / scroll / hover / ...
    ├── content.ts         # content.getText / getHTML / getAccessibilityTree / ...
    ├── js.ts              # js.evaluate / evaluateAsync / callFunction
    ├── keyboard.ts        # keyboard.press / shortcut
    ├── capture.ts         # capture.screenshot / element / gif*
    ├── console.ts         # console.getLogs / getErrors / clear
    ├── network.ts         # network.getLogs / filter / getResponseBody / ...
    ├── storage.ts         # cookies + local/session storage
    ├── file.ts            # file.upload / download / getDownloads
    └── frames.ts          # frames.list / find
```

action 名定义在 `@vortex-browser/shared`，handler 在此实现。新增 action 时两边都要改。

## 构建

```bash
pnpm build           # 生产构建 → dist/（vite build + page-side IIFE）
pnpm dev             # 联调 dev loop：vite serve + @crxjs HMR + page-side watch
pnpm dev:build       # 回退：vite build --watch（无 HMR，需手动 reload 扩展）
```

构建产物：`dist/`（manifest + bg + content + assets + `page-side/*.js`），可直接作为 unpacked extension 加载。

### dev loop (HMR)

`pnpm dev` 走 `scripts/dev.mjs`，启动 `vite serve`（@crxjs HMR）并并行 watch page-side IIFE，**改 handler 免手动 reload 扩展**。**重载语义**：

| 改动 | 行为 |
|------|------|
| handler / background（`src/handlers/*`、`src/lib/*`） | crx **自动 reload 扩展**（免手动 🔄）；整扩展 reload 会断 Native Messaging → 改后需在 LLM 客户端 `/mcp reconnect` |
| page-side（`src/page-side/*`） | watch 重建文件，下次 `executeScript({files})` 自动取新，**无需任何 reload** |
| content-main（`src/content-main.ts`，world:MAIN） | crx 整体 reload（MAIN world 不支持模块级 HMR） |

> ⚠️ 为何需要 `dev.mjs` 编排而非直接 `vite`：① page-side 包是独立 IIFE（`build-page-side.mjs`，与 crx 隔离避免 code-splitting），而 crx serve **启动时会清空 dist** → 必须等 serve ready 后再把 page-side 写回，否则 `dom.*` 的 `executeScript({files})` 读不到文件；② 就绪信号需捕获 vite `"ready"`，不能用 `manifest.json` 出现判断（crx 早写晚抹有竞态）。详见 `scripts/dev.mjs` 注释。

## 安装到 Chrome

1. `pnpm build`（或 `pnpm dev`）
2. Chrome `chrome://extensions/` → 开启「开发者模式」
3. 「加载已解压的扩展程序」→ 选 `packages/extension/dist/`
4. 扩展 ID 固定为 `fbonhjdohmkcejfgmaicnkknpfafihnd`（`manifest.json` 内置 RSA `key`，**与加载路径/worktree 无关**），NM host `allowed_origins` 一次配置永久有效

## Native Messaging 配对

扩展启动时通过 `chrome.runtime.connectNative("com.vortexbrowser.host")` 连上 `vortex-server` 的 stdio。

NM host manifest 安装见 [`packages/server/README.md`](../server/README.md#native-messaging-host-安装)。
没有 server 进程时扩展功能仍可用（仅 background.ts 的 NM 监听报错），但所有 vortex 工具会失败。

## 调试

- **service worker 日志**：扩展页面 → 「检查视图：service worker」
- **content script 日志**：目标页面 DevTools console（前缀 `[vortex]`）
- **NM 协议**：`vortex-server` 启动时 stderr 会打印每条 `tool_request`/`tool_response`

## 协议

所有线缆消息形态（NmRequest/NmResponse/VtxRequest/VtxResponse）见 `@vortex-browser/shared/protocol.ts`。错误用 `VtxErrorCode` 标准化分类。
