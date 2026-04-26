// L1 CDP Adapter：chrome.debugger.* 包装。
// 不被 L2/L3/L4 import（depcruise 强制；见 .dependency-cruiser.cjs）。
// PR #1 各 task 逐步迁入：clickBBox / cdpClickElement / 3 个 CDP driver。

import { getIframeOffset } from "../lib/iframe-offset.js";
import type { DebuggerManager } from "../lib/debugger-manager.js";

/**
 * CDP 真鼠标 click at viewport-coords (cx, cy)。
 * 抽取自 dom.ts 3 处重复（runDateRangeDriverCDP / runCascaderDriverCDP / runTimePickerDriverCDP）。
 * CLICK handler useRealMouse 分支 inline 版本将在 T1.9（cdpClickElement 抽取）一并合并复用。
 *
 * debuggerMgr 显式参数（cdp.ts 内不持有状态，见 §0.2 约束 #1）。
 */
export async function clickBBox(
  debuggerMgr: DebuggerManager,
  tabId: number,
  frameId: number | undefined,
  cx: number,
  cy: number,
): Promise<void> {
  const { x: ox, y: oy } = await getIframeOffset(tabId, frameId);
  const x = cx + ox;
  const y = cy + oy;
  await debuggerMgr.attach(tabId);
  await debuggerMgr.sendCommand(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await debuggerMgr.sendCommand(tabId, "Input.dispatchMouseEvent", {
    type: "mousePressed", x, y, button: "left", clickCount: 1,
  });
  await debuggerMgr.sendCommand(tabId, "Input.dispatchMouseEvent", {
    type: "mouseReleased", x, y, button: "left", clickCount: 1,
  });
}
