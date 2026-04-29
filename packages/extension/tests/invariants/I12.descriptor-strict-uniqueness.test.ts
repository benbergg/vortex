// I12: descriptor 三级消解唯一性（strict 模式）
// spec: vortex重构-L3-spec.md §2.2

import { describe, it, expect } from "vitest";
import { VtxErrorCode } from "@bytenew/vortex-shared";
import { resolveDescriptor } from "../../src/reasoning/descriptor.js";
import type { AXSnapshot } from "../../src/reasoning/types.js";
import { interactiveNode, makeDebuggerMock } from "../fixtures/ax-tree.js";

function snap(nodes: ReturnType<typeof interactiveNode>[]): AXSnapshot {
  return {
    snapshotId: "snap-test",
    tabId: 1,
    frameId: 0,
    capturedAt: Date.now(),
    nodes: nodes.map((n, i) => ({
      ref: `@e${i}`,
      role: n.role!.value,
      name: n.name!.value,
      textHash: "0".repeat(16),
      properties: {},
      backendDOMNodeId: n.backendDOMNodeId,
    })),
  };
}

describe("I12: descriptor strict 唯一性", () => {
  it("tier 1 单匹配 → resolve 返回该节点", async () => {
    const s = snap([interactiveNode("1", "button", "Submit")]);
    const r = await resolveDescriptor({ role: "button", name: "Submit" }, s);
    expect(r.tier).toBe(1);
    expect(r.ref).toBe("@e0");
  });

  it("tier 1 多匹配 + strict 默认 → 抛 AMBIGUOUS_DESCRIPTOR", async () => {
    const s = snap([
      interactiveNode("1", "button", "OK"),
      interactiveNode("2", "button", "OK"),
    ]);
    await expect(resolveDescriptor({ role: "button", name: "OK" }, s))
      .rejects.toMatchObject({ code: VtxErrorCode.AMBIGUOUS_DESCRIPTOR });
  });

  it("tier 1 多匹配 + strict=false → 返回首个", async () => {
    const s = snap([
      interactiveNode("1", "button", "OK"),
      interactiveNode("2", "button", "OK"),
    ]);
    const r = await resolveDescriptor({ role: "button", name: "OK", strict: false }, s);
    expect(r.ref).toBe("@e0");
  });

  it("tier 1 fail → tier 2 visible text 命中", async () => {
    const s = snap([interactiveNode("1", "link", "Click here for details")]);
    const r = await resolveDescriptor({ text: "Click here" }, s);
    expect(r.tier).toBe(2);
  });

  it("全部 tier 失败 → 抛 REF_NOT_FOUND", async () => {
    const s = snap([interactiveNode("1", "button", "Cancel")]);
    await expect(resolveDescriptor({ role: "button", name: "NotExist" }, s))
      .rejects.toMatchObject({ code: VtxErrorCode.REF_NOT_FOUND });
  });

  it("tier 3 css selector → 调 DOM.querySelector", async () => {
    const dbg = makeDebuggerMock();
    dbg.sendCommand.mockImplementation(async (_t, method) => {
      if (method === "DOM.querySelector") return { nodeId: 5, backendNodeId: 100 };
      return undefined;
    });
    const s = snap([interactiveNode("1", "button", "Submit")]); // backendDOMNodeId = 100
    const r = await resolveDescriptor({ selector: "#submit" }, s, dbg);
    expect(r.tier).toBe(3);
  });
});
