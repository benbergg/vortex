// L3: a11y snapshot 采集（CDP Accessibility.getFullAXTree + filter）。
// spec: vortex重构-L3-spec.md §2.1
// 实现状态：T3.4 stub（throw not-implemented）

import type { AXSnapshot, CDPAXNode } from "./types.js";

export interface DebuggerLike {
  enableDomain(tabId: number, domain: string): Promise<void>;
  sendCommand(tabId: number, method: string, params?: unknown): Promise<unknown>;
}

export async function captureAXSnapshot(
  _debuggerMgr: DebuggerLike,
  _tabId: number,
  _frameId = 0,
): Promise<AXSnapshot> {
  throw new Error("captureAXSnapshot: not implemented (T3.4)");
}

export const INTERACTIVE_ROLES = new Set([
  "button", "link", "textbox", "checkbox", "radio", "combobox",
  "listbox", "menuitem", "tab", "switch", "slider", "spinbutton",
  "option", "searchbox",
]);

export const STRUCTURAL_ROLES = new Set([
  "heading", "banner", "navigation", "main", "contentinfo",
  "complementary", "region", "dialog", "alert", "status",
]);

export function isInteresting(_n: CDPAXNode): boolean {
  throw new Error("isInteresting: not implemented (T3.4)");
}
