// I22: open shadow 通（CDP flatten） / closed shadow detectClosedShadow 命中
// spec: vortex重构-L3-spec.md §3.2

import { describe, it, expect } from "vitest";
import { captureAXSnapshot, detectClosedShadow } from "../../src/reasoning/ax-snapshot.js";
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

  it("custom element + 无 shadowRoots + Runtime probe 真 → detectClosedShadow 返 true", async () => {
    const dbg = makeDebuggerMock();
    dbg.sendCommand.mockImplementation(async (_t: number, method: string) => {
      if (method === "DOM.describeNode") {
        return { node: { nodeName: "MY-WIDGET", shadowRoots: [] } };
      }
      if (method === "Runtime.evaluate") {
        return { result: { value: true } };
      }
      return undefined;
    });
    const closed = await detectClosedShadow(dbg, 42, 100);
    expect(closed).toBe(true);
  });

  it("普通元素（无 hyphen）→ detectClosedShadow 返 false", async () => {
    const dbg = makeDebuggerMock();
    dbg.sendCommand.mockImplementation(async (_t: number, method: string) => {
      if (method === "DOM.describeNode") {
        return { node: { nodeName: "DIV", shadowRoots: [] } };
      }
      return undefined;
    });
    const closed = await detectClosedShadow(dbg, 42, 100);
    expect(closed).toBe(false);
  });

  it("custom element + 有 shadowRoots → detectClosedShadow 返 false（open shadow）", async () => {
    const dbg = makeDebuggerMock();
    dbg.sendCommand.mockImplementation(async (_t: number, method: string) => {
      if (method === "DOM.describeNode") {
        return { node: { nodeName: "MY-WIDGET", shadowRoots: [{ nodeId: 5 }] } };
      }
      return undefined;
    });
    const closed = await detectClosedShadow(dbg, 42, 100);
    expect(closed).toBe(false);
  });
});
