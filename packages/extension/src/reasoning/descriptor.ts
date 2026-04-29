// L3: descriptor 三级消解（role+name → text → CSS）。
// spec: vortex重构-L3-spec.md §2.2
// 实现状态：T3.5 stub

import type { AXNode, AXSnapshot, Descriptor } from "./types.js";
import type { DebuggerLike } from "./ax-snapshot.js";

export interface ResolveResult {
  ref: string;
  backendDOMNodeId: number;
  tier: 1 | 2 | 3;
}

export async function resolveDescriptor(
  _d: Descriptor,
  _snap: AXSnapshot,
  _debuggerMgr?: DebuggerLike,
): Promise<ResolveResult> {
  throw new Error("resolveDescriptor: not implemented (T3.5)");
}

export function normalizeName(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

export async function sha16(_input: string): Promise<string> {
  throw new Error("sha16: not implemented (T3.5)");
}

export function matchesNear(
  _n: AXNode,
  _near: NonNullable<Descriptor["near"]>,
  _snap: AXSnapshot,
): boolean {
  throw new Error("matchesNear: not implemented (T3.5)");
}
