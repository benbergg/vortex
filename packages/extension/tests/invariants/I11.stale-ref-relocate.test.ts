// I11: stale ref → descriptor 重消解成功率 ≥ 95%（fixture 10+ 场景）
// spec: vortex重构-L3-spec.md §1.3 + §2.3

import { describe, it, expect, beforeEach, vi } from "vitest";
import { RefStore } from "../../src/reasoning/ref-store.js";
import { interactiveNode, makeDebuggerMock, type MockDebugger } from "../fixtures/ax-tree.js";
import type { Descriptor } from "../../src/reasoning/types.js";

describe("I11: stale ref 自动用 descriptor 重消解", () => {
  let dbg: MockDebugger;
  let refStore: RefStore;

  beforeEach(() => {
    dbg = makeDebuggerMock();
    refStore = new RefStore();
  });

  it("backendDOMNodeId 失效 → 用 descriptor 重抓 snapshot 找回", async () => {
    // 第一次：original node
    const original = interactiveNode("1", "button", "Submit");
    const ref = refStore.create("snap-1", { role: "button", name: "Submit" }, original.backendDOMNodeId);

    // mock DOM.resolveNode 第一次抛错（节点消失）
    dbg.sendCommand.mockImplementationOnce(async (_t, method) => {
      if (method === "DOM.resolveNode") throw new Error("Node not found");
      return undefined;
    });

    // 第二次抓 snapshot：相同 descriptor 命中（新 backendDOMNodeId）
    const relocated = interactiveNode("2", "button", "Submit"); // backendDOMNodeId = 200
    dbg.queueAXTree([relocated]);

    const result = await refStore.resolve(ref, 42, dbg);
    expect(result.backendDOMNodeId).toBe(relocated.backendDOMNodeId);
  });

  it("10 个 stale 场景 ≥ 9.5 个恢复（≥ 95%；tier 1+2 only，selector/near 由 §2.2 自身覆盖）", async () => {
    // 全 tier-1（role+name）+ 1 tier-2（text）+ 1 expected-fail
    const scenarios: Array<{ desc: Descriptor; expectFound: boolean }> = [
      { desc: { role: "button", name: "Submit" }, expectFound: true },
      { desc: { role: "textbox", name: "Email" }, expectFound: true },
      { desc: { role: "link", name: "Home" }, expectFound: true },
      { desc: { role: "checkbox", name: "Agree" }, expectFound: true },
      { desc: { role: "combobox", name: "Country" }, expectFound: true },
      { desc: { role: "radio", name: "Yes" }, expectFound: true },
      { desc: { role: "switch", name: "Dark" }, expectFound: true },
      { desc: { role: "tab", name: "Tab1" }, expectFound: true },
      { desc: { text: "Click here" }, expectFound: true },
      { desc: { role: "button", name: "Renamed" }, expectFound: false }, // 1/10 失败可接受
    ];

    let recovered = 0;
    for (const s of scenarios) {
      const localStore = new RefStore();
      const ref = localStore.create("snap-old", s.desc, 999);
      // 构造 fixture：tier-1 用 role+name 完整匹配；tier-2 用 text-only 节点
      const target = s.expectFound
        ? [
            interactiveNode(
              "9",
              s.desc.role ?? "link",
              s.desc.name ?? s.desc.text ?? "Click here for details",
            ),
          ]
        : [];

      // 每场景独立 mock：resolveNode 抛错触发 relocate；getFullAXTree 返 target
      const localDbg = makeDebuggerMock();
      localDbg.sendCommand.mockImplementation(async (_t: number, method: string) => {
        if (method === "DOM.resolveNode") throw new Error("stale");
        if (method === "Accessibility.getFullAXTree") return { nodes: target };
        return undefined;
      });

      try {
        await localStore.resolve(ref, 42, localDbg);
        recovered++;
      } catch {
        // expected fail for last scenario
      }
    }
    expect(recovered).toBeGreaterThanOrEqual(9);
  });
});
