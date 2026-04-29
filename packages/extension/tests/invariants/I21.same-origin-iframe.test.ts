// I21: 同源 iframe 跨 frame observe + act 通；跨源抛 CROSS_ORIGIN_IFRAME
// spec: vortex重构-L3-spec.md §3.1

import { describe, it, expect } from "vitest";
import { captureAXSnapshot } from "../../src/reasoning/ax-snapshot.js";
import { interactiveNode, makeDebuggerMock } from "../fixtures/ax-tree.js";

describe("I21: 同源 iframe", () => {
  it("frameId != 0 时传给 getFullAXTree", async () => {
    const dbg = makeDebuggerMock();
    dbg.queueAXTree([interactiveNode("1", "button", "InFrame")]);
    const snap = await captureAXSnapshot(dbg, 42, /* frameId */ 7);
    expect(snap.frameId).toBe(7);
    expect(dbg.sendCommand).toHaveBeenCalledWith(42, "Accessibility.getFullAXTree", { frameId: 7 });
  });

  it("跨源 iframe getFullAXTree 抛 → CROSS_ORIGIN_IFRAME", async () => {
    const dbg = makeDebuggerMock();
    dbg.sendCommand.mockImplementationOnce(async (_t, method) => {
      if (method === "Accessibility.getFullAXTree") {
        throw new Error("Cannot access iframe content (cross-origin)");
      }
      return undefined;
    });
    await expect(captureAXSnapshot(dbg, 42, 99)).rejects.toThrow(/CROSS_ORIGIN_IFRAME/);
  });
});
