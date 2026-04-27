// I8: checkActionability returns NOT_EDITABLE for non-editable elements.
// Per spec §1.6 + §5: vortex checks INPUT/TEXTAREA/SELECT readonly attribute,
// and non-input elements (e.g. span) that are not contenteditable.
// contenteditable elements are always editable.
// Implementation: ../../src/action/actionability.ts (T2.3b will implement).
// FIXME: remove .skip at T2.9 after actionability is implemented.

import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { checkActionability } from "../../src/action/actionability.js";

declare global {
  // eslint-disable-next-line no-var
  var chrome: any;
}

describe.skip("I8: NOT_EDITABLE for readonly / non-editable elements", () => {
  function setupDom(html: string) {
    const dom = new JSDOM(html);
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

  it("returns NOT_EDITABLE for input with readonly attribute", async () => {
    setupDom('<input id="inp" type="text" readonly value="test" />');
    const res = await checkActionability(1, undefined, "#inp", { needsEditable: true });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("NOT_EDITABLE");
  });

  it("returns NOT_EDITABLE for plain span (not contenteditable)", async () => {
    setupDom('<span id="txt">Hello</span>');
    const res = await checkActionability(1, undefined, "#txt", { needsEditable: true });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("NOT_EDITABLE");
  });

  it("returns ok=true for a normal writable input", async () => {
    setupDom('<input id="inp" type="text" value="" />');
    const res = await checkActionability(1, undefined, "#inp", { needsEditable: true });
    expect(res.ok).toBe(true);
  });
});
