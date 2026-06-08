# BUG-010: 京东商品卡无显式 `<a>` 详情链接(React 重写后靠 `firstCard.onclick`)

**Author:** qingwa
**Date:** 2026-06-08
**Status:** ✅ 已修复 (方案 A + B 均已实施)
**严重度:** 🟠 P1
**修复 commit:** `fd1a5b9` (方案 A) + `?` (方案 B)
**相关 Phase:** Phase 2.x 列表浏览
**评测来源:** `reports/jd-dogfood-V1/3C/04-阶段2-列表浏览.md` (D3 ⚠️ mouse_drag 1 步降级) + `家电/04-...` + `服饰/04-...`
**参考:** BUG-009 全闭环模板见 `_meta/P1-1京东根因诊断.md` 6 节 300 行

---

## 1. 现象

**关键观察:**

- 京东新搜索页 React 重写后,**商品卡内只有 1 个 `<a>`(客服图标) + 1 个 `<button>`(加购车)**,**无显式详情链接**
- 详情跳转靠 `firstCard.onclick` —— JS 事件监听绑在容器 div 上,**没有 href**
- 评测实测:`element.click()` 调用不能触发 React 跳转(`function kd(){}` 是 React 桩函数)
- **必须真实 mouse 事件**:`vortex_mouse_drag(卡片中心 → 卡片中心)` 验证可触发
- 跨品类 **100% 复现**:3C / 家电 / 服饰 的 hash class `_card_1fqso_83` 完全相同(同 React 应用)
- D3 主路径 1 步降级:从 `vortex_act click` 降到 `vortex_mouse_drag`,评测可继续

**数据引用:**
- `3C/04-阶段2-列表浏览.md` D3 ⚠️:vortex_act click 失败 → vortex_mouse_drag 1 步降级成功
- `家电/04-阶段2-列表浏览.md` D3 ⚠️:同上
- `服饰/04-阶段2-列表浏览.md` D3 ⚠️:同上

---

## 2. 复现 fixture

**真站复现 URL:** `https://search.jd.com/Search?keyword=iPhone+16`

**复现命令:**
```
vortex_navigate("https://search.jd.com/Search?keyword=iPhone+16")
vortex_wait_for(value='document.querySelectorAll("[class*=\"_card_\"]").length >= 20')
vortex_observe(scope="viewport", filter="all")  # 可见 6 个商品卡
# 拿第一卡 ref → vortex_act click → 跳转失败 (no React onClick 桩)
vortex_mouse_drag(firstCardCx, firstCardCy, firstCardCx, firstCardCy)  # 真实 mouse down+up 兜底成功
```

**本地 fixture(若需):** `playground/public/jd-search-list-react-rewrite.html`(模拟 React 重写后无 `<a>` 详情链接的卡)

---

## 3. 代码定位

### 3.1 vortex_act click 失败原因(react onClick 桩识别)

`packages/extension/src/handlers/dom.ts:101-294` —— `DomActions.CLICK` handler
- 走 `el.click()` 路径(非 `useRealMouse` / 非 `trustedMode`):合成 click 事件 `isTrusted=false`
- 京东 React 18 root delegation **丢弃 isTrusted=false 的 click 事件**(onClick 桩函数 `kd()` 不被调用)
- 同问题已知:淘宝搜索提交按钮(同 dom.ts:229 注释)

### 3.2 vortex_mouse_drag 兜底成功原因

`packages/extension/src/handlers/mouse.ts` —— CDP `Input.dispatchMouseEvent` 真实 mouse 事件
- `mouseMoved` + `mousePressed` + `mouseReleased` 序列
- `isTrusted=true`,React 桩函数被调用
- 已有 V4 修复 BUG-008 同款机制(observe 补抓淘宝 sticky bar div CTA)

### 3.3 observe 已识别卡 ref,只是 click 不触发

`packages/extension/src/handlers/observe.ts:340-369` —— `iconNameFromClass` 智能翻译 `<img alt>` 为可读 ref
- 京东 `_card_1fqso_83` div 被识别为可读 ref(整卡文本拼接)
- D1 ✅ 识别通过;D3 click 失败

---

## 4. 根因

**逻辑链:**

1. 京东商品卡 DOM 结构:`<div class="_card_...">` 容器 → 内部 `<a>`(客服,跳 chat.jd.com)+ `<button>`(加购,弹层) + 无详情链接
2. 整卡 div 上 React 注册 `onClick={kd()}` —— 桩函数,**没有 href 也不走 `<a>` click 路径**
3. vortex_act click 默认走 `el.click()` 合成,**isTrusted=false**,React 18 root delegation 拦截
4. 真实 mouse 事件(`vortex_mouse_drag` 模拟 mousePressed/Released)能触发 React onClick 桩
5. **这不是"找不到 ref",而是"ref 找到了但 click 路径不通"**

**为什么 BUG-009 修复没用:** P1-1 修复(`observe.ts:605-608` textContent 含商品特征)处理"整卡是 `<a>` 含 textContent"场景;京东整卡是 `<div>`,无 textContent 商品特征,需走另一个分支。

---

## 5. Patch 草稿

### 方案 A(推荐):observe 暴露 `onclick + cursor:pointer` 的 div 为可点击 ref

`packages/extension/src/handlers/observe.ts` observe 阶段加 gate:

```ts
// observe.ts: 在 element probes 阶段追加
const hasReactClick = el.onclick != null
  || el.getAttribute("onclick") != null
  || getComputedStyle(el).cursor === "pointer";
if (hasReactClick && !isContainer) {
  // 标记为可点击 ref(本就是 ref,只是 click 路径需走真实 mouse)
  el.dataset.vortexReactClickable = "1";
}
```

调用方在 `vortex_act click` 之前检测 `data-vortex-react-clickable="1"` → 自动切换到 CDP `Input.dispatchMouseEvent` 路径(等价 `useRealMouse=true`)。**不需新增工具**。

### 方案 B:vortex_act click 增加 auto_real_mouse 兜底

`packages/extension/src/handlers/dom.ts:114` `waitActionable` 后追加:

```ts
// dom.ts:114 后
if (!useRealMouse && !trustedMode) {
  const probe = await chrome.scripting.executeScript({
    func: (sel: string) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) return null;
      const hasReactClick = el.onclick != null
        || el.getAttribute("onclick") != null;
      return hasReactClick ? "react-clickable" : "plain";
    },
    args: [selector],
  });
  if (probe[0]?.result === "react-clickable") {
    // 自动 fallback 到 CDP real mouse
    return await cdpClickElement(debuggerMgr, tid, frameId, selector);
  }
}
```

**优点:** 用户无需手动加 `useRealMouse=true`;**缺点:** 默认行为变更,可能影响其他场景(需回归淘宝)。

### 方案 C:文档化 mouse_drag 兜底

`_meta/BUG-010-京东商品卡无ref.md` 末尾加 "评测最佳实践:遇到 React 重写 SPA 卡 + 无 `<a>` 详情链接,统一用 `vortex_mouse_drag(refX, refY, refX, refY)` 兜底"。**0 代码变更**,P1-1 修复路径沿用 N0059-V4 mouse_drag 模式。

### 5.x 风险点

- 方案 A 改 observe 阶段,需回归淘宝(N0060-V4 评测集)、京东 3 品类 fixture
- 方案 B 改 click 默认行为,可能误触发其他 React 应用走 CDP 路径(性能/兼容性影响)
- 方案 C 0 风险,但要求评测者读文档

### 5.y 推荐组合

**方案 A + 方案 B** 同步:observe 标注 → click 自动 fallback。最小变更(observe 加 1 gate,click 加 1 检测) + 用户无需改评测脚本。

---

## 6. 优先级与工作量

- **优先级:** 🟠 P1(工作流阻断,需 mouse_drag 1 步降级)
- **工作量:** 0.5d(observe.ts + dom.ts 各 1 处 gate + 1 处检测)
- **验收:**
  1. 京东 3 品类列表页 `vortex_act click firstCard` 直接成功(无 mouse_drag 降级)
  2. 淘宝 N0059-V4 fixture 全场景无回归(observe 输出结构、click 路径不变)
  3. 跑 `pnpm test` 793 全量无回归

**对应 N0060-V4 行动项:** Phase 7 P1
