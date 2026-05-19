// Fixture-based: playground/public/shadow-dom-counter.html uses a custom
// element with `attachShadow({ mode: 'open' })`.
//
// Tested guarantee:
//   - vortex_observe surfaces interactive elements inside an OPEN
//     shadow root via the page-side querySelectorAllDeep walker
//     added in observe.ts as part of the 2026-05-19 baseline run
//     (the older code path used plain `document.querySelectorAll`
//     which does not pierce shadow boundaries, leaving custom-element
//     pages with 0 elements surfaced).
//   - State change inside the shadow propagates outward (the widget
//     mirrors its counter to a light-DOM [data-testid="result"] span).
//
// Known follow-up (not gated by this case):
//   `dom.click` resolves its `_sel` via `document.querySelector` in
//   page-side scripts, which has the same light-DOM-only limitation.
//   Ref-based act/click on shadow-internal elements therefore returns
//   ELEMENT_NOT_FOUND today. This case dispatches the click through
//   `vortex_evaluate` instead — the observe→click contract for shadow
//   widgets via `vortex_act` is a separate Kaizen step.

import type { CaseDefinition } from "../src/types.js";
import { assertResultContains, extractText } from "./_helpers.js";

function findRef(snapshot: string, name: string): string | null {
  // v0.8 hashed ref support: matches @eN / @fNeM / @<hash>:eN / @<hash>:fNeM
  const re = new RegExp(`(@(?:[a-f0-9]{4}:)?(?:f\\d+)?e\\d+)\\s+\\[[^\\]]+\\]\\s+"([^"]*?)"`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(snapshot)) !== null) {
    if (m[2].trim() === name) return m[1];
  }
  return null;
}

const def: CaseDefinition = {
  name: "shadow-dom-counter",
  playgroundPath: "/shadow-dom-counter.html",
  async run(ctx) {
    // The custom element registers synchronously, so by the time
    // wait_for(idle, dom) fires from the runner harness it should be in
    // the snapshot. No extra warm-up.
    const snap = extractText(await ctx.call("vortex_observe", {}));

    // The in-shadow button has accessible name "Increment". If vortex
    // cannot see through the open shadow root, this fails fast.
    const btnRef = findRef(snap, "Increment");
    ctx.assert(
      btnRef !== null,
      `observe should surface in-shadow button "Increment". snapshot head:\n${snap.slice(0, 600)}`,
    );

    // Dispatch the click via vortex_evaluate (page-side script) because
    // dom.click's selector resolution does not pierce shadow boundaries
    // — see top-of-file follow-up note. The click target is identified
    // by the host element + in-shadow id which the fixture pins.
    await ctx.call("vortex_evaluate", {
      code: 'document.querySelector("counter-widget").shadowRoot.getElementById("inc").click()',
    });

    // The shadow handler mirrors its counter into the light-DOM
    // [data-testid="result"] span, so assertResultContains polls
    // through the standard helper.
    await assertResultContains(ctx, "外部读数：1");
  },
};

export default def;
