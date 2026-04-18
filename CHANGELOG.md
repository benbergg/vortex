# Changelog

本文件记录 vortex 各包版本变动。遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 约定，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

---

## [0.2.0-alpha.1] — 2026-04-18

> 首个 0.2 alpha 版本：围绕 LLM Agent 的感知 / 决策 / 反馈三个环节做了整体升级。
> 详细规划见 `12-Projects/20260418-0000-vortex工具能力升级/` 的设计文档与测试报告。

### 新增（Added）

- **MCP 工具**（3 个）
  - `vortex_observe`：一次调用返回页面的 LLM 友好快照（带 index 的可交互元素列表 + role + 可读名 + bbox + 遮挡检测 + 关键属性），配合 `snapshotId` 供后续 `dom.*` 按 `index` 操作。
  - `vortex_events_subscribe` / `vortex_events_unsubscribe`：订阅浏览器事件，通过 tool response 的 `[vortex-events]` 文本项 piggyback 推送。
- **错误码**（14 个新增）
  - 元素定位：`ELEMENT_OCCLUDED`、`ELEMENT_OFFSCREEN`、`ELEMENT_DISABLED`、`ELEMENT_DETACHED`、`SELECTOR_AMBIGUOUS`
  - 页面状态：`NAVIGATION_IN_PROGRESS`、`PAGE_NOT_READY`、`DIALOG_BLOCKING`、`IFRAME_NOT_READY`
  - Snapshot：`STALE_SNAPSHOT`、`INVALID_INDEX`
  - 其他：`TAB_CLOSED`、`CSP_BLOCKED`、`INTERNAL_ERROR`
- **事件类型**（11 类，6 个源已接入）
  - urgent：`user.switched_tab`、`user.closed_tab`、`download.completed`
  - notice：`page.navigated`、`network.error_detected`、`console.error`
  - 声明但暂未实装：`dialog.opened`、`extension.disconnected`、`form.submitted`、`dom.mutated`、`network.request`
- **协议增强**
  - `VtxErrorPayload` 新增 `hint`、`recoverable`、`context`（含 `extras` 兜底）字段；`VtxResponse.error` / `NmResponse.error` 类型收敛至此。
  - `VtxEvent` / `NmEvent` 新增 `level`、`frameId` 字段。
- **质量基础设施**
  - 全仓引入 vitest（shared / mcp / extension），**68 个单元测试**覆盖 `VtxError`、`errors.hints`、`events`、`event-store`、`router`、`tab handlers`、`console dedup`。
  - `scripts/check-throw-discipline.mjs` + `pnpm prebuild` hook：禁止 `handlers/` 与 `lib/` 下出现 `throw new Error`。
- **dom.\* 工具扩展**：11 个 `dom.*` 工具接受 `{ index, snapshotId }` 作为 selector 替代；snapshot 绑定的 tab/frame 自动覆盖 `args.tabId/frameId`。
- **探测**：`dom.click` 普通路径在 page script 内逐项探测失败原因（OCCLUDED/OFFSCREEN/DISABLED/DETACHED/AMBIGUOUS），返回结构化 `errorCode` + `extras.blocker`。
- **MCP tool description**：29 个高价值工具 description 补 `Failures: CODE (hint)` 段落，供 LLM 预先了解恢复路径。

### 变更（Changed）

- **Handler 错误抛出**：全部 handlers（13 个）+ 两个 lib 文件改用 `vtxError(code, msg, context?)`，注入默认 hint 与 recoverable。
- **`dom.*` schema**：`required` 从 `["selector"]` 改为 `[]`（LLM 可在 selector / index 间二选一）。
- **`file.onDownloadComplete`**：退化为向后兼容说明；下载监听改为模块加载即挂载，事件通过 `DOWNLOAD_COMPLETED` 广播。
- **Console 事件去重**：`error` 级仅走 `CONSOLE_ERROR`，其他级别保留 legacy `console.message`。
- **协议错误响应**：`code` 类型从 `string` 收敛到 `VtxErrorCode` 字面量联合，恢复类型安全。

### 修复（Fixed）

- **router** 不识别 `VtxError` 导致 handler 结构化错误被降级到 `JS_EXECUTION_ERROR`（丢失 hint/context/recoverable）。E2E 发现。
- **server `message-router`** 将 `NmEvent` 转 `VtxEvent` 时丢弃 `level` 与 `frameId`，导致 MCP 侧订阅 `notice` 级事件永远空。E2E 发现。
- **`tab.activate`** handler 未接收第二参数 `tabId`，导致 `vortex_tab_activate(tabId=X)` 始终返回 `INVALID_PARAMS`。
- **`dom.scroll`** 未做参数前置校验，selector/position/x/y 都缺失时返回 `JS_EXECUTION_ERROR`，改为直接 `INVALID_PARAMS`。
- **`js.callFunction`**：函数名不存在时由 `JS_EXECUTION_ERROR` 细化为 `INVALID_PARAMS`。
- **`file.upload`**：目标非 `<input type=file>` 时由 `JS_EXECUTION_ERROR` 细化为 `INVALID_PARAMS`。
- **`relay-client`**：手写的 `"RELAY_HANDLER_ERROR"` 字符串替换为 `VtxErrorCode.INTERNAL_ERROR`。

### 向后兼容

- 所有协议字段扩展均为 optional，旧 client 零改动可升级到 0.2.0-alpha.1。
- Legacy 事件名（`console.message`、`network.requestStart` 等）保留通道；订阅方可用 `minLevel: "info"` 继续消费。

### 已知遗留（Follow-up）

见测试报告 F1~F11：
- TYPE / FILL / HOVER / SELECT 与 CLICK useRealMouse 路径尚未加探测
- `DIALOG_OPENED` / `FORM_SUBMITTED` / `DOM_MUTATED` 事件需要 CDP attach 策略或 content script 架构
- dispatcher 节流聚合延后到需求真正出现再做
- `EXTENSION_DISCONNECTED` 事件声明未 emit

---

## [0.1.0] — 之前

（本 CHANGELOG 之前的变更详见 git log）
