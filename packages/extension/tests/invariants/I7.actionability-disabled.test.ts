// I7: checkActionability returns DISABLED for disabled elements.
// Per spec §1.5 + §5: vortex covers native disabled (BUTTON/INPUT/SELECT/TEXTAREA),
// aria-disabled (direct attribute), and fieldset[disabled] (simplified, no legend exception).
// Implementation: ../../src/action/actionability.ts (T2.3b will implement).
// FIXME: remove .skip at T2.9 after actionability is implemented.

import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { checkActionability } from "../../src/action/actionability.js";

declare global {
  // eslint-disable-next-line no-var
  var chrome: any;
}

describe.skip("I7: DISABLED for disabled elements", () => {
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

  it("returns DISABLED for button with disabled attribute", async () => {
    setupDom('<button id="btn" disabled>Click</button>');
    const res = await checkActionability(1, undefined, "#btn");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("DISABLED");
  });

  it("returns DISABLED for element with aria-disabled=true", async () => {
    setupDom('<button id="btn" aria-disabled="true">Click</button>');
    const res = await checkActionability(1, undefined, "#btn");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("DISABLED");
  });

  it("returns DISABLED for input inside fieldset[disabled]", async () => {
    setupDom(`
      <fieldset disabled>
        <input id="inp" type="text" value="test" />
      </fieldset>
    `);
    const res = await checkActionability(1, undefined, "#inp");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("DISABLED");
  });
});
