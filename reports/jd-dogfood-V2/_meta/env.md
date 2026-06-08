# 京东评测 V2 环境

**Author:** qingwa
**Date:** 2026-06-09
**Git commit:** 83a892048a32e60ccf629aab3d6df149fcb5f961
**Git status:** clean
**dist hash:** 1.0.0 (与 git HEAD 83a8920 "docs: V4 修复实施计划 + BUG-012 react-virtuoso fixture 入库" 一致)
**Chrome 状态:** stable + extension 加载
**vortex-server:** PID 55875, listening 6800 (IPv6 [::]:6800)
**vortex MCP:** vortex 工具集 17 个, vortex-server 健康
**R8 白盒核对 (2026-06-09):**
- `schemas-public.ts:201` vortex_debug_read filter: `{ type: "object" }` **无 description, 未声明子字段** (level / urlPattern / statusMin / statusMax) — D16 真 gap = schema 文档化 (非能力缺失)
- `console.ts:160-163` handler 已实现 `args.level` 过滤 (`logs.filter((l) => l.level === level)`) — 能力具备, 缺 schema 暴露
- `network.ts:305-321` handler 已实现 `urlPattern` (line 253) / `url` (line 305) / `statusMin` / `statusMax` 过滤 — 能力具备, 注意 line 305 用 `args.url` 而非 `args.urlPattern` (字段名不统一, schema 未声明)
- `js.ts:106` evaluate `userGesture: false` — INP 不会产生, V2 D10 删 INP 判据源码佐证
- `js.ts:61-71` async=true 包装 `return (async () => (${c}))()`, handler 已 await — V2 实施计划 Opus 订正要求 (P0 致命) 源码佐证
- `js.ts:266-285` `expandHost` 函数处理 Promise/Map/Set 等非可枚举对象, sync 模式 (无 async) 不 await → 返 `{}`
**京东登录态:** ✅ (用户名 `jd_130679dqq...` — 京东截断显示, 已脱敏)
**网络:** ✅ 京东真站可访问 (search.jd.com / item.jd.com 200 OK)

---

## 真实 item id 落档

**真实 item id:**
- **3C** = `100142621650` (Apple/苹果 iPhone 16 128GB 白色 ¥3972.51) — V1 同款, 跨 V1/V2 对比
- **家电** = `100146042265` (海尔空调 净省电 大1.5匹 一级能效 变频冷暖) — V1 同款, 跨 V1/V2 对比
- **服饰** = `10163956330188` (NAERSI 娜尔思 连衣裙 **本白色 L** ¥1115) — V1 同款, 跨 V1/V2 对比
  (订正: 之前取的 `10157103834827` 是 NAERSI **淡叶绿色** 款式, 不是 V1 同款; V1 服饰是本白色)

(京东商品卡 selector: `[data-sku]`, **非** `href`; V1 §7.3 已记)

---

## D11 react-virtuoso 前置验证

**D11 react-virtuoso 真站可复现:** ❌ (京东详情页评价区不是 react-virtuoso)

实测:
- `[data-virtuoso-scroller]` / `[data-testid*="virtuoso"]` / `[class*="virtuoso"]` / `[class*="Virtuoso"]` → **0 命中**
- `[class*="virtual-list"]` / `[class*="VirtualList"]` → **0 命中**
- `[class*="virtual"]` / `[class*="Virtual"]` → **0 命中**
- 评价项 selector `[class*="comment-item"]` 命中 15 个 (京东自渲染, **非** react-virtuoso)
- 评价 tab selector: `.left-tabs-item.everyone-reviews` (200万+买家评价)

**分支执行 (V2 实施计划 Task 2.1 前置分支)**:
- ❌ 京东真站**不**触发 react-virtuoso, D11 BUG-012 回归改在 **fixture 上跑** (`bench` 已 fixture 化 BUG-012 @ `93f60fb`)
- 真站只测"动画状态可读 (getComputedStyle) + wait_for 停止" 2 格子
- Phase 2 Task 2.1 Step 1-3 (真站 BUG-012 回归) 改为 **Step 1 工具现状 - 动画状态读取 + Step 2 工具现状 - 动画停止等待 + Step 3 写 D11-动效.md (3 格子而非 5 格子)**

---

## Runbook 兜底 (R1-R8)

- **R1** ✅: `pkill -f vortex-bench/playground` (PID 55875 不在 bench 进程列表)
- **R2** ✅: vortex-server PID 55875 listening 6800
- **R3** ✅: vortex MCP 健康 (dispatch 通过)
- **R4**: D1-D8 沿用 V1, 口径一致
- **R5**: V2 D9-D16 不涉及京东独有
- **R6**: D9/D11/D16 用 `vortex_evaluate + observe + debug_read` 组合
- **R7** ✅: dist version 1.0.0 与 git HEAD 83a8920 对应 (V1 旧 dist 缓存矛盾已防)
- **R8** ✅: codegraph 白盒核对 (见上)

---

## ⚠️ V2 评测关键发现: vortex_observe 在 main frame 0 全部扫空 (V2 D9 真 gap #1)

**现象** (京东真站 + example.com 同症状):
```
vortex_observe scope=viewport/full filter=interactive/all
  → "# frame 0 not scanned (url=...)"
```

**根因** (debug_read console error 实证):
```
ReferenceError: applyReactClickableMarker is not defined
    at <anonymous>:1:14814
```

**源码分析**:
- `packages/extension/src/handlers/observe.ts:228` `applyReactClickableMarker` 是 handler 顶层 export 函数
- 但在 `scanOneFrame` (observe.ts:254) 用 `chrome.scripting.executeScript` 注入 page-side MAIN world 时, **`func` 参数被序列化为字符串** (background scope 中定义的 `applyReactClickableMarker` / `REACT_CLICKABLE_HINT` 不进字符串)
- dist build (`background.ts--x5mOpJ-.js:130344` 函数定义 vs `:145596` 引用) 验证: 函数定义在 background scope, 引用在 inject func body 内, 序列化时**引用对象未带过去**
- 结果: page-side MAIN world 抛 ReferenceError → `scanOneFrame` 返 null → "frame 0 not scanned"

**影响**:
- vortex_observe **在所有页面都不可用** (京东 / example.com / 任何 main frame 0)
- 不仅是 D9, 任何依赖 observe 的评测 (D11 BUG-012 回归 / D3 主路径交互) 都受影响
- V1 评测未发现, 因 V1 主路径是 extract + act + wait_for, observe 是 "兜底"路径
- V2 D9 用 observe 抓 a11y props 直接踩雷

**D9 应对 (降级)**: 不依赖 observe, 用 `vortex_evaluate` 读 `role`/`aria-label` 替代。

**修复建议 (V2.1 候选, 真原语层 gap)**:
- 方案 A: 在 page-side inject func 内**内联** `applyReactClickableMarker` 逻辑 (不依赖外部函数)
- 方案 B: 把 `applyReactClickableMarker` / `REACT_CLICKABLE_HINT` 移到 page-side 模块, 通过 `loadPageSideModule` 注入 (`capture.ts` 已有此模式, line "loadPageSideModule(i,l,"dom-resolve")")
- 方案 C: 改 dist build, 让 `applyReactClickableMarker` 真的 inline 进 inject func (rollup config 改)

(具体 V2.1 P0/P1 排序待 Phase 5 行动项填, v2.0 设计稿不预设)
