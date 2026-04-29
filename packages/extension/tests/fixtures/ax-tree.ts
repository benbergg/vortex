// PR #3 L3 Reasoning fixture helpers — CDP AX tree mock + DebuggerManager mock.
// spec: vortex重构-L3-spec.md §1 + §2

import { vi } from "vitest";
import type { CDPAXNode } from "../../src/reasoning/types.js";
import type { DebuggerLike } from "../../src/reasoning/ax-snapshot.js";

// Build a CDP AXNode literal with sensible defaults.
export function cdpNode(overrides: Partial<CDPAXNode> & { nodeId: string }): CDPAXNode {
  return {
    role: { value: "generic" },
    name: { value: "" },
    ...overrides,
  };
}

export function interactiveNode(
  nodeId: string,
  role: string,
  name: string,
  extras: Partial<CDPAXNode> = {},
): CDPAXNode {
  return {
    nodeId,
    role: { value: role },
    name: { value: name },
    backendDOMNodeId: parseInt(nodeId, 10) * 100,
    ...extras,
  };
}

export function ignoredNode(nodeId: string): CDPAXNode {
  return { nodeId, ignored: true };
}

// Create a synthetic CDP AX tree of `count` nodes，按 ratio 比例标 interactive。
export function makeTree(count: number, interactiveRatio = 0.1): CDPAXNode[] {
  const nodes: CDPAXNode[] = [];
  for (let i = 0; i < count; i++) {
    const isInteractive = i < Math.floor(count * interactiveRatio);
    nodes.push(
      isInteractive
        ? interactiveNode(String(i), "button", `btn-${i}`)
        : cdpNode({ nodeId: String(i), role: { value: "generic" } }),
    );
  }
  return nodes;
}

// Mock DebuggerManager that returns canned getFullAXTree responses.
export interface MockDebugger extends DebuggerLike {
  enableDomain: ReturnType<typeof vi.fn>;
  sendCommand: ReturnType<typeof vi.fn>;
  // helper to chain多次 getFullAXTree 不同响应（snap1 / snap2 / ...）
  queueAXTree(nodes: CDPAXNode[]): void;
}

export function makeDebuggerMock(): MockDebugger {
  const queued: CDPAXNode[][] = [];
  const enableDomain = vi.fn().mockResolvedValue(undefined);
  const sendCommand = vi.fn(async (_tabId: number, method: string, _params?: unknown) => {
    if (method === "Accessibility.getFullAXTree") {
      const nodes = queued.shift() ?? [];
      return { nodes };
    }
    if (method === "DOM.resolveNode") {
      // 默认 alive；测试可 override
      return { object: { objectId: "obj-stub" } };
    }
    if (method === "DOM.querySelector") {
      return { nodeId: 0, backendNodeId: undefined };
    }
    return undefined;
  });
  return {
    enableDomain,
    sendCommand,
    queueAXTree(nodes: CDPAXNode[]) {
      queued.push(nodes);
    },
  };
}
