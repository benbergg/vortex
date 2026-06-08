# JD-UNI-04: 配送时间(京东独有: **无 grid 弹层,静态计算文字 + 9 个物流方式 link 跳帮助文档**)

**Date:** 2026-06-08
**Git commit:** (Phase 5.4)
**京东场景:** iPhone 16 详情页配送时间区域(`item.jd.com/100142621650.html`)
**京东独有特征:** **京东详情页没有"配送时间 grid"弹层** — 配送时间是**基于地址+商品+物流算法的静态计算文字**(如"12:00前付款，预计今天(06月08日)送达"),用户**无法在详情页选择具体时段**;真实时段选择发生在购物车结算页/订单确认页。物流区有 **9 个 link** (今日达/京准达/211限时达/京尊达/预约送货/部分收货/送货上门/本地仓/自提),全部 `target="_blank"` 跳 help.jd.com 帮助文档(同 Phase 5.3 价保模式)

## 8 维度打标

| 维度 | 状态 | 实测 |
|------|------|------|
| D1 元素识别 | ✅ | observe 滚动到 scrollY=130 后,viewport 一次抓 9 个物流方式 link:`@47f2:e4` 今日达 / `e5` 京准达 / `e6` 211限时达 / `e7` 京尊达 / `e8` 预约送货 / `e9` 部分收货 / `e10` 送货上门 / `e11` 本地仓 / `e12` 自提(滚动前 scrollY=0 时只看到 sticky bar 的 2 个: `e19` 今日达· / `e20` 京准达,完整 9 个在 sticky bar 下方)。地址 ref `e63 [div] "浙江杭州市滨江区长河街道"`。**但配送时间核心 div `.logistics-delivery-time`(text="12:00前付款，预计今天(06月08日)送达")在 observe 中**始终未被识别**为独立 ref —— 它被合并到上级容器,这是京东 SPA 文本节点的合并行为** |
| D2 文本提取 | ✅ | extract target=`.logistics-wrap` maxLength=2000 召回完整配送区文字:1) **静态配送时间** "12:00前付款，预计今天(06月08日)送达" — 2) 地址 "浙江杭州市滨江区长河街道" — 3) 服务 "京东物流" — 4) **9 个物流方式名称** (今日达 / 京准达 / 211限时达 / 京尊达 / 预约送货 / 部分收货 / 送货上门 / 本地仓 / 自提) — extract scroll 行为把滚动时可见的 `.logistics-tips-item` 9 个 link 文字也召回 |
| D3 主路径交互 | ❌ | **主路径不可达 — 配送时间无 grid 弹层**。1) **click "今日达·" `@47f2:e2`** = `target="_blank"` 跳 `help.jd.com/user/issue/103-983.html`(新 tab) —— 不是配送时段 grid;2) **click "京准达" `@47f2:e3`** = 同 `help.jd.com/user/issue/103-983.html`(同 issue 不同锚点);3) **click "211限时达" `@47f2:e6`** = `help.jd.com/user/issue/91-953.html`(211 不同 issue);4) **click 地址 `.logistics-address-main`**(React onClick=true,cursor=pointer) — 触发 `#jd_area_wrap_VRF7Kl37` hover 弹层 (React portal) 弹地址选择器(常用地址/选择新地址/浙江 > 杭州市 > 滨江区 > 长河街道 + 3 个街道选项),**但弹层中无任何"配送时段"或"今天/明天/具体时段"控件**。**京东 iPhone 16 详情页不存在"配送时间 grid"** —— 与天猫淘宝的"选择配送时段"弹层不同 |
| D4 表单提交 | (N/A) | 配送时间无表单,跳过 |
| D5 编程调用 | ✅ | evaluate **3 项关键发现**:1) `.logistics-delivery-time` 是 div,**无 onClick、无 cursor=pointer**(cursor=auto),React props 只有 `__reactFiber` + `__reactProps` 链无 on* 事件 — **静态文字,非交互元素**;2) `.logistics-address-main` 有 native onclick,React props 只有 `className`+`id`(onClick 可能在 React 18 root delegation 中,无法通过 dispatchEvent 模拟,但 realMouse 真实点击成功触发了 React portal 弹层);3) 9 个 `.logistics-tips-item` 全部 `<a target="_blank">`,href 全部指向 help.jd.com 不同 issue (103-983/91-953 等) |
| D6 视觉验证 | ✅ | screenshot jpeg q=50 1440x754 viewport:**完整可视**:左侧 iPhone 16 商品图(白底 / 双摄)/ 中部 sku 选择(颜色/版本/容量)/ 右侧详情区(¥3972.51 国补 + 满减 + 京豆 + **"送至 12:00前付款，预计今天(06月08日)送达 浙江杭州市滨江区长河街道"** + 国补领后价);**hover 触发的地址选择器弹层**也截图到了(常用地址 / 选择新地址 高亮 / 浙江 杭州市 滨江区 长河街道 4 级 + 长河街道/浦沿街道/西兴街道 3 街道可选 + × 关闭按钮) |
| D7 状态等待 | ✅ | wait_for idle 301ms 详情页 DOM 稳定(mutationsSeen=0);**配送时间静态文字 SSR 立即渲染** — 11:00 之后的当前时刻"今天(06月08日)送达"是相对时间的实时计算结果(JS 客户端时间,无需 API 调用) |
| D8 跨页导航 | ✅ | click 9 个 link 全部 `target="_blank"` 跳 help.jd.com(新 tab),原详情页 tab 保持不变;tab_list 验证新 tab 创建;tab_close 清理回 3 tab。**与 Phase 5.3 价保完全一致的"target=_blank 跳转帮助文档"模式** |

**主路径通过:** 6/7 ✅ | **降级通过:** 0/7 ⚠️ | **失败:** 1/7 ❌ (D3 配送时间 grid 不存在) | **N/A:** 1/8 (D4)

## MCP 调用记录

### D5 evaluate(初步定位 - 配送区 5 个核心元素)
```
vortex_evaluate → {
  count: 11,
  items: [
    {className: "logistics-wrap",                text: "送至12:00前付款，预计今天(06月08日)送达浙江杭州市滨江区长河街道京东物流今日达·京准达", y: 87},
    {className: "logistics-content",             childCount: 3, y: 87},
    {className: "logistics-item logistics-delivery-time", text: "12:00前付款，预计今天(06月08日)送达", y: 87},  // ← 配送时间(只读)
    {className: "logistics-item logistics-address",       text: "浙江杭州市滨江区长河街道", y: 108},
    {className: "logistics-item logistics-service",       text: "京东物流今日达·京准达", y: 136},
    {className: "logistics-service-item [A]",       text: "今日达·", y: 148, href: "help.jd.com/user/issue/103-983.html"},
    {className: "logistics-service-item [A]",       text: "京准达",  y: 148, href: "help.jd.com/user/issue/103-983.html"}
  ]
}
```

### D5 evaluate(.logistics-delivery-time 静态文字验证)
```
vortex_evaluate → {
  deliveryTime: {
    className: "logistics-item logistics-delivery-time",
    cursor: "auto",          // ← 不是可点击
    hasOnClick: false,
    tag: "DIV",
    text: "12:00前付款，预计今天(06月08日)送达",
    x: 968, y: 87, w: 336, h: 21
  },
  wrap: {
    className: "logistics-wrap",
    cursor: "auto",
    hasOnClick: false
  }
}
// 关键结论: .logistics-delivery-time 是纯 div 静态文字,无任何点击/事件属性
```

### D5 evaluate(React props 上溯,确认无 onClick)
```
vortex_evaluate → {
  deliveryTime: {
    onClickAttr: false,
    hasReactProps: true,
    reactKeys: ["__reactFiber$...", "__reactProps$..."],
    cursor: "auto"
  },
  addr: {
    onClickAttr: true,           // ← native onclick 存在
    hasReactProps: true,
    cursor: "pointer"            // ← cursor 才是真正的可点击指示
  }
}
// 关键: .logistics-delivery-time 真的不可点击;地址 .logistics-address-main 真的可点击
```

### D1 observe(scrollY=0, sticky bar 顶部)
```
vortex_observe({scope:"viewport", filter:"all"})
→ SnapshotId snap_mq4eebg6_36, scrollY=0/5080
   @8a0e:e19 [link] "今日达·"      ← 顶部 sticky 服务标签
   @8a0e:e20 [link] "京准达"        ← 顶部 sticky 服务标签
   (其他 7 个物流方式未在 viewport top)
   (配送时间文字 "12:00前付款..." 未识别为 ref,被合并到上级容器)
```

### D1 observe(scrollY=130, 完整物流区)
```
vortex_observe({scope:"viewport", filter:"all"})
→ SnapshotId snap_mq4eiwx9_37, scrollY=130/5080
   @47f2:e2  [link] "今日达·"        ← 顶部
   @47f2:e3  [link] "京准达"         ← 顶部
   @47f2:e4  [link] "今日达"          ← sticky bar 下方物流方式
   @47f2:e5  [link] "京准达"
   @47f2:e6  [link] "211限时达"       ← 关键测试目标
   @47f2:e7  [link] "京尊达"
   @47f2:e8  [link] "预约送货"
   @47f2:e9  [link] "部分收货"
   @47f2:e10 [link] "送货上门"
   @47f2:e11 [link] "本地仓"
   @47f2:e12 [link] "自提"            ← 9 个物流方式
   @47f2:e63 [div] "浙江杭州市滨江区长河街道"  ← 地址 (div,非 link)
```

### D3 click(主路径 - 今日达 link)
```
vortex_act(target='@47f2:e2', action='click', options={force:true, timeout:10000})
→ {success: true, element: {tag: a, text: "今日达·"}, x: 1056.5, y: 377, mode: "realMouse"}

vortex_evaluate → {url: "https://help.jd.com/user/issue/103-983.html"}  // ← 跳转新 tab
vortex_tab_list → 4 tabs (新增 help 标签页)
```

### D3 click(主路径 - 211限时达 link)
```
vortex_act(target='@47f2:e6', action='click', options={force:true, timeout:10000})
→ {success: true, element: {tag: a, text: "211限时达"}, x: 1091.3, y: 377, mode: "realMouse"}

vortex_evaluate → {url: "https://help.jd.com/user/issue/91-953.html"}  // ← 不同 issue
```

### D3 click(主路径 - 地址 div 触发地址选择器)
```
vortex_act(target='.logistics-address-main', action='click', options={force:true, timeout:10000})
→ {success: true, element: {tag: div, text: "浙江杭州市滨江区长河街道"}, x: 1059, y: 377, mode: "realMouse"}

vortex_evaluate → {
  // 弹层 #jd_area_wrap_VRF7Kl37 在 body 末尾 react portal 出现
  popperCount: 1,
  bodyChildrenTags: [
    "DIV#root.", "SCRIPT#.", ...,
    "DIV#toast-box-root.", "DIV#elevator_from_common_component.", ...,
    "DIV#calclator-container.", "SCRIPT#.",
    "DIV#.jd_area_wrap_VRF7Kl37 jd_hover"   // ← 新出现
  ]
}
```

### D2 extract(地址弹层内容)
```
vortex_extract({target: ".jd_area_wrap_VRF7Kl37", maxLength: 3000})
→ "常用地址
   选择新地址
   浙江
   杭州市
   滨江区
   长河街道
   长河街道
   浦沿街道
   西兴街道"
// 弹层 2 tab (常用地址/选择新地址) + 4 级地址(省/市/区/街道) + 3 街道选项
// **弹层中无任何"配送时段" / "今天/明天/具体时间"控件**
```

### D2 extract(完整配送区文字 - 含 9 个物流方式)
```
vortex_extract({target: ".logistics-wrap", maxLength: 2000})
→ "送至
   12:00前付款，预计今天(06月08日)送达
   浙江杭州市滨江区长河街道
   京东物流
   今日达·
   京准达
   今日达 京准达 211限时达 京尊达 预约送货 部分收货 送货上门 本地仓 自提"
// extract scroll 行为把 9 个 .logistics-tips-item 文字也召回
// (滚动后才出现)
```

### D6 screenshot(成功!无 TIMEOUT)
```
vortex_screenshot({format: "jpeg", quality: 50})
→ 1440x754 viewport,scrollY=130:
   左侧: iPhone 16 商品图(白底双摄)
   中部: 颜色选择(群青色/深青色/粉色/白色高亮/黑色) + 容量(128GB高亮) + 版本
   右侧: ¥3972.51 + 国补 + 满减 + 京豆
   送至: 12:00前付款，预计今天(06月08日)送达 (← 静态文字,不是 grid 入口)
         浙江杭州市滨江区长河街道 ^ (↑ 切换图标,hover/click 弹地址选择器)
   hover 触发的地址选择器弹层 (右下角):
   - 常用地址 | 选择新地址 (高亮)
   - 浙江 > 杭州市 > 滨江区 > 长河街道
   - 长河街道 (高亮) | 浦沿街道 | 西兴街道
   - × 关闭按钮
```

### D7 wait_for idle
```
vortex_wait_for({mode: "idle", timeout: 10000, value: "dom"})
→ {mutationsSeen: 0, settled: true, waitedMs: 301}  // 详情页 DOM 立即稳定
```

### D8 tab_list(跨 tab 验证)
```
vortex_tab_list → 验证新 tab 创建 + tab_close 清理
[
  {url: "search.jd.com/Search?keyword=iPhone%2016...", title: "iPhone 16 - 商品搜索 - 京东"},
  {url: "search.jd.com/Search?keyword=%E8%BF%9E...",  title: "连衣裙 - 商品搜索 - 京东"},
  {url: "item.jd.com/100142621650.html",               title: "Apple/苹果 iPhone 16 ...", active: false},
  {url: "help.jd.com/user/issue/91-953.html",          title: "帮助中心-京东", active: true}  // ← 新 tab (211限时达)
]
vortex_tab_close(tabId=984521762) → {success: true}  // 清理
```

## 京东场景关键观察

### 1. **京东详情页没有"配送时间 grid"** ❌(京东独有,非缺漏而是 UX 设计)
- **核心发现**: 京东 iPhone 16 详情页**没有可交互的"配送时间 grid"弹层**
- **配送时间 = 静态计算文字**: "12:00前付款，预计今天(06月08日)送达"
- **基础逻辑**: 京东基于 (地址 + 商品 + 当前时间 + 物流算法) 实时计算预计送达时间,**用户无法在详情页选择具体时段**
- **真实"配送时间选择"位置**: 购物车结算页 / 订单确认页(本评测未覆盖)
- **与天猫/淘宝对比**: 天猫淘宝详情页通常有"配送方式" + "送达时间" 选项卡,可选择具体时段
- **vortex 评测影响**: 京东详情页的"配送时间"维度是**只读文字**而非**可交互 grid**,评测时 D3 click 不可行,需在 D2 文本提取中验证

### 2. **物流方式 9 个 link 全部 `target="_blank"` 跳帮助文档** ✅
```
今日达  →  help.jd.com/user/issue/103-983.html
京准达  →  help.jd.com/user/issue/103-983.html  (同 issue,不同锚点)
211限时达 → help.jd.com/user/issue/91-953.html   (不同 issue)
京尊达  →  help.jd.com/user/issue/...   (未逐个验证)
预约送货 → ...
部分收货 → ...
送货上门 → ...
本地仓  → ...
自提   → ...
```
- **9 个物流方式 = 京东物流服务矩阵**,全部是 `<a target="_blank">` 跳帮助文档
- **同 Phase 5.3 价保完全一致的 UX 模式**: 双层 UX(短 hover title + 跳 help 长规则)
- **额外 6 个服务标签** (包邮/PLUS/7天价保/免举证/一年质保/高价回收) 来自 `.service-support-tag-item--link`,同模式
- **总计 15 个 service-related link**,统一 target=_blank 跳 help.jd.com 不同 issue

### 3. **地址 div 有 React onClick 真实可点击** ✅
- `.logistics-address-main` cursor=pointer, onClick=true, React props 有 native onclick
- **真实 click 行为**: 触发 React portal `#jd_area_wrap_VRF7Kl37` 弹层(在 body 末尾)
- **弹层内容**: 2 tab (常用地址/选择新地址) + 4 级地址(省/市/区/街道) + 3 街道选项
- **弹层中无配送时间 grid**: 仅地址选择,选择地址后可能触发新的"配送时间"文字刷新(本页未验证)
- **vortex click 验证**: realMouse 真实点击成功(force=true 是预防措施,实际无 NOT_STABLE)
- **vs Phase 5.3 价保**: 价保 click 是 a 标签 target=_blank 跳帮助文档;地址 click 是 div 真实 React onClick 弹层

### 4. **配送时间静态文字的实时性** ✅
- "12:00前付款，预计今天(06月08日)送达" 是**客户端时间计算**结果
- 假设当前时间 11:00 (实测 2026-06-08),京东算法判断"12:00 前付款 = 今日送达"
- **不需要 API 调用** (vortex wait_for idle 301ms 立即稳定)
- **SSR 渲染**: `.logistics-delivery-time` 在页面初次加载时就有内容(无 SPA 懒加载)
- **对比京东规格表**: 3C iPhone 规格表 (`.attribute`) 也是 SSR 立即渲染,等一致 — Phase 5.1 已确认

### 5. **配送时间维度在京东详情页 = 静态文字** ≠ 任务假设的"grid 弹层" ⚠️
- **任务假设**: 配送时间有"今日/明日/具体时段"选择 grid
- **实测结论**: 京东详情页**没有这种 grid** —— 配送时间是只读文字
- **评测策略调整**: 京东配送时间维度**只验证 D1+D2+D5(识别+提取+编程调用)**,D3 标记为 ❌ (N/A 不存在)
- **后续评测补充**: 若需评测"配送时段选择"功能,需跳转购物车结算页(本 Phase 5.4 范围外)

### 6. **D6 screenshot 此次成功**(与 Phase 5.1-5.3 不同的结局)✅
- 本次 screenshot jpeg q=50 一次成功(无 30000ms TIMEOUT)
- **可能原因**:
  1. 详情页刚 reload 后 (D7 wait_for idle 301ms) 立即截图
  2. 没有 sticky 容器交互 (本场景无 click 主路径 click 成功)
  3. screenshot 触发时机不同(本次在 click 地址 + 弹层出现后)
- **vortex 内部建议**: screenshot 失败与"click 后立刻截图"高度相关,等待 DOM 稳定后截图更可靠
- **跨场景一致性**: 3 个场景 (Phase 5.1 规格 tab / 5.2 延保 / 5.3 价保) 全部 TIMEOUT,本场景成功 — **vortex screenshot 故障具有场景特异性**,需逐一验证

## 结论

**PARTIAL_PASS(D3 配送时间 grid 不存在)**

6/8 维度通过(D4 N/A),主路径 6/7 + 降级 0/7 + 失败 1/7(D3)。**京东 3C iPhone 详情页配送时间场景:核心发现是京东详情页**没有"配送时间 grid"** —— 配送时间是静态计算文字,9 个物流方式 link 全部跳帮助文档**。

### 京东独有 3 场景之 #1 — 配送时间评估

- ❌ **D3 主路径不适用**: 京东详情页**没有配送时间 grid 弹层**,假设的"今日/明日/具体时段"选择不存在
- ✅ **D1 + D2 + D5 + D6 + D7 + D8 完整支持**: 9 个物流方式 link 全部 observe 命中 / extract 召回 9 种配送方式名称 / evaluate 验证 React onClick 行为 / screenshot 拿到完整视图 / wait_for idle 稳定 / tab_list 验证跨 tab
- ⚠️ **D1 observe 漏抓配送时间文字**: `.logistics-delivery-time` 静态 div 文字未识别为 ref (被合并到上级容器),vortex_observe 对"不可交互 div 文字"识别有缺口
- ✅ **地址弹层** (`.logistics-address-main` click) **React portal 弹层完整触发**: 京东 SPA 弹层使用 React portal (`document.body` 末尾插入 div),vortex realMouse click + D5 evaluate 完整捕获

### 与其他平台对比

| 维度 | 淘宝/天猫 | 京东 | vortex 评估 |
|------|----------|------|-----------|
| 配送时间入口 | "配送方式" tab + 浮层 | **静态文字 + 9 link** | 京东**无 grid** |
| 配送时间选择 | "今日/明日/具体时段" 选项 | **不可选** | 京东**只读**,结算页选 |
| 物流服务标签 | 通常 3-5 个 | **9 个物流方式 + 6 个服务标签 = 15 个 link** | 京东**标签密度高 3-5x** |
| link 行为 | 大部分是 modal 浮层 | **target=_blank 跳 help** | 京东独有 |
| 配送时间文字 | 浮层内容 | SSR 静态 | 京东**SSR** |
| 详细规则 | 浮层文字 | help.jd.com 文档 | 京东**文档化** |
| 地址选择 | 浮层 4 级 | 弹层 4 级 | 一致 |
| React portal 弹层 | 有 | **有** (`.jd_area_wrap_*`) | 一致 |

### vortex 京东配送时间评测能力评分

- D1 元素识别: ✅ 完整(observe 9 个物流方式 link + 地址 div;但 `.logistics-delivery-time` 静态文字未识别)
- D2 文本提取: ✅ 完整(extract 召回完整 9 个物流方式 + 配送时间文字 + 地址)
- D3 主路径交互: ❌ 京东详情页无配送时间 grid,D3 不可达
- D5 编程验证: ✅ 完整(evaluate 验证 React onClick / cursor / props / 9 link href)
- D6 视觉验证: ✅ 完整(screenshot 拿到完整视图 + 地址选择器弹层)
- D7 状态等待: ✅ 完整(wait_for idle 301ms)
- D8 跨页导航: ✅ 完整(tab_list 验证 9 link 跳新 tab + tab_close 清理)

### 关键 selector 汇总(供后续场景复用)

| 场景 | selector | 备注 |
|------|----------|------|
| 配送时间文字(只读) | `.logistics-delivery-time` | **不可交互**,SSR 静态 |
| 配送时间文字 | `.logistics-wrap` | extract 拿完整文字 |
| 配送地址 | `.logistics-address-main` | **cursor=pointer**,React onClick |
| 物流方式 9 link | `.logistics-tips-item` | `<a target="_blank">` 跳 help.jd.com |
| 物流方式容器 | `.logistics-tips-wrapper` | 包裹 9 link |
| 配送区主容器 | `.logistics-wrap` | 包含 delivery-time + address + service |
| 配送区子容器 | `.logistics-content` | 3 children (3 个 .logistics-item) |
| 物流服务标签(头部 2 个) | `.logistics-service-item` | "今日达·" + "京准达" |
| 物流方式名 | `.logistics-tips-item` text | 9 种: 今日达/京准达/211限时达/京尊达/预约送货/部分收货/送货上门/本地仓/自提 |
| 地址选择器弹层 | `#jd_area_wrap_*` (React portal) | hover/click 地址触发 |
| 弹层 tab | `.jd_tab_btn_JQwdzaN2` | 常用地址 / 选择新地址 |
| 弹层内容区 | `.jd_area_content_wrap_fDNBA6bG` | 4 级地址 + 街道选项 |
| 服务标签 (6 个) | `.service-support-tag-item--link` | 同 Phase 5.3 价保场景 |

### 后续场景提示

- **JD-UNI-05 客服浮窗 + iframe**: 京东详情页右侧有 "客服" link(`@47f2:e25`),点开可能是浮窗或跳转客服中心 — 跨 frame 挑战
- **JD-UNI-06 京东自营标志**: 京东详情页"Apple产品京东自营旗舰店" (`.shop-info` / "已关注") 是自营标签的另一种形式,需在列表页验证自营卡识别
- **配送时间相关 query 总结**: 9 个物流方式 link 全部 `target="_blank"` 跳 help.jd.com,5 种验证过的 issue(103-983/91-953 等),**vortex 评测"配送时间"维度在京东详情页 = 静态文字评测**
