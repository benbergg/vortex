// packages/mcp/src/lib/ref-parser.ts

export type ParsedRef =
  | { kind: "ref"; index: number; frameId: number }
  | { kind: "selector"; selector: string };

const REF_RE = /^@(?:f(\d+))?e(\d+)$/;

export function parseRef(input: string): ParsedRef {
  if (!input) throw new Error("target is required");
  if (input.startsWith("@")) {
    const m = input.match(REF_RE);
    if (!m) throw new Error(`invalid ref format: ${input} (expected @eN or @fNeM)`);
    const frameId = m[1] != null ? parseInt(m[1], 10) : 0;
    const index = parseInt(m[2], 10);
    return { kind: "ref", index, frameId };
  }
  return { kind: "selector", selector: input };
}

export interface ResolvedTargetParam {
  selector?: string;
  index?: number;
  snapshotId?: string;
  frameId?: number;
}

/** 把 `@eN` / CSS 字符串翻译成 extension action 需要的参数组合 */
export function resolveTargetParam(
  target: string,
  activeSnapshotId: string | null,
): ResolvedTargetParam {
  const r = parseRef(target);
  if (r.kind === "selector") return { selector: r.selector };
  if (!activeSnapshotId) {
    throw new Error("StaleRef: no active snapshot — call vortex_observe first");
  }
  return { index: r.index, snapshotId: activeSnapshotId, frameId: r.frameId };
}
