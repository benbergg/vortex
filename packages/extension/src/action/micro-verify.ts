// L2 Action - Micro-verify (per-action verification dispatcher).
// Reference: design doc §5.5 matrix.
// Each action has its own verification logic; no shared single verify across actions.

import { pageQuery as nativePageQuery } from "../adapter/native.js";

export type ActionType =
  | "click"
  | "fill"
  | "type"
  | "select"
  | "scroll"
  | "hover"
  | "drag";

export interface VerifyContext {
  tabId: number;
  frameId: number | undefined;
  selector: string;
}

export interface VerifyResult {
  ok: boolean;
  effects: Record<string, unknown> | null;
}

/**
 * Dispatches to per-action verify based on action type.
 * scroll / hover / drag have no strong success state → returns effects: null (not treated as failure).
 */
export async function microVerify(
  action: ActionType,
  ctx: VerifyContext,
  expected?: { value?: unknown; scrollPos?: { top?: number; left?: number } },
): Promise<VerifyResult> {
  switch (action) {
    case "click":
      return await verifyClick(ctx);
    case "fill":
      return await verifyFill(ctx, String(expected?.value ?? ""));
    case "type":
      return await verifyType(ctx, String(expected?.value ?? ""));
    case "select":
      return await verifySelect(ctx, String(expected?.value ?? ""));
    case "scroll":
      return await verifyScroll(ctx, expected?.scrollPos ?? {});
    case "hover":
    case "drag":
      // No strong success state.
      return { ok: true, effects: null };
  }
}

/** click: 1-RAF DOM diff (attribute / subtree / element disappearance / URL change). */
async function verifyClick(ctx: VerifyContext): Promise<VerifyResult> {
  return await nativePageQuery<VerifyResult>(
    ctx.tabId,
    ctx.frameId,
    (sel: string) => {
      const before = {
        url: location.href,
        exists: !!document.querySelector(sel),
        body: document.body.innerHTML.length,
      };
      return new Promise<VerifyResult>((resolve) => {
        requestAnimationFrame(() => {
          const after = {
            url: location.href,
            exists: !!document.querySelector(sel),
            body: document.body.innerHTML.length,
          };
          const url_changed = before.url !== after.url;
          const ref_state_change =
            before.body !== after.body || before.exists !== after.exists;
          resolve({
            ok: true,
            effects: {
              url_changed,
              ref_state_change,
              new_visible_elements: [], // Filled by L3 in future
            },
          });
        });
      });
    },
    [ctx.selector],
  );
}

/** fill: value === target_value */
async function verifyFill(
  ctx: VerifyContext,
  target: string,
): Promise<VerifyResult> {
  return await nativePageQuery<VerifyResult>(
    ctx.tabId,
    ctx.frameId,
    (sel: string, expected: string) => {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      if (!el) return { ok: false, effects: null };
      const ok = el.value === expected;
      return { ok, effects: { url_changed: false, value: el.value, expected } };
    },
    [ctx.selector, target],
  );
}

/** type: value endsWith typed string */
async function verifyType(
  ctx: VerifyContext,
  typed: string,
): Promise<VerifyResult> {
  return await nativePageQuery<VerifyResult>(
    ctx.tabId,
    ctx.frameId,
    (sel: string, expected: string) => {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      if (!el) return { ok: false, effects: null };
      const ok = el.value.endsWith(expected);
      return { ok, effects: { value: el.value, typed: expected } };
    },
    [ctx.selector, typed],
  );
}

/** select: select.value === target or selected option matches */
async function verifySelect(
  ctx: VerifyContext,
  target: string,
): Promise<VerifyResult> {
  return await nativePageQuery<VerifyResult>(
    ctx.tabId,
    ctx.frameId,
    (sel: string, expected: string) => {
      const el = document.querySelector(sel) as HTMLSelectElement | null;
      if (!el) return { ok: false, effects: null };
      const ok = el.value === expected;
      return { ok, effects: { value: el.value, expected } };
    },
    [ctx.selector, target],
  );
}

/** scroll: scrollTop / scrollLeft within ± 5px of target */
async function verifyScroll(
  ctx: VerifyContext,
  pos: { top?: number; left?: number },
): Promise<VerifyResult> {
  return await nativePageQuery<VerifyResult>(
    ctx.tabId,
    ctx.frameId,
    (sel: string, expected: { top?: number; left?: number }) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) return { ok: false, effects: null };
      const ok =
        (expected.top === undefined ||
          Math.abs(el.scrollTop - expected.top) < 5) &&
        (expected.left === undefined ||
          Math.abs(el.scrollLeft - expected.left) < 5);
      return {
        ok,
        effects: { scrollTop: el.scrollTop, scrollLeft: el.scrollLeft, expected },
      };
    },
    [ctx.selector, pos],
  );
}
