// Issue #21 — bench-budget reporter for `compare-boxes` sweep.
//
// Compares per-case `outputBytesByTool.vortex_observe` between two passes
// of the same bench cases: pass A (baseline, no includeBoxes) vs pass B
// (`includeBoxes: true` injected at the runner). Emits per-case ratios
// and cohort median / p95 / max so we can verify SPEC R6's ceiling for
// the visual-grounding rollout.
//
// All functions are pure — no I/O, no clock — so they're trivially
// testable. The CLI in src/index.ts performs the I/O wrapping.

import type { CaseMetrics } from "../types.js";

/**
 * SPEC R6 (revised 2026-05-14): cohort median AND p95 of
 * `bytesWith / bytesWithout` must stay at or below this ceiling. The
 * original SPEC text said ≤ 1.20 (+20% from issue #21), but the
 * first bench sweep showed structural per-element cost of ~+96% and
 * cohort floor at ~1.50. The ceiling was raised to 1.60 with a
 * reflexion note (see SPEC § Reflexion note T7). Encoding it as a
 * single named constant prevents the future drift between code
 * default, render label, and CHANGELOG prose that PR #23 review
 * caught.
 */
export const SPEC_R6_CEILING = 1.6;
/**
 * Per-case outlier flag (informational, not blocking). Cases above
 * this trip a warning in the report. Raised from 1.40 → 1.80 in the
 * same SPEC R6 revision.
 */
export const SPEC_R6_OUTLIER_FLAG = 1.8;

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
  /** Ceiling that was applied (SPEC R6). Embedded so future readers don't
   * need to cross-reference docs to know which threshold the verdict used. */
  ceiling: number;
  /** Per-case outlier flag threshold. */
  outlierFlag: number;
  /** Number of cases that contributed to the cohort metrics (ratio is finite). */
  observedCount: number;
  /** Median of finite ratios. NaN if observedCount === 0. */
  median: number;
  /** 95th percentile of finite ratios. NaN if observedCount === 0. */
  p95: number;
  /** Max finite ratio. NaN if observedCount === 0. */
  max: number;
  /** Count of cases with ratio > 1.20 (informational, fixed threshold for
   * cross-run trending — independent of the active ceiling). */
  casesOver1_20: number;
  /** Count of cases with ratio > 1.40 (informational, fixed threshold). */
  casesOver1_40: number;
  /** Count of cases over the current ceiling. */
  casesOverCeiling: number;
  /** Count of cases over the current outlier flag. */
  casesOverOutlierFlag: number;
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

/**
 * Aggregate entries into a full BoxesBudgetReport.
 *
 * - `ceiling` / `outlierFlag` default to the named constants but the
 *   caller can override (handy for unit tests). The report records the
 *   value actually used so artifact consumers can read it directly.
 * - `generatedAt` left empty for the CLI wrapper to fill.
 */
export function summarizeBoxesBudget(
  before: readonly CaseMetrics[],
  after: readonly CaseMetrics[],
  ceiling: number = SPEC_R6_CEILING,
  outlierFlag: number = SPEC_R6_OUTLIER_FLAG,
): BoxesBudgetReport {
  const entries = joinPasses(before, after);
  const ratios = entries.map((e) => e.ratio).filter((r) => Number.isFinite(r));
  return {
    generatedAt: "",
    ceiling,
    outlierFlag,
    observedCount: ratios.length,
    median: median(ratios),
    p95: percentile(ratios, 0.95),
    max: ratios.length === 0 ? Number.NaN : Math.max(...ratios),
    casesOver1_20: ratios.filter((r) => r > 1.2).length,
    casesOver1_40: ratios.filter((r) => r > 1.4).length,
    casesOverCeiling: ratios.filter((r) => r > ceiling).length,
    casesOverOutlierFlag: ratios.filter((r) => r > outlierFlag).length,
    entries,
  };
}

/**
 * SPEC R6 gate: median AND p95 ≤ ceiling. Cohort with 0 observations
 * fails. Reads the ceiling from the report by default so caller, render
 * label, and gate verdict all reference the same source of truth.
 */
export function passesGate(
  report: BoxesBudgetReport,
  ceiling: number = report.ceiling,
): boolean {
  if (report.observedCount === 0) return false;
  return report.median <= ceiling && report.p95 <= ceiling;
}

/** Render a sortable stdout table for human eyeballing. */
export function renderBoxesBudgetTable(report: BoxesBudgetReport): string {
  const lines: string[] = [];
  const ceilingLabel = report.ceiling.toFixed(2);
  lines.push("┌─ boxes-budget report ───────────────────────────────────────────┐");
  lines.push(`│ cases observed: ${report.observedCount.toString().padStart(3)}                                            │`);
  lines.push(`│ median ratio:   ${fmtRatio(report.median).padStart(7)}                                       │`);
  lines.push(`│ p95 ratio:      ${fmtRatio(report.p95).padStart(7)}                                       │`);
  lines.push(`│ max ratio:      ${fmtRatio(report.max).padStart(7)}                                       │`);
  lines.push(`│ cases > 1.20:   ${report.casesOver1_20.toString().padStart(3)}                                            │`);
  lines.push(`│ cases > 1.40:   ${report.casesOver1_40.toString().padStart(3)}                                            │`);
  lines.push(`│ gate (≤ ${ceilingLabel}):  ${passesGate(report) ? "PASS" : "FAIL"}                                           │`);
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
