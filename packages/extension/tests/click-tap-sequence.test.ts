import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Regression lock for the click tap-sequence introduced in v0.8.2
 * (BUG 8, 2026-05-21 RocketMQ-Dashboard dogfood).
 *
 * Before this fix, DomActions.CLICK only invoked el.click(), which fires
 * a single synthetic "click" event with isTrusted=false. Frameworks that
 * hook mousedown/mouseup to synthesise their own tap event silently
 * ignored it:
 *   - AngularJS Material 1.x ($mdGesture / tapClick) — md-select dropdown
 *     never opened, blocking the entire Topic-trace workflow.
 *   - Hammer.js (`tap` recogniser) — same.
 *   - Ant Design v3 Select / older Element UI Select — same.
 *
 * The fix dispatches the full activation sequence
 *   pointerdown → mousedown → pointerup → mouseup → click
 * so framework gesture detectors observe what looks like a real tap, then
 * still calls el.click() for plain-DOM handlers.
 *
 * Source-level contract (so this lock doesn't rely on spinning up an
 * AngularJS test page in CI): the CLICK handler text must contain each
 * event dispatch in the correct order.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const DOM_SRC = readFileSync(
  join(__dirname, "..", "src", "handlers", "dom.ts"),
  "utf8",
);

describe("dom.click tap sequence (@since 0.8.2 BUG 8)", () => {
  it("dispatches pointerdown before mousedown", () => {
    const block = DOM_SRC.match(
      /el\.dispatchEvent\(new PointerEvent\("pointerdown"[\s\S]*?el\.dispatchEvent\(new MouseEvent\("mousedown"/,
    );
    expect(block, "pointerdown must precede mousedown in CLICK handler").not.toBeNull();
  });

  it("dispatches pointerup before mouseup", () => {
    const block = DOM_SRC.match(
      /el\.dispatchEvent\(new PointerEvent\("pointerup"[\s\S]*?el\.dispatchEvent\(new MouseEvent\("mouseup"/,
    );
    expect(block, "pointerup must precede mouseup in CLICK handler").not.toBeNull();
  });

  it("mouseup precedes el.click() so frameworks see tap before native click", () => {
    const block = DOM_SRC.match(
      /el\.dispatchEvent\(new MouseEvent\("mouseup"[\s\S]*?el\.click\(\)/,
    );
    expect(block, "mouseup must precede el.click() in CLICK handler").not.toBeNull();
  });

  it("mouse events carry clientX/clientY computed from element center", () => {
    expect(DOM_SRC).toMatch(/clientX:\s*cx/);
    expect(DOM_SRC).toMatch(/clientY:\s*cy/);
  });

  it("mousedown carries buttons=1, mouseup carries buttons=0 (W3C spec)", () => {
    // mousedown init has buttons: 1
    expect(DOM_SRC).toMatch(/mouseDown[\s\S]*?buttons:\s*1/);
    // mouseup init has buttons: 0
    expect(DOM_SRC).toMatch(/mouseUp[\s\S]*?buttons:\s*0/);
  });

  it("PointerEvent dispatches are wrapped in try/catch (Safari/older browsers)", () => {
    // pointerdown wrapped
    expect(DOM_SRC).toMatch(/try\s*\{\s*el\.dispatchEvent\(new PointerEvent\("pointerdown"/);
    // pointerup wrapped
    expect(DOM_SRC).toMatch(/try\s*\{\s*el\.dispatchEvent\(new PointerEvent\("pointerup"/);
  });

  it("preserves the focus() call before the event sequence (vortex_press contract)", () => {
    // focus must precede pointerdown so subsequent vortex_press keyboard
    // events land on the active element.
    const block = DOM_SRC.match(
      /\(el as HTMLElement\)\.focus\(\)[\s\S]*?el\.dispatchEvent\(new PointerEvent\("pointerdown"/,
    );
    expect(block, "focus() must precede the tap sequence").not.toBeNull();
  });
});
