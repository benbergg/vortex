// Page-side Actionability 6-probe checks (IIFE, attaches to window.__vortexActionability).
// Loaded via chrome.scripting.executeScript({ files: ['page-side/actionability.js'], world: 'MAIN' }).
//
// Reference: design doc §5.2 + docs/spec-l2-action.md §1, §5.
// 6 checks: Attached / Visible / Stable / ReceivesEvents / Enabled / Editable.
//
// Implementation constraints:
// - IIFE self-contained, no external imports (chrome.scripting files = plain script injection)
// - Defensive guard against double-load (page-side-loader is idempotent, but defend here too)
// - All checks are sync except Stable (which uses RAF double-sample)

export type ActionabilityFailure =
  | "NOT_ATTACHED"
  | "NOT_VISIBLE"
  | "NOT_STABLE"
  | "OBSCURED"
  | "DISABLED"
  | "NOT_EDITABLE";

export type ActionabilityResult =
  | { ok: true; rect: { x: number; y: number; w: number; h: number } }
  | {
      ok: false;
      reason: ActionabilityFailure;
      extras?: { blocker?: string; tagName?: string; hasReadOnly?: boolean };
    };

(function () {
  if ((window as any).__vortexActionability?.version === 1) return;

  function isAttached(el: Element): boolean {
    return el.isConnected;
  }

  // Calibration #1: vortex decision — prefer checkVisibility(), do not check opacity, do not use offsetParent.
  // Use checkVisibility() when supported (Chromium/Firefox). Fall back to visibility style check for older WebKit.
  // Always require non-zero bounding rect.
  function isVisible(el: Element): boolean {
    if (typeof (el as any).checkVisibility === "function") {
      if (
        !(el as any).checkVisibility({
          checkOpacity: false, // vortex does not block on opacity
          checkVisibilityCSS: true,
          contentVisibilityAuto: true,
          opacityProperty: false,
          visibilityProperty: true,
        })
      ) {
        return false;
      }
    } else if (el instanceof HTMLElement) {
      // Fallback for browsers without checkVisibility() (e.g. older WebKit).
      const style = getComputedStyle(el);
      if (style.visibility !== "visible") return false;
    }
    // Always require non-zero rect
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    return true;
  }

  function isEnabled(el: Element): boolean {
    if (!(el instanceof HTMLElement)) return true;
    const aria = el.getAttribute("aria-disabled");
    if (aria === "true") return false;
    if ((el as HTMLInputElement).disabled === true) return false;
    const fs = el.closest("fieldset[disabled]");
    if (fs) return false;
    return true;
  }

  // Calibration #2: vortex decision — include SELECT readonly check.
  // contenteditable is always editable (readonly attribute is HTML-spec-invalid on contenteditable).
  function isEditable(
    el: Element,
  ): { ok: boolean; tagName: string; hasReadOnly: boolean } {
    if (!(el instanceof HTMLElement))
      return { ok: false, tagName: el.tagName.toLowerCase(), hasReadOnly: false };
    const tag = el.tagName.toLowerCase();
    // contenteditable is always editable (regardless of any "readonly" attribute,
    // which is HTML-spec-invalid on contenteditable)
    if (el.isContentEditable) return { ok: true, tagName: tag, hasReadOnly: false };
    // INPUT / TEXTAREA / SELECT — check readOnly state
    if (tag === "input" || tag === "textarea") {
      const ro = (el as HTMLInputElement | HTMLTextAreaElement).readOnly === true;
      return { ok: !ro, tagName: tag, hasReadOnly: ro };
    }
    if (tag === "select") {
      const ro = el.hasAttribute("readonly");
      return { ok: !ro, tagName: tag, hasReadOnly: ro };
    }
    // Anything else is not editable
    return { ok: false, tagName: tag, hasReadOnly: false };
  }

  function receivesEvents(
    el: Element,
    cx: number,
    cy: number,
  ): { ok: boolean; blocker?: string } {
    const hit = document.elementFromPoint(cx, cy);
    if (!hit) return { ok: false, blocker: "elementFromPoint=null" };
    if (hit === el || el.contains(hit) || hit.contains(el)) return { ok: true };
    const cls =
      typeof hit.className === "string" && hit.className
        ? "." + hit.className.split(" ").filter(Boolean).slice(0, 2).join(".")
        : "";
    const desc = hit.tagName.toLowerCase() + (hit.id ? "#" + hit.id : "") + cls;
    return { ok: false, blocker: desc };
  }

  // Stable check: double-sample bounding rect with RAF, position+size diff < 1px.
  function isStable(el: Element): Promise<boolean> {
    return new Promise((resolve) => {
      const r1 = el.getBoundingClientRect();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const r2 = el.getBoundingClientRect();
          const stable =
            r1.x === r2.x &&
            r1.y === r2.y &&
            r1.width === r2.width &&
            r1.height === r2.height;
          resolve(stable);
        });
      });
    });
  }

  // Single-shot probe (no wait; host-side auto-wait orchestrates retries).
  // needsEditable: true for fill/type, false for click.
  // Stable is checked separately by host-side via probeStable (RAF cannot compose with chrome.scripting boundary).
  async function probe(
    selector: string,
    needsEditable: boolean,
  ): Promise<ActionabilityResult> {
    const el = document.querySelector(selector);
    if (!el) return { ok: false, reason: "NOT_ATTACHED" };
    if (!isAttached(el)) return { ok: false, reason: "NOT_ATTACHED" };
    if (!isVisible(el)) return { ok: false, reason: "NOT_VISIBLE" };
    if (!isEnabled(el)) return { ok: false, reason: "DISABLED" };
    if (needsEditable) {
      const ed = isEditable(el);
      if (!ed.ok) {
        return {
          ok: false,
          reason: "NOT_EDITABLE",
          extras: { tagName: ed.tagName, hasReadOnly: ed.hasReadOnly },
        };
      }
    }
    const r = el.getBoundingClientRect();
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    const re = receivesEvents(el, cx, cy);
    if (!re.ok) return { ok: false, reason: "OBSCURED", extras: { blocker: re.blocker } };
    return { ok: true, rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
  }

  // Stable re-check: host-side calls this immediately after probe ok to confirm position is stable.
  async function probeStable(selector: string): Promise<{ ok: boolean }> {
    const el = document.querySelector(selector);
    if (!el) return { ok: false };
    const stable = await isStable(el);
    return { ok: stable };
  }

  (window as any).__vortexActionability = {
    version: 1,
    probe,
    probeStable,
    // Atomic methods exposed for host-side direct use
    _isAttached: isAttached,
    _isVisible: isVisible,
    _isEnabled: isEnabled,
    _isEditable: isEditable,
    _receivesEvents: receivesEvents,
  };
})();

export {};
