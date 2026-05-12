# Vortex 整体设计文档

> 让 LLM 直接驱动用户当前正在使用的本地 Chrome —— 一套面向 AI Agent 的浏览器自动化协议与工具链。

---

## 1. 设计目标

| 目标 | 说明 |
|------|------|
| **接管真实会话** | 不另起独立浏览器（区别于 Playwright/Puppeteer 的无头模式），直接驱动用户当前 Chrome —— 所有 Cookie/插件/登录态/历史可用 |
| **协议即产品** | action 名 / 参数 schema 是稳定 API；上下游通过 `@bytenew/vortex-shared` 单一来源，避免分裂 |
| **多客户端复用** | 同一组 action 可经 MCP / CLI / HTTP / 远程 relay 调用，新增入口不改动浏览器侧 |
| **远程可达** | 通过 reverse-WS relay 把 NAT 后的本地浏览器暴露给公网 LLM 服务（如 OpenClaw） |
| **LLM 友好** | 工具命名一致、参数类型显式（绕过 schema 透传陷阱）、错误码可枚举、大返回值自动落盘 |

**反目标**：不追求复刻 Playwright 全部 API；不做无头/并发任务；不做反检测对抗。

---

## 2. 架构总览

```
┌──────────────────────────────────────────┐
│  调用方（LLM Agent / 脚本 / 终端）          │
│  ──────────────────────────────────       │
│  • Claude Code         via MCP stdio      │
│  • OpenClaw plugin     via Relay WS       │
│  • 用户终端            via CLI            │
│  • 自定义脚本          via local WS/HTTP  │
└──────────────────┬───────────────────────┘
                   │ VtxRequest / VtxResponse
                   │
        ┌──────────┴──────────────┐
        │                         │
        ▼                         ▼
┌────────────────┐       ┌─────────────────┐
│  vortex-mcp    │       │  vortex-cli     │
│  (stdio MCP)   │       │  (commander)    │
└───────┬────────┘       └────────┬────────┘
        │ ws:6800/ws            │ http:6800
        └──────────┬─────────────┘
                   ▼
        ┌─────────────────────────┐                  Public Internet
        │     vortex-server       │ ─── relay-client ─────────────┐
        │  (本地桥接进程)           │   (持久 reverse-WS, 心跳/重连) │
        │                         │                              │
        │  • ws-server.ts         │             ┌────────────────┴──────────┐
        │  • http-routes.ts       │             │  OpenClaw vortex-browser  │
        │  • message-router.ts    │             │  plugin (relay broker)    │
        │  • native-messaging.ts  │             └───────────────────────────┘
        │  • relay-client.ts      │
        └───────────┬─────────────┘
                    │ NM stdio (NmRequest/NmResponse)
                    ▼
        ┌─────────────────────────┐
        │  vortex-extension (MV3) │
        │  ───────────────        │
        │  background.ts (sw)     │
        │  ActionRouter           │
        │  handlers/*  ──┐        │
        │                ▼        │
        │  chrome.tabs / scripting │
        │  CDP debugger / cookies │
        └───────────┬─────────────┘
                    ▼
              真实 Chrome 页面
```

**两层桥接**：
1. **客户端 ↔ server**：`VtxRequest`/`VtxResponse` —— 业务层抽象，承诺 stable
2. **server ↔ extension**：`NmRequest`/`NmResponse` —— Native Messaging 私有传输，承诺向后兼容（消息体小写、单向 stdio、含 chunk 协议处理大消息）

中间换新传输（如直接走 CDP）时只需重写 server，协议表面不动。

---

## 3. 子项目职责

| 包 | 进程 | 职责 | 关键决定 |
|----|------|------|----------|
| **vortex-shared** | （类型库） | 统一 action 名常量、协议类型、错误码 | 纯类型 + 常量，无运行时；用 workspace 引用，避免发版滞后 |
| **vortex-extension** | Chrome service worker | 实际执行浏览器操作；维护 ActionRouter；通过 NM 与 server 通信 | MV3；handler 按模块拆分（tab/page/dom/...）；CDP 仅在 capture/mouse 等必要场景临时 attach |
| **vortex-server** | 本地 Node 进程 | NM stdio ↔ HTTP/WS ↔ 远程 relay 的桥接；pending 请求池、超时、缓存 | 单进程多入口：**本地端口 + relay 出站**可同时开 |
| **vortex-cli** | 短生命 Node | 终端调用入口；打印 / 存盘 / pipe 友好 | commander，按模块分子命令；失败用退出码区分网络 vs 业务错 |
| **vortex-mcp** | 长生命 stdio | 把 **11 个公开工具**（v0.6 L4 facade 重构）暴露给 MCP 客户端（Claude Code 等） | facade 工具 `vortex_<verb>` + action 枚举（如 `vortex_act` 的 `action=click\|fill\|...`）；25+ 内部 dom.* 路由 by dispatch；图片 >500KB 自动落盘返回路径 |
| **vortex-migrate** | 短生命 Node | codemod，把 v0.5 细粒度调用（`vortex_click` 等）改写到 v0.6 facade（`vortex_act{action:"click"}`） | 双形态识别：MCP SDK `{name, arguments}` + positional `ctx.call(name, args)`；`conditionalPartial` 警告参数 drop |
| **vortex-bench** | 短生命 Node | 受控环境 + Playwright 驱动 case 跑分，验证 LLM-facing tool 行为 | 38 case；instrument bytes / step ratio；含 Element Plus / JD / iframe nested fixtures |
| **vortex-browser-plugin**（外部仓） | OpenClaw gateway 内 | 公网 broker：接 vortex-server 出站连接，转发 LLM tool call | session 单例 + 多设备名 + token 鉴权 |

---

## 4. 核心协议

### 4.1 业务层（VtxRequest / VtxResponse）

```ts
interface VtxRequest {
  action: string;          // 如 "page.navigate"
  params?: Record<string, unknown>;
  id: string;              // 调用方生成，用于配对响应
  tabId?: number;          // 顶层；handler 也支持 params.tabId
}
interface VtxResponse {
  action: string;
  id: string;
  result?: unknown;
  error?: { code: string; message: string };
}
```

设计要点：
- **action 字符串而不是 RPC 方法**：方便上游用 enum/前缀过滤；也便于序列化到 LLM 描述
- **params 自由对象**：handler 内自校验，避免维护双层 schema
- **id 由调用方分配**：server 不强制全局唯一，简化分布式调用
- **tabId 顶层 + params 内都接受**：兼容多种调用约定

### 4.2 传输层（NmRequest / NmResponse + chunk）

Chrome NM 限制单消息 1MB。`NmResponseChunk` 用 `chunkIndex/totalChunks` 承载大响应（如截图）：

```ts
interface NmResponseChunk {
  type: "tool_response_chunk";
  requestId: string;
  chunkIndex: number;
  totalChunks: number;
  data: string;
}
```

server 端按 requestId 缓存 chunk，全到齐再 resolve `pending`。

控制帧 `NmPing/NmPong` 用于检测扩展是否还活着；relay 段另有独立心跳。

### 4.3 错误码

`VtxErrorCode` 是封闭枚举，**当前 43 个**（v0.7.4 实测），分三层：

- **基础层（25）**：`ELEMENT_NOT_FOUND` / `TIMEOUT` / `TAB_NOT_FOUND` / `NAVIGATION_FAILED` / `JS_EXECUTION_ERROR` / `PERMISSION_DENIED` / `NATIVE_MESSAGING_ERROR` / `EXTENSION_NOT_CONNECTED` / `INVALID_PARAMS` / `UNKNOWN_ACTION` / `IFRAME_NOT_READY` / `STALE_REF` / `NOT_ATTACHED` / 其他基础工具错误
- **L2 层（9）**：dom.commit driver 体系的 `SELECTOR_AMBIGUOUS` / `INVALID_TARGET` 等
- **L3 层（8）**：observe / extract 高层工具的 `SCAN_FAILED` / 大对象 truncation 等

每个错误码可携带 `context`（如 `{ tabId, frameId }`）与 `override`（如 `{ hint, recoverable }`）：调用方根据 `recoverable=true` 决定是否走自纠正路径（典型：`IFRAME_NOT_READY` → caller 重 observe 后再调）。

设计原则：**错误码新增不算 breaking、移除/重命名算 breaking**；新增 hint 文案不算 breaking；recoverable 改 true→false 算 breaking。

---

## 5. 数据流（端到端示例）

`Claude Code` 让用户当前 Chrome 截图：

```
1. Claude 调用 mcp__vortex__vortex_capture_screenshot
2. vortex-mcp.server.ts
   - 收到 MCP CallToolRequest
   - 转 VtxRequest { action:"capture.screenshot", params:{format:"png"}, id:"x1" }
   - 通过 ws://localhost:6800/ws 发给 vortex-server

3. vortex-server.message-router.ts
   - 把 VtxRequest 转 NmRequest { tool:"capture.screenshot", args:{...}, requestId:"r-1" }
   - 写到 stdout（NM 协议）
   - pending.set("r-1", {timer, resolve, vtxRequest})

4. vortex-extension.background.ts
   - service worker 收到 NM 消息
   - ActionRouter.dispatch(req) → handlers/capture.ts
   - chrome.debugger.attach + Page.captureScreenshot
   - 返回 base64

5. NmResponse 体积 > 1MB 时 → 多个 NmResponseChunk
6. vortex-server 重组 chunks → NmResponse → VtxResponse
7. ws 推回 vortex-mcp
8. vortex-mcp.server.ts
   - 检测到 image 内容
   - >500KB 落盘到临时文件，返回 file:// 路径
   - <500KB 直接返回 base64 image
9. Claude 看到 image content
```

任何一段超时（NM stdio / WS / pending）都会被对应层回 `TIMEOUT`，不会让上游一直挂住。

---

## 6. 关键设计决定

### 6.1 为什么不直接用 CDP

- CDP 需要以 `--remote-debugging-port` 启动 Chrome 或外部 attach，会破坏用户日常 Chrome 会话。
- 扩展 + NM 天然继承用户的登录态、Cookie、扩展环境。
- CDP 只在必须的地方临时用（mouse 真实点击、capture 全页面截图），用完立即 detach，避免长期占用 debugger 横幅。

### 6.2 为什么不直接 WebSocket 接 LLM 平台，而是反向连出去

公网 LLM（OpenClaw）部署在 NAT 之外，本地 Chrome 在 NAT 之内：
- LLM → Local 不可直达（要打洞/frp/ngrok）
- Local → LLM 是普通 HTTPS WebSocket，企业网/家用网都通

`relay-client.ts` 维持一条长连，断线指数退避重连、4401 不重试（鉴权失败应立即停而非循环）。

### 6.3 为什么 LLM 调用要显式声明每个参数（不是 additionalProperties）

OpenClaw 的 `anthropic-transport-stream.ts` 在转 input_schema 时只取 `properties` + `required`，**丢弃 `additionalProperties: true`**。LLM 看不到 schema 没列的字段，不会生成 `selector` 等参数。

→ MCP/插件层都需把所有可能字段（约 40 个）显式声明为 Optional。这是经验性的、跨 transport 的稳健做法。

### 6.4 工具粒度演进：v0.5 细粒度 → v0.6 facade（11 公开）

历史路径：

- **v0.5 之前**：MCP 暴露 60+ 细粒度工具（`vortex_click` / `vortex_fill` / `vortex_type` / `vortex_select` / ...），LLM 选择更准但 `tools/list` token 占用大、新增工具需双入口同步注册。
- **v0.6 L4 重构**：合并为 **11 个公开 facade**（`vortex_act` 含 `action: click|fill|type|select|scroll|hover` 枚举 / `vortex_observe` / `vortex_extract` / `vortex_navigate` / `vortex_tab_create` / `vortex_tab_close` / `vortex_screenshot` / `vortex_wait_for` / `vortex_press` / `vortex_debug_read` / `vortex_storage`）。`tools/list` 从 ~5.6KB 降到 ~3KB（-47%）；新增 action 不动 tool 注册。
- **OpenClaw plugin** 仍可用单工具 + action 路由模式，原因不变（插件注册成本随工具数线性增长）。

两种形态共享同一组 handler 实现，仅入口包装不同。**facade 的代价**：dispatch 内部 `kind` 参数与子 action 的隐式路由（如 `vortex_fill { kind: "daterange" }` → `dom.commit`）需要 codemod 显式 warning（见 `vortex-migrate` 的 `conditionalPartial`），避免静默丢字段。

### 6.5 为什么 SessionManager 用模块级单例

OpenClaw 在同一进程里会多次 `plugin.register`（不同代码路径分别注册 HTTP routes / tools / hooks），每次 `new SessionManager()` 会出现 tool 看不到 HTTP 端记录的 session。

→ `getOrCreateSessionManager()` 模块级单例，确保所有入口共享同一 session 表。

### 6.6 为什么大图自动落盘

LLM 上下文窗口宝贵；500KB+ 的 base64 图片塞进消息历史会快速耗光。
落盘后返回 `file://` 路径，Claude Code 能识别并按需读取，不污染历史。

---

## 7. 安全模型

| 边界 | 威胁 | 控制 |
|------|------|------|
| **本地 WS/HTTP** | 同机其他进程探测/调用 | 默认 bind `127.0.0.1`；token 可选 |
| **Native Messaging** | 任意扩展冒充 | NM host manifest `allowed_origins` 白名单扩展 ID |
| **Relay 出站** | 中间人 / 假 broker | 强制 `wss://`；token 通过 query + Authorization 双发（兼容剥 header 的代理） |
| **LLM 通过插件操控** | 跨用户访问 | 插件层 token 绑定 user/device；多用户下按 user 隔离 session |
| **页面内 JS 执行** | 误注入恶意脚本 | `js.evaluate` 需 LLM 主动选用；返回值类型校验；handler 不放 `eval` 直通 |

---

## 8. 性能与限制

- **响应延迟**：本地链路 < 50ms（不含浏览器执行）；relay 链路 = 本地 + 公网 RTT
- **吞吐**：单扩展进程串行执行，handler 内并行无意义；并发请求由 server pending 队列序列化
- **大消息**：NM 1MB 限制 → chunk 协议；relay 6KB nginx 默认头限制 → token 走 query
- **超时分层**：MCP 调用 30s / NM 调用 30s / Relay 心跳 30s / OpenClaw 心跳 90s
- **虚拟列表抓取**：滚动+边滚边收+去重（Map by 自然 key），不依赖一次性全量

---

## 9. 协议版本与演进

- 当前所有包统一 `0.1.x`，breaking 改动同步升级。
- action 名一旦发布即不重命名；废弃保留 + 新增。
- 错误码新增不算 breaking，移除算 breaking。
- protocol 字段只允许新增 optional，不允许删除/改语义。

---

## 10. 调试与可观测

| 层 | 工具 |
|----|------|
| extension | `chrome://extensions` → service worker DevTools；handler 前缀 `[vortex]` |
| server | stderr 日志（`[NM]`、`[ws]`、`[relay]`），不污染 NM stdio |
| relay | server 端 + plugin 端双侧均打 session register/unregister |
| MCP | 每次 ToolCall 在 stderr 打 action + 耗时 |
| CLI | `DEBUG=vortex:*` 打印请求/响应 |

---

## 11. 路线图

### v0.7.x（收尾，2026-05）

- [x] L4 facade 落地（11 公开工具，v0.6）
- [x] dogfood batch 修复 7 bug class（v0.7.0–v0.7.1）
- [x] vortex-bench 工具名迁移 codemod（v0.7.2）
- [x] codemod `conditionalPartial` 警告（v0.7.3）
- [x] observe 智能 frame fallback + frame detach 检测（v0.7.4）
- [x] ship-preflight checklist 工具（参见 `Knowledge-Library/07-Tech/20260512-vortex-ship-checklist.md`）
- [ ] 收尾余项：DESIGN.md 同步（本次）+ v0.7.x 遗留 issue 转 v0.8 milestone

### v0.8.x（GitHub milestone v0.8，2026-Q2 起）

**协议硬化 + LLM ergonomics 追赶 SOTA**：

- [ ] **P0**: snapshot ref 携带短哈希，server 校验跨 observe 复用（#20，杜绝当前协议级 footgun）
- [ ] **P0**: `vortex_observe` 暴露 element bbox 双轨 grounding（#21，对标 MS playwright-mcp `boxes:true` / Anthropic Computer Use）
- [ ] **P1**: 外部 benchmark（WebArena 子集）或公开真站 dogfood replay（#22，结束 single-user dogfood-only 模式）
- [ ] dom-commit test debt（#13）+ multi-frame 渲染细节（#15）+ generic [div] noise（#18）

### v0.9+（长期）

- [ ] Shadow DOM bench case + handler 显式支持
- [ ] Multi-tab 协调（cross-tab 状态共享）
- [ ] action schema 自动生成 MCP/OpenClaw 两套入口（消除手工同步）
- [ ] 录制 / 回放（已有 capture.gif，扩展为完整事件录制）
- [ ] Live View（在 OpenClaw dashboard 嵌实时浏览器画面）
- [ ] 多扩展实例（Edge / Firefox 同协议适配）

### v1.0（协议冻结）

- [ ] action 名 + schema SemVer 锁定
- [ ] 错误码集合冻结
- [ ] DESIGN.md 重写为"how to build a vortex driver"

---

## 12. 参考

- [README.md](../README.md) — 仓库总览
- 各子包 README — 实现细节
- [vortex-browser-plugin](https://github.com/bytenew/vortex-browser-plugin) — OpenClaw 插件
