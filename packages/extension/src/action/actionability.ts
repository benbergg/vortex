// L2 Action - Host-side Actionability wrapper.
// Calls page-side bundle's window.__vortexActionability.probe via chrome.scripting; host-side is orchestration only.
//
// Design:
// - alias pattern (PR #1 experience): const probe = (...) => nativePageQuery(...) closes over tabId/frameId,
//   matching cdp-driver call shape from PR #1.
// - Stable re-check: after probe ok, call probeStable separately (two-step async because RAF cannot compose
//   across the chrome.scripting boundary).
//
// Public API:
//   checkActionability(tabId, frameId, selector, options?) → ActionabilityResult

import { pageQuery as nativePageQuery } from "../adapter/native.js";
import { loadPageSideModule } from "../adapter/page-side-loader.js";
import type {
  ActionabilityFailure,
  ActionabilityResult,
} from "../page-side/actionability.js";

export type { ActionabilityFailure, ActionabilityResult };

export interface CheckOptions {
  /** True for fill/type, false for click/hover. Default false. */
  needsEditable?: boolean;
  /** Skip the Stable re-check (when auto-wait already does stable check in retry loop). Default false. */
  skipStable?: boolean;
}

/**
 * Single-shot actionability probe (no wait; caller orchestrates retries via auto-wait).
 * Returns ActionabilityResult; ok=false includes reason + extras.
 */
export async function checkActionability(
  tabId: number,
  frameId: number | undefined,
  selector: string,
  options: CheckOptions = {},
): Promise<ActionabilityResult> {
  await loadPageSideModule(tabId, frameId, "actionability");

  // alias pattern: closure-bind tabId/frameId for repeated probe calls
  const probe = <T>(fn: (...args: unknown[]) => T, args: unknown[] = []) =>
    nativePageQuery<T>(tabId, frameId, fn, args);

  const result = await probe<ActionabilityResult>(
    (sel: string, needsEditable: boolean) => {
      const A = (window as any).__vortexActionability;
      if (!A?.probe) {
        // Bundle not loaded: treat as element-not-found (caller will retry via auto-wait).
        return { ok: false, reason: "NOT_ATTACHED" } as const;
      }
      return A.probe(sel, needsEditable);
    },
    [selector, options.needsEditable ?? false],
  );

  if (!result.ok) return result;
  if (options.skipStable) return result;

  // Stable re-check (two-step async)
  const stable = await probe<{ ok: boolean }>(
    (sel: string) => {
      const A = (window as any).__vortexActionability;
      return A.probeStable(sel);
    },
    [selector],
  );
  if (!stable.ok) {
    return { ok: false, reason: "NOT_STABLE" };
  }
  return result;
}
