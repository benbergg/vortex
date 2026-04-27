// I8: checkActionability returns NOT_EDITABLE for non-editable elements.
// Per spec §1.6 + §5: vortex checks INPUT/TEXTAREA/SELECT readonly attribute,
// and non-input elements (e.g. span) that are not contenteditable.
// contenteditable elements are always editable.
// loadPageSideModule is mocked as a no-op; page-side IIFE loaded via dynamic import.
//
// jsdom note: getBoundingClientRect returns 0×0 → isVisible returns NOT_VISIBLE before
// reaching the editable check. Each test mocks the prototype to return a visible rect.

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

describe("I8: NOT_EDITABLE for readonly / non-editable elements", () => {
  it("returns NOT_EDITABLE for input with readonly attribute", async () => {
    vi.resetModules();
    const dom = setupActionabilityEnv({ html: '<input id="inp" type="text" readonly value="test" />' });
    mockVisibleRect(dom);
    await import("../../src/page-side/actionability.js");
    const { checkActionability } = await import("../../src/action/actionability.js");
    const res = await checkActionability(1, undefined, "#inp", { needsEditable: true });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("NOT_EDITABLE");
  });

  it("returns NOT_EDITABLE for plain span (not contenteditable)", async () => {
    vi.resetModules();
    const dom = setupActionabilityEnv({ html: '<span id="txt">Hello</span>' });
    mockVisibleRect(dom);
    await import("../../src/page-side/actionability.js");
    const { checkActionability } = await import("../../src/action/actionability.js");
    const res = await checkActionability(1, undefined, "#txt", { needsEditable: true });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("NOT_EDITABLE");
  });

  it("returns ok=true for a normal writable input", async () => {
    vi.resetModules();
    let inputRef: Element | null = null;
    const dom = setupActionabilityEnv({
      html: '<input id="inp" type="text" value="" />',
      // elementFromPoint returns the input itself → receivesEvents passes.
      elementFromPoint: (_x: number, _y: number) => inputRef,
    });
    inputRef = dom.window.document.getElementById("inp");
    mockVisibleRect(dom);
    await import("../../src/page-side/actionability.js");
    const { checkActionability } = await import("../../src/action/actionability.js");
    // skipStable avoids the async RAF-based probeStable check for this simple positive assertion.
    const res = await checkActionability(1, undefined, "#inp", {
      needsEditable: true,
      skipStable: true,
    });
    expect(res.ok).toBe(true);
  });
});
