// I4: checkActionability returns NOT_VISIBLE for hidden elements.
// Covers: display:none, opacity:0 (note: Playwright does NOT check opacity; included here
// as a boundary case — T2.3b should clarify if opacity triggers NOT_VISIBLE per spec §1.2).
// visibility:hidden is the primary CSS visibility case.
// Implementation: ../../src/action/actionability.ts (T2.3b will implement).
// FIXME: remove .skip at T2.9 after actionability is implemented.

import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { checkActionability } from "../../src/action/actionability.js";

declare global {
  // eslint-disable-next-line no-var
  var chrome: any;
}

describe.skip("I4: NOT_VISIBLE for hidden elements", () => {
  let dom: JSDOM;

  function setupDom(html: string) {
    dom = new JSDOM(html);
    globalThis.document = dom.window.document;
    globalThis.window = dom.window as any;
    globalThis.chrome = {
      scripting: {
        executeScript: async (opts: any) => {
          const result = opts.func(...(opts.args ?? []));
          return [{ result }];
        },
      },
    };
  }

  it("returns NOT_VISIBLE for display:none element", async () => {
    setupDom('<button id="btn" style="display:none">Click</button>');
    const res = await checkActionability(1, undefined, "#btn");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("NOT_VISIBLE");
  });

  it("returns NOT_VISIBLE for visibility:hidden element", async () => {
    setupDom('<button id="btn" style="visibility:hidden">Click</button>');
    const res = await checkActionability(1, undefined, "#btn");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("NOT_VISIBLE");
  });

  it("returns NOT_VISIBLE for opacity:0 element (boundary: per spec §7.1 Playwright does not check opacity)", async () => {
    setupDom('<button id="btn" style="opacity:0">Click</button>');
    // Per spec §7.1: Playwright does NOT check opacity as actionability criterion.
    // This test asserts the vortex behavior — T2.3b decides if opacity:0 triggers NOT_VISIBLE.
    const res = await checkActionability(1, undefined, "#btn");
    // Intentionally left as a placeholder; T2.3b will determine the correct assertion.
    expect(res).toBeDefined();
  });
});
