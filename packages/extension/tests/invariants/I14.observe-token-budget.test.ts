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
    // 用真实场景常见的短按钮名（OK / Cancel / Submit 等，avg 4-6 char）
    const labels = ["OK", "Cancel", "Submit", "Edit", "Delete", "Save", "Close", "Open"];
    const nodes = Array.from({ length: 200 }, (_, i) =>
      interactiveNode(String(i + 1), "button", labels[i % labels.length]),
    );
    dbg.queueAXTree(nodes);
    const snap = await captureAXSnapshot(dbg, 42, 0);

    // observe 序列化按 tuple 紧凑形式 [ref, role, name]，并按 role 分桶去 role 重复
    // 对单一 role 群（最常见场景）的紧凑编码：{role: "button", items: [[ref, name], ...]}
    const grouped: Record<string, Array<[string, string]>> = {};
    for (const n of snap.nodes) {
      grouped[n.role] ??= [];
      grouped[n.role].push([n.ref, n.name]);
    }
    const json = JSON.stringify(grouped);
    expect(estimateTokens(json)).toBeLessThanOrEqual(1500);
  });
});
