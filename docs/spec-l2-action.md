# L2 Action 层实施细节 spec（PR #2 输入）

**消费者**：T2.3a / T2.3b / T2.4 / T2.5 / T2.6 实施。
**参考**：Playwright `packages/injected/src/injectedScript.ts` + `packages/playwright-core/src/server/dom.ts`（commit hash: a6786ebed5b964f06af325bc3e7f7dd3a931f60c）。

## 1. Actionability 6 项判定

### 1.1 Attached
判据：`element.isConnected === true`
失败码：`NOT_ATTACHED`
处方：re-observe 重新拿 ref（L3 重定位）

### 1.2 Visible
判据（Playwright 实际实现）：
1. `element.checkVisibility()` 返回 false（覆盖 `content-visibility`、`details[open]` 等，优先使用；WebKit 有 bug 退化到手动检查）
2. `getComputedStyle(el).visibility !== 'visible'`（包含 hidden / collapse 等）
3. `getBoundingClientRect()` 宽或高为 0

注意：Playwright **不使用** `offsetParent === null` 作为主判据；`opacity === 0` 也不在 `isElementVisible` 判定范围内（opacity 不影响 checkVisibility）。`display:contents` 元素递归检查子节点可见性。

失败码：`NOT_VISIBLE`
处方：等可见 / re-observe

### 1.3 Stable
判据（Playwright 实际实现）：
连续 `stableRafCount` 次（Chromium/Firefox 默认 = 1，WebKit Win = 5）`requestAnimationFrame` 回调之间 `getBoundingClientRect()` 的 `{top, left, width, height}` 完全相等（严格 `===`，非 `< 1px`）。
帧间距 < 15ms 的帧被跳过（WebKit Win 的 bug 规避）。

失败码：`NOT_STABLE`
处方：等动画结束（Auto-wait 内部继续 RAF polling）

### 1.4 ReceivesEvents
判据（Playwright 实际实现）：
使用 `root.elementsFromPoint(x, y)` + shadow DOM 树遍历（不是简单的 `document.elementFromPoint`）：
- 对每一层 ShadowRoot 调用 `elementsFromPoint`，逐层比较命中元素
- 最终 `hitElement` 须等于 `targetElement` 或其祖先（通过 `assignedSlot ?? parentElementOrShadowHost` 向上追溯）
- 命中失败 → 返回 `{ hitTargetDescription }` 标识遮挡元素

失败码：`OBSCURED`
处方：报"元素被 <blocker> 遮挡" + extras { blocker }

### 1.5 Enabled
判据（Playwright 实际实现）：`getAriaDisabled(element)` 返回 true 则禁用，分两部分：

**原生禁用**（`isNativelyDisabled`）：
- 元素为 BUTTON / INPUT / SELECT / TEXTAREA / OPTION / OPTGROUP 之一
- 且满足：`element.hasAttribute('disabled')` || 属于禁用 OPTGROUP || 属于禁用 FIELDSET
- 禁用 FIELDSET 规则：`element.closest('FIELDSET[DISABLED]')` 命中，且该元素不在 fieldset 的 `> LEGEND` 直接子节点内

**ARIA 禁用**（`hasExplicitAriaDisabled`）：
- 元素具有允许 `aria-disabled` 的 ARIA 角色
- 或其祖先（含 shadow boundary）设置了 `aria-disabled="true"`
- `aria-disabled="false"` 显式终止向上传播

失败码：`DISABLED`
处方：等启用 / 报错

### 1.6 Editable（仅 fill / type）
判据（Playwright 实际实现）：`getReadonly(element)` 或 `getAriaDisabled(element)`，任一为 true 则不可编辑：

- INPUT / TEXTAREA / SELECT：`element.hasAttribute('readonly')`
- 具有 kAriaReadonlyRoles（checkbox、combobox、grid、gridcell、listbox、radiogroup、slider、spinbutton、textbox 等）的元素：`aria-readonly="true"`
- `contenteditable` 元素：始终可编辑（readonly = false）
- 其他元素：抛出 `Element is not an <input>, <textarea>, <select> or [contenteditable]...`

失败码：`NOT_EDITABLE`
处方：报错 + extras { tagName, hasReadOnly }

## 2. Auto-wait 时序

- 默认 timeout: 由 `Progress` 传入（Playwright 框架级默认 30000ms；vortex L2 建议 5000ms，可通过 `act({ options: { timeout: N } })` 覆盖）
- 轮询周期: RAF（约 16ms）；stable 判定在 page-side IIFE 内完成
- **vortex 选用 reason-aware 重试策略**（按失败原因使用不同间隔）：
  - `NOT_ATTACHED` → 立即重试（DOM 可能正在 re-render）
  - `NOT_VISIBLE` → 50ms 间隔（等 CSS transition）
  - `NOT_STABLE` → 1 RAF 间隔（等动画下一帧）
  - `OBSCURED` → 100ms 间隔（等 modal / loading 退出）
  - `DISABLED` → 200ms 间隔（等异步状态更新）
  - `NOT_EDITABLE` → 不重试（语义错误，立即报）
- 参考：Playwright 实际使用固定递进 `waitTime = [0, 20, 100, 100, 500]` ms，不区分失败原因（详见 §7.5）
- timeout 用尽 → 报最后一次失败码，含 extras

## 3. Fallback Chain

| Action | 默认路径 | Fallback 1 | Fallback 2 |
|---|---|---|---|
| click | dispatchEvent (untrusted) | CDP `Input.dispatchMouseEvent` (trusted) | (报 ACTION_FAILED_ALL_PATHS) |
| fill | focus + select-all + type | `element.value = v` + dispatch input | CDP `Input.insertText` |
| type | typing each char with delay | execCommand("insertText") | CDP `Input.insertText` |
| drag | CDP-only | (无 fallback，CDP 不可用直接 DRAG_REQUIRES_CDP) | — |

每层失败 → 用 micro-verify 判定是否真失败（如 dispatchEvent 跑过但 input.value 未变 = framework reject，进 fallback）。

## 4. Micro-verify 矩阵（按 action）

参见设计文档 §5.5。本 spec 不重复，T2.6 实施时按表对应。

## 5. 实施约束

- **page-side 探测代码必须 IIFE 模块**（actionability 6 项放 page-side/actionability.ts，挂 `window.__vortexActionability`）
- **host-side actionability.ts 仅做 orchestration**（loadPageSideModule + pageQuery 调用 6 项）
- **Stable 判定的 RAF 采样**：在 page-side IIFE 内通过 `requestAnimationFrame` 实现（与 Playwright 一致）；jsdom 测试用 fake timer 模拟（host-side 用 `setTimeout(16)` 双次调用作为降级）
- **Visible 判定**：优先 `element.checkVisibility()` API（Chromium/Firefox），WebKit 退化为手动检查 `visibility` + `getBoundingClientRect()`；不使用 `offsetParent === null` 作为主判据
- **ReceivesEvents**：需要处理 Shadow DOM 多层 `elementsFromPoint`，简化实现可用 `document.elementFromPoint` 单层，但需在 extras 中注明 shadow DOM 精度限制
- **Enabled 判定**：vortex 简化为 native disabled（BUTTON/INPUT/SELECT/TEXTAREA/OPTION/OPTGROUP + `hasAttribute('disabled')`）+ aria-disabled（直接属性，不跨 shadow boundary 遍历 ARIA 链）+ fieldset[disabled]（`element.closest('FIELDSET[DISABLED]')`，**不处理** legend 例外）
- **Editable 判定**：vortex 检查对象为 INPUT / TEXTAREA / contenteditable / SELECT；contenteditable 始终视为可编辑（readonly = false）；SELECT 检查 `hasAttribute('readonly')`；不支持 ARIA readonly roles
- **Auto-wait 重试策略**：vortex 选用 reason-aware 策略（详见 §2），Playwright 固定递进 `[0, 20, 100, 100, 500]`ms 仅作历史参考（详见 §7.5）

## 6. 修订记录

| 版本 | 日期 | 来源 |
|---|---|---|
| v1 | 2026-04-27 | T2.0b（Playwright commit a6786ebed5b964f06af325bc3e7f7dd3a931f60c 移植） |

## 7. Playwright 移植偏差

以下是 Playwright 实际代码与原始 spec 模板的差异，实施时以本文档为准：

### 7.1 Visible 判定（差异显著）
- **原始模板**：`offsetParent === null && position !== "fixed"` / `visibility === "hidden"` / `opacity === 0` / `getBoundingClientRect()` 宽高为 0
- **实际 Playwright**：使用 `element.checkVisibility()`（覆盖 content-visibility + flat tree 遍历）+ `visibility !== 'visible'`（含所有非 visible 值）+ `getBoundingClientRect()` 宽高为 0；**不检查 opacity**；`display:contents` 元素递归子节点
- **vortex 建议**：实施时优先 `checkVisibility()`，WebKit 降级手动检查；opacity 不做 actionability 判断

### 7.2 Stable 判定（精度差异）
- **原始模板**：连续 2 个 RAF 差 < 1px
- **实际 Playwright**：严格 `===` 相等（无 tolerance），`stableRafCount` 配置（Chromium/Firefox 默认 1 次，WebKit Win 5 次）
- **vortex 建议**：使用严格 `===` 比较，固定 1 次 RAF 周期（Chromium CDP 环境）

### 7.3 Enabled 判定（更复杂）
- **原始模板**：简单 `element.disabled === true` + `aria-disabled="true"` + `fieldset[disabled]`
- **实际 Playwright**：通过 `getAriaDisabled()` 包含完整 ARIA 继承链（跨 shadow boundary）、OPTGROUP 禁用、FIELDSET legend 例外（fieldset 内 legend 直属子节点不被 fieldset 的 disabled 影响）
- **vortex 建议**：实施时至少覆盖：native disabled + aria-disabled（直接属性）+ fieldset[disabled]（简化，不处理 legend 例外）

### 7.4 Editable 判定（SELECT 纳入）
- **原始模板**：不是 input / textarea / contenteditable 则 NOT_EDITABLE
- **实际 Playwright**：SELECT 也可设 readonly（`hasAttribute('readonly')`），且支持 ARIA readonly roles
- **vortex 建议**：editable 检查对象应包含 SELECT；contenteditable 始终视为可编辑

### 7.5 Auto-wait 重试时序（非 reason-aware）
- **原始模板**：按失败原因使用不同重试间隔（reason-aware）
- **实际 Playwright**：固定递进 `[0, 20, 100, 100, 500]`ms，不区分失败原因
- **vortex 建议**：可选择 reason-aware 策略（对 UX 更友好），也可直接移植 Playwright 的固定递进策略
