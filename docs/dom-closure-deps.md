# dom.ts 闭包依赖分析（PR #1 输入）

**源文件**：`packages/extension/src/handlers/dom.ts`（v0.5.0，2233 行）
**入口**：`registerDomHandlers(router, debuggerMgr)` (L14-L1453)
**产出 Task**：T1.2.5（PR #1 内部 task，T1.6/T1.7 实施前置必读）
**分析方法**：
1. 入口函数体范围 = L14-L1453（`registerAll({...})` 大对象字面量）
2. grep 函数体内 2-空格缩进的 `let` / `const` 声明
3. grep 参数 `router` / `debuggerMgr` 全部引用
4. grep 潜在共享状态（`Map` / `Set` / `Observer` / `inflight`）
5. 每个共享变量决定 PR #1 处理策略

---

## 1. 共享变量清单

| 变量 | 类型 | 来源 | 引用位置（绝对行号） | 引用数 | PR #1 处理策略 | 归属 |
|------|------|------|---------------------|--------|----------------|------|
| `router` | `ActionRouter` | 入口参数（L15） | L18 `router.registerAll({...})` 一处 | 1 | **不动**：仅注册壳用，拆分后由新 entry 文件统一调用各模块的 `registerXxxHandlers(router, ...)` | 上提（路由注册壳保留在 entry） |
| `debuggerMgr` | `DebuggerManager` | 入口参数（L16） | L188-196（CLICK useRealMouse 分支：`attach` + 3× `sendCommand`）；L961 / L975 / L988（传给 3 个 driver 的 opts） | 4 处 | **显式注入**：3 个 top-level driver 已是 `opts.debuggerMgr` 形式（L1475 / L1871 / L2025 类型字段，参见下表）；CLICK useRealMouse 分支抽 `cdpClickElement(tid, frameId, x, y, debuggerMgr)` 时显式新增 1 个参数 | 注入（CdpAdapter） |

**结论**：闭包共享变量 = **2 个**（且都是入口参数，无 `let` / `const`）。

---

## 2. 顶层 let / const 状态扫描

```
$ awk 'NR>=14 && NR<=1453' packages/extension/src/handlers/dom.ts | grep -nE "^  (let|const) "
(空)
```

`registerDomHandlers` 函数体内 **零** 个 2-空格缩进的 `let` / `const` 声明。所有 `const` / `let` 都嵌套在 handler 内部（4-空格及更深缩进）或 `chrome.scripting.executeScript` 的 page-side `func` 内。

- ✅ **无 module-level 状态需上提**
- ✅ **无 closure 状态需重构为 RefStore**
- ✅ **无 cache / observer / inflight requests / queue / registry** 等隐藏共享状态

---

## 3. 潜在共享状态扫描（已排除）

| 模式 | 命中位置 | 真实位置 | 是否闭包 |
|------|---------|---------|---------|
| `new MutationObserver` | L810 / L886 | `chrome.scripting.executeScript` 的 `func: ...` 体内（page-side） | 否（page-side serialized） |
| `new Set(...)` | L1249 | 同上（page-side `func`） | 否 |
| `function pageQuery<T>` | L1494 / L1883 / L2040 | 3 个 driver 函数内部 local 声明（每个独立） | 否（局部 helper） |
| `Map` / `WeakMap` / `WeakSet` / `inflight` / `pending` / `queue` / `registry` | 无命中 | — | — |

---

## 4. 模块级 import / 函数引用（非闭包，仅供 T1.6/T1.7 拆分时定位）

`registerDomHandlers` body 内还引用了以下模块级符号（直接 import，不是闭包）：

- `DomActions`, `VtxErrorCode`, `vtxError`（`@bytenew/vortex-shared`）
- `getActiveTabId`, `buildExecuteTarget`（`../lib/tab-utils.js`）
- `getIframeOffset`（`../lib/iframe-offset.js`）
- `resolveTarget`, `resolveTargetOptional`（`../lib/resolve-target.js`）
- `FILL_REJECT_PATTERNS`, `findDriver`, `COMMIT_DRIVERS`, `CommitKind`（`../patterns/index.js`）
- 同文件内：`runDateRangeDriverCDP` (L1467) / `runCascaderDriverCDP` (L1864) / `runTimePickerDriverCDP` (L2018) / `parseYMDLocal` (L1461)

这些拆分时按 import 处理即可，**不属于闭包依赖**。

---

## 5. 3 个 CDP driver 的现状（已是显式参数，无需重构）

| 函数 | 位置 | 签名是否含 `debuggerMgr: DebuggerManager` | PR #1 处理 |
|------|------|------------------------------------------|-----------|
| `runDateRangeDriverCDP` | L1467-L1858 | ✅ `opts.debuggerMgr`（L1475 类型字段，L1477 解构） | 整体迁到 `cdp-drivers/daterange.ts`，签名不变 |
| `runCascaderDriverCDP` | L1864-L2011 | ✅ `opts.debuggerMgr`（L1871 / L1873） | 整体迁到 `cdp-drivers/cascader.ts`，签名不变 |
| `runTimePickerDriverCDP` | L2018-L2233 | ✅ `opts.debuggerMgr`（L2025 / L2027） | 整体迁到 `cdp-drivers/time-picker.ts`，签名不变 |

3 个函数都是「自包含」（每个都 local 声明 `pageQuery`、`sleep` 等 helper），直接 cut/paste 即可，闭包风险 = 0。

---

## 6. CLICK useRealMouse 分支抽函数提案（PR #1 唯一新增点）

L188-196 是当前 dom.ts 内**唯一**直接调用 `debuggerMgr.attach + sendCommand` 的 inline 闭包代码。T1.6 将抽为 CdpAdapter 方法：

```ts
// adapter/cdp-adapter.ts (CdpAdapter 接口已在 T1.2 骨架定义)
async clickAtPoint(tid: number, x: number, y: number): Promise<void> {
  await this.debuggerMgr.attach(tid);
  await this.debuggerMgr.sendCommand(tid, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await this.debuggerMgr.sendCommand(tid, "Input.dispatchMouseEvent", {
    type: "mousePressed", x, y, button: "left", clickCount: 1,
  });
  await this.debuggerMgr.sendCommand(tid, "Input.dispatchMouseEvent", {
    type: "mouseReleased", x, y, button: "left", clickCount: 1,
  });
}
```

CLICK handler 改调 `cdpAdapter.clickAtPoint(tid, x, y)`，闭包对 `debuggerMgr` 的依赖即可消除。

---

## 7. PR #1 风险评估

| 风险维度 | 评估 | 说明 |
|---------|------|------|
| 闭包破坏作用域 | **极低** | 仅 2 个共享变量，且都是入口参数（不是 `let` / `const`） |
| 隐藏 cache / state | **无** | 全文 0 处 `Map` / `WeakMap` / `inflight` / `registry` |
| MutationObserver 跨模块共享 | **无** | 全部 page-side serialized，不跨闭包 |
| 函数签名爆炸（`debuggerMgr` 在多调用链反复传递） | **低** | 3 个 driver + CLICK 分支共 4 处调用，CdpAdapter 注入后归一 |
| `router` 注册壳拆分 | **无** | 拆分后改 export 多个 `register*Handlers(router, deps)`，由 entry 顺序调用 |

**总评**：PR #1 闭包风险 = **低**。无需 factory pattern，无需 RefStore，无需上提 module-level state。`debuggerMgr` 是唯一共享，3 处已是显式参数（保持），1 处（CLICK useRealMouse）抽 `CdpAdapter.clickAtPoint` 后即统一。

---

## 8. page-side 嵌套 helper（不属本分析范围）

详见 `dom-migration-map.md` §B.2。`chrome.scripting.executeScript` 的 `func: ...` 体内的所有局部函数 / `MutationObserver` / 等，因 V8 序列化限制 **不可能跨闭包提取**，PR #1 全部保留 page-side 内联。

---

## 9. 自检命令

```bash
# 函数体内 debuggerMgr 引用应为 8 处（4 个使用 + 注释 + 类型字段不算）
awk 'NR>=14 && NR<=1453' packages/extension/src/handlers/dom.ts | grep -c "debuggerMgr"
# 实际：8（L188-196 共 4 行 + L961/L975/L988 共 3 行 + L16 参数声明 1 行）

# router 引用应为 2 处（参数 + registerAll）
awk 'NR>=14 && NR<=1453' packages/extension/src/handlers/dom.ts | grep -c "router"
# 实际：2

# 函数体内顶层 let / const 应为 0
awk 'NR>=14 && NR<=1453' packages/extension/src/handlers/dom.ts | grep -cE "^  (let|const) "
# 实际：0
```

---

## 10. 后续 v0.7 优化建议（不在 PR #1 范围）

若 v0.7 希望简化签名（避免 `debuggerMgr` 在 driver 调用链反复传递），可改 factory：

```ts
// v0.7 建议
const cdpDrivers = createCdpDrivers(debuggerMgr);
// → cdpDrivers.runDateRange({ tid, frameId, ... })  // 不再传 debuggerMgr
```

或将 3 个 driver 全部内化为 `CdpAdapter` 方法，调用方直接 `cdpAdapter.runDateRange(...)`。

本 PR 暂不引入，因 3 个 driver 当前签名已正常工作且稳定。
