import { describe, it, expect } from "vitest";
import { gateEval, type EvalBaseline } from "../src/runner/eval.js";
import type { EvalTierSummary } from "../src/runner/eval.js";

/**
 * 评测门 P3.3:数据驱动分档门。current 低于档阈值(recall% 或 task 分)→ fail;
 * 高于基线 → 记 improvement(单向 ratchet 提示可提升基线)。阈值从实测基线推。
 */
function tier(p: Partial<EvalTierSummary> & { tier: EvalTierSummary["tier"] }): EvalTierSummary {
  return {
    recallMatched: 0, recallExpected: 0, recallNoise: 0, fixtureCount: 0,
    taskPass: 0, taskDegraded: 0, taskFail: 0, caseCount: 0, ...p,
  };
}

const baseline: EvalBaseline = {
  tiers: [
    { tier: "easy", minRecallPct: 1.0, minTaskScore: 1.0 },
    { tier: "medium", minRecallPct: 0.95, minTaskScore: 0.9 },
    { tier: "hard", minRecallPct: 0.8, minTaskScore: 0.7 },
  ],
};

describe("eval --gate 数据驱动分档门 (P3.3)", () => {
  it("全档达标 → pass", () => {
    const current: EvalTierSummary[] = [
      tier({ tier: "easy", recallMatched: 3, recallExpected: 3, taskPass: 2, caseCount: 2 }),
      tier({ tier: "medium", recallMatched: 10, recallExpected: 10, taskPass: 10, caseCount: 10 }),
    ];
    const r = gateEval(current, baseline);
    expect(r.pass).toBe(true);
    expect(r.failures).toEqual([]);
  });

  it("某档召回低于阈值 → fail,列出该档", () => {
    const current: EvalTierSummary[] = [
      tier({ tier: "medium", recallMatched: 8, recallExpected: 10, taskPass: 10, caseCount: 10 }), // recall 80% < 95%
    ];
    const r = gateEval(current, baseline);
    expect(r.pass).toBe(false);
    expect(r.failures.some((f) => f.tier === "medium" && /recall/i.test(f.reason))).toBe(true);
  });

  it("某档任务分低于阈值 → fail", () => {
    const current: EvalTierSummary[] = [
      tier({ tier: "hard", recallMatched: 8, recallExpected: 10, taskPass: 1, taskFail: 3, caseCount: 4 }), // task 0.25 < 0.7
    ];
    const r = gateEval(current, baseline);
    expect(r.pass).toBe(false);
    expect(r.failures.some((f) => f.tier === "hard" && /task|任务/i.test(f.reason))).toBe(true);
  });

  it("高于基线 → pass + 记 improvement(ratchet 提示)", () => {
    const current: EvalTierSummary[] = [
      tier({ tier: "hard", recallMatched: 10, recallExpected: 10, taskPass: 4, caseCount: 4 }), // recall 100%>80%, task 1>0.7
    ];
    const r = gateEval(current, baseline);
    expect(r.pass).toBe(true);
    expect(r.improvements.length).toBeGreaterThan(0);
  });

  it("current 缺某基线档 → 该档不评(观察期新档不阻断)", () => {
    const r = gateEval([], baseline);
    expect(r.pass).toBe(true);
  });
});
