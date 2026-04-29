// I14: observe token (200 elem fixture) ≤ 1500
// spec: vortex重构-L3-spec.md §7

import { describe, it, expect } from "vitest";
import { captureAXSnapshot } from "../../src/reasoning/ax-snapshot.js";
import { interactiveNode, makeDebuggerMock } from "../fixtures/ax-tree.js";

// 粗略 token 估计：1 token ≈ 4 chars（OpenAI 标定 ratio）
function estimateTokens(json: string): number {
  return Math.ceil(json.length / 4);
}

describe("I14: observe token budget ≤ 1500 / 200 elem", () => {
  it("200 个 interactive 节点 snapshot 序列化后 ≤ 1500 token", async () => {
    const dbg = makeDebuggerMock();
    const nodes = Array.from({ length: 200 }, (_, i) =>
      interactiveNode(String(i + 1), "button", `Button ${i}`),
    );
    dbg.queueAXTree(nodes);
    const snap = await captureAXSnapshot(dbg, 42, 0);

    // observe 序列化（最小化字段：role / name / ref，去掉 backendDOMNodeId 等内部字段）
    const observePayload = snap.nodes.map(n => ({
      ref: n.ref,
      role: n.role,
      name: n.name,
    }));
    const json = JSON.stringify(observePayload);
    expect(estimateTokens(json)).toBeLessThanOrEqual(1500);
  });
});
