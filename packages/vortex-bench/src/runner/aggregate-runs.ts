import type { ScenarioDataPoint, ScenarioMetrics } from "./metrics.js";

export function scoreOf(m: ScenarioMetrics): number {
  return 60 * m.correctness + 15 * m.efficiency + 15 * m.robustness + 10 * m.utilization;
}

function tokensOf(p: ScenarioDataPoint): number {
  return p.agent.inputTokens + p.agent.outputTokens;
}

/**
 * 从 N 次 run 里挑代表 index：
 * - 若多数通过：从 pass 子集里挑 median layer-score，tiebreak 用 tokens 升序。
 * - 否则：从全部 runs 里挑 median layer-score。
 */
export function pickRepresentativeIndex(runs: ScenarioDataPoint[]): number {
  if (runs.length === 0) throw new Error("pickRepresentativeIndex: empty runs");
  const passes = runs.map((r, i) => ({ r, i })).filter((x) => x.r.pass);
  const useSubset = passes.length >= Math.ceil(runs.length / 2);
  const candidates = useSubset ? passes : runs.map((r, i) => ({ r, i }));

  candidates.sort((a, b) => {
    const sa = scoreOf(a.r.metrics);
    const sb = scoreOf(b.r.metrics);
    if (sa !== sb) return sa - sb;
    return tokensOf(a.r) - tokensOf(b.r);
  });

  return candidates[Math.floor(candidates.length / 2)].i;
}

export interface RunVariance {
  tokens: { min: number; p50: number; max: number };
  steps: { min: number; p50: number; max: number };
  elapsed_ms: { min: number; p50: number; max: number };
  pass_stable: boolean;
}

function stats(values: number[]): { min: number; p50: number; max: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  const p50 = sorted[Math.floor(sorted.length / 2)] ?? 0;
  return { min, p50, max };
}

export function computeVariance(runs: ScenarioDataPoint[]): RunVariance {
  const tokens = runs.map(tokensOf);
  const steps = runs.map((r) => r.agent.steps);
  const elapsed = runs.map((r) => r.agent.elapsedMs);
  const passes = new Set(runs.map((r) => r.pass));
  return {
    tokens: stats(tokens),
    steps: stats(steps),
    elapsed_ms: stats(elapsed),
    pass_stable: passes.size === 1,
  };
}
