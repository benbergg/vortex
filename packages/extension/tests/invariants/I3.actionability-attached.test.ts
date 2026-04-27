// I3: checkActionability returns NOT_ATTACHED for a detached element.
// Implementation: ../../src/action/actionability.ts
// loadPageSideModule is mocked as a no-op; page-side IIFE loaded via dynamic import.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { setupActionabilityEnv } from "../helpers/actionability-test-setup.js";

// Mock loadPageSideModule as a no-op so chrome.scripting.executeScript({ files }) is bypassed.
vi.mock("../../src/adapter/page-side-loader.js", () => ({
  loadPageSideModule: async () => {},
  _resetPageSideLoader: () => {},
}));

describe("I3: NOT_ATTACHED for detached element", () => {
  beforeEach(async () => {
    // Reset module registry so the page-side IIFE re-executes on the fresh globalThis.window.
    vi.resetModules();
    setupActionabilityEnv({ html: '<button id="btn">Click</button>' });
    await import("../../src/page-side/actionability.js");
  });

  it("returns NOT_ATTACHED after element is removed from DOM", async () => {
    const { checkActionability } = await import("../../src/action/actionability.js");
    const btn = document.getElementById("btn")!;
    btn.remove();
    const res = await checkActionability(1, undefined, "#btn");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("NOT_ATTACHED");
  });
});
