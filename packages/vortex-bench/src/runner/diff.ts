// 两份 report 比较 + 回退阈值判定。
// 默认阈值（可 env 覆盖）：
//   VB_Index ↓ > 3       → warning
//   任一层 ↓ > 5         → critical
//   任一 ROI ↓ > 10      → critical
//   总 cost (tokens) ↑ > 30% → warning（cost 无法直接算美元，用 tokens 代理）

import type { Report } from "./reporter.js";

export interface DiffRegression {
  severity: "critical" | "warning";
  message: string;
}

export interface DiffResult {
  vb_index_delta: number;
  layer_deltas: Record<string, number>;
  roi_deltas: {
    observe: number;
    errorHint: number | null;
    eventBus: number | null;
  };
  tokens_delta_pct: number;
  regressions: DiffRegression[];
}

const DEFAULT_THRESHOLDS = {
  vbIndex: 3,
  layer: 5,
  roi: 10,
  tokensPct: 30,
};

export function diffReports(
  baseline: Report,
  latest: Report,
  thresholds = DEFAULT_THRESHOLDS,
): DiffResult {
  const vbDelta = latest.aggregate.vb_index - baseline.aggregate.vb_index;

  const layerDeltas: Record<string, number> = {};
  const allLayers = new Set([
    ...Object.keys(baseline.aggregate.layers),
    ...Object.keys(latest.aggregate.layers),
  ]);
  for (const l of allLayers) {
    const b = baseline.aggregate.layers[l];
    const a = latest.aggregate.layers[l];
    if (!b || !a || b.count === 0 || a.count === 0) continue;
    layerDeltas[l] = a.score - b.score;
  }

  const roiDeltas = {
    observe: latest.aggregate.roi.observe - baseline.aggregate.roi.observe,
    errorHint: deltaNullable(
      baseline.aggregate.roi.errorHint,
      latest.aggregate.roi.errorHint,
    ),
    eventBus: deltaNullable(
      baseline.aggregate.roi.eventBus,
      latest.aggregate.roi.eventBus,
    ),
  };

  const bTokens = baseline.aggregate.usage.tokens_total;
  const lTokens = latest.aggregate.usage.tokens_total;
  const tokensPct = bTokens === 0 ? 0 : ((lTokens - bTokens) / bTokens) * 100;

  // 判定
  const regressions: DiffRegression[] = [];
  if (vbDelta < -thresholds.vbIndex) {
    regressions.push({
      severity: "warning",
      message: `VB_Index ↓ ${Math.abs(vbDelta).toFixed(1)} (threshold ${thresholds.vbIndex})`,
    });
  }
  for (const [l, d] of Object.entries(layerDeltas)) {
    if (d < -thresholds.layer) {
      regressions.push({
        severity: "critical",
        message: `Layer ${l} score ↓ ${Math.abs(d).toFixed(1)} (threshold ${thresholds.layer})`,
      });
    }
  }
  if (roiDeltas.observe < -thresholds.roi) {
    regressions.push({
      severity: "critical",
      message: `ROI A observe ↓ ${Math.abs(roiDeltas.observe).toFixed(1)}%`,
    });
  }
  if (roiDeltas.errorHint !== null && roiDeltas.errorHint < -thresholds.roi) {
    regressions.push({
      severity: "critical",
      message: `ROI B error-hint ↓ ${Math.abs(roiDeltas.errorHint).toFixed(1)}%`,
    });
  }
  if (roiDeltas.eventBus !== null && roiDeltas.eventBus < -thresholds.roi) {
    regressions.push({
      severity: "critical",
      message: `ROI C event-bus ↓ ${Math.abs(roiDeltas.eventBus).toFixed(1)}%`,
    });
  }
  if (tokensPct > thresholds.tokensPct) {
    regressions.push({
      severity: "warning",
      message: `Tokens ↑ ${tokensPct.toFixed(1)}% (threshold ${thresholds.tokensPct}%)`,
    });
  }

  // v2 variance regression 检查：latest scenario 有 variance 字段时，对比 baseline tokens
  for (const latestScenario of latest.scenarios) {
    const baselineScenario = baseline.scenarios.find((b) => b.id === latestScenario.id);
    if (!baselineScenario) continue;
    const latestV = (latestScenario as any).variance as
      | { tokens: { min: number; p50: number; max: number } }
      | undefined;
    const baselineTokens =
      baselineScenario.agent.inputTokens + baselineScenario.agent.outputTokens;
    if (latestV?.tokens?.max !== undefined && baselineTokens > 0) {
      const threshold = baselineTokens * 1.5;
      if (latestV.tokens.max > threshold) {
        regressions.push({
          severity: "warning",
          message: `[variance] ${latestScenario.id} tokens.max ${latestV.tokens.max} exceeds baseline ${baselineTokens} × 1.5 (${threshold})`,
        });
      }
    }
  }

  return {
    vb_index_delta: vbDelta,
    layer_deltas: layerDeltas,
    roi_deltas: roiDeltas,
    tokens_delta_pct: tokensPct,
    regressions,
  };
}

export function renderDiffMarkdown(
  baseline: Report,
  latest: Report,
  d: DiffResult,
): string {
  const lines: string[] = [];
  const arrow = (x: number) => (x > 0 ? "↑" : x < 0 ? "↓" : "·");
  lines.push(
    `# Bench diff`,
    ``,
    `Baseline: \`${baseline.generated_at}\`  ·  Latest: \`${latest.generated_at}\``,
    ``,
    `- **VB_Index**: ${baseline.aggregate.vb_index.toFixed(1)} → ${latest.aggregate.vb_index.toFixed(1)} (${arrow(d.vb_index_delta)} ${Math.abs(d.vb_index_delta).toFixed(1)})`,
  );
  lines.push(``, `## Layers`, ``);
  lines.push(`| Layer | Baseline | Latest | Δ |`);
  lines.push(`|-------|---------:|-------:|--:|`);
  for (const [l, delta] of Object.entries(d.layer_deltas)) {
    const b = baseline.aggregate.layers[l]?.score ?? 0;
    const a = latest.aggregate.layers[l]?.score ?? 0;
    lines.push(
      `| ${l} | ${b.toFixed(1)} | ${a.toFixed(1)} | ${arrow(delta)} ${Math.abs(delta).toFixed(1)} |`,
    );
  }
  lines.push(``, `## ROI Δ`, ``);
  lines.push(`- A observe: ${arrow(d.roi_deltas.observe)} ${Math.abs(d.roi_deltas.observe).toFixed(1)}%`);
  lines.push(
    `- B error-hint: ${d.roi_deltas.errorHint === null ? "N/A" : `${arrow(d.roi_deltas.errorHint)} ${Math.abs(d.roi_deltas.errorHint).toFixed(1)}%`}`,
  );
  lines.push(
    `- C event-bus: ${d.roi_deltas.eventBus === null ? "N/A" : `${arrow(d.roi_deltas.eventBus)} ${Math.abs(d.roi_deltas.eventBus).toFixed(1)}%`}`,
  );
  lines.push(``);
  lines.push(`**Tokens**: ${arrow(d.tokens_delta_pct)} ${Math.abs(d.tokens_delta_pct).toFixed(1)}%`);
  lines.push(``);

  if (d.regressions.length === 0) {
    lines.push(`✅ No regressions detected.`);
  } else {
    lines.push(`## ⚠️ Regressions`, ``);
    for (const r of d.regressions) {
      const tag = r.severity === "critical" ? "🔴 critical" : "🟡 warning";
      lines.push(`- ${tag}: ${r.message}`);
    }
  }

  return lines.join("\n");
}

function deltaNullable(
  base: number | null,
  latest: number | null,
): number | null {
  if (base === null || latest === null) return null;
  return latest - base;
}
