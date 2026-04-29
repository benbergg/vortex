// I9: waitActionable times out and throws with the last failure reason when element
// remains non-actionable for the full timeout duration.
// Per spec §2: default timeout 5000ms (vortex L2), reason-aware retry strategy.
// loadPageSideModule is mocked as a no-op; page-side IIFE loaded via dynamic import.
//
// jsdom note: getBoundingClientRect returns 0×0 → isVisible would fire before isEnabled.
// The disabled button will return NOT_VISIBLE instead of DISABLED unless we mock the rect.
// We mock HTMLElement.prototype.getBoundingClientRect to return a visible rect so the
// probe proceeds to the isEnabled check and returns DISABLED as expected.

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

describe("I9: waitActionable times out when element stays non-actionable", () => {
  it("rejects with TIMEOUT error and lastReason after timeout", async () => {
    vi.useFakeTimers();
    vi.resetModules();

    const dom = setupActionabilityEnv({ html: '<button id="btn" disabled>Click</button>' });

    // Mock visible rect so the probe reaches isEnabled and returns DISABLED (not NOT_VISIBLE).
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

    await import("../../src/page-side/actionability.js");
    const { waitActionable } = await import("../../src/action/auto-wait.js");

    const timeout = 200;
    // Start waiting; advance time past the timeout to trigger rejection.
    // Use try/catch pattern (not rejects.toMatchObject) to avoid the unhandled-rejection
    // warning that occurs when the rejection is handled asynchronously.
    let caught: unknown;
    const waitPromise = waitActionable(1, undefined, "#btn", { timeout }).catch((err) => {
      caught = err;
    });
    await vi.advanceTimersByTimeAsync(timeout + 50);
    await waitPromise;

    // Element is disabled → last failure reason should be DISABLED.
    // VtxError structure: { code, extra: { hint, recoverable, context: { selector, extras } } }
    expect(caught).toMatchObject({
      code: "TIMEOUT",
      extra: expect.objectContaining({
        context: expect.objectContaining({
          extras: expect.objectContaining({ lastReason: "DISABLED" }),
        }),
      }),
    });
  });
});
