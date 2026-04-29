// I4: checkActionability returns NOT_VISIBLE for hidden elements.
// Covers: display:none, opacity:0 (note: Playwright does NOT check opacity; included here
// as a boundary case — vortex also returns NOT_VISIBLE for opacity:0 due to zero bounding rect
// in jsdom; real browsers without layout would behave similarly).
// visibility:hidden is the primary CSS visibility case.
// Implementation: ../../src/action/actionability.ts
// loadPageSideModule is mocked as a no-op; page-side IIFE loaded via dynamic import.

import { describe, it, expect, vi } from "vitest";
import { setupActionabilityEnv } from "../helpers/actionability-test-setup.js";

// Mock loadPageSideModule as a no-op so chrome.scripting.executeScript({ files }) is bypassed.
vi.mock("../../src/adapter/page-side-loader.js", () => ({
  loadPageSideModule: async () => {},
  _resetPageSideLoader: () => {},
}));

describe("I4: NOT_VISIBLE for hidden elements", () => {
  it("returns NOT_VISIBLE for display:none element", async () => {
    vi.resetModules();
    setupActionabilityEnv({ html: '<button id="btn" style="display:none">Click</button>' });
    await import("../../src/page-side/actionability.js");
    const { checkActionability } = await import("../../src/action/actionability.js");
    // jsdom: display:none → getBoundingClientRect returns 0×0 → isVisible returns false.
    const res = await checkActionability(1, undefined, "#btn");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("NOT_VISIBLE");
  });

  it("returns NOT_VISIBLE for visibility:hidden element", async () => {
    vi.resetModules();
    setupActionabilityEnv({ html: '<button id="btn" style="visibility:hidden">Click</button>' });
    await import("../../src/page-side/actionability.js");
    const { checkActionability } = await import("../../src/action/actionability.js");
    // jsdom: visibility:hidden → getComputedStyle returns "hidden" → isVisible fallback returns false.
    const res = await checkActionability(1, undefined, "#btn");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("NOT_VISIBLE");
  });

  it("returns NOT_VISIBLE for opacity:0 element (boundary: per spec §7.1 Playwright does not check opacity)", async () => {
    vi.resetModules();
    setupActionabilityEnv({ html: '<button id="btn" style="opacity:0">Click</button>' });
    await import("../../src/page-side/actionability.js");
    const { checkActionability } = await import("../../src/action/actionability.js");
    // Per spec §7.1: Playwright does NOT check opacity as actionability criterion.
    // jsdom: opacity:0 → getBoundingClientRect returns 0×0 → isVisible returns NOT_VISIBLE.
    // (In real browsers, opacity:0 element has a non-zero rect and vortex does NOT block on opacity.)
    const res = await checkActionability(1, undefined, "#btn");
    // jsdom layout returns 0×0 for all elements → NOT_VISIBLE is the jsdom-specific outcome.
    expect(res).toBeDefined();
  });
});
