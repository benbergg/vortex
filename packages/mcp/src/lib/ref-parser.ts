// packages/mcp/src/lib/ref-parser.ts

import { VtxErrorCode, vtxError } from "@bytenew/vortex-shared";

export type ParsedRef =
  | { kind: "ref"; index: number; frameId: number; hash?: string }
  | { kind: "selector"; selector: string };

// v0.8: dual-format. Hash prefix `<hex>:` is OPTIONAL and always outermost;
// frame prefix `fN` is OPTIONAL and immediately before `eN`. Bare `@eN` and
// `@fNeM` remain accepted (deprecated in v0.9).
const REF_RE = /^@(?:([a-fA-F0-9]{4}):)?(?:f(\d+))?e(\d+)$/;

// v0.5 snapshot-ref shapes that LLMs sometimes emit when guessing at v0.6
// target syntax (e.g. carrying habits from v0.5 vortex_dom_click({index, snapshotId})).
// Reject early with a clear migration hint instead of silently dropping the
// raw string into document.querySelector — that would throw SyntaxError deep
// inside page-side actionability and surface as `null.ok` JS_EXECUTION_ERROR.
const V05_REF_PATTERNS: Array<{ re: RegExp; example: string }> = [
  { re: /^snap_[a-z0-9_]+#\d+$/i, example: "snap_xxx#54" },
  { re: /^#\d+$/, example: "#54" },
  { re: /^\d+$/, example: "54" },
];

export function parseRef(input: string): ParsedRef {
  if (input == null || input === "") {
    throw vtxError(VtxErrorCode.INVALID_PARAMS, "target is required");
  }
  if (typeof input !== "string") {
    throw vtxError(
      VtxErrorCode.INVALID_PARAMS,
      `target must be a string (CSS selector or @ref), got ${typeof input}. Descriptor object form (role/name/...) is reserved for v0.6.x.`,
    );
  }
  if (input.startsWith("@")) {
    const m = input.match(REF_RE);
    if (!m) {
      throw vtxError(
        VtxErrorCode.INVALID_PARAMS,
        `invalid ref format: ${input} (expected @eN, @fNeM, @<hash>:eN, or @<hash>:fNeM where hash is 4 hex chars)`,
      );
    }
    const hash = m[1] != null ? m[1].toLowerCase() : undefined;
    const frameId = m[2] != null ? parseInt(m[2], 10) : 0;
    const index = parseInt(m[3], 10);
    return hash !== undefined
      ? { kind: "ref", index, frameId, hash }
      : { kind: "ref", index, frameId };
  }
  for (const { re, example } of V05_REF_PATTERNS) {
    if (re.test(input)) {
      throw vtxError(
        VtxErrorCode.INVALID_PARAMS,
        `target "${input}" looks like a v0.5 snapshot reference (${example}). v0.6 uses @eN / @fNeM — see vortex_observe output for the correct ref per element (e.g. target: "@e54" or "@f1e2").`,
      );
    }
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
    throw vtxError(
      VtxErrorCode.STALE_SNAPSHOT,
      "no active snapshot — call vortex_observe first",
    );
  }
  return { index: r.index, snapshotId: activeSnapshotId, frameId: r.frameId };
}
