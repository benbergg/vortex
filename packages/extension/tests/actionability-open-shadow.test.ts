// Regression for issue #27: act on an open-shadow-internal element must fail FAST
// with OPEN_SHADOW_DOM, instead of the page-side probe returning NOT_ATTACHED and
// auto-wait retrying it into a full 5s TIMEOUT (the "act hang >5s" symptom found by
// the autonomous discovery engine #3 robustness layer).
//
// Root cause: observe walks open shadow via querySelectorAllDeep and emits a ref for
// the shadow-internal element, but buildSelector breaks at the shadow boundary
// (parentElement is null) and returns a bare tag selector like "button". act's
// document.querySelector("button") cannot pierce shadow → null → NOT_ATTACHED → retry.
//
// Fix: when querySelector finds nothing, the probe does a one-shot open-shadow deep
// check; a match inside an open shadow root → reason OPEN_SHADOW (non-retryable in
// auto-wait) → throws OPEN_SHADOW_DOM immediately with a diagnostic hint.

import { describe, it, expect, afterEach, vi } from "vitest";
import { VtxErrorCode } from "@bytenew/vortex-shared";
import { setupActionabilityEnv } from "./helpers/actionability-test-setup.js";

vi.mock("../src/adapter/page-side-loader.js", () => ({
  loadPageSideModule: async () => {},
  _resetPageSideLoader: () => {},
}));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("actionability open-shadow fast-fail (issue #27)", () => {
  it("act on open-shadow-internal element throws OPEN_SHADOW_DOM, not TIMEOUT", async () => {
    vi.resetModules();
    const dom = setupActionabilityEnv({ html: '<div id="host"></div>' });

    // Attach an OPEN shadow root with a button inside. No light-DOM button exists,
    // so document.querySelector("button") returns null (jsdom does not pierce shadow).
    const host = dom.window.document.getElementById("host")!;
    const sr = host.attachShadow({ mode: "open" });
    const btn = dom.window.document.createElement("button");
    btn.textContent = "影子按钮";
    sr.appendChild(btn);

    await import("../src/page-side/actionability.js");
    const { waitActionable } = await import("../src/action/auto-wait.js");

    // timeout is generous on purpose: the fix throws immediately (non-retryable),
    // so this resolves fast. Before the fix it would loop the full timeout then
    // throw TIMEOUT — the regression this test locks out.
    let caught: any;
    await waitActionable(1, undefined, "button", { timeout: 2000 }).catch((e) => {
      caught = e;
    });

    expect(caught).toBeDefined();
    expect(caught.code).toBe(VtxErrorCode.OPEN_SHADOW_DOM);
    expect(caught.code).not.toBe(VtxErrorCode.TIMEOUT);
  });

  it("element nested two shadow levels deep is also detected (recursive walk)", async () => {
    vi.resetModules();
    const dom = setupActionabilityEnv({ html: '<div id="host"></div>' });

    // host → open shadow → innerHost → open shadow → button. The button lives two
    // shadow levels down, exercising existsInOpenShadow's recursive walk(sr, depth+1).
    const host = dom.window.document.getElementById("host")!;
    const sr1 = host.attachShadow({ mode: "open" });
    const innerHost = dom.window.document.createElement("div");
    sr1.appendChild(innerHost);
    const sr2 = innerHost.attachShadow({ mode: "open" });
    const btn = dom.window.document.createElement("button");
    btn.textContent = "深层影子按钮";
    sr2.appendChild(btn);

    await import("../src/page-side/actionability.js");
    const { waitActionable } = await import("../src/action/auto-wait.js");

    let caught: any;
    await waitActionable(1, undefined, "button", { timeout: 2000 }).catch((e) => {
      caught = e;
    });

    expect(caught).toBeDefined();
    expect(caught.code).toBe(VtxErrorCode.OPEN_SHADOW_DOM);
  });

  it("genuinely missing element (no shadow match) still reports NOT_ATTACHED → TIMEOUT", async () => {
    vi.resetModules();
    const dom = setupActionabilityEnv({ html: "<div id='x'></div>" });
    void dom;

    await import("../src/page-side/actionability.js");
    const { waitActionable } = await import("../src/action/auto-wait.js");

    // "button" matches nothing anywhere (no light button, no shadow) → NOT_ATTACHED
    // remains retryable → TIMEOUT after the (short) timeout. Confirms the fast-fail
    // is scoped to genuine open-shadow matches and does not swallow transient-attach.
    let caught: any;
    await waitActionable(1, undefined, "button", { timeout: 150 }).catch((e) => {
      caught = e;
    });

    expect(caught).toBeDefined();
    expect(caught.code).toBe(VtxErrorCode.TIMEOUT);
  });
});
