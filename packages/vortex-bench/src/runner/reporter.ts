// 报告生成：JSON schema v1 + Markdown 报告卡。

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  LayerAggregate,
  RoiScores,
  ScenarioDataPoint,
  UsageStats,
} from "./metrics.js";
import type { JudgeReport } from "./judge.js";

export interface Report {
  schema_version: 1;
  dataset_version: "v1";
  generated_at: string;
  git_commit?: string;
  provider: { name: string; model: string; baseURL: string };
  scenarios: Array<ScenarioDataPoint & { judge_checks: JudgeReport["checks"] }>;
  aggregate: {
    layers: Record<string, LayerAggregate>;
    roi: RoiScores;
    vb_index: number;
    usage: UsageStats;
  };
}

export async function writeJsonReport(
  report: Report,
  outDir: string,
  filename?: string,
): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const name = filename ?? `${ts}.json`;
  const path = resolve(outDir, name);
  await writeFile(path, JSON.stringify(report, null, 2));
  return path;
}

export function renderMarkdown(report: Report): string {
  const lines: string[] = [];
  lines.push(
    `# Vortex-Bench v1 · ${report.generated_at}`,
    ``,
    `**VB_Index**: **${report.aggregate.vb_index.toFixed(1)} / 100**`,
    ``,
    `- Provider: \`${report.provider.name}\` / model \`${report.provider.model}\``,
    `- Dataset: \`${report.dataset_version}\`  Schema: \`v${report.schema_version}\``,
    ...(report.git_commit ? [`- Commit: \`${report.git_commit}\``] : []),
    ``,
    `## Layer breakdown`,
    ``,
    `| Layer | Score | Pass | C | E | R | U |`,
    `|-------|------:|------|---|---|---|---|`,
  );
  for (const [key, layer] of Object.entries(report.aggregate.layers)) {
    if (layer.count === 0) continue;
    lines.push(
      `| ${key} | ${layer.score.toFixed(1)} | ${layer.pass}/${layer.count} | ` +
        `${layer.correctness.toFixed(2)} | ${layer.efficiency.toFixed(2)} | ` +
        `${layer.robustness.toFixed(2)} | ${layer.utilization.toFixed(2)} |`,
    );
  }
  lines.push(``);

  lines.push(`## Design ROI`, ``);
  const { roi } = report.aggregate;
  lines.push(`- **A observe**: ${roi.observe.toFixed(1)}%  (使用 observe 的比例 × 总通过率)`);
  lines.push(
    `- **B error-hint**: ${roi.errorHint === null ? "N/A (no samples encountered expected errors)" : roi.errorHint.toFixed(1) + "%  (L1 撞到错后的恢复率)"}`,
  );
  lines.push(
    `- **C event-bus**: ${roi.eventBus === null ? "N/A (no event-subscribe scenarios)" : roi.eventBus.toFixed(1) + "%"}`,
  );
  lines.push(``);

  const u = report.aggregate.usage;
  lines.push(`## Usage`, ``);
  lines.push(`- Tokens: in=${u.tokens_input.toLocaleString()} out=${u.tokens_output.toLocaleString()} total=${u.tokens_total.toLocaleString()}`);
  lines.push(`- Steps p50=${u.steps_p50}  p95=${u.steps_p95}`);
  lines.push(`- Elapsed total: ${(u.elapsed_ms_total / 1000).toFixed(1)}s`);
  lines.push(``);

  const sortedTools = Object.entries(u.tool_usage).sort((a, b) => b[1] - a[1]);
  const top = sortedTools.slice(0, 10);
  lines.push(`### Tool usage (top 10 by calls)`, ``);
  for (const [name, count] of top) {
    lines.push(`- \`${name}\`: ${count}`);
  }
  if (u.unused_tools.length > 0) {
    lines.push(``);
    lines.push(`### Unused tools (${u.unused_tools.length})`, ``);
    lines.push(`<details><summary>click to expand</summary>`, ``);
    for (const name of u.unused_tools) lines.push(`- \`${name}\``);
    lines.push(`</details>`);
  }
  lines.push(``);

  lines.push(`## Scenarios`, ``);
  lines.push(`| Layer | ID | Pass | Steps | Tokens | Tools | Errors | C/E/R/U |`);
  lines.push(`|-------|----|------|------:|-------:|------:|--------|---------|`);
  for (const s of report.scenarios) {
    const tkn = s.agent.inputTokens + s.agent.outputTokens;
    const m = s.metrics;
    const metricStr = `${m.correctness.toFixed(2)}/${m.efficiency.toFixed(2)}/${m.robustness.toFixed(2)}/${m.utilization.toFixed(2)}`;
    lines.push(
      `| ${s.layer ?? "-"} | ${s.id} | ${s.pass ? "✓" : "✗"} | ${s.agent.steps} | ` +
        `${tkn.toLocaleString()} | ${s.agent.toolCalls.length} | ${s.agent.errorCodes.join(",") || "-"} | ${metricStr} |`,
    );
  }
  lines.push(``);

  return lines.join("\n");
}
