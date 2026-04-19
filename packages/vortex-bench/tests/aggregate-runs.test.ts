import { describe, it, expect } from "vitest";
import { pickRepresentativeIndex, computeVariance, scoreOf } from "../src/runner/aggregate-runs.js";
import type { ScenarioDataPoint } from "../src/runner/metrics.js";

function mkPoint(opts: {
  pass: boolean;
  correctness?: number;
  efficiency?: number;
  robustness?: number;
  utilization?: number;
  tokens: number;
  steps?: number;
}): ScenarioDataPoint {
  return {
    id: "test",
    layer: "L1",
    pass: opts.pass,
    expectedErrorCode: undefined,
    metrics: {
      correctness: opts.correctness ?? (opts.pass ? 1 : 0),
      efficiency: opts.efficiency ?? 0.5,
      robustness: opts.robustness ?? 1,
      utilization: opts.utilization ?? 0.5,
      encountered_expected_error: false,
      used_observe: false,
      used_events: false,
      unique_tool_count: 3,
    },
    agent: {
      steps: opts.steps ?? 5,
      inputTokens: opts.tokens,
      outputTokens: 0,
      toolCalls: [],
      errorCodes: [],
      terminationReason: "done",
      elapsedMs: 1000,
    },
  };
}

describe("scoreOf", () => {
  it("matches layer-score formula 60C + 15E + 15R + 10U", () => {
    const m = { correctness: 1, efficiency: 0.5, robustness: 1, utilization: 0.5 };
    expect(scoreOf(m as any)).toBeCloseTo(60 + 7.5 + 15 + 5, 2);
  });
});

describe("pickRepresentativeIndex", () => {
  it("all pass: picks median score", () => {
    const runs = [
      mkPoint({ pass: true, correctness: 1, efficiency: 0.9, tokens: 40000 }),
      mkPoint({ pass: true, correctness: 1, efficiency: 0.6, tokens: 50000 }),
      mkPoint({ pass: true, correctness: 1, efficiency: 0.3, tokens: 80000 }),
    ];
    expect(pickRepresentativeIndex(runs)).toBe(1);
  });

  it("majority pass: picks median among passes", () => {
    const runs = [
      mkPoint({ pass: true, efficiency: 0.9, tokens: 40000 }),
      mkPoint({ pass: true, efficiency: 0.6, tokens: 50000 }),
      mkPoint({ pass: false, efficiency: 0, tokens: 200000 }),
    ];
    const idx = pickRepresentativeIndex(runs);
    expect(runs[idx].pass).toBe(true);
  });

  it("all fail: picks median score among all", () => {
    const runs = [
      mkPoint({ pass: false, correctness: 0, efficiency: 0.5, tokens: 50000 }),
      mkPoint({ pass: false, correctness: 0, efficiency: 0.3, tokens: 40000 }),
      mkPoint({ pass: false, correctness: 0, efficiency: 0.1, tokens: 30000 }),
    ];
    const idx = pickRepresentativeIndex(runs);
    expect(idx).toBe(1); // median efficiency
  });

  it("tiebreak on tokens ascending when scores equal", () => {
    const runs = [
      mkPoint({ pass: true, efficiency: 0.5, tokens: 80000 }),
      mkPoint({ pass: true, efficiency: 0.5, tokens: 40000 }),
      mkPoint({ pass: true, efficiency: 0.5, tokens: 60000 }),
    ];
    const idx = pickRepresentativeIndex(runs);
    expect(runs[idx].agent.inputTokens).toBe(60000); // median tokens
  });
});

describe("computeVariance", () => {
  it("computes tokens min/p50/max across runs", () => {
    const runs = [
      mkPoint({ pass: true, tokens: 40000 }),
      mkPoint({ pass: true, tokens: 50000, steps: 10 }),
      mkPoint({ pass: true, tokens: 80000, steps: 15 }),
    ];
    const v = computeVariance(runs);
    expect(v.tokens).toEqual({ min: 40000, p50: 50000, max: 80000 });
    expect(v.steps.min).toBe(5);
    expect(v.steps.max).toBe(15);
  });

  it("handles single run", () => {
    const v = computeVariance([mkPoint({ pass: true, tokens: 10000 })]);
    expect(v.tokens).toEqual({ min: 10000, p50: 10000, max: 10000 });
  });
});
