// Issue #21 — bench-budget reporter for `compare-boxes` sweep.
//
// Compares per-case `outputBytesByTool.vortex_observe` between two passes
// of the same bench cases: pass A (baseline, no includeBoxes) vs pass B
// (`includeBoxes: true` injected at the runner). Emits per-case ratios
// and cohort median / p95 / max so we can verify SPEC R6's ≤ +20%
// ceiling for the visual-grounding rollout.
//
// All functions are pure — no I/O, no clock — so they're trivially
// testable. The CLI in src/index.ts performs the I/O wrapping.

import type { CaseMetrics } from "../types.js";

/** Per-case row in the boxes-budget report. */
export interface BoxesBudgetEntry {
  case: string;
  bytesWithout: number;
  bytesWith: number;
  /** bytesWith - bytesWithout */
  delta: number;
  /** bytesWith / bytesWithout (NaN when bytesWithout is 0 — case had no observe call) */
  ratio: number;
}

/** Cohort summary + per-case detail. */
export interface BoxesBudgetReport {
  /** ISO timestamp injected by the CLI wrapper; pure pipeline leaves empty. */
  generatedAt: string;
  /** Number of cases that contributed to the cohort metrics (ratio is finite). */
  observedCount: number;
  /** Median of finite ratios. NaN if observedCount === 0. */
  median: number;
  /** 95th percentile of finite ratios. NaN if observedCount === 0. */
  p95: number;
  /** Max finite ratio. NaN if observedCount === 0. */
  max: number;
  /** Count of cases with ratio > 1.20 (the SPEC ceiling). */
  casesOver1_20: number;
  /** Count of cases with ratio > 1.40 (the per-case outlier flag). */
  casesOver1_40: number;
  /** All per-case entries, including the ones we couldn't measure (NaN ratio). */
  entries: BoxesBudgetEntry[];
}

/**
 * Build per-case entries by joining two passes by case name.
 *
 * - Drops cases that appear in only one pass (the cohort has to be the
 *   same set or the comparison is meaningless).
 * - Computes ratio against the `vortex_observe` slice of
 *   `outputBytesByTool` — that's the only bytes affected by includeBoxes.
 * - When neither pass made any `vortex_observe` call (e.g. a pure-act
 *   case that only navigates + clicks), the entry's ratio is NaN; cohort
 *   metrics ignore it.
 */
export function joinPasses(
  before: readonly CaseMetrics[],
  after: readonly CaseMetrics[],
): BoxesBudgetEntry[] {
  const afterByName = new Map(after.map((m) => [m.case, m]));
  const entries: BoxesBudgetEntry[] = [];
  for (const a of before) {
    const b = afterByName.get(a.case);
    if (!b) continue;
    const bytesWithout = a.outputBytesByTool?.vortex_observe ?? 0;
    const bytesWith = b.outputBytesByTool?.vortex_observe ?? 0;
    entries.push({
      case: a.case,
      bytesWithout,
      bytesWith,
      delta: bytesWith - bytesWithout,
      ratio: bytesWithout > 0 ? bytesWith / bytesWithout : Number.NaN,
    });
  }
  return entries;
}

/** Median of a numeric array. NaN on empty. Stable for sorted input copy. */
export function median(xs: readonly number[]): number {
  if (xs.length === 0) return Number.NaN;
  const sorted = [...xs].sort((p, q) => p - q);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * p-th percentile (0 ≤ p ≤ 1) using **linear interpolation between
 * closest ranks** — matches numpy's default `linear` method. p95 = 0.95.
 * NaN on empty.
 */
export function percentile(xs: readonly number[], p: number): number {
  if (xs.length === 0) return Number.NaN;
  if (xs.length === 1) return xs[0];
  const sorted = [...xs].sort((a, b) => a - b);
  const rank = p * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const frac = rank - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

/** Aggregate entries into a full BoxesBudgetReport. `generatedAt` left empty. */
export function summarizeBoxesBudget(
  before: readonly CaseMetrics[],
  after: readonly CaseMetrics[],
): BoxesBudgetReport {
  const entries = joinPasses(before, after);
  const ratios = entries.map((e) => e.ratio).filter((r) => Number.isFinite(r));
  return {
    generatedAt: "",
    observedCount: ratios.length,
    median: median(ratios),
    p95: percentile(ratios, 0.95),
    max: ratios.length === 0 ? Number.NaN : Math.max(...ratios),
    casesOver1_20: ratios.filter((r) => r > 1.2).length,
    casesOver1_40: ratios.filter((r) => r > 1.4).length,
    entries,
  };
}

/** SPEC R6 gate: median AND p95 ≤ 1.20. Cohort with 0 observations fails. */
export function passesGate(report: BoxesBudgetReport, ceiling = 1.2): boolean {
  if (report.observedCount === 0) return false;
  return report.median <= ceiling && report.p95 <= ceiling;
}

/** Render a sortable stdout table for human eyeballing. */
export function renderBoxesBudgetTable(report: BoxesBudgetReport): string {
  const lines: string[] = [];
  lines.push("┌─ boxes-budget report ───────────────────────────────────────────┐");
  lines.push(`│ cases observed: ${report.observedCount.toString().padStart(3)}                                            │`);
  lines.push(`│ median ratio:   ${fmtRatio(report.median).padStart(7)}                                       │`);
  lines.push(`│ p95 ratio:      ${fmtRatio(report.p95).padStart(7)}                                       │`);
  lines.push(`│ max ratio:      ${fmtRatio(report.max).padStart(7)}                                       │`);
  lines.push(`│ cases > 1.20:   ${report.casesOver1_20.toString().padStart(3)}                                            │`);
  lines.push(`│ cases > 1.40:   ${report.casesOver1_40.toString().padStart(3)}                                            │`);
  lines.push(`│ gate (≤ 1.20):  ${passesGate(report) ? "PASS" : "FAIL"}                                           │`);
  lines.push("└─────────────────────────────────────────────────────────────────┘");
  lines.push("");
  lines.push("case                                bytes_without  bytes_with     ratio");
  lines.push("─".repeat(75));
  for (const e of [...report.entries].sort((a, b) => fallbackInf(b.ratio) - fallbackInf(a.ratio))) {
    const ratioCell = Number.isFinite(e.ratio) ? fmtRatio(e.ratio) : "  n/a  ";
    lines.push(
      `${e.case.padEnd(34)} ${String(e.bytesWithout).padStart(13)}  ${String(e.bytesWith).padStart(11)}  ${ratioCell.padStart(7)}`,
    );
  }
  return lines.join("\n");
}

function fmtRatio(r: number): string {
  if (!Number.isFinite(r)) return "n/a";
  return r.toFixed(3);
}

/** Push NaN entries to the bottom of the sort. */
function fallbackInf(x: number): number {
  return Number.isFinite(x) ? x : -Infinity;
}
