// L3: RefStore — @e<N> ↔ descriptor 映射 + stale 重定位。
// spec: vortex重构-L3-spec.md §2.3
// 实现状态：T3.6 stub

import type { Descriptor, RefEntry } from "./types.js";
import type { DebuggerLike } from "./ax-snapshot.js";

export class RefStore {
  // @ts-expect-error stub fields not used yet
  private entries = new Map<string, RefEntry>();

  create(_snapshotId: string, _descriptor: Descriptor, _backendDOMNodeId?: number): string {
    throw new Error("RefStore.create: not implemented (T3.6)");
  }

  get(_ref: string): RefEntry | undefined {
    throw new Error("RefStore.get: not implemented (T3.6)");
  }

  async resolve(_ref: string, _tabId: number, _debuggerMgr: DebuggerLike): Promise<{ backendDOMNodeId: number }> {
    throw new Error("RefStore.resolve: not implemented (T3.6)");
  }

  update(_ref: string, _patch: Partial<RefEntry>): void {
    throw new Error("RefStore.update: not implemented (T3.6)");
  }
}

export const refStore = new RefStore();
