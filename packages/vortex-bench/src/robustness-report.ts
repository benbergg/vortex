// packages/vortex-bench/src/robustness-report.ts
// R0→R1 排序 + markdown 渲染。json 报告直接 JSON.stringify(report)。

import type { RobustnessReport, RobustnessFinding } from "./robustness-types.js";

const SEV_ORDER: Record<RobustnessFinding["severity"], number> = { R0: 0, R1: 1 };

export function rankRobustnessFindings(findings: RobustnessFinding[]): RobustnessFinding[] {
  return [...findings].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
}

export function renderRobustnessMarkdown(report: RobustnessReport): string {
  const lines: string[] = [];
  lines.push("# vortex robustness 报告(漏斗 layer-0:observe→act 契约)");
  lines.push("");
  lines.push(`- 生成时间: ${report.generatedAt}`);
  lines.push(`- playground: ${report.playgroundUrl}`);
  const r0 = report.findings.filter((f) => f.severity === "R0").length;
  const r1 = report.findings.filter((f) => f.severity === "R1").length;
  lines.push(`- fixture 数: ${report.fixtures.length}  R0: ${r0}  R1: ${r1}`);
  lines.push("");

  // per-page 表
  lines.push("## 汇总(per-fixture)");
  lines.push("");
  lines.push("| fixture | 总 ref | okRate | R0 | R1 |");
  lines.push("|---|---|---|---|---|");
  for (const fxr of report.fixtures) {
    const fr0 = fxr.findings.filter((f) => f.severity === "R0").length;
    const fr1 = fxr.findings.filter((f) => f.severity === "R1").length;
    lines.push(
      `| ${fxr.fixture} | ${fxr.totalRefs} | ${(fxr.okRate * 100).toFixed(0)}% | ${fr0} | ${fr1} |`,
    );
    if (fxr.error) lines.push(`| ↳ ⚠ error | ${fxr.error.replace(/\|/g, "\\|")} | | | |`);
  }
  lines.push("");

  const ranked = rankRobustnessFindings(report.findings);
  if (r0 === 0) {
    lines.push("> ✅ observe→act 契约全成立 —— observe 发的每个 ref 都能被 act 解析(无 R0)。");
    lines.push("");
  }
  for (const sev of ["R0", "R1"] as const) {
    const group = ranked.filter((f) => f.severity === sev);
    if (group.length === 0) continue;
    const title = sev === "R0" ? "R0(契约违反 / crash / timeout)" : "R1(actionability 降级)";
    lines.push(`## ${title} — ${group.length}`);
    lines.push("");
    for (const f of group) {
      lines.push(`- **[${f.code}]** \`${f.fixture}\` \`${f.ref}\` — ${f.detail}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
