import { describe, it, expect } from "vitest";
import { diffReports } from "../src/runner/diff.js";
import type { Report } from "../src/runner/reporter.js";

function mkReportV1(tokens: number): Report {
  return {
    schema_version: 1,
    dataset_version: "v1",
    generated_at: "2026-04-19T00:00:00Z",
    provider: { name: "test", model: "test", baseURL: undefined },
    scenarios: [
      {
        id: "L2-004",
        layer: "L2",
        pass: true,
        expectedErrorCode: undefined,
        metrics: { correctness: 1, efficiency: 0.5, robustness: 1, utilization: 0.5, encountered_expected_error: false, used_observe: true, used_events: false, unique_tool_count: 3 },
        agent: { steps: 5, inputTokens: tokens, outputTokens: 0, toolCalls: [], errorCodes: [], terminationReason: "done", elapsedMs: 1000 },
        judge_checks: [],
      },
    ],
    aggregate: {
      layers: {},
      roi: { observe: 80, errorHint: null, eventBus: null },
      vb_index: 85,
      usage: { tokens_total: tokens, tokens_input: tokens, tokens_output: 0, steps_p50: 5, steps_p95: 5, elapsed_ms_total: 1000, tool_usage: {}, unused_tools: [] },
    },
  } as Report;
}

function mkReportV2(tokens_min: number, tokens_max: number): Report {
  const r = mkReportV1(Math.floor((tokens_min + tokens_max) / 2));
  r.schema_version = 2;
  (r.scenarios[0] as any).runs = 3;
  (r.scenarios[0] as any).runs_completed = 3;
  (r.scenarios[0] as any).pass_rate = "3/3";
  (r.scenarios[0] as any).pass_stable = true;
  (r.scenarios[0] as any).variance = {
    tokens: { min: tokens_min, p50: Math.floor((tokens_min + tokens_max) / 2), max: tokens_max },
    steps: { min: 5, p50: 5, max: 5 },
    elapsed_ms: { min: 1000, p50: 1000, max: 1000 },
  };
  return r;
}

describe("diffReports v1/v2 compat", () => {
  it("v1 baseline vs v2 latest: no crash, variance regression emits warning when max > baseline × 1.5", () => {
    const base = mkReportV1(40000);
    const latest = mkReportV2(50000, 80000); // max 80000 > 40000 * 1.5 = 60000
    const diff = diffReports(base, latest);
    const varWarn = diff.regressions.find((r) => r.message.startsWith("[variance]"));
    expect(varWarn).toBeDefined();
    expect(varWarn?.severity).toBe("warning");
  });

  it("no variance warning when max within 1.5x", () => {
    const base = mkReportV1(40000);
    const latest = mkReportV2(38000, 55000); // max 55000 < 60000
    const diff = diffReports(base, latest);
    const varWarn = diff.regressions.find((r) => r.message.startsWith("[variance]"));
    expect(varWarn).toBeUndefined();
  });

  it("v1 vs v1 still works (no variance path)", () => {
    const base = mkReportV1(40000);
    const latest = mkReportV1(45000);
    expect(() => diffReports(base, latest)).not.toThrow();
  });
});
