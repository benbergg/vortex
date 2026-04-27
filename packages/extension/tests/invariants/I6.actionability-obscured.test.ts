// I6: checkActionability returns OBSCURED when another element covers the target.
// Per spec §1.4: ReceivesEvents uses document.elementFromPoint (simplified single-layer,
// without full shadow DOM traversal per spec §5 vortex simplification).
// jsdom does not implement elementFromPoint — mock required.
// loadPageSideModule is mocked as a no-op; page-side IIFE loaded via dynamic import.

import { describe, it, expect, vi } from "vitest";
import { JSDOM } from "jsdom";
import { setupActionabilityEnv } from "../helpers/actionability-test-setup.js";

// Mock loadPageSideModule as a no-op so chrome.scripting.executeScript({ files }) is bypassed.
vi.mock("../../src/adapter/page-side-loader.js", () => ({
  loadPageSideModule: async () => {},
  _resetPageSideLoader: () => {},
}));

describe("I6: OBSCURED when element is covered by another element", () => {
  it("returns OBSCURED with blocker info when another element covers target center", async () => {
    vi.resetModules();

    const html = `
      <div id="overlay" style="position:fixed;top:0;left:0;width:200px;height:200px;z-index:999">Overlay</div>
      <button id="btn" style="position:absolute;top:10px;left:10px;width:100px;height:40px">Click</button>
    `;

    // Placeholder dom reference; real overlay set after env is created.
    let overlayRef: Element | null = null;

    const dom: JSDOM = setupActionabilityEnv({
      html,
      // elementFromPoint returns the overlay (not the button) → OBSCURED.
      elementFromPoint: (_x: number, _y: number) => overlayRef,
    });

    overlayRef = dom.window.document.getElementById("overlay");

    // jsdom getBoundingClientRect always returns 0×0; mock the button to return non-zero
    // so isVisible passes and the probe reaches the receivesEvents check.
    const btn = dom.window.document.getElementById("btn")!;
    vi.spyOn(btn, "getBoundingClientRect").mockReturnValue({
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

    await import("../../src/page-side/actionability.js");
    const { checkActionability } = await import("../../src/action/actionability.js");

    const res = await checkActionability(1, undefined, "#btn");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("OBSCURED");
    // Per spec §1.4: extras should identify the blocking element.
    expect(res.extras).toBeDefined();

    vi.restoreAllMocks();
  });
});
