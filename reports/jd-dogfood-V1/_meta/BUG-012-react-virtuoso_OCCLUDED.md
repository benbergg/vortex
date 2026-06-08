# BUG-012: `react-virtuoso` 虚拟列表导致 `vortex click` 必报 `ELEMENT_OCCLUDED`

**Author:** qingwa
**Date:** 2026-06-08
**Status:** 立项
**严重度:** 🟠 P1
**相关 Phase:** Phase 5.x 加购 + 评价
**评测来源:** `reports/jd-dogfood-V1/家电/07-阶段5-加购.md` (D3 ⚠️ ELEMENT_OCCLUDED)
**参考:** BUG-009 全闭环模板见 `_meta/P1-1京东根因诊断.md` 6 节 300 行

---

## 1. 现象

**关键观察:**

- 京东家电(空调)详情页使用 `react-virtuoso` 虚拟列表:`._list_1ygkr_67` / `._rateListContainer_1ygkr_45` / `#rateList`
- `vortex_act click` 必报 `ELEMENT_OCCLUDED`
- 评测兜底:`vortex_evaluate` + `scrollIntoView({block:"center"})` + `el.click()` 三步手动绕过
- `react-virtuoso` 虚拟列表 hash 跨家电 + 服饰**完全一致**(同 React 应用)
- 虚拟列表特点:DOM 只渲染视口内 N 个,外层容器有 transition,viewport 边界元素不断被 unmount/remount

**数据引用:**
- `家电/07-阶段5-加购.md` D3 ⚠️:vortex click ELEMENT_OCCLUDED → evaluate + scrollIntoView + click 兜底
- 服饰 D3 同(未单列 .md,合并到家电)
- 评价区(Phase 4.x 评价 tab 切)同(同 `react-virtuoso` 容器)

---

## 2. 复现 fixture

**真站复现 URL:** `https://item.jd.com/100014349213.html` (空调详情页)

**复现命令:**
```
vortex_navigate("https://item.jd.com/100014349213.html")
vortex_wait_for(value='document.querySelectorAll("[class*=\"_list_\"]").length >= 1')
vortex_observe(scope="viewport")  # 找 react-virtuoso list 内某个评价 ref
vortex_act(action="click", target="@ref:eN")
# → ELEMENT_OCCLUDED
# 评测兜底:
vortex_evaluate(code="() => { const el=document.querySelector('#rateList [class*=\"_rateList_\"]'); el.scrollIntoView({block:'center'}); el.click(); }")
```

**本地 fixture:** `playground/public/react-virtuoso-list.html`(用 react-virtuoso 库模拟京东家电/服饰评价区虚拟列表)

---

## 3. 代码定位

### 3.1 vortex click occlusion 检查逻辑

`packages/extension/src/handlers/dom.ts:171-198` —— click probe
```ts
el.scrollIntoView({ block: "center", inline: "center" });
const rect = el.getBoundingClientRect();
const cx = rect.left + rect.width / 2;
const cy = rect.top + rect.height / 2;
const topEl = (window as any).__vortexDomResolve.deepElementFromPoint(cx, cy);
```

### 3.2 react-virtuoso 触发的具体 occlusion

- 虚拟列表外层 wrapper 有 `position: relative` + 内层 viewport 容器有 `transform: translate3d(0, -Ypx, 0)` 做滚动
- 评测点击"评价"tab 后,react-virtuoso 渲染视口内 5-8 个评价
- 但 wrapper 与 viewport 容器之间**有另一层"staggered animation"覆盖**(评价项淡入动画)
- `elementFromPoint(cx, cy)` 命中动画覆盖层(伪元素或同位置兄弟)而非目标 ref
- → 报 ELEMENT_OCCLUDED

### 3.3 已有 V4 同款修复(observe sticky bar)

`packages/extension/src/handlers/dom.ts:180-198` —— `isInteractiveEl` + `sameWidgetDecoration` carve-out
- 已知场景:el-select wrapper + 显示层兄弟
- **不覆盖** react-virtuoso 的"动画覆盖层"场景(动画层不是兄弟而是 transient element)

### 3.4 评测兜底已成功

`vortex_evaluate` + `scrollIntoView + click()` —— 跳过了 `waitActionable` 门 + `isInteractiveEl` 检测 + occlusion 检测,**直接走 React 事件委托**(因为 react-virtuoso 监听 onClick 是 root delegation)

---

## 4. 根因

**逻辑链:**

1. react-virtuoso 虚拟列表在 wrapper 与 viewport 之间插入"动画覆盖层"(淡入 + 滑动)
2. `elementFromPoint(cx, cy)` 命中动画覆盖层(伪元素 / transient span)而非目标 ref
3. vortex click probe 报 ELEMENT_OCCLUDED,卡住
4. 评测用 evaluate 绕过 —— 等价于"信任用户的点击决策"
5. **不是 vortex 找不到 ref,也不是 ref 不可点,而是 vortex 的"安全门"过严**

**为什么 BUG-009 修复无关:** P1-1 修复是 observe 阶段的空名率;本 BUG 是 click 阶段的 occlusion 误判,**两个独立问题**。

---

## 5. Patch 草稿

### 方案 A(推荐):vortex_act click 增加 popper / transient 检测 + scrollIntoView 兜底

`packages/extension/src/handlers/dom.ts:198 后`:
```ts
// popper / transient detection: react-virtuoso 动画层、element-plus popper 覆盖
// 都是带 transform/opacity 动画 + 短暂存在的元素,如果 topEl 不在 el 祖先链
// 且 isInteractiveEl(topEl)=false 且 topEl.dataset.vortexTransient==="1"
// 或 topEl 有 opacity < 1 / transform 含 matrix → 视为瞬态覆盖,放行
const isTransient = (x: Element): boolean => {
  const cs = getComputedStyle(x);
  if (parseFloat(cs.opacity) < 0.99) return true;
  if (cs.transform && cs.transform !== "none" && cs.transform.includes("matrix")) return true;
  if (x.getAttribute("aria-hidden") === "true") return true;
  return false;
};
if (topEl && topEl !== el && !el.contains(topEl) && !topEl.contains(el) && !isInteractiveEl(topEl) && isTransient(topEl)) {
  // transient overlay,放行,继续 el.click()
}
```

**优点:** 与现有 `isInteractiveEl` carve-out 同款风格(代码风格一致),只放宽瞬态覆盖场景;**缺点:** 仍可能误判,需更多 fixture 验证。

### 方案 B:vortex 新增 auto_unobscure 选项(默认开)

`packages/extension/src/handlers/dom.ts:114 后`:
```ts
const autoUnobscure = args.autoUnobscure !== false;  // 默认 true
// click probe 检测到 occlusion → 自动 scrollIntoView 中心 + 重新 probe + retry
if (occlusionDetected && autoUnobscure) {
  el.scrollIntoView({ block: "center", inline: "center" });
  // 等待 50ms 让动画完成
  await new Promise(r => setTimeout(r, 50));
  // 重新 probe
  return retryClick();
}
```

**优点:** 0 用户感知;**缺点:** 默认行为变更,可能掩盖"真遮挡"问题(弹层遮罩等应真报错)。

### 方案 C:observe 阶段标记 popper,observe 输出加 [popper] 标志

`packages/extension/src/handlers/observe.ts` observe 阶段:
```ts
// 检测 react-virtuoso / popper / 动画层,在 ref 输出后加 [popper] 提示
if (isReactVirtuosoContainer(el)) {
  ref.hint = "[popper]";  // 提示调用方这是动画容器内 ref
}
```

调用方看到 `[popper]` 提示 → 知道要用 `force: true` 或 `useRealMouse: true`。**优点:** 语义清晰;**缺点:** 仍需用户理解 hint,文档化要求高。

### 5.x 风险点

- 方案 A 改 click 核心逻辑,需大量回归(京东 + 淘宝 + element-plus 各场景)
- 方案 B 默认行为变更,需评估"真遮挡"场景(如弹层遮罩点透)
- 方案 C 0 运行时风险,但需文档 + 用户学习

### 5.y 推荐组合

**方案 A 单独实施**(最小代码变更 + 精准处理 react-virtuoso 类动画层),Phase 8 评估是否叠加方案 B。

---

## 6. 优先级与工作量

- **优先级:** 🟠 P1(评测 1 步降级,但不阻断,影响 5.x 加购 + 4.x 评价两阶段)
- **工作量:** 0.5d(方案 A:dom.ts 加 isTransient 检测 + 2-3 个 fixture 验证)
- **验收:**
  1. 京东家电 + 服饰 react-virtuoso 列表内 `vortex click` 一次成功
  2. 淘宝 N0059-V4 fixture 全场景无回归
  3. 真实遮挡场景(京东物流弹层遮罩)仍正常报 ELEMENT_OCCLUDED
  4. 跑 `pnpm test` 793 全量无回归

**对应 N0060-V4 行动项:** Phase 7 P1
