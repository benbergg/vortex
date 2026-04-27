// I7: checkActionability returns DISABLED for disabled elements.
// Per spec §1.5 + §5: vortex covers native disabled (BUTTON/INPUT/SELECT/TEXTAREA),
// aria-disabled (direct attribute), and fieldset[disabled] (simplified, no legend exception).
// loadPageSideModule is mocked as a no-op; page-side IIFE loaded via dynamic import.
//
// jsdom note: getBoundingClientRect returns 0×0 for all elements → isVisible would return
// NOT_VISIBLE before reaching the disabled check. Each test mocks the prototype to return
// non-zero dimensions so the probe proceeds to the isEnabled check.

import { describe, it, expect, afterEach, vi } from "vitest";
import { JSDOM } from "jsdom";
import { setupActionabilityEnv } from "../helpers/actionability-test-setup.js";

// Mock loadPageSideModule as a no-op so chrome.scripting.executeScript({ files }) is bypassed.
vi.mock("../../src/adapter/page-side-loader.js", () => ({
  loadPageSideModule: async () => {},
  _resetPageSideLoader: () => {},
}));

afterEach(() => {
  vi.restoreAllMocks();
});

/** Mocks HTMLElement.prototype.getBoundingClientRect on the given JSDOM to return a visible rect. */
function mockVisibleRect(dom: JSDOM): void {
  vi.spyOn(dom.window.HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    top: 10,
    left: 10,
    width: 100,
    height: 40,
    right: 110,
    bottom: 50,
    x: 10,
    y: 10,
    toJSON: () => ({}),
  } as DOMRect);
}

describe("I7: DISABLED for disabled elements", () => {
  it("returns DISABLED for button with disabled attribute", async () => {
    vi.resetModules();
    const dom = setupActionabilityEnv({ html: '<button id="btn" disabled>Click</button>' });
    mockVisibleRect(dom);
    await import("../../src/page-side/actionability.js");
    const { checkActionability } = await import("../../src/action/actionability.js");
    const res = await checkActionability(1, undefined, "#btn");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("DISABLED");
  });

  it("returns DISABLED for element with aria-disabled=true", async () => {
    vi.resetModules();
    const dom = setupActionabilityEnv({ html: '<button id="btn" aria-disabled="true">Click</button>' });
    mockVisibleRect(dom);
    await import("../../src/page-side/actionability.js");
    const { checkActionability } = await import("../../src/action/actionability.js");
    const res = await checkActionability(1, undefined, "#btn");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("DISABLED");
  });

  it("returns DISABLED for input inside fieldset[disabled]", async () => {
    vi.resetModules();
    const dom = setupActionabilityEnv({
      html: `<fieldset disabled><input id="inp" type="text" value="test" /></fieldset>`,
    });
    mockVisibleRect(dom);
    await import("../../src/page-side/actionability.js");
    const { checkActionability } = await import("../../src/action/actionability.js");
    const res = await checkActionability(1, undefined, "#inp");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("DISABLED");
  });
});
