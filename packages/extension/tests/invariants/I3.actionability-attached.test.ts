// I3: checkActionability returns NOT_ATTACHED for a detached element.
// Implementation: ../../src/action/actionability.ts (T2.3b will implement).
// FIXME: remove .skip at T2.9 after actionability is implemented.

import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { checkActionability } from "../../src/action/actionability.js";

declare global {
  // eslint-disable-next-line no-var
  var chrome: any;
}

describe.skip("I3: NOT_ATTACHED for detached element", () => {
  let dom: JSDOM;
  beforeEach(() => {
    dom = new JSDOM('<button id="btn">Click</button>');
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
  });

  it("returns NOT_ATTACHED after element is removed from DOM", async () => {
    const btn = document.getElementById("btn")!;
    btn.remove();
    const res = await checkActionability(1, undefined, "#btn");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("NOT_ATTACHED");
  });
});
