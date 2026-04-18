# Changelog

本文件记录 vortex 各包版本变动。遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 约定，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

---

## [0.2.0] — 2026-04-18

> 在 beta.1 基础上：新增 **vortex-bench v1** 评测集（18 场景，4 层分层）、`vortex_events_drain` 工具（主动拉聚合事件绕过 1s 节流窗口）。首版 baseline = 87.0/100（GLM-4.7），drain 工具令 C event-bus ROI 从 0% 升到 100%。

### 新增（Added）

- **MCP 工具**（1 个）
  - `vortex_events_drain`：强制 flush dispatcher（notice+info buffer 全清），返回 `{ events, flushed: { notice, info } }`。专为 sub-second ReAct loop 设计，解决"agent 在 1s 聚合窗口内结束导致事件被吞"的使用性问题。
  - 底层 action：`events.drain`（新 `EventsActions` 命名空间）
- **vortex-bench v1**（新包 `packages/vortex-bench/`，private）
  - 18 场景 4 层分层：L0 smoke (5) / L1 antipattern (5) / L2 realworld (5) / L3 session (3)
  - 四维指标：Correctness / Efficiency / Robustness / Utilization
  - VB_Index = 0.25·L0 + 0.25·L1 + 0.30·L2 + 0.20·L3
  - ROI 三件独立分：A observe / B error-hint / C event-bus
  - Provider 路由：zhipu / anthropic / minimax 自动或显式切换（一套 `@anthropic-ai/sdk` 吃三家）
  - CLI：`bench run / score / diff`
  - 程序化 judge（声明式断言）+ LLM judge 兜底（`expected.llmRubric`）
  - 本地 CI 脚本 `scripts/bench-ci.sh` + GH Actions workflow 占位
  - Baselines 入 git：L0+L1 / L2 / L3 / 完整 v1 / GLM-4.7 / GLM-4.6V
- **dispatcher.flushAll() 返回计数**：`{ notice: N, info: M }`，便于观察/测试

### 变更（Changed）

- **dispatcher**：`flushAll()` API 从 `void` 改为返回 `{ notice, info }`（破坏性？—— 但仅内部使用，不影响外部调用方）
- **CHANGELOG**：补 bench v1 / drain 工具 / 模型对比数据

### 测试

- extension 单测 42 → **48**（+6 events-handler.test.ts）
- 真实 bench 跑通 L0+L1+L2+L3 = 18 场景，GLM-4.7 pass 17/18
- 单个 GLM-4.6V baseline 也入 git（pass 13/18，用于模型能力对比）

### Bench 首版 baseline 数字

| Provider | VB_Index | Pass | L0 | L1 | L2 | L3 | A ROI | C ROI |
|----------|---------:|-----:|---:|---:|---:|---:|------:|------:|
| GLM-4.7 (智谱) | **87.0** | 17/18 | 89.0 | 93.0 | 77.2 | 91.7 | 68.2% | 100% |
| GLM-4.6V (智谱) | 75.1 | 13/18 | 89.8 | 64.4 | 61.0 | 91.3 | 47.5% | 100% |

- GLM-4.7 在"长 ReAct 循环"任务上明显优于 4.6V（L1/L2 差 16-28 分）
- drain 工具对两模型同样有效（C ROI = 100%）

### 向后兼容

- `vortex_events_drain` 是新增工具，不破坏已有订阅/取消流程
- `flushAll()` 签名变化仅影响内部（测试/进程退出兜底），无外部 client 依赖

### 已知限制

- bench CI 需本地 Chrome + 扩展 active + vortex-server（GH Actions 占位为 workflow_dispatch，待后续 headless runner）
- GLM-4.6V 在多步 ReAct 任务上容易陷 max_steps，建议 bench 默认选 GLM-4.7

### 发布 commits

- `4f6c395` vortex_events_drain + L3-003 pass
- `9fa7de8` 完整 v1 baseline (82.4→87.0)
- `4aec05b` L2-003 rubric 松化
- `9673c5d` GLM-4.6V 模型对比 baseline
- `44ea25e` B7 L2/L3 共 8 场景（beta 后补齐）
- `0d36167` bench B1~B6 核心切片
- `733a4ec` beta.1 → （本版本）

---

## [0.2.0-beta.1] — 2026-04-18

> 在 alpha.1 基础上清掉所有登记的 follow-up（F1~F11 + DOM_MUTATED），修复 E2E 发现的两个关键通道 bug，引入 content script 架构做页面级事件拦截。真实浏览器 E2E 9/10 场景通过。

### 新增（Added）

- **MCP 工具**（2 个）
  - `vortex_dom_watch_mutations` / `vortex_dom_unwatch_mutations`：按需激活目标 tab 的 MutationObserver，DOM 变动作为 info 级 `dom.mutated` 事件（dispatcher 自动合并聚合）。
- **事件源 5 个**（W5 未做的全部实装）
  - `extension.disconnected`（urgent）：MCP client WS 意外断开时合成事件
  - `dialog.opened`（urgent）：content-main 覆盖 `window.alert/confirm/prompt`
  - `form.submitted`（notice）：content-isolated `document.addEventListener('submit', capture)`
  - `dom.mutated`（info）：按需激活 MutationObserver
  - 至此 `VtxEventType` 11 类全部有实际 emit 源
- **架构 · content script**：
  - `content-main.ts`（MAIN world，document_start，all_frames）：native dialog 拦截
  - `content-isolated.ts`（ISOLATED world）：MAIN ← message 转发、submit 监听、MutationObserver
  - background `chrome.runtime.onMessage` 作为中继，源校验 `"vortex-content"` + 事件白名单
- **dispatcher 三级节流聚合**（F10）：
  - urgent 立即 send；notice 200ms 批量；info 1000ms 批量 + 同 `(type, tabId, frameId)` 合并（`data: { mergedCount, firstAt, lastAt, samples[≤3] }`）
  - 构造参数可覆盖窗口时长（便于测试）
  - 新增 `flushAll()` 进程退出前兜底
- **交互 handler 全套探测**（F1+F2）：`dom.type` / `fill` / `select` / `hover` 继承 CLICK 的 occluded/offscreen/disabled/detached/ambiguous 探测；CLICK useRealMouse 分支也补全。
- **单测**：88 个（shared 28 + mcp 18 + extension 42）。新增 router / tab-handlers / console-dedup / dispatcher / mutations-handler 覆盖。

### 修复（Fixed）

- **router** 未识别 `VtxError` 实例，导致 handler 结构化错误被降级到 `JS_EXECUTION_ERROR`（`83a93c2`）。E2E 发现。
- **server `message-router`** 将 `NmEvent` 转 `VtxEvent` 时丢弃 `level` / `frameId`（`e1e925f`）。E2E 发现。
- **`tab.activate`** handler 未接收第二参数 `tabId`（`afd0970`）。
- **`dom.scroll`** 未做参数前置校验（`4295164`）。
- **console error 双推**：`Runtime.consoleAPICalled` 的 error 级仅走 `CONSOLE_ERROR`，去除 legacy `console.message` 重复（`07d82ee`）。
- **F8**：content.ts 的 4 处 `res.error` throw 补 selector context。
- **F9**：SCROLL 参数校验提前到 handler 入口。

### 变更（Changed）

- **manifest** 加入 `content_scripts`：`<all_urls>` + `run_at=document_start` + `all_frames`。
- **background**：注册 `chrome.runtime.onMessage` 事件中继。

### 向后兼容

- alpha.1 → beta.1 无协议层破坏性变更。
- content_scripts 是 extension manifest 扩展，用户升级后需**重新 install/reload 扩展**，已打开的页面需 reload 才会注入 content script（首次访问新页面自动注入）。

### 真实浏览器 E2E 结果

- ✅ 1 ELEMENT_NOT_FOUND / 2 ELEMENT_OCCLUDED（blocker 描述准确）/ 3 vortex_observe / 4 index click / 5 STALE_SNAPSHOT / 6 事件 piggyback / 7 ELEMENT_DISABLED / 8 SELECTOR_AMBIGUOUS / 9 form.submitted
- ⏳ 10 DOM_MUTATED：MCP 工具需重启 Claude Code 拉新 tool 列表才能调，单测 8 条已覆盖

### 已知限制

- dialog.opened 自动 E2E 受限（`window.alert` 会阻塞页面 JS），但 override 安装可通过 `window.alert.toString()` 验证，通道与 form.submitted 同路径。
- content_scripts 对 `chrome://` / 扩展 UI 页面不生效（Chrome 限制）。

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
