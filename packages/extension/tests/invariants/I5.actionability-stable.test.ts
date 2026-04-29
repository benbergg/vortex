// I5: checkActionability returns NOT_STABLE for an animating element.
// Per spec §1.3: stability is determined by consecutive RAF callbacks comparing
// getBoundingClientRect() {top, left, width, height} with strict === equality.
//
// jsdom RAF mock: requestAnimationFrame is shimmed to setTimeout(0) in the test setup helper,
// so vi.useFakeTimers() can advance the RAF ticks to simulate the double-sample check.
// loadPageSideModule is mocked as a no-op; page-side IIFE loaded via dynamic import.

import { describe, it, expect, afterEach, vi } from "vitest";
import { JSDOM } from "jsdom";
import { setupActionabilityEnv } from "../helpers/actionability-test-setup.js";

// Mock loadPageSideModule as a no-op so chrome.scripting.executeScript({ files }) is bypassed.
vi.mock("../../src/adapter/page-side-loader.js", () => ({
  loadPageSideModule: async () => {},
  _resetPageSideLoader: () => {},
}));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("I5: NOT_STABLE for animating element", () => {
  it("returns NOT_STABLE when element bounding rect changes between RAF ticks", async () => {
    vi.useFakeTimers();
    vi.resetModules();

    // Set up env with a placeholder elementFromPoint; override below after element reference.
    const dom: JSDOM = setupActionabilityEnv({
      html: '<button id="btn">Click</button>',
    });

    const btn = dom.window.document.getElementById("btn")!;

    // Override elementFromPoint to return the button so receivesEvents passes (no OBSCURED).
    Object.defineProperty(dom.window.document, "elementFromPoint", {
      value: (_x: number, _y: number) => btn,
      writable: true,
      configurable: true,
    });

    // Simulate animating element: getBoundingClientRect returns different position each call.
    let callCount = 0;
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

    await import("../../src/page-side/actionability.js");
    const { checkActionability } = await import("../../src/action/actionability.js");

    // Start checkActionability; it will await probeStable which uses double-RAF.
    // The RAF shim uses setTimeout(0), so we use runAllTimersAsync to drain all pending
    // timers and microtasks so the nested RAF callbacks fire and probeStable resolves.
    const [res] = await Promise.all([
      checkActionability(1, undefined, "#btn"),
      vi.runAllTimersAsync(),
    ]);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("NOT_STABLE");
  });
});
