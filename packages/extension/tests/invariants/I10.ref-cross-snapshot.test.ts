// I10: ref 跨 snapshot 在原节点存活时仍可 resolve。
// spec: vortex重构-L3-spec.md §1.1 + §2.3

import { describe, it, expect, beforeEach } from "vitest";
import { captureAXSnapshot } from "../../src/reasoning/ax-snapshot.js";
import { RefStore } from "../../src/reasoning/ref-store.js";
import { interactiveNode, makeDebuggerMock, type MockDebugger } from "../fixtures/ax-tree.js";

describe("I10: ref 跨 snapshot 在节点存活时 resolve 成功", () => {
  let dbg: MockDebugger;
  let refStore: RefStore;

  beforeEach(() => {
    dbg = makeDebuggerMock();
    refStore = new RefStore();
  });

  it("两次抓 snapshot，相同节点 backendDOMNodeId 不变 → ref 可 resolve", async () => {
    const nodes = [interactiveNode("1", "button", "Submit")];
    dbg.queueAXTree(nodes);
    const snap1 = await captureAXSnapshot(dbg, 42, 0);

    const node = snap1.nodes[0];
    const ref = refStore.create(snap1.snapshotId, { role: "button", name: "Submit" }, node.backendDOMNodeId);

    // 第二次抓 snapshot，节点仍存在
    dbg.queueAXTree(nodes);
    const resolved = await refStore.resolve(ref, 42, dbg);

    expect(resolved.backendDOMNodeId).toBe(node.backendDOMNodeId);
  });
});
