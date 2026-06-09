# V2.1 P0 修复端到端验证 - 环境与配置

## Author
- qingwa

## 测试环境

### 软件版本
- vortex: HEAD = `0b7a38c` (P0 修 3), 5 commits ahead of origin/main
  - `b52547d` — filter 文档化 (P0 修 1)
  - `e239efc` — handler 字段名 `pattern` (P0 修 2)
  - `0b7a38c` — observe 内联 (P0 修 3)
  - `f86030a` — V2 重测版 reports
  - `312ce1b` — V2 早期 9 份 reports
- Chrome: 149.0.0.0, macOS 10_15_7, Apple M-series
- vortex-server: auto-restart daemon, watching dist/ (debounce 2s)
- vortex-extension: dist loaded at 09:47:13 (P0 修复 build 后时间一致)

### 测试站点
- 京东主平台: `item.jd.com/100142621650.html` (iPhone 16 白色 128GB)
- 入口路径: 京东首页 → 搜索 "iPhone 16" → 真实点击真品 1 (100142621650) → 详情页跳转
- 搜索页: `search.jd.com/Search?keyword=iPhone%2016` (1 步真品跳转, V2 重测版沿用)

## V2.1 vs V2 重测版 - P0 修复关键差异

| 项 | V2 重测版 | V2.1 P0 修复 | 端到端验证 |
|---|---|---|---|
| vortex_observe main frame 0 | "frame 0 not scanned" ❌ | 真实元素 ✅ | snap_mq61mya2_3: 73 元素 (e0-e72) |
| vortex_observe 滚动后 | "frame 0 not scanned" ❌ | 真实元素 ✅ | snap_mq61vp7u_4: 54 元素 |
| vortex_debug_read filter 子字段 | 报错 (字段未文档化) | 接受 ✅ | G1-G5 (level=error/info/warn/log/debug) |
| vortex_debug_read network pattern | 报错 (字段名不统一) | 接受 ✅ | G8 (pattern+statusMin+statusMax) |
| INVALID_PARAMS 错误信息 | 模糊 | "Network pattern REQUIRED" ✅ | G9 (修 1 文档化真生效) |
| vortex_act 京东 SPA 点击 | OBSCURED 错 | SPA 跳转成功 ✅ | iPhone 16 100142621650 详情页跳转 |

## V2.1 测试路径详细

### Step 1: 京东首页 → 搜索 "iPhone 16"
- URL: `https://www.jd.com/` → input "iPhone 16" → Enter
- 跳转: `https://search.jd.com/Search?keyword=iPhone%2016`
- 验证: 首页可访问, 搜索正常, 无风控

### Step 2: 搜索页 observe 验证 (P0 修 3)
- vortex_observe scope=viewport filter=interactive
- snap_mq60rymt_1: 122 元素 (e0-e121)
- 真品 1 ref: `@44eb:e92` (深青色 iPhone 16, SKU `100156393069`, ¥6598)
- 真品 2 ref: V1 沿用 `100142621650` (白色 iPhone 16, ¥4172.51) - 滚动 800 后可见

### Step 3: 真品 2 (白色 100142621650) 真实点击
- vortex_act target=`[data-sku="100142621650"]` action=click options={force: true}
- success: true, mode: realMouse, x: 390, y: 377
- 京东 SPA 拦截: 第一次 vortex_act 不带 force 报 OBSCURED, 第二次 force=true 成功
- 这是**京东 SPA root delegation + 浮层遮挡**导致的双重 actionability 检查

### Step 4: 详情页跳转成功
- URL 跳到: `https://item.jd.com/100142621650.html?pcdk=...&spmTag=...`
- pcdk/spmTag 来自京东 SPA 拦截注入, URL 含 referer+cookies, 模拟真人路径

### Step 5: 详情页 observe 验证 (P0 修 3) - **核心胜利**
- vortex_observe scope=viewport filter=interactive
- snap_mq61mya2_3: **73 元素 (e0-e72)**
- 关键交互: e62-e64 (SKU iPhone 14/15/16) + e66-e70 (颜色) + e71 (加购) + e72 (购买)
- 修复前 V2 重测版: "frame 0 not scanned (url=...)" ❌

### Step 6: 详情页滚动 2000 observe
- vortex_observe scope=viewport filter=interactive
- snap_mq61vp7u_4: **54 元素**
- sticky 元素 (顶导/详情页导航/客服入口) 仍可见
- 修复前 V2 重测版: "frame 0 not scanned" ❌

### Step 7: D11 动效检测
- sticky 元素 13 个 (login-bottom-bar / left-tabs-nav / page-content-right / page-right-banber / activity-banner)
- animated 元素 114 个 (logo-icon / area-mini / iconfont 等)

### Step 8: D16 9 格子 filter 端到端
- G1: console level=error → 3 条 (京东 pc-risk + video AbortError + marker)
- G2: console level=warn → 1 条 (marker)
- G3: console level=info → 1 条 (marker)
- G4: console level=log → 1 条 (marker)
- G5: console level=debug → 0 条
- G6: network 旧字段 url → 接受 (P0 修 2 向后兼容)
- G7: console 不带 filter → 7 条 (混合 error+log+info+warn)
- G8: network pattern+statusMin+statusMax → favicon 真命中 + 接受
- G9: INVALID_PARAMS 缺 pattern → "Network pattern REQUIRED" + 字段名提示 + 5k 硬上限优化 (修 1 文档化真生效)

## V2.1 风险与限制

### 已知风险
1. **京东 SPA root delegation**: 京东 SPA 已迁移到 React 18 root delegation, 商品卡 onClick 不在 div Fiber props 上, 需真实 mouse event (vortex_act mode=realMouse) 触发
2. **京东浮层遮挡**: 京东 SPA 顶层有多个浮层 (login-bottom-bar / activity-banner), vortex_act 严格 actionability 检查会报 OBSCURED, 需 force=true 跳过
3. **V2.1 iPhone 16 SKU 变化**: 搜索页首屏第 1 个 iPhone 16 是深青色 `100156393069` (V2 早期 + V2 重测版沿用是 `100142621650` 白色), V1 沿用 100142621650 现在排第 2 屏

### 限制
- V2.1 只测了京东 3C 详情页, 家电/服饰详情页未测
- V2.1 未测跨平台 (淘宝/天猫/拼多多)
- V2.1 D11 sticky 数量是初始值, 滚动后 sticky 可能变化 (V2.1 测了滚动 2000 仍 54 元素)
- V2.1 D16 5k 条硬上限**未触发**, 大流量场景下需后续验证
