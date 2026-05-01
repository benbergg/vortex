# Changelog

本文件记录 vortex 各包版本变动。遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 约定，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

---

## [0.6.0] - TBD

> Release date and dogfood numbers are filled in by PR #5 phase C (T5.10).

### 💥 BREAKING CHANGES

- **工具面收敛 36 → 11**。所有 v0.5 `vortex_<atom>` 工具被删除或改名，必须迁移代码。见下方迁移表 + `vortex-migrate` CLI。
- **三动词架构**：写操作走 `vortex_act`、读结构走 `vortex_extract`、探查走 `vortex_observe`；6 个 atom 操作（click / fill / type / select / scroll / hover）合并到 `vortex_act` 的 `action` 参数。
- **`vortex_ping` 删除**（无业务价值）。
- **错误码契约化**：53 个错误码全部走 `vtxError` 工厂 + `DEFAULT_ERROR_META` hint 表。手写 `throw new Error()` 在 `src/` 下被 invariant I19 拦截。

### ✨ Features

#### L1 Adapter 拆分（PR #1）

- `extension/src/adapter/cdp.ts` 抽取共享 CDP 操作（`clickBBox` 去重 3 份）
- `extension/src/adapter/native.ts` 抽取共享 page-side 探测（`pageQuery` 去重 3 份）
- `extension/src/adapter/detector.ts` `CapabilityDetector` 检测 `chrome.debugger` 可用性 + timeout-late-attach race 修复
- depcruise 静态依赖检查 + CI workflow（I1 invariant）
- **`dom.ts` 减 41%**（2233 → 1312 行）

#### L2 Action 层（PR #2）

- **6 项 actionability 探测**（Attached / Visible / Stable / ReceivesEvents / Enabled / Editable）按 Playwright 移植，page-side IIFE 实现
- **auto-wait** RAF polling + reason-aware retry（`NOT_VISIBLE` 50 ms / `NOT_STABLE` 1 RAF / `OBSCURED` 100 ms / `DISABLED` 200 ms / `NOT_ATTACHED` 立即重试 / `NOT_EDITABLE` 不重试）
- **fallback chain**：click/fill/type/drag 差异化策略（`dispatchEvent` → CDP `Input.dispatch` → `Input.insertText`）
- **micro-verify** 按 action 类型矩阵 verify
- **page-side bundle 机制**：vite + page-side-loader，page-side 代码可跨文件 import（解决 `chrome.scripting.executeScript` 序列化限制）
- 9 L2 错误码：`NOT_ATTACHED` / `NOT_VISIBLE` / `NOT_STABLE` / `OBSCURED` / `DISABLED` / `NOT_EDITABLE` / `TIMEOUT` / `ACTION_FAILED_ALL_PATHS` / `DRAG_REQUIRES_CDP`

#### L3 Reasoning 层（PR #3）

- **`captureAXSnapshot`**：CDP `Accessibility.getFullAXTree` + interesting-node filter（INTERACTIVE_ROLES 14 + STRUCTURAL_ROLES 10 + 显式状态属性）
- **`resolveDescriptor`** 三级消解：role+name → text → CSS selector，strict 模式默认 + first-match opt-in
- **`RefStore`** stale ref 自动 relocate：`DOM.resolveNode` 探活 → 失败用 descriptor 重消解
- **`detectClosedShadow`** custom-element + `DOM.describeNode` + `Runtime.evaluate` 启发式探测
- 8 L3 错误码：`A11Y_UNAVAILABLE` / `CDP_NOT_ATTACHED` / `STALE_REF` / `AMBIGUOUS_DESCRIPTOR` / `REF_NOT_FOUND` / `SNAPSHOT_EXPIRED` / `CROSS_ORIGIN_IFRAME` / `CLOSED_SHADOW_DOM`
- 17 invariant 测试（I10-I14, I21, I22）

#### L4 Task 门面（PR #4）

- **三动词 + 八基础 atom = 11 工具**：`vortex_act` / `vortex_extract` / `vortex_observe` / `vortex_navigate` / `vortex_tab_create` / `vortex_tab_close` / `vortex_screenshot` / `vortex_wait_for` / `vortex_press` / `vortex_debug_read` / `vortex_storage`
- **`target` ref-or-descriptor**：`act` / `extract` 接受 `@eN` ref 或 descriptor 对象（schema 强制二选一）；descriptor 显式调用自动分配 ref（`effects.assigned_ref`）
- **`act` effects**：`url_changed` / `ref_relocated` / `assigned_ref` / `ref_state_change` / `new_visible_elements`，LLM 链式决策依据
- **atom 合并参数化**：`wait_for(mode=)` / `debug_read(source=)` / `storage(op=)`
- 2 L4 错误码：`INVALID_TARGET` / `UNSUPPORTED_ACTION`
- **`tools/list` 字节 14,500 B → 4,500 B（-69%）**，估计 LLM token ~3,400 → ~1,000

#### 错误处方化（PR #5）

- 53 错误码全部满足 hint 质量标准：next-action verb + 工具名/参数提示 + 50-300 char
- I19 invariant：抛错处全经 `vtxError` 工厂（白名单 `lib/internal/`）
- I20 invariant：错误消息 + hint 不含 v0.5 已删工具名（grep regression）

#### 自动迁移工具（PR #5）

- 新增 `@bytenew/vortex-migrate` CLI（jscodeshift codemod backend）
- 覆盖 36 v0.5 atom：6 保持名 + 16 改写 + 1 删除（`vortex_ping`）+ 13 warn-only
- 默认 dry-run；`--write` 应用；`--json` 机器可读摘要；`--ignore` / `--ext` 自定义扫描
- 间接调用（变量名传入工具名）emit `<indirect>` warning，需手工迁移

### 🔧 Internal

- **`dom.ts` 总计减 -64%**：2233（v0.5）→ 1312（PR #1）→ 895（PR #2）→ ≤ 800（PR #4 拆 datetimerange page-side fallback 完成）
- 新 packages：`@bytenew/vortex-migrate`
- spec 文档：5 个 layer spec（L1-L5）落 obsidian Knowledge Library；slim spec 实验（L3/L4/L5 共 1255 行 vs L1/L2 4805 行 = -74%）
- bench 基线：`baselines/v0.5.json` 锁定（27 cases，CDP P50 = 3289 ms / Native P50 = 5 ms）+ dogfood 5 任务定义在 `cases/dogfood/`

### 📋 dogfood 验收（前 3 任务对比 v0.5，N=3）

> v0.6.0 release gate 采用降级方案：前 3 任务硬卡（每任务 v0.5/v0.6 各 3 次取 mean），任务 4 / 任务 5 推到 v0.6.1。
> 实测数据由 PR #5 phase C 填充，写入 [`reports/dogfood/dogfood-report.md`](reports/dogfood/dogfood-report.md)。

| 任务 | 类型 | LLM 调用 | 总 token | 成功率 |
|---|---|---|---|---|
| GitHub 搜索 + star 第一仓库 | 简单 | TBD | TBD | ≥ v0.5 |
| 内部 ERP 登录 + 商品同步 | 表单密集 | TBD | TBD | ≥ v0.5 |
| 知乎搜索文章 + 截图 | 多模态 | TBD | TBD | ≥ v0.5 |
| ~~Notion / Linear 文档编辑~~ | 复杂 SPA | _deferred to v0.6.1_ | | |
| ~~OpenClaw 现有 prod 工作流回归~~ | breaking 验证 | _deferred to v0.6.1_ | | |

**release gate（前 3 任务）**：mean LLM 调用 ≤ v0.5 × 0.7（**-30%**）+ mean token ≤ v0.5 × 0.7（**-30%**）+ 成功率 ≥ v0.5。

### 📋 迁移表（v0.5 → v0.6）

完整迁移指南见 [`docs/v0.5-to-v0.6-migration.md`](docs/v0.5-to-v0.6-migration.md)。下表为速查节选。

#### 写操作 → `vortex_act`

| v0.5 | v0.6 |
|---|---|
| `vortex_click({ target })` | `vortex_act({ action: "click", target })` |
| `vortex_fill({ target, value })` | `vortex_act({ action: "fill", target, value })` |
| `vortex_type({ target, value })` | `vortex_act({ action: "type", target, value })` |
| `vortex_select({ target, value })` | `vortex_act({ action: "select", target, value })` |
| `vortex_hover({ target })` | `vortex_act({ action: "hover", target })` |
| `vortex_scroll({ target })` | `vortex_act({ action: "scroll", target })` |

#### 读 → `vortex_extract` / `vortex_observe`

| v0.5 | v0.6 |
|---|---|
| `vortex_get_text({ target })` | `vortex_extract({ include: ["text"], target })` |
| `vortex_observe` | unchanged（语义吸收 frames_list / tab_list） |

#### 等待 → `vortex_wait_for`（合并 mode）

| v0.5 | v0.6 |
|---|---|
| `vortex_wait({ target, timeout })` | `vortex_wait_for({ mode: "element", value: target, timeout })` |
| `vortex_wait_idle({ kind, idleMs })` | `vortex_wait_for({ mode: "idle", value: kind, timeout: idleMs })` |
| `vortex_page_info` | `vortex_wait_for({ mode: "info" })` |

#### 调试 → `vortex_debug_read`（合并 source）

| v0.5 | v0.6 |
|---|---|
| `vortex_console({ tail })` | `vortex_debug_read({ source: "console", tail })` |
| `vortex_network({ tail, filter })` | `vortex_debug_read({ source: "network", tail, filter })` |

#### 存储 → `vortex_storage`（合并 op）

| v0.5 | v0.6 |
|---|---|
| `vortex_storage_get({ scope: "local", key })` | `vortex_storage({ op: "get", key })` |
| `vortex_storage_get({ scope: "session", key })` | `vortex_storage({ op: "session-get", key })` |
| `vortex_storage_get({ scope: "cookie", key })` | `vortex_storage({ op: "cookies-get", key })` |
| `vortex_storage_set(...)` | `vortex_storage({ op: "set"\|"session-set", ... })` |

#### 删除 / 内部化（无 v0.6 等价物，需手工迁移）

`vortex_ping`（删除）、`vortex_evaluate` / `vortex_get_html` / `vortex_history` / `vortex_events` / `vortex_network_response_body` / `vortex_storage_session` / `vortex_frames_list` / `vortex_tab_list` / `vortex_batch` / `vortex_fill_form` / `vortex_file_upload` / `vortex_file_download` / `vortex_file_list_downloads` / `vortex_mouse_move` / `vortex_mouse_drag`。详见迁移指南 §2.4。

### 🛠 自动迁移

```bash
npm install -g @bytenew/vortex-migrate@^0.6
vortex-migrate ./src           # dry run
vortex-migrate ./src --write   # apply
vortex-migrate ./src --json    # machine-readable summary
```

直接调用形态 100% 自动改写；变量名传入需手动 review（脚本 emit `<indirect>` warning）。

### 🔗 v0.5 LTS

`v0.5.x` 维护分支保留至少 2 个月：

```bash
git checkout v0.5.x
```

仅接 critical bug fix；新 feature 一律 v0.6+。

---

## [0.5.0] - 2026-04-20

### 💥 BREAKING CHANGES

- **工具面收敛 74 → 35**。所有老 `vortex_*` 工具名被删除或改名，必须迁移代码。见下方迁移表。
- **元素定位改用 `target` 参数**。所有动作工具的 `selector` / `index` / `snapshotId` / `frameId` 参数被 `target` 字符串取代：`target: "@eN"` / `"@fNeM"` / CSS selector。
- **observe 默认输出改为 compact Markdown 文本**。`detail=full` 可回到 v0.4 JSON 结构。

### ✨ Features

- **`@eN` / `@fNeM` ref 格式**：observe 给每元素分配 ref（agent-browser 风格），跨 frame 用 `@fNeM` 前缀；MCP 层自动解析。
- **跨 frame 透明路由**：动作工具不再需要 `frameId` 参数，ref 前缀携带。全页工具（get_text/html/evaluate/screenshot）新增 `frameRef: "@fN"` 逃生舱。
- **stale ref 错误提示**：`STALE_SNAPSHOT` 错误附带"请重新调用 observe"提示。
- **tools/list payload 从 27.5KB 压到 14.5KB（-47%）**，observe 默认输出从 ~80KB（200 元素）降到 ~5KB（-94%）。

### 🔧 Internal

- MCP 层新增 `lib/ref-parser.ts`、`lib/observe-render.ts`、`lib/dispatch.ts`
- server.ts 里的 MCP 名 → extension action 映射集中到 `dispatchNewTool`
- vortex-bench 新增真实场景 fixture 套件（Element Plus / Ant Design / shadcn / Vuetify），jsdom 单测 + v0.4 基线对照断言

### 📋 迁移表（Old → New）

**Tab**

| v0.4 | v0.5 |
|------|------|
| `vortex_tab_activate({tabId})` | 合并入 `vortex_tab_create({tabId, active:true})` |
| `vortex_tab_get_info` | 用 `vortex_tab_list` 或 `vortex_page_info` |

**Page / Navigation**

| v0.4 | v0.5 |
|------|------|
| `vortex_page_reload` | `vortex_navigate({reload:true})` |
| `vortex_page_back` | `vortex_history({direction:"back"})` |
| `vortex_page_forward` | `vortex_history({direction:"forward"})` |
| `vortex_page_wait` | `vortex_wait` |
| `vortex_page_wait_for_network_idle` | `vortex_wait_idle({kind:"network"})` |
| `vortex_page_wait_for_xhr_idle` | `vortex_wait_idle({kind:"xhr"})` |

**DOM**

| v0.4 | v0.5 |
|------|------|
| `vortex_dom_click({index, snapshotId})` | `vortex_click({target:"@eN"})` |
| `vortex_dom_type` | `vortex_type` |
| `vortex_dom_fill` | `vortex_fill` |
| `vortex_dom_commit({kind:"cascader", value})` | `vortex_fill({kind:"cascader", target, value})` |
| `vortex_dom_select` | `vortex_select` |
| `vortex_dom_hover` | `vortex_hover` |
| `vortex_dom_batch` | `vortex_batch` |
| `vortex_dom_query / query_all` | 删除（用 `vortex_observe` 或 `vortex_evaluate`） |
| `vortex_dom_scroll / get_attribute / get_scroll_info` | 删除（用 `vortex_evaluate`） |
| `vortex_dom_wait_for_mutation / wait_settled` | `vortex_wait_idle({kind:"dom"})` |
| `vortex_dom_watch_mutations / unwatch_mutations` | `vortex_events({op:"subscribe", types:["dom.mutated"]})` |

**Content**

| v0.4 | v0.5 |
|------|------|
| `vortex_content_get_text` | `vortex_get_text` |
| `vortex_content_get_html` | `vortex_get_html` |
| `vortex_content_get_accessibility_tree` | 删除（`vortex_observe` 覆盖） |
| `vortex_content_get_element_text` | `vortex_get_text({target:"@eN"})` |
| `vortex_content_get_computed_style` | 删除（用 `vortex_evaluate`） |

**JavaScript**

| v0.4 | v0.5 |
|------|------|
| `vortex_js_evaluate` | `vortex_evaluate` |
| `vortex_js_evaluate_async` | `vortex_evaluate({async:true})` |
| `vortex_js_call_function` | 删除（用 `vortex_evaluate`） |

**Keyboard / Mouse / Capture**

| v0.4 | v0.5 |
|------|------|
| `vortex_keyboard_press` | `vortex_press` |
| `vortex_keyboard_shortcut` | 删除（用 `vortex_press` 多次调用） |
| `vortex_mouse_double_click` | `vortex_mouse_click({clickCount:2})` |
| `vortex_capture_element({selector})` | `vortex_screenshot({target:"@eN"})` |
| `vortex_capture_gif_*` | 删除 |

**Console / Network**

| v0.4 | v0.5 |
|------|------|
| `vortex_console_get_logs` | `vortex_console({op:"get", level?})` |
| `vortex_console_get_errors` | `vortex_console({op:"get", level:"error"})` |
| `vortex_console_clear` | `vortex_console({op:"clear"})` |
| `vortex_network_get_logs` | `vortex_network({op:"get"})` |
| `vortex_network_get_errors` | `vortex_network({op:"get", filter:{statusMin:400}})` |
| `vortex_network_filter` | `vortex_network({op:"get", filter})` |
| `vortex_network_clear` | `vortex_network({op:"clear"})` |
| `vortex_network_get_response_body` | `vortex_network_response_body` |

**Storage**

| v0.4 | v0.5 |
|------|------|
| `vortex_storage_get_cookies` | `vortex_storage_get({scope:"cookie"})` |
| `vortex_storage_set_cookie` | `vortex_storage_set({scope:"cookie", ...})` |
| `vortex_storage_delete_cookie` | `vortex_storage_set({scope:"cookie", op:"delete", ...})` |
| `vortex_storage_get_local_storage` | `vortex_storage_get({scope:"local"})` |
| `vortex_storage_set_local_storage` | `vortex_storage_set({scope:"local", ...})` |
| `vortex_storage_get_session_storage` | `vortex_storage_get({scope:"session"})` |
| `vortex_storage_set_session_storage` | `vortex_storage_set({scope:"session", ...})` |
| `vortex_storage_export_session` | `vortex_storage_session({op:"export", domain})` |
| `vortex_storage_import_session` | `vortex_storage_session({op:"import", data})` |

**File / Frames / Events**

| v0.4 | v0.5 |
|------|------|
| `vortex_file_get_downloads` | `vortex_file_list_downloads` |
| `vortex_frames_find` | 删除（用 `vortex_observe`） |
| `vortex_events_subscribe` | `vortex_events({op:"subscribe", ...})` |
| `vortex_events_unsubscribe` | `vortex_events({op:"unsubscribe", ...})` |
| `vortex_events_drain` | `vortex_events({op:"drain"})` |

---

## [Unreleased] (towards 0.4.0)

### Added

- **`vortex_observe` 新增 `frames: "all-permitted"`**（O-6）：按扩展 `manifest.host_permissions` 过滤 iframe，而不是严格 origin 同源。真实踩坑案例——`testc.bytenew.com` 页面里的主功能位于 `voc-testc.bytenew.com` 跨源 iframe，扩展对 `*.bytenew.com` 有权限但 `all-same-origin` 会漏掉它，导致"看不见菜单 → 回退到 js_evaluate 手摸"的坑。`all-permitted` 解决这个——manifest 是 `<all_urls>` 时等同 `all`，当 manifest 收紧时才真正过滤。内置轻量 MV3 match pattern 匹配器（支持 `<all_urls>` + `scheme://host-pattern/path`，含 `*.domain.com` 子域通配），不依赖 `chrome.permissions` API 以避免扩大扩展权限。
- 非 HTTP(S)/ws(s) 的 frame（`about:blank` / `chrome://newtab/` 等）在 `all-permitted` 模式下自动跳过。
- **`vortex_dom_commit` 支持 `kind: "checkbox-group"`**（O-10，消灭 3 个 session 踩过的同一个坑）：Element Plus `<el-checkbox-group>` 的幂等 toggle。传 `{values: ["好评"]}`，driver diff 当前 `.is-checked` 与目标 labels 的对称差，**逐个** `input.click()` + `await setTimeout 40ms` 让 Vue reactivity 在每次 toggle 间跑完 render cycle——修掉 `forEach(btn=>btn.click())` 被 Element Plus 合并成"只切最后一次"的坑。失败抛 `COMMIT_FAILED{stage:"verify"}`，extras 带 `checkedNow / wanted / toggled`。未知 label 抛 `INVALID_PARAMS` 并列出 `available`。
- **`vortex_observe` 元素带 `state` 字段**（O-8）：从 element 自身 + 最近 2 层 ancestor 扫 `.is-checked` / `.is-selected` / `.is-active` / `aria-checked=true` / `aria-selected=true` / `aria-pressed=true` / `disabled` / `aria-disabled`。代理不再需要额外 js_evaluate 补查框架状态（Element Plus 把 checked 放 label.is-checked 而不在 input 上，之前每次 session 都要踩一遍）。只有任一状态位为 true 时才附加 `state` 字段，保持常规元素的输出干净。
- **扩展自重载**（O-3b，对称 O-3）：vortex-server 启动时 `fs.watch(packages/extension/dist/)`，`.js` / `.html` / `manifest.json` 变化 → 2s debounce → 通过 native messaging 推送 `{type:"control", action:"reload-extension"}` → 扩展 background 收到后调 `chrome.runtime.reload()`（Chrome 对 load-unpacked 扩展会重读磁盘 dist）。上次 session 踩到的"O-1 报 `diagnosticsSupported:false` 但没法自动刷扩展"的坑被这个修掉：现在 `pnpm -C packages/extension build` 后 2s 内扩展自动换新，无需人肉 `chrome://extensions` 点重载。
- shared 协议扩展：`NmControl` 类型（`type:"control"`, `action:"reload-extension"`, `reason?:string`）加入 `NmMessageFromServer` 联合。
- `VORTEX_NO_EXT_AUTO_RELOAD=1` opt-out；扩展 dist 不存在时 watcher 优雅跳过不崩 server。
- **MCP server 自重启**（O-3）：server 启动后 `fs.watch` 自身运行目录（生产环境是 `dist/src/`），`.js` 文件变更即标记 `pendingRestart`；等当前正在处理的 `tool_call` 全部结束（`inflight === 0`）再 `process.exit(0)`。Claude Code 的 MCP stdio client 在子进程退出后会在下一次 tool_call 时自动 respawn，拿到最新 schema。解决"`pnpm -r build` 后 Claude 仍看不到新工具，必须手动重启 Claude Code"的踩坑（O-1 里添加的 `warning` 字段本质是让代理**看见**问题，O-3 让问题**自动消失**）。Opt-out：`VORTEX_MCP_NO_AUTO_RESTART=1`。
- `CallToolRequestSchema` handler 包裹 `inflight++/--` + `maybeExitAfterDrain`，保证 in-flight 请求不会被 exit 打断。
- **`vortex_ping` 返回版本指纹**（O-1）：响应体新增 `mcpVersion` / `extensionVersion` / `schemaHash`（12-char）/ `toolCount` / `extensionActionCount` / `diagnosticsSupported` 字段。MCP 与扩展语义主版本不一致时自动带 `warning`。代理在每个新 session 第一次 ping 即可看出"MCP 没重启"或"扩展过旧"的版本漂移问题，不再白跑一圈才发现工具对不上。
- `DiagnosticsActions.VERSION`（`diagnostics.version`）扩展侧 action：返回 `{ extensionVersion, actionCount, actions[] }`。版本由 `vite.config.ts` 的 `define.__EXTENSION_VERSION__` 从 `package.json` 注入。
- **observe 元素附加 `suggestedUsage`**（O-2）：每个 element 带 `{ domClick: "vortex_dom_click({ index, snapshotId })", click: "vortex_mouse_click({ x, y, frameId })" }` 预拼好的下一步命令。代理不必再自行推断应传 frameId——直接抄即可。
- `mouse_click` / `_double_click` / `_move` description 前置 ⭐ 标记主动推荐 frameId 用法；`vortex_observe` description 点明 `suggestedUsage` 与 `frames: 'all-same-origin'` iframe 流程；`vortex_ping` description 改写为"FIRST 调用"的版本指纹检查工具。
- `ELEMENT_NOT_FOUND` 和 `IFRAME_NOT_READY` hint 补"先 observe(frames:'all-same-origin') 拿 frameId 再 route"的引导链路，修复 v0.4 新工具"有但代理不用"的惯性。

- **`vortex_mouse_click` / `_double_click` / `_move` 支持 `frameId` + `coordSpace`**：传入 iframe 相对坐标 + frameId，自动换算为视口坐标后送 CDP，嵌套 iframe 累加祖先链偏移。`coordSpace` 默认按 frameId 自动选择（`frame` / `viewport`），可显式覆盖。返回体新增 `coordSpace`、`frameId`、`offsetApplied` 三个字段便于排障。
- `iframe-offset` 支持嵌套 iframe 偏移累加（原实现只算直接父 frame，跨两层以上 iframe 会错位）。跨源父 frame 执行失败时整体回退到 `{0,0}` 并允许调用方显式改走 `coordSpace: "viewport"`。
- **`vortex_network_get_logs` / `_get_errors` / `_filter` / `_get_response_body` 首次调用自动订阅**：无需先调 `vortex_network_subscribe` 即可拿到 XHR/Fetch 日志。首次触达 tab 时自动 `enableDomain(Network)` + 加入 `subscribedTabs`，后续调用幂等。显式 `SUBSCRIBE` 仍可覆盖 urlPattern / types / maxApiLogs 配置，职责从"启用"退化为"调参"。
- network schema 描述补"Auto-subscribes on first call" 提示。
- **`vortex_page_wait_for_xhr_idle`** 新工具：只盯 CDP 请求 type 为 `XHR`/`Fetch` 的请求 idle，忽略 WebSocket / Image / Stylesheet / Font，专解 SPA 上"后台 telemetry 长连导致 network_idle 永不到"的痛点。默认 idleTime 200ms、timeout 10s。
- **`vortex_page_wait_for_network_idle` 增强**：新增三个可选参数：
  - `urlPattern: string` —— 只计数 URL 含该子串的请求
  - `requestTypes: string[]` —— CDP 请求 type 白名单（如 `["XHR","Fetch"]`）
  - `minRequests: number` —— 至少看到 N 个匹配请求发起过才允许 resolve，防止"页面静止时瞬间假 idle"
- 返回体新增 `matchedRequests: number` 字段，便于调用方确认过滤器是否命中。
- **`vortex_dom_wait_settled`** 新工具：页内注入 `MutationObserver` 监视子树，在 `quietMs`（默认 300ms）内无任何 mutation 即返回。与已有 `vortex_dom_wait_for_mutation`（等待 CHANGE）互补。不传 selector 时观察 `document.body` 整棵树。返回体含 `{ settled: true, waitedMs, mutationsSeen }`。典型用法：点击筛选按钮触发 re-render 后立刻调用确保列表重排完成再读计数，避免把"渲染中间态"当作稳定状态。
- `DomActions.WAIT_SETTLED` 枚举位。
- **`vortex_dom_fill` framework-aware 拒绝**：命中受控组件（Element Plus datetime/date range picker & cascader、Ant Design RangePicker）时抛 `UNSUPPORTED_TARGET`，并在 hint 中指引代理改走 `vortex_dom_commit`。杜绝"DOM input.value 改了但组件状态没同步"的隐蔽 false-positive。
- `fallbackToNative: true` 参数（`dom_fill`）：兜底过渡开关。旧代理若强依赖松弛写值，可一版 window 期内显式开启；目标是 v0.5 前全面收紧。
- `VtxErrorCode.UNSUPPORTED_TARGET` 错误码 + `DEFAULT_ERROR_META` 对应 hint。
- 新增模块 `packages/extension/src/patterns/`：集中声明 fill 拒绝模式 + commit driver 注册表。
- **`vortex_dom_commit`** 新工具：对 framework 受控组件（picker/cascader/select）执行完整 "open → navigate → click → confirm → verify" 流程。首发覆盖 **Element Plus `<el-date-picker type='daterange'|'datetimerange'>`**，单次调用就能把 `{start: "2026-01-01", end: "2026-03-31"}` 提交到组件，告别 agent 侧手打二十次 `mouse_click` 导航 picker 的反模式。
- `VtxErrorCode.COMMIT_FAILED` 错误码：driver 中途失败时抛出，`context.extras.stage` 指示失败阶段（`open-picker` / `click-start` / `click-end` / `verify` 等），便于代理自愈或切换策略。
- 新增 `patterns/commit-drivers.ts` 注册表声明 driver 元数据（`id/kind/closestSelector/summary`），为 Ant Design / 其它框架 driver 预留。实际交互逻辑在 `dom.ts` COMMIT handler 的 page-side func 里按 `driverId` 分派。
- **`vortex_observe` 多 frame 扫描**：新增 `frames` 参数，`"main"`（默认，向后兼容）/ `"all-same-origin"` / `"all"` / `number[]`。跨 frame 扫描时 `index` 按扫描顺序累加为全局唯一，`element.frameId` 指向元素所在 frame。
- observe 响应体升级为 `version: 2`：顶层新增 `frames[]`（每帧含 `frameId / parentFrameId / url / offset / elementCount / truncated / scanned`），`elements[]` 每个元素带 `frameId` 字段。
- `resolveTarget` 路由升级：按 snapshot `element.frameId` 路由至正确 frame 操作；兼容旧 `entry.frameId` 单 frame 写法。
- 跨源 iframe 扫描失败标记为 `scanned: false`、`elementCount: 0`，不 throw 不污染结果。

### Tests

- 新增 `packages/extension/tests/observe-all-permitted.test.ts`（4 用例）：<all_urls> 下跨源 frame 被扫 / 限制 host_permissions 时过滤生效 / 非 HTTP 协议跳过 / 三种 frames 值（all-same-origin / all-permitted / all）行为对比。
- 新增 `packages/extension/tests/checkbox-group-commit.test.ts`（8 用例）：driver 注册表 + dom.ts 源码合约（for…of + await tick / is-checked 作为幂等判定 / verify 失败抛 COMMIT_FAILED / 未知 label 抛 INVALID_PARAMS）。
- 新增 `packages/extension/tests/observe-ui-state.test.ts`（7 用例）：getUiState 读 class + aria 的 6 个 state 位 / 仅在非空时附加 state 字段 / 类型层有 state?: 定义。
- 新增 `packages/extension/tests/extension-self-reload.test.ts`（13 用例）：源码级合约测试固化 O-3b 的跨三文件不变式（protocol.ts 的 NmControl 定义 / server watcher 的 opt-out + debounce + 文件过滤 + 写消息路径 + 从 startServer 调用 / extension background 的 control 分支 + chrome.runtime.reload 包 setTimeout）。
- 新增 `packages/mcp/tests/self-restart.test.ts`（7 用例）：源码级合约测试固化 O-3 的四条不变式（env opt-out / watch 自身目录 / exit 门控 inflight=0 / handler 包裹 inflight / 只响应 .js / watcher.on('error') graceful / installAutoRestart 在 connect 前调用）。
- 新增 `packages/extension/tests/diagnostics-handler.test.ts`（3 用例）：版本字符串存在 / actionCount>0 + 已排序 + 包含 `diagnostics.version`+`tab.list` / tab.* 数量断言。
- 新增 `packages/mcp/tests/ping-fingerprint.test.ts`（6 用例）：schemaHash 12 字符 hex / description 长度变化即触发 hash 漂移 / v0.4 新工具均在 toolset / ping description 提及 mcpVersion 等四字段 / mouse_click description 首 12 字符含 ⭐ 且 frameId 在 CDP 之前 / observe description 含 suggestedUsage+all-same-origin。

### Changed

- `vortex_mouse_*` 工具的 `description` 统一补充 frame-aware 行为说明。
- 静态资源默认不收（`includeResources` 需要配合显式 `SUBSCRIBE` 打开资源侧订阅），避免自动订阅引入大量噪声。
- `network_get_response_body` 的 hint 改写：自动订阅生效后提示代理"触发请求再取"，不再指示用户手动 subscribe。
- `waitForNetworkIdle` 内部抽象为 `awaitIdle(tabId, opts)` 通用助手，`waitForXhrIdle` 复用。
- `awaitIdle` 按 `requestId` 集合追踪 pending，只对过滤命中的请求计数并在 `loadingFinished/loadingFailed` 时核验 id——修掉旧实现"过滤掉的请求也递减 pending 导致假 idle"的 bug。
- `vortex_dom_fill` description 的 `Failures:` 段补充 `UNSUPPORTED_TARGET`。
- `SnapshotElement` 新增可选 `frameId` 字段；多 frame 时 `SnapshotEntry.frameId` 不填，单 frame 兼容旧 hint。
- 向后兼容：`frameId` 单值参数保持原 observe 语义（只扫该 frame）；不传 `frames` / 不传 `frameId` 时仅扫主 frame，返回结构除 `version` / `frames[]` / `element.frameId` 字段外与 v0.3 行为一致。

### Tests

- 新增 `tests/iframe-offset.test.ts`（7 用例）覆盖主 frame / 单层 / 嵌套 / 跨源失败 / 未知 frameId 五种路径。
- 新增 `tests/mouse-handlers.test.ts`（8 用例）覆盖 CLICK / DOUBLE_CLICK / MOVE 三类工具的 viewport / frame-local / 显式 coordSpace 覆盖 / INVALID_PARAMS / 偏移回退场景。
- 新增 `tests/network-auto-subscribe.test.ts`（6 用例）覆盖首次自动订阅 / 幂等 / GET_ERRORS + FILTER 同样走自动订阅 / 显式 SUBSCRIBE 覆盖 / 多 tab 独立订阅。因 `network.ts` 含模块级 state，测试使用 `vi.resetModules` + 动态 import 隔离。
- 新增 `tests/page-wait-idle.test.ts`（7 用例）：无请求瞬间 idle / 忽略 WebSocket+Image / XHR 挂起不 idle / urlPattern 过滤 / minRequests gate / TIMEOUT / ghost loadingFinished 不误触发。使用 `vi.useFakeTimers + advanceTimersByTimeAsync`。
- 新增 `tests/dom-wait-settled.test.ts`（7 用例）：默认返回 / selector 透传 / 'DOM did not settle' → TIMEOUT / 'Element not found:' → ELEMENT_NOT_FOUND / 'document.body not found' → ELEMENT_NOT_FOUND / 任意报错 → JS_EXECUTION_ERROR / 默认 quietMs=300 + timeout=8000。
- 新增 `tests/fill-reject-patterns.test.ts`（7 用例）覆盖 pattern 注册表完整性 + 拒绝决策算法（含 `fallbackToNative` bypass）。
- 新增 `tests/dom-commit.test.ts`（11 用例）：driver 注册表完整性 + handler 参数校验（missing kind/value/unknown kind）+ 四类错误映射（COMMIT_FAILED 带 stage / UNSUPPORTED_TARGET / ELEMENT_NOT_FOUND / 成功返回 startValue+endValue）。
- 新增 `tests/observe-multi-frame.test.ts`（8 用例）：默认 main / all-same-origin 跨 frame / 跨源排除 / entry.frameId 单帧兼容 / per-element frameId 路由 / legacy frameId 优先 / 扫描失败降级 / 无 frame IFRAME_NOT_READY。
- `packages/shared/tests/errors.test.ts` 用例总数 24 → 26，单独断言 `UNSUPPORTED_TARGET` 和 `COMMIT_FAILED`。

---

## [0.3.0] - 2026-04-19

> **发布性质**：结构型版本。主要价值是 **bench 方法论升级 + L1b 新层 + content 护栏**，bench canonical 分数因 N=3 揭示 flakiness 从 75.1 回退到 71.08（非 v0.3 代码引起；详见 Metrics 段）。B error-hint ROI 仍 null——L1b fixture 强化需在 v0.3.1 跟进。

### Added

- **bench `--repeats N`**：每场景跑 N 次取 median layer-score 代表值，报 `variance.tokens/steps/elapsed_ms`（min/p50/max）+ `pass_stable`。默认 N=1 保 CI 快；baseline / 夜跑用 N=3。Env fallback：`BENCH_REPEATS`。
- **bench `--verbose-runs`**：保留 `allRuns` 原始数据（默认丢，JSON 精简）。
- **L1b-no-observe 场景层**：5 个镜像 L1 的禁用 observe 变体。聚合进 `aggregate.l1b`，**不**进主 `vb_index`（保 v0.2↔v0.3 可比）。首次产出独立 L1b 分数（本版 59.60）。
- **`vortex_content_get_text` / `_html` soft size limit**：默认 128KB，可传 `maxBytes` 覆盖（范围 4KB~5MB）。截断后追加 sentinel trailer：text 走 `\n\n[VORTEX_TRUNCATED ...]`，html 走 `<!-- [VORTEX_TRUNCATED ...] -->`。采用 code-point-safe 切分（`[...str].slice(0,n).join('')`）避免 UTF-16 surrogate 破损。
- `ExpectedSpec.disabledTools: string[]`：per-scenario MCP 工具黑名单。Runner 层过滤 + agent system prompt 声明双保险。
- `AgentOptions.tools?: MCPTool[]`：覆盖 `mcp.tools`，给 per-scenario filter 留口子。
- **FLAKY / INCOMPLETE 告警**：reporter 在 `pass_stable === false` 或 `incomplete === true` 时前缀高亮行首，暴露"N=1 基线掩盖的噪声"。
- **variance regression warning**：`bench diff` 发现新 `tokens.max > baseline × 1.5` 时报 `[variance] ...` warning（不阻断发布）。

### Changed

- `vortex_observe` description 首行强化"Call this first on non-trivial page"（MCP schema + bench DEFAULT_SYSTEM 双向）。
- Report `schema_version` 1 → 2；老 reader 读 v2 报告仍能看 `aggregate`；`diff.ts` 支持 v1/v2 双路径 + 向后兼容（老 baseline 视为 `runs=1`）。

### Metrics（GLM-4.6V via 智谱 Anthropic 端点）

> ⚠️ **对比不完全对称**：v0.2.0 canonical GLM-4.7 baseline（VB 87.0）是 N=1，v0.2.0 GLM-4.6V baseline（VB 75.1，`full-v1-glm46v-baseline.json`）也是 N=1。v0.3.0 首次引入 N=3。本版未重跑 GLM-4.7（600 万资源包在 GLM-4.6V 上）。跨模型/跨 N 对比时须保持此差异意识。

| 指标 | v0.2.0 GLM-4.6V (N=1) | v0.3.0 GLM-4.6V (N=3, p50) | Δ |
|---|---:|---:|---:|
| **VB_Index** 主 | 75.1 | **71.08** | **-4.0** |
| L0 | 89.8 | 89.55 | ≈ |
| L1 | 64.4 | **49.05** | **-15.4** |
| L2 | 61.0 | 60.55 | ≈ |
| L3 | 91.3 | 91.33 | ≈ |
| L1b（新）| — | **59.60** | 首次数据 |
| A observe ROI | — | 30.25 | — |
| **B errorHint ROI** | null | **仍 null** | ❌ v0.3.1 跟进 |
| L2-004 GitHub tokens p50 | ~409K (max_steps) | 339K (max_steps) | 单响应 trailer 起效但未根治 |
| Tokens total（整套）| 828K | 904K | 略增（N=3 但 scenarios 也增加 L1b 5 个） |

**L1 回退根因分析**：非 v0.3 代码引起。N=1 → N=3 揭示 v0.2 canonical 的运气成分：
- L1-002 ambiguous：v0.2 N=1 pass → v0.3 N=3 **0/3 pass**，agent 稳定陷入 max_steps
- L1-003 disabled：v0.3 N=3 **1/3 pass (FLAKY)**
- L1-004 offscreen：v0.3 N=3 **0/3 pass**

这恰是 `--repeats` 方法论升级要暴露的信号——与其让单 shot 侥幸通过给出假 87.0，不如 N=3 揭示真实 flakiness。

**B ROI 仍 null 的根因**：L1b 禁 observe 后，agent 在 max_steps 前**没触发** expectedErrorCode 路径；log 里普遍 `[ROI-B] → direct`（蒙对 selector）或 `→ direct (task failed)`（走旁路失败）。需 v0.3.1 加固 L1b fixture 让 agent **必须**通过 vortex 工具路径（见 Known Issues）。

### Baselines 入 git

- `packages/vortex-bench/reports/full-v1-glm46v-baseline.json` — v0.2.0 参考（N=1，不变）
- `packages/vortex-bench/reports/full-v1-repeats3-v0.3.0-glm46v.json` — v0.3.0 canonical（N=3，含 L1b）

### Known Issues / v0.3.1 待办

- **B error-hint ROI 仍 null**：L1b 5 场景禁 observe 后，agent 大部分未触及 vortex 结构化错误码；fixture 需要强化为"非通过 vortex observe / vortex dom 错误处理就不能完成任务"的设计。
- **L2-004 GitHub max_steps 未根治**：128KB 单响应截断让单次工具调用不爆 context，但 agent 30 步内多次调用累积仍超；需要 agent 端的 step budget 或 content 访问次数限流。
- **L1-002 / L1-004 可能是 fixture bug**：N=3 稳定 0/3 值得单独审 fixture 是否对 GLM-4.6V 有歧义 selector 路径。

### Breaking

- Report `schema_version=2`：`Report.scenarios[i]` 含可选新字段 `runs/runs_completed/pass_rate/pass_stable/variance/representative_index/incomplete/error_runs/allRuns`；`Report.aggregate` 含可选 `l1b/incomplete_scenarios/vb_index_stability`。外部消费方需读 `schema_version` 判断。老 v1 baseline 读取兼容（reader 视作 `runs=1`）。

### Internal

- `metrics.ts:scoreOf` 提取为单一来源，`aggregateLayer` 改调用它（避免公式重复）
- `src/index.ts` 加 ESM entry-point guard，防止 test import 触发 main()
- 新增单元测试 32 个（基线 94 → 126）：`truncate.test.ts`（11）+ `aggregate-runs.test.ts`（7）+ `cli-args.test.ts`（9）+ `diff-v2.test.ts`（3）+ `scenario-disabled-tools.test.ts`（2）
- 两轮 Codex 独立 review（session `019da345-4d48-7a91-880d-5928053df87f`）：首轮 14 问题（6 P1 + 6 P2 + 2 P3）全修；二轮 6 问题（3 P1 + 3 P2）全修

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
