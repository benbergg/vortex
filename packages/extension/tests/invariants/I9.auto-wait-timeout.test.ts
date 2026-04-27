// I9: waitActionable times out and returns the last failure reason when element
// remains non-actionable for the full timeout duration.
// Per spec §2: default timeout 5000ms (vortex L2), reason-aware retry strategy.
// Implementation: ../../src/action/auto-wait.ts (T2.4 will implement).
// FIXME: remove .skip at T2.9 after auto-wait is implemented.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { JSDOM } from "jsdom";
import { waitActionable } from "../../src/action/auto-wait.js";

declare global {
  // eslint-disable-next-line no-var
  var chrome: any;
}

describe.skip("I9: waitActionable times out when element stays non-actionable", () => {
  let dom: JSDOM;

  beforeEach(() => {
    vi.useFakeTimers();
    dom = new JSDOM('<button id="btn" disabled>Click</button>');
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
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with ok=false and last failure reason after timeout", async () => {
    const timeout = 200;
    // Start waiting; advance time past timeout to trigger resolution.
    const waitPromise = waitActionable(1, undefined, "#btn", { timeout });
    await vi.advanceTimersByTimeAsync(timeout + 50);
    const res = await waitPromise;

    expect(res.ok).toBe(false);
    // Element is disabled, so last failure reason should be DISABLED.
    expect(res.reason).toBe("DISABLED");
    // Auto-wait should have made multiple attempts before timing out.
    expect(typeof res.attempts).toBe("number");
    expect(res.attempts).toBeGreaterThan(0);
  });
});
