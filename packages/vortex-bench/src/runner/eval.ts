// 评测门统一 eval:合并 A 层(scanFixture 召回)+ B 层(runCase 任务结局),按 tier
// 聚合成分档汇总,供 eval-report 渲染与 eval --gate 比对。
//
// aggregateEval 是纯函数(无浏览器),可单测;runEval 编排实跑(需 Chrome 桥,Phase 2)。

import { scanFixture, type ScanOptions } from "./scan.js";
import { runCase, classifyCaseOutcome } from "./run-case.js";
import type { FixtureScanResult, SynthManifest } from "../scan-types.js";
import type { CaseDefinition, CaseMetrics } from "../types.js";

export type Tier = "easy" | "medium" | "hard";
export const TIER_ORDER: Tier[] = ["easy", "medium", "hard"];

export interface EvalTierSummary {
  tier: Tier;
  // A 层召回(scanFixture)
  recallMatched: number;
  recallExpected: number;
  recallNoise: number; // precision FP(matchedNoise)
  fixtureCount: number;
  // B 层任务(runCase,经 classifyCaseOutcome 三态)
  taskPass: number;
  taskDegraded: number; // 优雅降级(evaluate 兜底)= 软扣分
  taskFail: number;
  caseCount: number;
}

export interface EvalResult {
  generatedAt: string;
  tiers: EvalTierSummary[];
}

/**
 * 纯聚合:把 A 层 scan 结果与 B 层 case 指标按 tier 合并。
 * - scan 缺省 tier 归 medium(与 scanFixture 兜底一致)。
 * - case 无 tier(工具管线类)不计入任何档的任务统计——它们测工具本身,非真实站任务。
 */
export function aggregateEval(
  scans: FixtureScanResult[],
  cases: CaseMetrics[],
): EvalTierSummary[] {
  const byTier = new Map<Tier, EvalTierSummary>();
  const ensure = (t: Tier): EvalTierSummary => {
    let s = byTier.get(t);
    if (!s) {
      s = {
        tier: t, recallMatched: 0, recallExpected: 0, recallNoise: 0, fixtureCount: 0,
        taskPass: 0, taskDegraded: 0, taskFail: 0, caseCount: 0,
      };
      byTier.set(t, s);
    }
    return s;
  };

  for (const sc of scans) {
    const s = ensure((sc.tier as Tier) ?? "medium");
    s.recallMatched += sc.recall.matched;
    s.recallExpected += sc.recall.expected;
    s.recallNoise += sc.precision.matchedNoise;
    s.fixtureCount += 1;
  }

  for (const c of cases) {
    if (c.tier == null) continue; // 工具管线类:不计入任务统计
    const s = ensure(c.tier);
    s.caseCount += 1;
    const outcome = classifyCaseOutcome(c);
    if (outcome === "pass") s.taskPass += 1;
    else if (outcome === "pass-degraded") s.taskDegraded += 1;
    else s.taskFail += 1;
  }

  return TIER_ORDER.filter((t) => byTier.has(t)).map((t) => byTier.get(t)!);
}

/**
 * 任务通过率加权分:pass=1 / pass-degraded=0.5(优雅降级软扣半分)/ fail=0。
 * 无 case 的档返回 1(空集不拖低,recall 单列另算)。gateEval 与 eval-report 共用。
 */
export function taskScore(s: EvalTierSummary): number {
  if (s.caseCount === 0) return 1;
  return (s.taskPass + s.taskDegraded * 0.5) / s.caseCount;
}

export interface EvalBaselineTier {
  tier: Tier;
  minRecallPct: number; // 0-1,A 层召回率下限
  minTaskScore: number; // 0-1,B 层任务分下限
}
export interface EvalBaseline {
  tiers: EvalBaselineTier[];
}

export interface GateFailure {
  tier: Tier;
  reason: string;
}
export interface GateImprovement {
  tier: Tier;
  reason: string;
}
export interface GateResult {
  pass: boolean;
  failures: GateFailure[];
  improvements: GateImprovement[];
}

/**
 * 数据驱动分档门(评测门 P3.3)。逐档比 current 的 recall% 与 task 分对基线下限:
 * 低于 → failure;明显高于(>下限)→ improvement(单向 ratchet,提示可提升基线)。
 * current 缺某基线档 → 不评(新档观察期不阻断)。recallExpected=0 的档跳过 recall 判。
 */
export function gateEval(current: EvalTierSummary[], baseline: EvalBaseline): GateResult {
  const byTier = new Map<Tier, EvalTierSummary>();
  for (const t of current) byTier.set(t.tier, t);
  const failures: GateFailure[] = [];
  const improvements: GateImprovement[] = [];

  for (const b of baseline.tiers) {
    const cur = byTier.get(b.tier);
    if (!cur) continue; // 观察期:current 无此档 → 不阻断
    if (cur.recallExpected > 0) {
      const recallPct = cur.recallMatched / cur.recallExpected;
      if (recallPct < b.minRecallPct) {
        failures.push({
          tier: b.tier,
          reason: `recall ${(recallPct * 100).toFixed(0)}% < 阈值 ${(b.minRecallPct * 100).toFixed(0)}%`,
        });
      } else if (recallPct > b.minRecallPct) {
        improvements.push({ tier: b.tier, reason: `recall ${(recallPct * 100).toFixed(0)}% > 基线 ${(b.minRecallPct * 100).toFixed(0)}%` });
      }
    }
    const score = taskScore(cur);
    if (cur.caseCount > 0) {
      if (score < b.minTaskScore) {
        failures.push({
          tier: b.tier,
          reason: `task 分 ${score.toFixed(2)} < 阈值 ${b.minTaskScore.toFixed(2)}`,
        });
      } else if (score > b.minTaskScore) {
        improvements.push({ tier: b.tier, reason: `task 分 ${score.toFixed(2)} > 基线 ${b.minTaskScore.toFixed(2)}` });
      }
    }
  }

  return { pass: failures.length === 0, failures, improvements };
}

/**
 * 从实测分档结果推基线(ratchet 地板):每档下限=当前实测的 recall%/task 分。
 * 用于首次建基线或显式提升基线(`eval --save-baseline`)。
 */
export function deriveBaseline(tiers: EvalTierSummary[]): EvalBaseline {
  return {
    tiers: tiers.map((t) => ({
      tier: t.tier,
      minRecallPct: t.recallExpected > 0 ? t.recallMatched / t.recallExpected : 0,
      minTaskScore: taskScore(t),
    })),
  };
}

export interface RunEvalOptions {
  mcpBin: string;
  playgroundUrl: string;
  manifests: SynthManifest[];
  cases: CaseDefinition[];
  generatedAt: string; // 调用方注入(脚本内禁用 Date.now);ISO 串
}

/**
 * 编排实跑(需 Chrome 桥):scanFixture 全 synth 语料 + runCase 全 tier-tagged case
 * → aggregateEval。Phase 2 验证;此处不在单测覆盖(依赖浏览器)。
 */
export async function runEval(opts: RunEvalOptions): Promise<EvalResult> {
  const scanOpts: ScanOptions = { mcpBin: opts.mcpBin, playgroundUrl: opts.playgroundUrl };
  const scans: FixtureScanResult[] = [];
  for (const m of opts.manifests) {
    scans.push(await scanFixture(m, scanOpts));
  }
  const metrics: CaseMetrics[] = [];
  for (const def of opts.cases) {
    metrics.push(await runCase(def, { mcpBin: opts.mcpBin, playgroundUrl: opts.playgroundUrl }));
  }
  return { generatedAt: opts.generatedAt, tiers: aggregateEval(scans, metrics) };
}
