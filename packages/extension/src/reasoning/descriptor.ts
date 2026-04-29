// L3: descriptor 三级消解（role+name → text → CSS）。
// spec: vortex重构-L3-spec.md §2.2

import { vtxError, VtxErrorCode } from "@bytenew/vortex-shared";
import type { AXNode, AXSnapshot, Descriptor } from "./types.js";
import type { DebuggerLike } from "./ax-snapshot.js";

export interface ResolveResult {
  ref: string;
  backendDOMNodeId: number;
  tier: 1 | 2 | 3;
}

export function normalizeName(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

// 16-char FNV-1a 64-bit hex（同步、零依赖；spec §1.1 名义为 SHA-256 截 16，实施降为 FNV-1a
// 因为 Web Crypto subtle 在 service worker 异步成本不必要，FNV-1a 64-bit 在 1k 候选下碰撞率 ≈ 1e-13）
export async function sha16(input: string): Promise<string> {
  // 用 BigInt 实现 64-bit FNV-1a，输出 16 hex
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

export function matchesNear(
  n: AXNode,
  near: NonNullable<Descriptor["near"]>,
  snap: AXSnapshot,
): boolean {
  const anchor = snap.nodes.find(x => x.ref === near.ref);
  if (!anchor) return false;
  if (near.relation === "parent") return n.parentRef === anchor.ref;
  if (near.relation === "child") return (anchor.childRefs ?? []).includes(n.ref);
  if (near.relation === "sibling") return n.parentRef === anchor.parentRef && n.ref !== anchor.ref;
  return false;
}

function pick(n: AXNode, tier: 1 | 2 | 3): ResolveResult {
  if (n.backendDOMNodeId === undefined) {
    throw vtxError(
      VtxErrorCode.REF_NOT_FOUND,
      `node missing backendDOMNodeId (ref=${n.ref})`,
      { extras: { tier } },
    );
  }
  return { ref: n.ref, backendDOMNodeId: n.backendDOMNodeId, tier };
}

export async function resolveDescriptor(
  d: Descriptor,
  snap: AXSnapshot,
  debuggerMgr?: DebuggerLike,
): Promise<ResolveResult> {
  // Tier 1: role + name 严格匹配
  if (d.role && d.name) {
    const want = normalizeName(d.name);
    const matches = snap.nodes.filter(
      n => n.role === d.role && normalizeName(n.name) === want,
    );
    if (matches.length === 1) return pick(matches[0], 1);
    if (matches.length > 1) {
      if (d.near) {
        const refined = matches.filter(n => matchesNear(n, d.near!, snap));
        if (refined.length === 1) return pick(refined[0], 1);
      }
      if (d.strict !== false) {
        throw vtxError(
          VtxErrorCode.AMBIGUOUS_DESCRIPTOR,
          `descriptor matched ${matches.length} elements in tier 1`,
          { extras: { tier: 1, count: matches.length } },
        );
      }
      return pick(matches[0], 1);
    }
  }

  // Tier 2: visible text（substring 或 textHash）
  const targetText = d.text ?? d.name;
  if (targetText) {
    const hashKey = await sha16(targetText);
    const matches = snap.nodes.filter(
      n => n.name.includes(targetText) || n.textHash === hashKey,
    );
    if (matches.length === 1) return pick(matches[0], 2);
    if (matches.length > 1) {
      if (d.strict !== false) {
        throw vtxError(
          VtxErrorCode.AMBIGUOUS_DESCRIPTOR,
          `descriptor matched ${matches.length} elements in tier 2`,
          { extras: { tier: 2, count: matches.length } },
        );
      }
      return pick(matches[0], 2);
    }
  }

  // Tier 3: CSS selector
  if (d.selector && debuggerMgr) {
    const result = (await debuggerMgr.sendCommand(snap.tabId, "DOM.querySelector", {
      nodeId: 1,
      selector: d.selector,
    })) as { nodeId?: number; backendNodeId?: number } | undefined;
    if (!result || !result.nodeId) {
      throw vtxError(
        VtxErrorCode.REF_NOT_FOUND,
        `css selector matched no element (selector=${d.selector})`,
        { selector: d.selector, extras: { tier: 3 } },
      );
    }
    const matched = snap.nodes.find(n => n.backendDOMNodeId === result.backendNodeId);
    if (matched) return pick(matched, 3);
    // CSS 命中但 AX tree 无对应节点：用 backendNodeId 直接构造 ref
    if (result.backendNodeId !== undefined) {
      return { ref: "@css", backendDOMNodeId: result.backendNodeId, tier: 3 };
    }
  }

  throw vtxError(
    VtxErrorCode.REF_NOT_FOUND,
    "descriptor could not be resolved by any tier",
    { extras: { descriptor: d as unknown as Record<string, unknown> } },
  );
}
