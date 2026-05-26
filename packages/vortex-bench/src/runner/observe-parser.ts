// packages/vortex-bench/src/runner/observe-parser.ts
// observe compact 文本 → 结构化。契约见 observe-render.ts:57-121。

import type { ObserveRow, ObserveHeader, ParsedObserve } from "../scan-types.js";

// 元素行:@<ref> [<role>] "<name>"? (<flags>)* (bbox=[..])?
// ref=@[\w:]+,role=[^\]]+,name 含转义 \" 与非 " 字符。
const ROW_RE =
  /^(@[\w:]+)\s+\[([^\]]+)\](?:\s+"((?:\\.|[^"\\])*)")?((?:\s+\[[a-z]+\])*)(?:\s+bbox=\[(\d+),(\d+),(\d+),(\d+)\])?\s*$/;
const FLAG_RE = /\[([a-z]+)\]/g;
const OFFSET_RE = /^#\s+frame\s+(\d+)\s+offset=\[(\d+),(\d+)\]/;
const VIEWPORT_RE = /^Viewport:\s+(\d+)x(\d+),\s+scrollY=(\d+)\/(\d+)/;

/** 从 ref 提取 frameId:@h:f<N>e<M> → N;无 fN 段 → 0 */
function frameIdOf(ref: string): number {
  const m = ref.match(/f(\d+)e\d+$/);
  return m ? Number.parseInt(m[1], 10) : 0;
}

export function parseObserveSnapshot(text: string): ParsedObserve {
  const header: ObserveHeader = { snapshotId: "", url: "" };
  const rows: ObserveRow[] = [];
  const frameOffsets: Record<number, [number, number]> = {};

  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (line.startsWith("SnapshotId:")) {
      header.snapshotId = line.slice("SnapshotId:".length).trim();
      continue;
    }
    if (line.startsWith("URL:")) {
      header.url = line.slice("URL:".length).trim();
      continue;
    }
    if (line.startsWith("Title:")) {
      header.title = line.slice("Title:".length).trim();
      continue;
    }
    const vp = line.match(VIEWPORT_RE);
    if (vp) {
      header.viewport = {
        width: Number.parseInt(vp[1], 10),
        height: Number.parseInt(vp[2], 10),
        scrollY: Number.parseInt(vp[3], 10),
        scrollHeight: Number.parseInt(vp[4], 10),
      };
      continue;
    }
    const off = line.match(OFFSET_RE);
    if (off) {
      frameOffsets[Number.parseInt(off[1], 10)] = [
        Number.parseInt(off[2], 10),
        Number.parseInt(off[3], 10),
      ];
      continue;
    }
    const m = line.match(ROW_RE);
    if (m) {
      const flags = m[4] ? [...m[4].matchAll(FLAG_RE)].map((f) => f[1]) : [];
      const bbox: ObserveRow["bbox"] =
        m[5] !== undefined
          ? [Number.parseInt(m[5], 10), Number.parseInt(m[6], 10), Number.parseInt(m[7], 10), Number.parseInt(m[8], 10)]
          : null;
      rows.push({
        ref: m[1],
        role: m[2],
        name: m[3] !== undefined ? m[3].replace(/\\"/g, '"') : null,
        flags,
        bbox,
        frameId: frameIdOf(m[1]),
      });
    }
  }
  return { header, rows, frameOffsets };
}
