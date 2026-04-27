// L2 Action - Fallback Chain (click / fill / type / drag differentiated paths).
// Reference: design doc §5.4 + docs/spec-l2-action.md §3.
//
// Each action has a sequence of paths; each layer's failure is judged via micro-verify (T2.6).
// In T2.5 we use inline checks (e.g. el.value === val) until T2.6 lands. All paths failing throws
// ACTION_FAILED_ALL_PATHS (FIXME T2.7).
//
// Drag is CDP-only: if CDP unavailable, throws DRAG_REQUIRES_CDP without fallback.
//
// FIXME(T2.7): replace JS_EXECUTION_ERROR placeholders with ACTION_FAILED_ALL_PATHS / DRAG_REQUIRES_CDP.

import { VtxErrorCode, vtxError } from "@bytenew/vortex-shared";
import { pageQuery as nativePageQuery } from "../adapter/native.js";
import { clickBBox as cdpClickBBox } from "../adapter/cdp.js";
import { capabilityDetector } from "../adapter/detector.js";
import type { DebuggerManager } from "../lib/debugger-manager.js";

export type ActionPath =
  | "dispatchEvent"
  | "cdp"
  | "value-setter"
  | "execCommand"
  | "insertText";

export interface FallbackContext {
  tabId: number;
  frameId: number | undefined;
  selector: string;
  debuggerMgr: DebuggerManager;
}

/**
 * Click fallback chain: dispatchEvent (untrusted) → CDP (trusted) → fail.
 */
export async function clickWithFallback(
  ctx: FallbackContext,
  rect: { x: number; y: number; w: number; h: number },
): Promise<{ path: ActionPath }> {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const attempted: ActionPath[] = [];

  // 1) dispatchEvent (untrusted)
  attempted.push("dispatchEvent");
  const dispatched = await tryDispatchEvent(ctx, cx, cy);
  if (dispatched.ok) return { path: "dispatchEvent" };

  // 2) CDP fallback
  if (await capabilityDetector.canUseCDP(ctx.tabId)) {
    attempted.push("cdp");
    try {
      // cdpClickBBox signature is (debuggerMgr, tabId, x, y) — no frameId
      await cdpClickBBox(ctx.debuggerMgr, ctx.tabId, cx, cy);
      return { path: "cdp" };
    } catch {
      // fall through to throw below
    }
  }

  throw vtxError(
    VtxErrorCode.JS_EXECUTION_ERROR, // FIXME(T2.7): ACTION_FAILED_ALL_PATHS
    `Click failed all paths`,
    { selector: ctx.selector, extras: { attemptedPaths: attempted } },
  );
}

async function tryDispatchEvent(
  ctx: FallbackContext,
  cx: number,
  cy: number,
): Promise<{ ok: boolean }> {
  return await nativePageQuery<{ ok: boolean }>(
    ctx.tabId,
    ctx.frameId,
    (sel: string, x: number, y: number) => {
      const el = document.querySelector(sel);
      if (!el) return { ok: false };
      const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
      el.dispatchEvent(new MouseEvent("mousedown", opts));
      el.dispatchEvent(new MouseEvent("mouseup", opts));
      el.dispatchEvent(new MouseEvent("click", opts));
      return { ok: true };
    },
    [ctx.selector, cx, cy],
  );
}

/**
 * Fill fallback chain: focus + select-all + execCommand → value setter + dispatch input → CDP insertText.
 */
export async function fillWithFallback(
  ctx: FallbackContext,
  value: string,
): Promise<{ path: ActionPath }> {
  const attempted: ActionPath[] = [];

  // 1) focus + select-all + execCommand("insertText") — closest to real input
  attempted.push("execCommand");
  const r1 = await tryFillExecCommand(ctx, value);
  if (r1.ok) return { path: "execCommand" };

  // 2) value setter + dispatch input
  attempted.push("value-setter");
  const r2 = await tryFillValueSetter(ctx, value);
  if (r2.ok) return { path: "value-setter" };

  // 3) CDP Input.insertText
  if (await capabilityDetector.canUseCDP(ctx.tabId)) {
    attempted.push("insertText");
    try {
      await ctx.debuggerMgr.attach(ctx.tabId);
      // focus first
      await nativePageQuery(
        ctx.tabId,
        ctx.frameId,
        (sel: string) => {
          (document.querySelector(sel) as HTMLElement | null)?.focus();
        },
        [ctx.selector],
      );
      await ctx.debuggerMgr.sendCommand(ctx.tabId, "Input.insertText", { text: value });
      return { path: "insertText" };
    } catch {
      // fall through to throw below
    }
  }

  throw vtxError(
    VtxErrorCode.JS_EXECUTION_ERROR, // FIXME(T2.7): ACTION_FAILED_ALL_PATHS
    `Fill failed all paths`,
    { selector: ctx.selector, extras: { attemptedPaths: attempted } },
  );
}

async function tryFillExecCommand(
  ctx: FallbackContext,
  value: string,
): Promise<{ ok: boolean }> {
  return await nativePageQuery<{ ok: boolean }>(
    ctx.tabId,
    ctx.frameId,
    (sel: string, val: string) => {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      if (!el) return { ok: false };
      el.focus();
      el.select();
      const ok = document.execCommand("insertText", false, val);
      return { ok: ok && el.value === val };
    },
    [ctx.selector, value],
  );
}

async function tryFillValueSetter(
  ctx: FallbackContext,
  value: string,
): Promise<{ ok: boolean }> {
  return await nativePageQuery<{ ok: boolean }>(
    ctx.tabId,
    ctx.frameId,
    (sel: string, val: string) => {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      if (!el) return { ok: false };
      const proto = Object.getPrototypeOf(el);
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(el, val);
      else el.value = val;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: el.value === val };
    },
    [ctx.selector, value],
  );
}

/**
 * Drag is CDP-only. If CDP unavailable, throws DRAG_REQUIRES_CDP without fallback.
 */
export async function dragWithFallback(
  ctx: FallbackContext,
  fromXY: { x: number; y: number },
  toXY: { x: number; y: number },
): Promise<{ path: ActionPath }> {
  if (!(await capabilityDetector.canUseCDP(ctx.tabId))) {
    throw vtxError(
      VtxErrorCode.JS_EXECUTION_ERROR, // FIXME(T2.7): DRAG_REQUIRES_CDP
      "Drag requires CDP but CDP unavailable",
      { selector: ctx.selector },
    );
  }
  await ctx.debuggerMgr.attach(ctx.tabId);
  await ctx.debuggerMgr.sendCommand(ctx.tabId, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: fromXY.x,
    y: fromXY.y,
    button: "left",
    clickCount: 1,
  });
  await ctx.debuggerMgr.sendCommand(ctx.tabId, "Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: toXY.x,
    y: toXY.y,
    button: "left",
  });
  await ctx.debuggerMgr.sendCommand(ctx.tabId, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: toXY.x,
    y: toXY.y,
    button: "left",
    clickCount: 1,
  });
  return { path: "cdp" };
}
