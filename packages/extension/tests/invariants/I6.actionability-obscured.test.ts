// I6: checkActionability returns OBSCURED when another element covers the target.
// Per spec §1.4: ReceivesEvents uses document.elementFromPoint (simplified single-layer,
// without full shadow DOM traversal per spec §5 vortex simplification).
// jsdom does not implement elementFromPoint — mock required.
// Implementation: ../../src/action/actionability.ts (T2.3b will implement).
// FIXME: remove .skip at T2.9 after actionability is implemented.

import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { checkActionability } from "../../src/action/actionability.js";

declare global {
  // eslint-disable-next-line no-var
  var chrome: any;
}

describe.skip("I6: OBSCURED when element is covered by another element", () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM(`
      <div id="overlay" style="position:fixed;top:0;left:0;width:200px;height:200px;z-index:999">Overlay</div>
      <button id="btn" style="position:absolute;top:10px;left:10px;width:100px;height:40px">Click</button>
    `);
    globalThis.document = dom.window.document;
    globalThis.window = dom.window as any;

    // jsdom does not implement elementFromPoint; mock it to return the overlay element.
    const overlay = dom.window.document.getElementById("overlay")!;
    dom.window.document.elementFromPoint = (_x: number, _y: number) => overlay;

    globalThis.chrome = {
      scripting: {
        executeScript: async (opts: any) => {
          const result = opts.func(...(opts.args ?? []));
          return [{ result }];
        },
      },
    };
  });

  it("returns OBSCURED with blocker info when another element covers target center", async () => {
    const res = await checkActionability(1, undefined, "#btn");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("OBSCURED");
    // Per spec §1.4: extras should identify the blocking element.
    expect(res.extras).toBeDefined();
  });
});
