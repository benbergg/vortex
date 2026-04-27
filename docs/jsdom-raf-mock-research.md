# jsdom RAF + elementFromPoint Mock 可行性调研

**任务**：T2.2.5（PR #2 技术预研）
**日期**：2026-04-27
**结论**：**可行**，但 elementFromPoint 需用 `Object.defineProperty` 注入（非 monkey-patch 直接赋值）

---

## §1 RAF Mock（vi.useFakeTimers）

### 实测结论

**可行**。vitest 2.1.9 的 `vi.useFakeTimers` 能成功 fake `requestAnimationFrame`。

- 测试环境：vitest 2.1.9 + jsdom（vite-plugin-vitest 默认环境）
- 方式：`vi.useFakeTimers({ toFake: ["requestAnimationFrame", "setTimeout", "Date"] })`
- 行为：`vi.advanceTimersByTime(50)` 触发所有已调度的 RAF 回调（N ≥ 2 帧 in 50ms）
- 结果：测试通过 ✓

### 实施细节

vitest v2.x 默认 `toFake` 列表已包含 `requestAnimationFrame`，无需显式列出。
若只 fake RAF 和 Date 可写：

```typescript
vi.useFakeTimers(); // 全部 fake，包含 RAF
// 或显式列出（等效）
vi.useFakeTimers({ toFake: ["requestAnimationFrame", "setTimeout", "Date"] });
```

推进帧：

```typescript
vi.advanceTimersByTime(50); // 触发约 3 帧（每帧 ~16ms）
// 或精确触发指定帧数：
vi.runAllTimers();
```

每次 `requestAnimationFrame(cb)` 注册的回调，都会在 `advanceTimersByTime` 推进足够时间后被调用。

### 与真实 Chrome 的行为差异

| 行为 | 真实 Chrome | jsdom fake RAF |
|---|---|---|
| 帧率 | VSync 驱动（60fps / 约 16.67ms） | 由 `advanceTimersByTime` 控制，无帧率概念 |
| 回调时序 | 在浏览器绘制管线中执行 | 同步执行（在推进时间时立即调用） |
| DOMHighResTimeStamp | 精确时钟 | 由 fake Date 控制 |
| 帧跳过（< 15ms） | Playwright 有 WebKit bug 规避 | 不存在，所有帧都会触发 |

**结论**：fake RAF 足以测试 stable 轮询逻辑的"计数是否正确递增"，但无法测试真实帧率下的时序敏感行为。bench 双轨（jsdom 单元测试 + Chrome E2E 基准）可缓解该差异。

---

## §2 elementFromPoint Mock

### 实测结论

jsdom **没有实现** `elementFromPoint`——该属性为 `undefined`，不是返回 `null`，而是完全不存在。
可通过 `Object.defineProperty` 注入，注入后行为正常，可用于 OBSCURED 测试。

```typescript
// 实测：
typeof dom.window.document.elementFromPoint // "undefined"（不是函数，也不是返回 null）

// 注入方式（推荐 defineProperty，避免严格模式赋值报错）：
Object.defineProperty(document, "elementFromPoint", {
  value: (_x: number, _y: number): Element | null => targetElement,
  writable: true,
  configurable: true,
});
```

### 适用场景

I6（OBSCURED）测试需要模拟 `elementFromPoint` 返回遮挡元素，注入后可正常使用：

```typescript
// Test setup pattern for I6 OBSCURED:
const blocker = document.createElement("div");
Object.defineProperty(document, "elementFromPoint", {
  value: (_x: number, _y: number) => blocker, // 遮挡元素
  writable: true,
  configurable: true,
});
```

### `elementsFromPoint`（plural）

spec §1.4 ReceivesEvents 使用 `root.elementsFromPoint`（复数），返回数组。
jsdom 同样**未实现**该方法。vortex 简化实现使用 `document.elementFromPoint` 单层（spec §5 已明确注明 shadow DOM 精度限制），注入模式与 `elementFromPoint` 相同。

---

## §3 风险点

### 3.1 真实 Chrome 行为差异

- **RAF 时序**：fake timer 推进是同步的，真实 Chrome 的 RAF 受 VSync 影响。单元测试只验证逻辑正确性，不验证真实帧率。
- **elementFromPoint 精度**：真实 Chrome 考虑 z-index、pointer-events、视口裁剪等，jsdom 注入的 mock 只能模拟预设场景。
- **Shadow DOM 穿透**：`elementsFromPoint` 在真实 Chrome 中可穿透 shadow root，jsdom 的单层 mock 无法覆盖该场景。

### 3.2 bench 双轨缓解策略

单元测试（jsdom + fake timers）验证逻辑分支，不验证实际性能和 DOM 精度。
Chrome E2E 基准（bench 套件）验证真实环境下的端到端行为。
两者互补，不引入 Puppeteer 以保持轻量。

### 3.3 不引 Puppeteer

调研确认不需要 Puppeteer。fake timer + defineProperty 已足够覆盖 I5 / I6 测试用例的逻辑验证。

---

## §4 实施约束（T2.3a/b 必须遵守）

### 4.1 page-side IIFE（actionability.ts）

Stable 判定在 page-side IIFE 内通过真实 `requestAnimationFrame` 实现。
jsdom 测试通过 fake timer 模拟，**不在 page-side 代码中引入 setTimeout 降级**：

```typescript
// page-side/actionability.ts（运行在 Chrome 页面上下文）
function waitStable(el: Element, rafCount = 1): Promise<void> {
  return new Promise((resolve, reject) => {
    let stableFrames = 0;
    let lastRect = el.getBoundingClientRect();

    const tick = () => {
      const rect = el.getBoundingClientRect();
      const stable =
        rect.top === lastRect.top &&
        rect.left === lastRect.left &&
        rect.width === lastRect.width &&
        rect.height === lastRect.height;

      if (stable) {
        stableFrames++;
        if (stableFrames >= rafCount) return resolve();
      } else {
        stableFrames = 0;
        lastRect = rect;
      }
      requestAnimationFrame(tick); // 真实 RAF，页面上下文
    };

    requestAnimationFrame(tick);
  });
}
```

### 4.2 host-side orchestration（actionability.ts）

host-side 通过 `pageQuery` 调用 page-side IIFE，不在 host-side 重新实现 RAF 逻辑。
如需 host-side 侧的定时（如超时控制），使用 `setTimeout`（可被 fake timer 覆盖）。

### 4.3 测试环境 fake timer 使用

```typescript
beforeEach(() => {
  vi.useFakeTimers(); // fake RAF + setTimeout + Date
});

afterEach(() => {
  vi.useRealTimers();
});

// 推进 RAF 帧：
vi.advanceTimersByTime(50); // 触发约 3 帧

// elementFromPoint 注入（每个测试独立 setup/teardown）：
const originalEFP = (document as any).elementFromPoint;
Object.defineProperty(document, "elementFromPoint", {
  value: mockFn,
  writable: true,
  configurable: true,
});
// ... test body ...
// restore:
Object.defineProperty(document, "elementFromPoint", {
  value: originalEFP,
  writable: true,
  configurable: true,
});
```

### 4.4 Stable 判定严格相等

使用严格 `===` 比较（非 `< 1px` tolerance），与 Playwright 实际实现一致（§7.2）。
固定 1 次 RAF 周期（Chromium CDP 环境，`stableRafCount = 1`）。

---

## §5 实测数据

| 项目 | 结果 |
|---|---|
| vitest 版本 | 2.1.9 |
| vi.useFakeTimers RAF fake | **成功** ✓ |
| jsdom elementFromPoint 默认行为 | **不存在**（`typeof === "undefined"`，不是 `null`） |
| Object.defineProperty 注入 | **成功** ✓ |
| 研究测试通过数 | 3/3 ✓ |
