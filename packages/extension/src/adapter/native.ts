// L1 Native Adapter：chrome.tabs / scripting / storage 包装。
// 见 ../handlers/dom.ts 内现有调用，PR #1 各 task 逐步迁入本文件。

import { VtxErrorCode, vtxError } from "@bytenew/vortex-shared";
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

/**
 * 把 page-side func 返回的 { error?, errorCode?, extras? } 统一映射为 vtxError 抛出。
 * 抽取自 dom.ts 5 处重复模板（CLICK / TYPE / FILL / SELECT / HOVER 末尾的错误码映射）。
 * 调用方仅在 page-side func 返回 error 时调用本 helper（其他情况按原代码 throw）。
 * 返回 never，便于 TS 在调用点 narrow res.error 为非 undefined。
 */
export function mapPageError(
  res: { error?: string; errorCode?: string; extras?: Record<string, unknown> } | undefined,
  selector: string | undefined,
): never {
  const error = res?.error ?? "Unknown error";
  const code: VtxErrorCode =
    res?.errorCode && res.errorCode in VtxErrorCode
      ? (res.errorCode as VtxErrorCode)
      : error.startsWith("Element not found:") || error.startsWith("Container not found:")
        ? VtxErrorCode.ELEMENT_NOT_FOUND
        : VtxErrorCode.JS_EXECUTION_ERROR;
  // 保持与原 dom.ts 行为：selector 缺失时仅在有 extras 时附 context；都缺则不传 context。
  const hasContext = selector !== undefined || res?.extras !== undefined;
  throw vtxError(code, error, hasContext ? { selector, extras: res?.extras } : undefined);
}

// 整个 adapter 的 facade（保留供 future 注入用）
export const nativeAdapter: NativeAdapter = {
  pageQuery,
};
