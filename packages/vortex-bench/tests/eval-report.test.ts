import { describe, it, expect } from "vitest";
import { renderEvalMarkdown, taskScore } from "../src/eval-report.js";
import type { EvalResult, EvalTierSummary } from "../src/runner/eval.js";

/**
 * 评测门 P3.2:eval 报告分档渲染。任务通过率把优雅降级计半分(pass=1 / degraded=0.5
 * / fail=0)——既奖励干净通过,也不把"完成但靠 evaluate 兜底"当全胜或全败。
 */
function tier(p: Partial<EvalTierSummary> & { tier: EvalTierSummary["tier"] }): EvalTierSummary {
  return {
    recallMatched: 0, recallExpected: 0, recallNoise: 0, fixtureCount: 0,
    taskPass: 0, taskDegraded: 0, taskFail: 0, caseCount: 0, ...p,
  };
}

describe("eval 报告渲染 (P3.2)", () => {
  it("taskScore:pass=1 / degraded=0.5 / fail=0 加权", () => {
    expect(taskScore(tier({ tier: "easy", taskPass: 2, taskDegraded: 0, taskFail: 0, caseCount: 2 }))).toBe(1);
    expect(taskScore(tier({ tier: "medium", taskPass: 1, taskDegraded: 1, taskFail: 0, caseCount: 2 }))).toBe(0.75);
    expect(taskScore(tier({ tier: "hard", taskPass: 0, taskDegraded: 0, taskFail: 2, caseCount: 2 }))).toBe(0);
    // 无 case 的档 → 1(空集不拖低,避免误判;recall 单列另算)
    expect(taskScore(tier({ tier: "easy", caseCount: 0 }))).toBe(1);
  });

  it("markdown 含每档召回率 + 任务通过率", () => {
    const r: EvalResult = {
      generatedAt: "2026-06-04T00:00:00Z",
      tiers: [
        tier({ tier: "easy", recallMatched: 3, recallExpected: 3, fixtureCount: 1, taskPass: 2, caseCount: 2 }),
        tier({ tier: "medium", recallMatched: 8, recallExpected: 10, recallNoise: 1, fixtureCount: 2, taskPass: 5, taskDegraded: 1, taskFail: 2, caseCount: 8 }),
      ],
    };
    const md = renderEvalMarkdown(r);
    expect(md).toMatch(/easy/);
    expect(md).toMatch(/3\/3/); // 召回 matched/expected
    expect(md).toMatch(/100%/); // easy 召回率
    expect(md).toMatch(/8\/10/);
    expect(md).toMatch(/80%/); // medium 召回率
    expect(md).toMatch(/2026-06-04/); // 生成时间
  });
});
