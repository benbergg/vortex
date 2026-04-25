// vortex-bench v0.6 公共类型
// case 定义 + 运行指标 + diff 结构

export interface CaseMetrics {
  /** case 名，等于 cases/<name>.case.ts */
  case: string;
  passed: boolean;
  /** 工具调用总次数（含 fallback） */
  callCount: number;
  /** evaluate 兜底次数：case 作者显式标记 "observe 看不到只能用 JS 兜底" */
  fallbackToEvaluate: number;
  /** observe 本应捕捉但漏掉的 popper / teleport 项数量 */
  observeMissedPopperItems: number;
  durationMs: number;
  failureReason?: string;
  /** v0.6 新增：case 自定义数值指标（如 P50/P90 延迟、token baseline 等） */
  customMetrics?: Record<string, number>;
}

export interface CaseContext {
  /** 直接调 MCP 工具，自动计数 callCount */
  call(name: string, args: Record<string, unknown>): Promise<unknown>;
  /** evaluate 兜底，callCount++ 且 fallbackToEvaluate++ */
  fallbackEvaluate(args: { frameId?: number; code: string; async?: boolean }): Promise<unknown>;
  /** 记录 observe 漏项数量（case 作者手动对比预期 vs 实际） */
  recordObserveMiss(missed: number): void;
  /** 断言失败即 throw，runCase 捕获置为 failed */
  assert(cond: unknown, message: string): void;
  /** v0.6 新增：写入 customMetrics 字段（被框架收集到 CaseMetrics） */
  recordMetric(key: string, value: number): void;
}

export interface CaseDefinition {
  name: string;
  /** playground 路由路径，e.g. '/#/el-dropdown' */
  playgroundPath: string;
  run(ctx: CaseContext): Promise<void>;
}

export interface BenchReport {
  generatedAt: string;
  playgroundUrl: string;
  cases: CaseMetrics[];
}

export type Severity = "ok" | "warning" | "critical";

export interface MetricDiff {
  metric: keyof CaseMetrics;
  before: number | boolean;
  after: number | boolean;
  delta: number;
  severity: Severity;
}

export interface CaseDiff {
  case: string;
  status: "added" | "removed" | "unchanged" | "regressed" | "improved";
  changes: MetricDiff[];
}
