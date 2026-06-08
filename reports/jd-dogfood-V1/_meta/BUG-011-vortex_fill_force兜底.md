# BUG-011: `vortex_fill` 在 sticky 搜索栏触发 `NOT_STABLE` 时缺 `force` 兜底

**Author:** qingwa
**Date:** 2026-06-08
**Status:** ✅ 已修复 (方案 A + B 均已实施)
**严重度:** 🟠 P1
**修复 commit:** `5d8dbf4` (V4 修复 `3fb0ee3` + 本次方案 B)
**相关 Phase:** Phase 1.x 搜索入口
**评测来源:** `reports/jd-dogfood-V1/3C/03-阶段1-搜索入口.md` (D4 ⚠️ navigate 兜底) + `家电/03-...` + `服饰/03-...` + `京东独有/JD-UNI-02-延保服务SKU.md`
**参考:** BUG-009 全闭环模板见 `_meta/P1-1京东根因诊断.md` 6 节 300 行

---

## 1. 现象

**关键观察:**

- 京东顶部 sticky 搜索栏下 `vortex_fill` 触发 **`NOT_STABLE`**(元素正在 transition / animation)
- `vortex_fill` **不支持 `force` 选项**(对比 `vortex_act click` 已支持 `force`,见 dom.ts:114)
- 3 品类(3C / 家电 / 服饰)阶段 1 **100% 复现**
- 评测统一用 `vortex_navigate("https://search.jd.com/Search?keyword=...")` URL 构造兜底
- 京东匿名用户搜索栏是 **React 受控 input**,`evaluate` 直接设 `el.value` 不同步 React state(需要 native value setter)

**数据引用:**
- `3C/03-阶段1-搜索入口.md` D4 ⚠️:vortex_fill NOT_STABLE → navigate URL 兜底
- `家电/03-阶段1-搜索入口.md` D4 ⚠️:同上
- `服饰/03-阶段1-搜索入口.md` D4 ⚠️:同上
- `京东独有/JD-UNI-02-延保服务SKU.md`:延保服务 SKU 选择器也是 sticky 容器内,同样 NOT_STABLE

---

## 2. 复现 fixture

**真站复现 URL:** `https://www.jd.com/` (首页 sticky 搜索栏)

**复现命令:**
```
vortex_navigate("https://www.jd.com/")
vortex_wait_for(time=1)
vortex_observe(scope="viewport")  # 找搜索框 ref
vortex_fill(selector="input#keyword", value="iPhone 16")
# → NOT_STABLE (sticky bar transition)
# 评测兜底:
vortex_navigate("https://search.jd.com/Search?keyword=iPhone+16")
```

**本地 fixture:** `playground/public/jd-sticky-search.html`(带 sticky 搜索栏 + transition animation 的简化 SPA)

---

## 3. 代码定位

### 3.1 vortex_fill 不支持 force 参数

`packages/extension/src/handlers/dom.ts:558-581` —— `[DomActions.FILL]` handler
- **当前签名**:`vortex_fill(selector, value, { fallbackToNative?: boolean })`
- `fallbackToNative` 走 raw `HTMLInputElement.value` 赋值路径(京东 React 受控 input 不适用)
- **缺** `force` 选项(对比 `vortex_act click` 已支持 `args.force`,见 dom.ts:114)
- 已有 V4 修复 commit `518d500` P1-2:`NOT_STABLE` 错误码 hint 在 sticky/fixed+transition 容器**显式建议 force=true 兜底** —— 但**没有真正实现 force 选项**

### 3.2 waitActionable 的 force 实现已存在

`packages/extension/src/page-side/actionability.ts` —— `waitActionable(tid, frameId, selector, { force })`
- `force=true` 时跳过稳定性检查(sticky/transition 容器直接放行)
- **fill handler 没透传 force 给 waitActionable**

### 3.3 评测兜底:URL 构造

`reports/jd-dogfood-V1/3C/03-阶段1-搜索入口.md` 实测:
```
vortex_navigate("https://search.jd.com/Search?keyword=iPhone+16")
```
直接绕过搜索框交互。**评测可继续但有副作用**:无法测试搜索框的"联想词下拉"等子特性。

---

## 4. 根因

**逻辑链:**

1. 京东首页 sticky 搜索栏使用 `position: sticky` + 滚动时 `transition: top 0.3s`
2. vortex_fill → waitActionable 默认要求元素"几何稳定 100ms 无变化"
3. transition 中元素 y 坐标在变 → NOT_STABLE
4. vortex_fill handler **没透传 force 选项给 waitActionable**(对比 click handler 已透传)
5. `fallbackToNative` 是另一条路径(走 raw value setter)与 force 不同

**为什么 V4 修复不完全:** `518d500` 只在 NOT_STABLE 错误 hint 加了 "force=true 建议",但**没有给 fill 工具加 force 参数**。hint 没用 —— 用户就算知道加 force,API 也不支持。

---

## 5. Patch 草稿

### 方案 A(推荐):vortex_fill 补 force 参数 + 透传到 waitActionable

`packages/extension/src/handlers/dom.ts:558-581`:
```ts
[DomActions.FILL]: async (args, tabId) => {
  const __t = resolveTarget(args);
  const selector = __t.selector;
  const fallbackToNative = args.fallbackToNative === true;
  const force = args.force === true;  // ← 新增
  // ...
  // L2 integration: actionability + auto-wait pre-check
  await waitActionable(tid, frameId, selector, {
    timeout: (args.timeout as number | undefined) ?? 5000,
    needsEditable: true,
    force,  // ← 透传
  });
  // ...
}
```

**调用方:**
```ts
vortex_fill({ selector: "input#keyword", value: "iPhone 16", force: true })
```

### 方案 B:vortex_fill 检测到 NOT_STABLE 时自动 force 重试(默认行为变更)

`packages/extension/src/handlers/dom.ts` waitActionable 后:
```ts
try {
  await waitActionable(tid, frameId, selector, { ..., force: false });
} catch (err) {
  if (err.code === "NOT_STABLE" && !args.force) {
    // 自动 force 重试一次
    await waitActionable(tid, frameId, selector, { ..., force: true });
  } else throw err;
}
```

**优点:** 用户无感,**默认兼容**;**缺点:** 默认行为变更,可能掩盖"真的不稳定"问题(京东 transition 完了就该 OK,本就是有效重试)。

### 方案 C:新增 vortex_evaluate_fill(用 evaluate + native setter 兜底)

新工具:
```ts
vortex_evaluate_fill({ selector: "input#keyword", value: "iPhone 16" })
// 走 React native value setter 路径(同 dom.ts:480 注释)
const nativeSetter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype, "value"
)!.set!;
nativeSetter.call(el, value);
el.dispatchEvent(new Event("input", { bubbles: true }));
el.dispatchEvent(new Event("change", { bubbles: true }));
```

**优点:** 100% 兼容 React 受控 input;**缺点:** 新工具,需 MCP schema 扩展 + 文档。

### 5.x 风险点

- 方案 A 风险最小(只加 1 个透传,语义清晰)
- 方案 B 风险:可能掩盖"真的不稳定"场景(如页面 JS 持续改 input value)
- 方案 C 风险:新工具维护成本 + 用户学习成本

### 5.y 推荐组合

**方案 A + 方案 B**:fill 加 force 参数(显式)+ NOT_STABLE 自动 force 重试 1 次(默认兜底)。N0060 评测可全部去掉 `vortex_navigate` 兜底。

---

## 6. 优先级与工作量

- **优先级:** 🟠 P1(评测 100% 走 navigate 兜底,失去搜索框交互测试)
- **工作量:** 0.3d(方案 A 0.1d,方案 B 0.2d)
- **验收:**
  1. 京东 3 品类首页 `vortex_fill` sticky 搜索框,默认 1 次重试成功
  2. 用户显式 `force: true` 直接跳过稳定性检查
  3. NOT_STABLE 错误码仅在 5s 内**两次都失败**时抛出(避免静默重试)
  4. 跑 `pnpm test` 793 全量无回归
  5. 跑 N0059-V4 fixture 确认淘宝搜索框(非 sticky)无回归

**对应 N0060-V4 行动项:** Phase 7 P1
