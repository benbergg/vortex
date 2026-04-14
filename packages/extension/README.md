# @bytenew/vortex-extension

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

action 名定义在 `@bytenew/vortex-shared`，handler 在此实现。新增 action 时两边都要改。

## 构建

```bash
pnpm build           # vite build → dist/
pnpm dev             # vite build --watch（监听源码变更，扩展页面手动 reload）
```

构建产物：`dist/`（manifest + bg + content + assets），可直接作为 unpacked extension 加载。

## 安装到 Chrome

1. `pnpm build`
2. Chrome `chrome://extensions/` → 开启「开发者模式」
3. 「加载已解压的扩展程序」→ 选 `packages/extension/dist/`
4. 记下扩展 ID（用于 NM host manifest）

## Native Messaging 配对

扩展启动时通过 `chrome.runtime.connectNative("com.bytenew.vortex")` 连上 `vortex-server` 的 stdio。

NM host manifest 安装见 [`packages/server/README.md`](../server/README.md#native-messaging-host-安装)。
没有 server 进程时扩展功能仍可用（仅 background.ts 的 NM 监听报错），但所有 vortex 工具会失败。

## 调试

- **service worker 日志**：扩展页面 → 「检查视图：service worker」
- **content script 日志**：目标页面 DevTools console（前缀 `[vortex]`）
- **NM 协议**：`vortex-server` 启动时 stderr 会打印每条 `tool_request`/`tool_response`

## 协议

所有线缆消息形态（NmRequest/NmResponse/VtxRequest/VtxResponse）见 `@bytenew/vortex-shared/protocol.ts`。错误用 `VtxErrorCode` 标准化分类。
