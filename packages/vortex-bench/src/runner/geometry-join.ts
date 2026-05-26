// packages/vortex-bench/src/runner/geometry-join.ts
// observe 行 ↔ oracle rect 几何 join。主 frame bbox 即视口坐标;
// 子 frame bbox 是 frame-local,需加 frameOffsets 复合到 top-page 坐标。

import type { ObserveRow, OracleRect } from "../scan-types.js";

type Box = [number, number, number, number];

/** bbox 中心是否落在 rect 内(含边界) */
export function centerInside(bbox: Box, rect: Box): boolean {
  const cx = bbox[0] + bbox[2] / 2;
  const cy = bbox[1] + bbox[3] / 2;
  return cx >= rect[0] && cx <= rect[0] + rect[2] && cy >= rect[1] && cy <= rect[1] + rect[3];
}

export interface JoinResult {
  /** oracleId → 命中它的 observe 行(可能多个 → INV-3 去重会另行处理) */
  matches: Map<string, ObserveRow[]>;
  /** 有 bbox 但没命中任何 oracle 的行(precision 候选) */
  unmatchedRows: ObserveRow[];
}

export function joinByGeometry(
  rows: ObserveRow[],
  oracles: OracleRect[],
  frameOffsets: Record<number, [number, number]>,
): JoinResult {
  const matches = new Map<string, ObserveRow[]>();
  for (const o of oracles) matches.set(o.id, []);
  const unmatchedRows: ObserveRow[] = [];

  for (const r of rows) {
    if (r.bbox === null) continue; // 无 bbox 不参与几何 join
    const [dx, dy] = frameOffsets[r.frameId] ?? [0, 0];
    const topBox: Box = [r.bbox[0] + dx, r.bbox[1] + dy, r.bbox[2], r.bbox[3]];
    const hit = oracles.find((o) => centerInside(topBox, o.rect));
    if (hit) matches.get(hit.id)!.push(r);
    else unmatchedRows.push(r);
  }
  return { matches, unmatchedRows };
}
