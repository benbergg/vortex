// Issue #21 — pure-function tests for the boxes-budget reporter
// pipeline used by `vortex-bench compare-boxes`. Live MCP / extension
// / playground integration is exercised manually in T7; this file
// proves the math is right.

import { describe, it, expect } from "vitest";
import {
  joinPasses,
  median,
  percentile,
  summarizeBoxesBudget,
  passesGate,
  renderBoxesBudgetTable,
  SPEC_R6_CEILING,
  SPEC_R6_OUTLIER_FLAG,
  type BoxesBudgetReport,
} from "../src/runner/boxes-budget.js";
import type { CaseMetrics } from "../src/types.js";

function mkMetric(
  name: string,
  observeBytes: number,
  other: Partial<CaseMetrics> = {},
): CaseMetrics {
  return {
    case: name,
    passed: true,
    callCount: 1,
    fallbackToEvaluate: 0,
    observeMissedPopperItems: 0,
    durationMs: 100,
    outputBytes: observeBytes,
    outputBytesByTool: { vortex_observe: observeBytes },
    ...other,
  };
}

describe("median()", () => {
  it("returns NaN for empty input", () => {
    expect(Number.isNaN(median([]))).toBe(true);
  });
  it("returns the single element for length 1", () => {
    expect(median([7])).toBe(7);
  });
  it("returns the middle element for odd length", () => {
    expect(median([3, 1, 5])).toBe(3);
    expect(median([1, 2, 3, 4, 5])).toBe(3);
  });
  it("returns the average of the two middles for even length", () => {
    expect(median([1, 2, 3, 4])).toBeCloseTo(2.5, 10);
    expect(median([1, 3])).toBe(2);
  });
  it("is order-independent (sorts internally)", () => {
    expect(median([5, 4, 3, 2, 1])).toBe(3);
  });
});

describe("percentile()", () => {
  it("returns NaN for empty input", () => {
    expect(Number.isNaN(percentile([], 0.95))).toBe(true);
  });
  it("returns the single value for length 1 (regardless of p)", () => {
    expect(percentile([42], 0.95)).toBe(42);
    expect(percentile([42], 0)).toBe(42);
  });
  it("p=0 returns min, p=1 returns max", () => {
    expect(percentile([1, 2, 3, 4, 5], 0)).toBe(1);
    expect(percentile([1, 2, 3, 4, 5], 1)).toBe(5);
  });
  it("p=0.95 on numpy-canonical [1..100] equals 95.05", () => {
    // numpy.percentile(range(1,101), 95) → 95.05 (linear interpolation)
    const xs = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(xs, 0.95)).toBeCloseTo(95.05, 10);
  });
  it("p=0.5 equals median for an even-length set", () => {
    const xs = [1, 2, 3, 4];
    expect(percentile(xs, 0.5)).toBeCloseTo(median(xs), 10);
  });
});

describe("joinPasses()", () => {
  it("joins by case name and skips one-sided cases", () => {
    const before = [mkMetric("a", 100), mkMetric("orphan-before", 50)];
    const after = [mkMetric("a", 120), mkMetric("orphan-after", 80)];
    const entries = joinPasses(before, after);
    expect(entries.map((e) => e.case)).toEqual(["a"]);
    expect(entries[0]).toMatchObject({
      bytesWithout: 100,
      bytesWith: 120,
      delta: 20,
      ratio: 1.2,
    });
  });

  it("returns NaN ratio when bytesWithout is 0 (case had no observe call)", () => {
    const before = [mkMetric("act-only", 0, { outputBytesByTool: {} })];
    const after = [mkMetric("act-only", 0, { outputBytesByTool: {} })];
    const [entry] = joinPasses(before, after);
    expect(Number.isNaN(entry.ratio)).toBe(true);
    expect(entry.bytesWithout).toBe(0);
    expect(entry.bytesWith).toBe(0);
  });

  it("missing outputBytesByTool falls back to 0", () => {
    const before = [{ ...mkMetric("a", 0), outputBytesByTool: undefined }];
    const after = [{ ...mkMetric("a", 50), outputBytesByTool: undefined }];
    const [entry] = joinPasses(before, after);
    expect(entry.bytesWithout).toBe(0);
    expect(entry.bytesWith).toBe(0);
    expect(Number.isNaN(entry.ratio)).toBe(true);
  });
});

describe("summarizeBoxesBudget()", () => {
  it("aggregates per-case ratios into median/p95/max + threshold counts", () => {
    const before = [
      mkMetric("c1", 100),
      mkMetric("c2", 200),
      mkMetric("c3", 1000),
      mkMetric("c4", 50),
      mkMetric("c5", 80),
    ];
    const after = [
      mkMetric("c1", 105), // ratio 1.05
      mkMetric("c2", 230), // ratio 1.15
      mkMetric("c3", 1180), // ratio 1.18
      mkMetric("c4", 65), // ratio 1.30 (over 1.20 but under 1.40)
      mkMetric("c5", 120), // ratio 1.50 (over 1.40)
    ];
    const r = summarizeBoxesBudget(before, after);
    expect(r.observedCount).toBe(5);
    expect(r.median).toBeCloseTo(1.18, 6);
    expect(r.max).toBeCloseTo(1.5, 6);
    expect(r.casesOver1_20).toBe(2);
    expect(r.casesOver1_40).toBe(1);
    expect(r.entries).toHaveLength(5);
    // generatedAt is set by the CLI wrapper, not the pure function.
    expect(r.generatedAt).toBe("");
  });

  it("embeds the ceiling and outlierFlag used so consumers can self-describe", () => {
    const r = summarizeBoxesBudget([mkMetric("c1", 100)], [mkMetric("c1", 110)]);
    expect(r.ceiling).toBe(SPEC_R6_CEILING);
    expect(r.outlierFlag).toBe(SPEC_R6_OUTLIER_FLAG);
  });

  it("respects caller-supplied ceiling and outlierFlag overrides", () => {
    const before = [mkMetric("c1", 100), mkMetric("c2", 100), mkMetric("c3", 100)];
    const after = [mkMetric("c1", 130), mkMetric("c2", 150), mkMetric("c3", 200)];
    // ratios = 1.3, 1.5, 2.0
    const r = summarizeBoxesBudget(before, after, /* ceiling */ 1.4, /* outlierFlag */ 1.9);
    expect(r.ceiling).toBe(1.4);
    expect(r.outlierFlag).toBe(1.9);
    expect(r.casesOverCeiling).toBe(2); // 1.5, 2.0
    expect(r.casesOverOutlierFlag).toBe(1); // 2.0
    // Fixed-threshold trending counts still computed independently:
    expect(r.casesOver1_20).toBe(3);
    expect(r.casesOver1_40).toBe(2);
  });

  it("excludes NaN-ratio cases from cohort metrics but keeps them in entries", () => {
    const before = [mkMetric("c1", 100), mkMetric("act-only", 0, { outputBytesByTool: {} })];
    const after = [mkMetric("c1", 120), mkMetric("act-only", 0, { outputBytesByTool: {} })];
    const r = summarizeBoxesBudget(before, after);
    expect(r.observedCount).toBe(1);
    expect(r.median).toBe(1.2);
    expect(r.entries).toHaveLength(2);
  });

  it("empty cohort yields NaN metrics and 0 counts", () => {
    const r = summarizeBoxesBudget([], []);
    expect(r.observedCount).toBe(0);
    expect(Number.isNaN(r.median)).toBe(true);
    expect(Number.isNaN(r.p95)).toBe(true);
    expect(Number.isNaN(r.max)).toBe(true);
    expect(r.casesOver1_20).toBe(0);
    expect(r.casesOver1_40).toBe(0);
    expect(r.casesOverCeiling).toBe(0);
    expect(r.casesOverOutlierFlag).toBe(0);
  });
});

describe("passesGate()", () => {
  const baseReport = (overrides: Partial<BoxesBudgetReport> = {}): BoxesBudgetReport => ({
    generatedAt: "",
    ceiling: SPEC_R6_CEILING,
    outlierFlag: SPEC_R6_OUTLIER_FLAG,
    observedCount: 5,
    median: 1.1,
    p95: 1.15,
    max: 1.3,
    casesOver1_20: 1,
    casesOver1_40: 0,
    casesOverCeiling: 0,
    casesOverOutlierFlag: 0,
    entries: [],
    ...overrides,
  });

  it("defaults to report.ceiling when no override is passed (SPEC R6 = 1.60)", () => {
    expect(passesGate(baseReport({ median: 1.55, p95: 1.59 }))).toBe(true);
    expect(passesGate(baseReport({ median: 1.6, p95: 1.6 }))).toBe(true); // exactly at ceiling
    expect(passesGate(baseReport({ median: 1.61, p95: 1.5 }))).toBe(false); // median over
    expect(passesGate(baseReport({ median: 1.5, p95: 1.7 }))).toBe(false); // p95 over
  });

  it("honours the ceiling embedded in the report (no global default leak)", () => {
    const tight = baseReport({ ceiling: 1.2, median: 1.5, p95: 1.59 });
    expect(passesGate(tight)).toBe(false); // 1.5 > 1.2 fails under report's own ceiling
    const loose = baseReport({ ceiling: 2.0, median: 1.5, p95: 1.59 });
    expect(passesGate(loose)).toBe(true);
  });

  it("explicit ceiling override beats report.ceiling", () => {
    const r = baseReport({ ceiling: 1.6, median: 1.5, p95: 1.59 });
    expect(passesGate(r, /* override */ 1.2)).toBe(false);
    expect(passesGate(r, /* override */ 2.0)).toBe(true);
  });

  it("fails when observedCount is 0", () => {
    expect(passesGate(baseReport({ observedCount: 0, median: NaN, p95: NaN }))).toBe(false);
  });
});

describe("renderBoxesBudgetTable()", () => {
  it("includes PASS / FAIL gate marker, cohort stats, and per-case rows", () => {
    const before = [mkMetric("c1", 100), mkMetric("c2", 200)];
    const after = [mkMetric("c1", 110), mkMetric("c2", 230)];
    const r = summarizeBoxesBudget(before, after);
    const out = renderBoxesBudgetTable(r);
    expect(out).toMatch(/median ratio:.*1\.125/);
    expect(out).toMatch(/PASS/);
    expect(out).toContain("c1");
    expect(out).toContain("c2");
  });

  it("renders ceiling from report.ceiling, not a hardcoded literal", () => {
    const before = [mkMetric("c1", 100)];
    const after = [mkMetric("c1", 130)]; // ratio 1.3
    const looseReport = summarizeBoxesBudget(before, after, /* ceiling */ 2.0);
    const tightReport = summarizeBoxesBudget(before, after, /* ceiling */ 1.2);
    const looseOut = renderBoxesBudgetTable(looseReport);
    const tightOut = renderBoxesBudgetTable(tightReport);
    expect(looseOut).toContain("gate (≤ 2.00)");
    expect(tightOut).toContain("gate (≤ 1.20)");
    expect(looseOut).toMatch(/gate.*PASS/);
    expect(tightOut).toMatch(/gate.*FAIL/);
  });

  it("shows n/a in the ratio column for cases with no observe baseline", () => {
    const before = [mkMetric("act-only", 0, { outputBytesByTool: {} })];
    const after = [mkMetric("act-only", 0, { outputBytesByTool: {} })];
    const r = summarizeBoxesBudget(before, after);
    const out = renderBoxesBudgetTable(r);
    expect(out).toContain("n/a");
    // gate fails because observedCount === 0
    expect(out).toMatch(/FAIL/);
  });

  it("sorts entries by ratio descending so worst cases surface first", () => {
    const before = [
      mkMetric("low", 100),
      mkMetric("hi", 100),
      mkMetric("mid", 100),
    ];
    const after = [
      mkMetric("low", 105), // 1.05
      mkMetric("hi", 150), // 1.50
      mkMetric("mid", 120), // 1.20
    ];
    const r = summarizeBoxesBudget(before, after);
    const out = renderBoxesBudgetTable(r);
    const hiIdx = out.indexOf("hi ");
    const midIdx = out.indexOf("mid ");
    const lowIdx = out.indexOf("low ");
    expect(hiIdx).toBeGreaterThan(0);
    expect(hiIdx).toBeLessThan(midIdx);
    expect(midIdx).toBeLessThan(lowIdx);
  });
});
