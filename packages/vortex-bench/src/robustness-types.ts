// 自主发现引擎 #3 — 健壮性信号层(漏斗 layer-0)共享类型。
// 与 scan-types.ts 解耦:robustness 是无 oracle 自证层,不复用 Finding/FixtureScanResult。

/** 单个 ref 跑 act(click) 的结果种类 */
export type RefOutcomeKind = "ok" | "typed-error" | "crash" | "timeout";

/** 一个 ref 的探测结果(供聚合) */
export interface RefOutcome {
  ref: string;
  /** observe 行的 role,供 finding 上下文 */
  role: string;
  /** observe 行的 name */
  name: string | null;
  kind: RefOutcomeKind;
  /** typed-error 时抽出的错误码(如 OBSCURED);其余为 null */
  code: string | null;
  /** act 输出/异常消息(已截断),供报告 */
  detail: string;
}

export type RobustnessSeverity = "R0" | "R1";

export interface RobustnessFinding {
  severity: RobustnessSeverity;
  fixture: string;
  ref: string;
  /** 错误码,或字面量 "crash"/"timeout" */
  code: string;
  detail: string;
}

export interface FixtureRobustness {
  fixture: string;
  path: string;
  totalRefs: number;
  okCount: number;
  /** okCount/totalRefs;totalRefs===0 时为 1(空页无契约可违反,vacuous pass) */
  okRate: number;
  /** outcome key → 计数,如 "ok" / "typed-error:OBSCURED" / "crash" / "timeout" */
  histogram: Record<string, number>;
  findings: RobustnessFinding[];
  /** 环境/工具错误(navigate/observe 失败等,非 finding) */
  error?: string;
}

export interface RobustnessReport {
  generatedAt: string;
  playgroundUrl: string;
  fixtures: FixtureRobustness[];
  /** 所有 fixture 扁平 + R0→R1 排序后的 finding */
  findings: RobustnessFinding[];
}
