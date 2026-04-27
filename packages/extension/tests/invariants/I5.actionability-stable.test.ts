// I5: checkActionability returns NOT_STABLE for an animating element.
// Per spec §1.3: stability is determined by consecutive RAF callbacks comparing
// getBoundingClientRect() {top, left, width, height} with strict === equality.
// Implementation: ../../src/action/actionability.ts (T2.3b will implement).
//
// FIXME: remove .skip at T2.9 after actionability + auto-wait implemented.
// NOTE: this test depends on jsdom RAF mock. T2.2.5 research result → determines
// concrete implementation. jsdom does not run a real layout engine, so RAF-based
// stability checks need fake timer coordination to simulate animating bounding rects.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { JSDOM } from "jsdom";
import { checkActionability } from "../../src/action/actionability.js";

declare global {
  // eslint-disable-next-line no-var
  var chrome: any;
}

describe.skip("I5: NOT_STABLE for animating element", () => {
  let dom: JSDOM;

  beforeEach(() => {
    vi.useFakeTimers();
    dom = new JSDOM('<button id="btn">Click</button>');
    globalThis.document = dom.window.document;
    globalThis.window = dom.window as any;

    // Mock chrome.scripting.executeScript to run func synchronously in jsdom context.
    globalThis.chrome = {
      scripting: {
        executeScript: async (opts: any) => {
          const result = opts.func(...(opts.args ?? []));
          return [{ result }];
        },
      },
    };

    // Simulate moving element: getBoundingClientRect returns different values each call.
    let callCount = 0;
    const btn = dom.window.document.getElementById("btn")!;
    vi.spyOn(btn, "getBoundingClientRect").mockImplementation(() => {
      callCount++;
      return {
        top: callCount * 10,
        left: 0,
        width: 100,
        height: 40,
        right: 100,
        bottom: callCount * 10 + 40,
        x: 0,
        y: callCount * 10,
        toJSON: () => ({}),
      } as DOMRect;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns NOT_STABLE when element bounding rect changes between RAF ticks", async () => {
    // checkActionability with a single-shot check should detect instability.
    // T2.3b will implement the actual RAF polling; this test documents the contract.
    const res = await checkActionability(1, undefined, "#btn");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("NOT_STABLE");
  });
});
