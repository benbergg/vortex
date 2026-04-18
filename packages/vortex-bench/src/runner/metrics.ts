// 每场景四维指标收集 + ROI 三件数据源。

import type { AgentResult } from "./agent.js";
import type { JudgeReport } from "./judge.js";
import type { Scenario, Layer } from "./scenario.js";

export interface ScenarioMetrics {
  /** 正确性 0~1：judge 是否通过 */
  correctness: number;
  /** 效率 0~1：1 - steps/budgetSteps（clamped） */
  efficiency: number;
  /** 韧性 0~1：撞到预期错误码 → pass ? 1 : 0；未撞 → 1（A 预防） */
  robustness: number;
  /** 功能利用 0~1：observe 使用 + 工具多样性 */
  utilization: number;
  // ─── ROI 原始数据 ───
  /** 撞到预期错误码（L1 才有意义） */
  encountered_expected_error: boolean;
  used_observe: boolean;
  used_events: boolean;
  unique_tool_count: number;
}

export interface ScenarioDataPoint {
  id: string;
  layer: Layer | undefined;
  pass: boolean;
  expectedErrorCode: string | undefined;
  metrics: ScenarioMetrics;
  agent: {
    steps: number;
    inputTokens: number;
    outputTokens: number;
    toolCalls: string[];
    errorCodes: string[];
    terminationReason: string;
    elapsedMs: number;
  };
}

export function computeScenarioMetrics(args: {
  scenario: Scenario;
  agent: AgentResult;
  judge: JudgeReport;
  elapsedMs: number;
}): ScenarioDataPoint {
  const { scenario, agent, judge } = args;
  const budgetSteps = scenario.expected.budgetSteps ?? 20;
  const toolNames = agent.toolCalls.map((c) => c.name);
  const uniqueTools = new Set(toolNames);

  const used_observe = uniqueTools.has("vortex_observe");
  const used_events = uniqueTools.has("vortex_events_subscribe");

  const correctness = judge.pass ? 1 : 0;
  const efficiency = 1 - clamp01(agent.steps / Math.max(budgetSteps, 1));

  // 韧性
  let encountered_expected_error = false;
  let robustness: number;
  if (scenario.expected.expectedErrorCode) {
    encountered_expected_error = agent.errorCodes.includes(
      scenario.expected.expectedErrorCode,
    );
    if (encountered_expected_error) {
      robustness = judge.pass ? 1 : 0; // 撞到错：恢复成功 ? 1 : 0
    } else {
      robustness = 1; // 未撞到：视作 A 预先预防成功
    }
  } else {
    robustness = 1; // 场景不测韧性
  }

  // 功能利用：observe + 工具多样性（≥4 种 unique tool 满分）
  const diversityNorm = Math.min(uniqueTools.size / 4, 1);
  const utilization = (Number(used_observe) + diversityNorm) / 2;

  return {
    id: scenario.id,
    layer: scenario.expected.layer,
    pass: judge.pass,
    expectedErrorCode: scenario.expected.expectedErrorCode,
    metrics: {
      correctness,
      efficiency,
      robustness,
      utilization,
      encountered_expected_error,
      used_observe,
      used_events,
      unique_tool_count: uniqueTools.size,
    },
    agent: {
      steps: agent.steps,
      inputTokens: agent.inputTokens,
      outputTokens: agent.outputTokens,
      toolCalls: toolNames,
      errorCodes: agent.errorCodes,
      terminationReason: agent.terminationReason,
      elapsedMs: args.elapsedMs,
    },
  };
}

// ─── 层级聚合 ───

export interface LayerAggregate {
  layer: string;
  count: number;
  pass: number;
  correctness: number;
  efficiency: number;
  robustness: number;
  utilization: number;
  /** 0~100 */
  score: number;
}

export function aggregateLayer(
  points: ScenarioDataPoint[],
  label: string,
): LayerAggregate {
  if (points.length === 0) {
    return {
      layer: label,
      count: 0,
      pass: 0,
      correctness: 0,
      efficiency: 0,
      robustness: 0,
      utilization: 0,
      score: 0,
    };
  }
  const avg = (fn: (p: ScenarioDataPoint) => number) =>
    points.reduce((s, p) => s + fn(p), 0) / points.length;

  const correctness = avg((p) => p.metrics.correctness);
  const efficiency = avg((p) => p.metrics.efficiency);
  const robustness = avg((p) => p.metrics.robustness);
  const utilization = avg((p) => p.metrics.utilization);
  const score =
    60 * correctness + 15 * efficiency + 15 * robustness + 10 * utilization;

  return {
    layer: label,
    count: points.length,
    pass: points.filter((p) => p.pass).length,
    correctness,
    efficiency,
    robustness,
    utilization,
    score,
  };
}

// ─── ROI 三件 ───

export interface RoiScores {
  /** A observe ROI（0~100）：使用 observe 的比例 × 总通过率 */
  observe: number;
  /** B error-hint ROI（0~100，null 表示本次无样本）：L1 撞到错后的恢复率 */
  errorHint: number | null;
  /** C event-bus ROI（0~100，null 表示本次无样本）：使用 events 的比例 × 通过率 */
  eventBus: number | null;
}

export function computeRoi(points: ScenarioDataPoint[]): RoiScores {
  const total = points.length;
  if (total === 0) return { observe: 0, errorHint: null, eventBus: null };

  const passed = points.filter((p) => p.pass).length;
  const observeUsed = points.filter((p) => p.metrics.used_observe).length;
  const observe = ((observeUsed / total) * (passed / total)) * 100;

  const l1 = points.filter((p) => p.expectedErrorCode);
  const encountered = l1.filter((p) => p.metrics.encountered_expected_error);
  const errorHint =
    encountered.length === 0
      ? null
      : (encountered.filter((p) => p.pass).length / encountered.length) * 100;

  const eventUsed = points.filter((p) => p.metrics.used_events);
  const eventBus =
    eventUsed.length === 0
      ? null
      : (eventUsed.filter((p) => p.pass).length / eventUsed.length) * 100;

  return { observe, errorHint, eventBus };
}

// ─── 总指数 ───

export interface VbIndexInput {
  L0?: number;
  L1?: number;
  L2?: number;
  L3?: number;
}

const LAYER_WEIGHTS: Record<keyof VbIndexInput, number> = {
  L0: 0.25,
  L1: 0.25,
  L2: 0.3,
  L3: 0.2,
};

export function vbIndex(scores: VbIndexInput): number {
  const entries = (Object.keys(LAYER_WEIGHTS) as Array<keyof VbIndexInput>)
    .filter((k) => scores[k] !== undefined)
    .map((k) => ({ k, w: LAYER_WEIGHTS[k], s: scores[k]! }));
  if (entries.length === 0) return 0;
  const totalW = entries.reduce((s, e) => s + e.w, 0);
  const weighted = entries.reduce((s, e) => s + e.w * e.s, 0);
  return weighted / totalW;
}

// ─── 其他辅助指标 ───

export interface UsageStats {
  tokens_total: number;
  tokens_input: number;
  tokens_output: number;
  steps_p50: number;
  steps_p95: number;
  elapsed_ms_total: number;
  tool_usage: Record<string, number>;
  unused_tools: string[];
}

export function computeUsageStats(
  points: ScenarioDataPoint[],
  allTools: string[],
): UsageStats {
  const tokens_input = points.reduce((s, p) => s + p.agent.inputTokens, 0);
  const tokens_output = points.reduce((s, p) => s + p.agent.outputTokens, 0);
  const tokens_total = tokens_input + tokens_output;

  const steps = points.map((p) => p.agent.steps).sort((a, b) => a - b);
  const steps_p50 = percentile(steps, 0.5);
  const steps_p95 = percentile(steps, 0.95);

  const elapsed_ms_total = points.reduce((s, p) => s + p.agent.elapsedMs, 0);

  const tool_usage: Record<string, number> = {};
  for (const p of points) {
    for (const name of p.agent.toolCalls) {
      tool_usage[name] = (tool_usage[name] ?? 0) + 1;
    }
  }
  const usedSet = new Set(Object.keys(tool_usage));
  const unused_tools = allTools.filter((t) => !usedSet.has(t)).sort();

  return {
    tokens_total,
    tokens_input,
    tokens_output,
    steps_p50,
    steps_p95,
    elapsed_ms_total,
    tool_usage,
    unused_tools,
  };
}

// ─── 工具函数 ───

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(Math.floor(p * sortedAsc.length), sortedAsc.length - 1);
  return sortedAsc[idx];
}
