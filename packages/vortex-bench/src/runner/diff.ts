// baseline.json vs latest 的差异判定。
// 阈值策略：critical 阻 CI，warning 提醒，其他 ok。

import type { BenchReport, CaseDiff, CaseMetrics, MetricDiff, Severity } from "../types.js";

export function diffReports(baseline: BenchReport, latest: BenchReport): CaseDiff[] {
  const baseMap = new Map(baseline.cases.map((c) => [c.case, c]));
  const latestMap = new Map(latest.cases.map((c) => [c.case, c]));
  const allNames = new Set([...baseMap.keys(), ...latestMap.keys()]);

  const out: CaseDiff[] = [];
  for (const name of [...allNames].sort()) {
    const before = baseMap.get(name);
    const after = latestMap.get(name);
    if (!before && after) {
      out.push({ case: name, status: "added", changes: [] });
    } else if (before && !after) {
      out.push({ case: name, status: "removed", changes: [] });
    } else if (before && after) {
      const changes = compareCases(before, after);
      const status = classify(changes);
      out.push({ case: name, status, changes });
    }
  }
  return out;
}

function compareCases(before: CaseMetrics, after: CaseMetrics): MetricDiff[] {
  const diffs: MetricDiff[] = [];
  diffs.push(boolDiff("passed", before.passed, after.passed));
  diffs.push(numDiff("callCount", before.callCount, after.callCount, thresholdsCallCount));
  diffs.push(numDiff("fallbackToEvaluate", before.fallbackToEvaluate, after.fallbackToEvaluate, thresholdsFallback));
  diffs.push(numDiff("observeMissedPopperItems", before.observeMissedPopperItems, after.observeMissedPopperItems, thresholdsObserveMiss));
  diffs.push(numDiff("durationMs", before.durationMs, after.durationMs, thresholdsDuration(before.durationMs)));
  return diffs;
}

function boolDiff(metric: keyof CaseMetrics, before: boolean, after: boolean): MetricDiff {
  const severity: Severity = before === true && after === false ? "critical" : "ok";
  return { metric, before, after, delta: before === after ? 0 : 1, severity };
}

function numDiff(
  metric: keyof CaseMetrics,
  before: number,
  after: number,
  th: (delta: number) => Severity,
): MetricDiff {
  const delta = after - before;
  return { metric, before, after, delta, severity: th(delta) };
}

function thresholdsCallCount(delta: number): Severity {
  if (delta <= 0) return "ok";
  if (delta <= 2) return "warning";
  return "critical";
}

function thresholdsFallback(delta: number): Severity {
  // fallback 不应增加：只要 +1 就是 critical（说明 vortex 能力退化）
  if (delta <= 0) return "ok";
  return "critical";
}

function thresholdsObserveMiss(delta: number): Severity {
  if (delta <= 0) return "ok";
  return "critical";
}

function thresholdsDuration(baseMs: number) {
  // duration 受 Chrome 状态 / playground Vite 编译缓存 / extension 冷启动影响，波动大。
  // 只记录变化但不单独触发 regressed —— 真退化信号看 passed/fallback/missedPopper。
  return (delta: number): Severity => {
    if (delta <= 0) return "ok";
    const pct = baseMs > 0 ? delta / baseMs : 0;
    // 只有翻倍以上涨幅才给 warning；不给 critical（避免 runtime 噪音炸 CI）
    return pct > 1.0 ? "warning" : "ok";
  };
}

function classify(changes: MetricDiff[]): CaseDiff["status"] {
  // 忽略 duration 的严重度，只看能力退化（pass/fallback/missedPopper）
  const nonDuration = changes.filter((c) => c.metric !== "durationMs");
  const hasCritical = nonDuration.some((c) => c.severity === "critical");
  const hasWarning = nonDuration.some((c) => c.severity === "warning");
  const passedNowOk = changes.some(
    (c) => c.metric === "passed" && c.before === false && c.after === true,
  );
  const metricImproved = changes.some(
    (c) =>
      typeof c.delta === "number" &&
      c.delta < 0 &&
      (c.metric === "fallbackToEvaluate" || c.metric === "observeMissedPopperItems"),
  );
  // 优先级：真退化 (critical) > 实质改进 (passed / fallback / missed) > 小退化 (warning)
  if (hasCritical) return "regressed";
  if (passedNowOk || metricImproved) return "improved";
  if (hasWarning) return "regressed";
  return "unchanged";
}

export function renderDiffTable(diffs: CaseDiff[]): string {
  const lines: string[] = [];
  lines.push("| case | status | callCount | fallback | missedPopper | duration |");
  lines.push("|------|--------|-----------|----------|--------------|----------|");
  for (const d of diffs) {
    if (d.status === "added") {
      lines.push(`| ${d.case} | ➕ added | — | — | — | — |`);
      continue;
    }
    if (d.status === "removed") {
      lines.push(`| ${d.case} | ➖ removed | — | — | — | — |`);
      continue;
    }
    const fmt = (m: keyof CaseMetrics) => {
      const ch = d.changes.find((c) => c.metric === m);
      if (!ch) return "—";
      if (ch.delta === 0) return `${ch.after}`;
      const mark = ch.severity === "critical" ? "⛔" : ch.severity === "warning" ? "⚠️" : "✅";
      const sign = typeof ch.delta === "number" && ch.delta > 0 ? "+" : "";
      return `${ch.before} → ${ch.after} ${mark}${sign}${ch.delta}`;
    };
    const statusIcon =
      d.status === "regressed" ? "🔴 regressed" : d.status === "improved" ? "🟢 improved" : "= unchanged";
    lines.push(
      `| ${d.case} | ${statusIcon} | ${fmt("callCount")} | ${fmt("fallbackToEvaluate")} | ${fmt("observeMissedPopperItems")} | ${fmt("durationMs")} |`,
    );
  }
  return lines.join("\n");
}

export function hasCritical(diffs: CaseDiff[]): boolean {
  return diffs.some((d) => d.changes.some((c) => c.severity === "critical"));
}
