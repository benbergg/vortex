// L1 Native Adapter：chrome.tabs / scripting / storage 包装。
// 见 ../handlers/dom.ts 内现有调用，PR #1 各 task 逐步迁入本文件。

import type { NativeAdapter } from "./types.js";
import { buildExecuteTarget } from "../lib/tab-utils.js";

// 公共 helper（T1.5a 实现）
export async function pageQuery<T>(
  tabId: number,
  frameId: number | undefined,
  fn: (...args: unknown[]) => T,
  args: unknown[] = [],
): Promise<T> {
  const r = await chrome.scripting.executeScript({
    target: buildExecuteTarget(tabId, frameId),
    func: fn,
    args,
    world: "MAIN",
  });
  return r[0]?.result as T;
}

// 整个 adapter 的 facade（保留供 future 注入用）
export const nativeAdapter: NativeAdapter = {
  pageQuery,
};
