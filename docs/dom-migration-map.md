# dom.ts 迁移映射（PR #1 输入）

**源文件**：`packages/extension/src/handlers/dom.ts`（v0.5.0 共 2233 行；唯一 export = `registerDomHandlers`）
**产出**：PR #0 Task 0.5
**消费者**：PR #1（L1 Adapter 拆分）
**目标**：PR #1 完成后 dom.ts ≤ 800 行

## 注册结构观察

dom.ts 不是逐个 `router.register('name', h)`，而是 `router.registerAll({ [DomActions.X]: h, ... })` 一次性注册一个对象字面量（L18-1452）。表中"handler 行号"指定到该 handler 在对象字面量内的起始行。

所有 handler 共享外层闭包 `{ router, debuggerMgr }`。`router` 仅用于 registerAll 调用，handler 内部不引用；`debuggerMgr` 被 4 处 handler/driver 真实使用（CLICK 的 useRealMouse 分支、3 个 top-level CDP driver）。这点决定 PR #1 拆分时跨文件签名形态。

## 目标层定义

| 缩写 | 目标 |
|---|---|
| `L1.native` | `extension/src/adapter/native.ts`（chrome.tabs / chrome.scripting / chrome.storage 调用，含 buildExecuteTarget / pageQuery 包装） |
| `L1.cdp` | `extension/src/adapter/cdp.ts`（chrome.debugger.* 调用，含 dispatchMouseEvent 三连击 clickBBox 模板） |
| `L2` | `extension/src/action/`（actionability / auto-wait / fallback / micro-verify） |
| `L3` | `extension/src/reasoning/`（a11y / descriptor / ref-store） |
| `keep` | 保留 dom.ts（v0.6 暂不迁，作 facade / 内部 helper） |
| `delete` | v0.6 不需要 |

## 关键事实：PR #1 范围裁剪

dom.ts 当前**未实现** L3 reasoning 层的任何能力（无 ax-snapshot / 无 @eN ref / 无 descriptor 计算）—— 这些在 v0.6 是新增能力，不在 PR #1 dom.ts 拆分范围内。所以下表 L3 列保持空。

dom.ts 当前**未实现** L2 的 auto-wait / fallback chain / micro-verify 也几乎为空：仅 WAIT_SETTLED / WAIT_FOR_MUTATION 是 auto-wait 雏形；FILL 的 `fallbackToNative` 是 fallback chain 雏形；COMMIT driver 的"verify 阶段"是 micro-verify 雏形。这些可在 PR #1 一起拆出，但更可能留到 PR #2/#3 实现完整 L2 时再做（PR #1 仅拆 L1 是稳健选择）。

## A. Action Handler 映射（13 个，按 `[DomActions.X]` 注册顺序）

| Action | handler 行号 | 主要能力调用 | 拆分目标 |
|---|---|---|---|
| `QUERY` | L19-53 (35 行) | chrome.scripting.executeScript（page-side querySelector + 抓 attrs） | L1.native |
| `QUERY_ALL` | L55-90 (36 行) | chrome.scripting.executeScript（querySelectorAll slice 100） | L1.native |
| `CLICK` | L92-312 (221 行) | useRealMouse 分支：chrome.scripting + chrome.debugger.attach/sendCommand×3；普通分支：chrome.scripting（含 actionability 探测） | L1.native + L1.cdp（**actionability 探测段抽 L2**） |
| `TYPE` | L314-397 (84 行) | chrome.scripting.executeScript（探测 + KeyboardEvent / InputEvent dispatch） | L1.native（探测段同 CLICK，**抽共享 L2 actionability**） |
| `FILL` | L399-512 (114 行) | chrome.scripting.executeScript（探测 + FILL_REJECT_PATTERNS 框架检查 + native value setter） | L1.native（探测同上；**reject patterns 段属 L2.fallback policy**） |
| `SELECT` | L514-586 (73 行) | chrome.scripting.executeScript（探测 + el.value = val + change event） | L1.native（探测同上） |
| `SCROLL` | L588-668 (81 行) | chrome.scripting.executeScript（容器解析 + scrollIntoView / scrollTo） | L1.native |
| `HOVER` | L670-726 (57 行) | chrome.scripting.executeScript（不查 disabled，dispatch mouseenter/over） | L1.native |
| `GET_ATTRIBUTE` | L728-752 (25 行) | chrome.scripting.executeScript（querySelector + getAttribute） | L1.native |
| `GET_SCROLL_INFO` | L754-797 (44 行) | chrome.scripting.executeScript（scrollTop/Width/clientHeight 读出） | L1.native |
| `WAIT_FOR_MUTATION` | L799-843 (45 行) | chrome.scripting.executeScript（page-side new MutationObserver） | L1.native（语义属 **L2.auto-wait**，但实现 100% page-side MO，PR #1 先迁 L1.native；L2 在后续 PR 包装） |
| `WAIT_SETTLED` | L845-928 (84 行) | chrome.scripting.executeScript（quietMs + MutationObserver） | L1.native（同 WAIT_FOR_MUTATION，语义属 **L2.auto-wait**） |
| `COMMIT` | L930-1451 (522 行) | findDriver(kind) → 路由到 3 个 CDP top-level driver（daterange/datetimerange/cascader/time）或一段巨大的 page-side switch（checkbox-group / select / 内联 daterange backup） | **拆分主战场**：路由壳 keep；3 个 CDP driver 迁 L1.cdp；page-side checkbox-group/select 迁 L1.native；verify 段未来作 L2.micro-verify |

## B. Internal Function 映射（4 个 top-level + 关键 page-side 嵌套 helper）

### B.1 Top-level functions（4 个，dom.ts 文件级 scope）

| 函数 | 行号 | 当前职责 | 目标层 | 依赖 | PR #1 备注 |
|---|---|---|---|---|---|
| `parseYMDLocal` | L1461-1465 (5 行) | extension-side 解析 "YYYY-M-D" → {year,month,day} | keep | （无） | 与 page-side 内联 `parseYMD` (COMMIT handler L1017-1022) 重复实现；迁 L1.cdp/datetime-range.ts 内部使用，或独立到 `lib/date-utils.ts`；PR #1 建议挪到 `extension/src/adapter/cdp.ts` 同侧 helper（仅 runDateRangeDriverCDP 调用） |
| `runDateRangeDriverCDP` | L1467-1862 (396 行) | 完整 daterange/datetimerange CDP 真鼠标驱动：6 处 pageQuery + 多次 clickBBox（CDP attach + dispatchMouseEvent×3） + scroll + 时间 spinner + verify 轮询 | L1.cdp | parseYMDLocal、buildExecuteTarget、getIframeOffset、debuggerMgr、vtxError | 迁 `extension/src/adapter/cdp.ts` 或更细的 `extension/src/adapter/cdp-drivers/daterange.ts`；签名改为接受 `cdp: CdpAdapter, native: NativeAdapter` 注入（取代当前的 `debuggerMgr` 直传 + chrome.scripting 直调）；保留导出供 dom.ts COMMIT handler 通过 import 调用（dom.ts 内 L953 调用点改 import 来源）|
| `runCascaderDriverCDP` | L1864-2011 (148 行) | cascader 混合驱动：1 次 CDP click 开 panel + page-side 一次性 walk label path 逐级点击 | L1.cdp | buildExecuteTarget、getIframeOffset、debuggerMgr、vtxError | 同 daterange：迁 `extension/src/adapter/cdp.ts` 或 `cdp-drivers/cascader.ts`；dom.ts L968 调用点改 import；内置 pageQuery + clickBBox 是与 daterange 重复 200% 的 helper，PR #1 应**抽 cdp.ts 内部公共 clickBBox(tid, frameId, x, y)** |
| `runTimePickerDriverCDP` | L2018-2233 (216 行) | time picker spinner 驱动：CDP click 开 panel + 三列 li scrollIntoView + CDP click + verify | L1.cdp | buildExecuteTarget、getIframeOffset、debuggerMgr、vtxError | 同 cascader：迁 `extension/src/adapter/cdp.ts` 或 `cdp-drivers/time-picker.ts`；dom.ts L981 调用点改 import；clickBBox helper 与 daterange/cascader 重复 |

### B.2 关键 page-side 嵌套 helper（在 chrome.scripting.executeScript 的 `func` 内部，不能跨闭包提取，但可文档化）

| 嵌套函数 | 所在位置 | 当前职责 | 目标层 | PR #1 备注 |
|---|---|---|---|---|
| `sleep` | L1002 / L1491 / L1957 / L2038 | `(ms) => new Promise(r => setTimeout(r, ms))` | keep（page-side 内联） | 6+ 处重复定义；page-side 函数受 chrome.scripting 序列化限制无法 import，只能保留内联或在 PR #1 引入 page-side bundle helper（超出 PR #1 范围，文档化即可） |
| `waitFor<T>` | L1003-1015（COMMIT 内） | page-side 轮询 probe 直到非空或超时 | keep（page-side） | 仅 COMMIT handler 一处使用；属 L2.auto-wait 语义但实现位置受限；PR #1 不动 |
| `parseYMD` | L1017-1022（COMMIT 内） | page-side 版 parseYMDLocal | keep（page-side） | 与 top-level parseYMDLocal 重复，但 page-side 不能引用外部，必须内联；PR #1 不动 |
| `readHeaderYM` | L1024-1048（COMMIT 内） | 解析 picker header 的 "YYYY 年 M 月" / "YYYY April" → {year, month} | keep（page-side） | 仅 COMMIT element-plus-daterange 分支使用；属 L1.native 路径下的 page-side helper，PR #1 不动 |
| `monthDelta` | L1050-1052（COMMIT 内） | (a,b) → 月差数 | keep（page-side） | 同上 |
| `findDayCell` | L1054-1064（COMMIT 内） | 在 picker content 内按 day 文本找非 disabled 的 td | keep（page-side） | 同上 |
| `dispatchMouseClick` | L1066-1078（COMMIT 内） | 同步 dispatch mousedown/mouseup/click 到 element（**untrusted** 事件） | keep（page-side） | COMMIT handler 内非 CDP 路径用；与 CDP 真鼠标 clickBBox 互补：page-side 此函数走 untrusted（select/checkbox-group 接受），CDP 走 trusted（daterange/cascader/time 必须）；PR #1 不动 |
| `clickBBox` (extension-side) | L1508-1520（runDateRangeDriverCDP）/ L1896-1908（runCascaderDriverCDP）/ L2053-2064（runTimePickerDriverCDP） | extension-side 真鼠标点击：getIframeOffset + debuggerMgr.attach + dispatchMouseEvent×3 (mouseMoved/Pressed/Released) | L1.cdp | **3 份完全重复实现**，PR #1 必抽到 `extension/src/adapter/cdp.ts` 单一 `clickBBox(tid, frameId, x, y)` 函数；3 个 driver 全部改 import 该函数 |
| `pageQuery<T>` (extension-side) | L1494-1505（runDateRangeDriverCDP）/ L1883-1894（runCascaderDriverCDP）/ L2043-2050（runTimePickerDriverCDP） | extension-side 包装 chrome.scripting.executeScript 取 r[0].result | L1.native | **3 份完全重复实现**，PR #1 必抽到 `extension/src/adapter/native.ts` 单一 `pageQuery(tid, frameId, fn, args)` 函数；3 个 driver 全部改 import |
| `readPanelState` / `navigateMonth` / `clickDayCell` / `set` (input setter) / `pad` | runDateRangeDriverCDP 内部 L1566-1810 | daterange CDP driver 的内部 step 函数 | L1.cdp | 跟随 runDateRangeDriverCDP 一起迁；PR #1 不需单独提取 |

## C. 统计

- **L1.native**: 11（10 个简单 handler 全转 + pageQuery helper）
- **L1.cdp**: 4（CLICK 的 useRealMouse 分支拆出 + 3 个 top-level CDP driver；外加抽出的 clickBBox helper）
- **L2**: 0（dom.ts 当前未实现完整 L2 能力；探测/reject patterns/verify 块在 PR #1 暂留 page-side 内联，留给 PR #2 拆）
- **L3**: 0（dom.ts 不含 L3 reasoning 能力）
- **keep**: 1（parseYMDLocal 仅供 cdp driver 用，伴随迁；技术上不算"keep"，但 page-side 嵌套 helper 9 个全 keep）
- **delete**: 0
- **合计 (A 表)**: 13 action handler
- **合计 (B.1 表)**: 4 top-level function
- **合计 (B.2 表)**: 9 关键 page-side / extension-side 嵌套 helper（其中 2 个跨 driver 重复需抽出）

## D. PR #1 实施动作清单（优先级序）

按 PR #1 实施时**必须**做的动作排序，每条都对应上表某行：

1. **抽 `pageQuery(tid, frameId, fn, args)` 到 `adapter/native.ts`** —— 消除 3 个 CDP driver 内的重复实现（B.2 第 9 行）
2. **抽 `clickBBox(tid, frameId, x, y)` 到 `adapter/cdp.ts`** —— 消除 3 个 CDP driver + CLICK useRealMouse 共 4 处重复（B.2 第 8 行 + A 表 CLICK 行）
3. **`runDateRangeDriverCDP` 整体迁 `adapter/cdp.ts`** —— 携带 parseYMDLocal（B.1 第 1-2 行）
4. **`runCascaderDriverCDP` 整体迁 `adapter/cdp.ts`**（B.1 第 3 行）
5. **`runTimePickerDriverCDP` 整体迁 `adapter/cdp.ts`**（B.1 第 4 行）
6. **dom.ts COMMIT handler 内的 3 个 driver 调用点（L953 / L968 / L981）改 import** —— 来源由 top-level 同文件函数 → `import { runXxxDriverCDP } from '../adapter/cdp'`
7. **CLICK handler 的 useRealMouse 分支（L99-205）抽 `cdpClickElement(tid, frameId, selector)`** —— 内部组合 native pageQuery（actionability + 取坐标）+ cdp clickBBox；CLICK handler L92-312 保持壳，分支改 await 函数调用
8. **10 个简单 handler（QUERY/QUERY_ALL/TYPE/FILL/SELECT/SCROLL/HOVER/GET_ATTRIBUTE/GET_SCROLL_INFO/WAIT_FOR_MUTATION/WAIT_SETTLED）的 chrome.scripting.executeScript 调用包装为 `pageQuery` 调用** —— 其余逻辑（page-side func 字面量 + 错误码映射）保留 dom.ts 内（不强求拆）
9. **保留**：FILL_REJECT_PATTERNS / findDriver / COMMIT_DRIVERS 仍 `from '../patterns/index.js'` 不动；resolveTarget / getActiveTabId / getIframeOffset 仍 `from '../lib/'` 不动
10. **行数预估**：完成 1-8 后 dom.ts 从 2233 行降到约 700-900 行（13 个 handler + 注册壳 + import）；目标 ≤ 800 行**可达**，但 COMMIT handler 内联 522 行 page-side switch（checkbox-group / select / fallback daterange）是单点拥堵 —— 若要进一步降，需在 PR #1 把 page-side switch 拆成多个 page-side 函数文件（成本高，建议留 PR #2）

## E. PR #1 风险点

1. **`debuggerMgr` 跨函数注入**：当前 `registerDomHandlers(router, debuggerMgr)` 闭包共享 debuggerMgr 给 4 处使用方。PR #1 拆 cdp.ts 后，`runXxxDriverCDP` 必须显式接受 `debuggerMgr` 参数（已是当前签名）；CLICK useRealMouse 分支抽出函数后也要显式接受 —— 闭包变显式参数，签名会膨胀，可考虑 cdp.ts 暴露一个绑定 debuggerMgr 的 factory（`createCdpAdapter(debuggerMgr)` → returns { clickBBox, attach, ... }）
2. **page-side func 字面量不可跨文件**：chrome.scripting.executeScript 的 `func` 必须是序列化为字符串的纯函数，不能引用外部模块。所以 10 个简单 handler 的 page-side func 字面量**不能**抽到 L2/actionability.ts —— 即使语义属于 actionability。PR #1 阶段：page-side 探测代码（actionability 检查）保留 dom.ts 内联，等 PR #2/#3 设计 L2 时引入 page-side bundle 机制（webpack 等）才能实现真正的 L2 抽离
3. **COMMIT handler 内联 522 行**：单个 handler 占文件 23%，是文件最大坏味道。其内部按 driver id 走 if/else if（element-plus-daterange / checkbox-group / select），结构上属"分发器"而非"实现"。PR #1 可考虑**最小动作**：把 if-else 链改 dispatch table（`{ [driverId]: pageSideDriverFunc }`），实现按 driver id 拆 page-side func 字面量到 `extension/src/page-drivers/{checkbox-group,select}.ts` —— 但这会跨进入 page-side bundle 机制，建议留 PR #2
4. **错误码映射重复**：10 个简单 handler 末尾的 errorCode 映射模板（L302-310 / L387-395 / L502-510 / L576-584 / L716-724）99% 重复。PR #1 可抽 `mapPageError(res, selector)` helper 到 `adapter/native.ts`，本身不是 L2 但能减一半样板代码
5. **测试覆盖**：dom.ts 当前应有的 e2e 覆盖：bench cases 13 个 P3 + datetimerange 实战；PR #1 拆完必须 bench 全过 + 最小回归（datetimerange / cascader / timepicker / fill-reject 4 个核心场景手测）才合并

## F. 行号校准（v0.5.0 / acdeeb3 HEAD）

文件总行数 2233。注册块 L18-1452，3 个 CDP driver 占 L1467-2233（共 767 行 = 文件 34%）。如 PR #1 实施前 dom.ts 已变化，需重新跑 Step 1 grep 校准行号。
