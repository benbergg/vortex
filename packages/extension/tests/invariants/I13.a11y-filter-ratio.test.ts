// I13: a11y filter ratio ≤ 30%（5000 节点页 → ≤ 1500 nodes 进 snapshot）
// spec: vortex重构-L3-spec.md §2.1 §7

import { describe, it, expect } from "vitest";
import { captureAXSnapshot } from "../../src/reasoning/ax-snapshot.js";
import { makeTree, makeDebuggerMock } from "../fixtures/ax-tree.js";

describe("I13: a11y filter ratio ≤ 30%", () => {
  it("5000 节点 + 10% interactive → snapshot ≤ 1500 节点", async () => {
    const dbg = makeDebuggerMock();
    dbg.queueAXTree(makeTree(5000, 0.1));
    const snap = await captureAXSnapshot(dbg, 42, 0);
    expect(snap.nodes.length).toBeLessThanOrEqual(1500);
  });

  it("5000 节点 + 5% interactive → snapshot ≈ 250-500", async () => {
    const dbg = makeDebuggerMock();
    dbg.queueAXTree(makeTree(5000, 0.05));
    const snap = await captureAXSnapshot(dbg, 42, 0);
    expect(snap.nodes.length).toBeLessThanOrEqual(500);
    expect(snap.nodes.length).toBeGreaterThanOrEqual(200);
  });

  it("ignored nodes 不计入", async () => {
    const dbg = makeDebuggerMock();
    const tree = makeTree(100, 0.2);
    // 标 80% 节点为 ignored
    tree.forEach((n, i) => {
      if (i % 5 !== 0) n.ignored = true;
    });
    dbg.queueAXTree(tree);
    const snap = await captureAXSnapshot(dbg, 42, 0);
    expect(snap.nodes.length).toBeLessThanOrEqual(20);
  });
});
