import { describe, it, expect } from "vitest";
import { classifyCaseOutcome } from "../src/runner/run-case.js";
import type { CaseMetrics } from "../src/types.js";

/**
 * 评测门 P2.2:B 层 case 三态结局。优雅降级(evaluate 兜底)是软扣分非硬失败——
 * agent 仍完成了任务,只是 observe 看不到只能 JS 兜底,记为 pass-degraded 让门
 * 既不放过(区别于干净 pass)也不误杀(区别于 fail)。
 */
function mk(p: Partial<CaseMetrics>): CaseMetrics {
  return {
    case: "x", passed: false, callCount: 0, fallbackToEvaluate: 0,
    observeMissedPopperItems: 0, outputBytes: 0, durationMs: 0, ...p,
  };
}

describe("eval 降级计分 classifyCaseOutcome (P2.2)", () => {
  it("pass:通过且无 evaluate 兜底", () => {
    expect(classifyCaseOutcome(mk({ passed: true, fallbackToEvaluate: 0 }))).toBe("pass");
  });
  it("pass-degraded:通过但有 evaluate 兜底(优雅降级)", () => {
    expect(classifyCaseOutcome(mk({ passed: true, fallbackToEvaluate: 2 }))).toBe("pass-degraded");
  });
  it("fail:未通过(无论是否兜底)", () => {
    expect(classifyCaseOutcome(mk({ passed: false, fallbackToEvaluate: 0 }))).toBe("fail");
    expect(classifyCaseOutcome(mk({ passed: false, fallbackToEvaluate: 3 }))).toBe("fail");
  });
});
