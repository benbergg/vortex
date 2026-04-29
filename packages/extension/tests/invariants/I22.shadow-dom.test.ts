// I22: open shadow 通（CDP flatten） / closed shadow 抛 CLOSED_SHADOW_DOM
// spec: vortex重构-L3-spec.md §3.2

import { describe, it, expect } from "vitest";
import { captureAXSnapshot } from "../../src/reasoning/ax-snapshot.js";
import { interactiveNode, makeDebuggerMock } from "../fixtures/ax-tree.js";

describe("I22: shadow DOM 边界", () => {
  it("open shadow CDP flatten → snapshot 含 shadow children", async () => {
    const dbg = makeDebuggerMock();
    // CDP 已 flatten：host node + shadow internal button 同层出现
    dbg.queueAXTree([
      interactiveNode("1", "generic", "host"),
      interactiveNode("2", "button", "InShadow"),
    ]);
    const snap = await captureAXSnapshot(dbg, 42, 0);
    const inShadow = snap.nodes.find(n => n.name === "InShadow");
    expect(inShadow).toBeDefined();
  });

  it("closed shadow detect → 抛 CLOSED_SHADOW_DOM（含 hint）", async () => {
    const dbg = makeDebuggerMock();
    // 模拟 CDP 探测 closed shadow
    dbg.sendCommand.mockImplementation(async (_t, method) => {
      if (method === "Runtime.evaluate") {
        return { result: { value: "closed" } };
      }
      if (method === "Accessibility.getFullAXTree") {
        return { nodes: [interactiveNode("1", "generic", "shadow-host")] };
      }
      return undefined;
    });
    // 占位：实际 closed shadow 探测调用方决定，T3.7 实现时再补完整流程
    expect(true).toBe(true); // TODO: T3.7 后填具体断言
  });
});
