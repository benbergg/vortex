// L3: RefStore — @e<N> ↔ descriptor 映射 + stale 重定位。
// spec: vortex重构-L3-spec.md §2.3

import { vtxError, VtxErrorCode } from "@bytenew/vortex-shared";
import type { Descriptor, RefEntry } from "./types.js";
import type { DebuggerLike } from "./ax-snapshot.js";
import { captureAXSnapshot } from "./ax-snapshot.js";
import { resolveDescriptor } from "./descriptor.js";

const SNAPSHOT_TTL_MS = 5 * 60 * 1000; // 5 min

export class RefStore {
  private entries = new Map<string, RefEntry>();
  private nextId = 0;

  create(snapshotId: string, descriptor: Descriptor, backendDOMNodeId?: number): string {
    const ref = `@e${this.nextId++}`;
    const entry: RefEntry = {
      ref,
      snapshotId,
      descriptor,
      lastValid: Date.now(),
    };
    if (backendDOMNodeId !== undefined) entry.backendDOMNodeId = backendDOMNodeId;
    this.entries.set(ref, entry);
    return ref;
  }

  get(ref: string): RefEntry | undefined {
    return this.entries.get(ref);
  }

  update(ref: string, patch: Partial<RefEntry>): void {
    const cur = this.entries.get(ref);
    if (!cur) return;
    this.entries.set(ref, { ...cur, ...patch });
  }

  async resolve(
    ref: string,
    tabId: number,
    debuggerMgr: DebuggerLike,
  ): Promise<{ backendDOMNodeId: number }> {
    const entry = this.entries.get(ref);
    if (!entry) {
      throw vtxError(VtxErrorCode.REF_NOT_FOUND, `ref ${ref} not in store`, {
        extras: { ref },
      });
    }

    // 试当前 backendDOMNodeId 是否还活着
    if (entry.backendDOMNodeId !== undefined) {
      try {
        await debuggerMgr.sendCommand(tabId, "DOM.resolveNode", {
          backendNodeId: entry.backendDOMNodeId,
        });
        this.update(ref, { lastValid: Date.now() });
        return { backendDOMNodeId: entry.backendDOMNodeId };
      } catch {
        // fall through to descriptor relocate
      }
    }

    // stale → 重抓 + descriptor 重消解
    try {
      const snap = await captureAXSnapshot(debuggerMgr, tabId, /* frameId */ 0);
      const resolved = await resolveDescriptor(entry.descriptor, snap, debuggerMgr);
      this.update(ref, {
        backendDOMNodeId: resolved.backendDOMNodeId,
        snapshotId: snap.snapshotId,
        lastValid: Date.now(),
      });
      return { backendDOMNodeId: resolved.backendDOMNodeId };
    } catch (relocateErr) {
      throw vtxError(
        VtxErrorCode.STALE_REF,
        `ref ${ref} stale and descriptor re-resolve failed`,
        {
          extras: {
            ref,
            cause: relocateErr instanceof Error ? relocateErr.message : String(relocateErr),
          },
        },
      );
    }
  }

  clearStale(now = Date.now()): void {
    for (const [ref, e] of this.entries) {
      if (now - e.lastValid > SNAPSHOT_TTL_MS) this.entries.delete(ref);
    }
  }
}

export const refStore = new RefStore();
