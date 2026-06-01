// packages/vortex-bench/src/fuzz-report.ts
// FuzzReport → markdown。结构性 finding 优先,name 类单列,沉淀清单。

import type { FuzzReport } from "./fuzz-types.js";

export function renderFuzzMarkdown(r: FuzzReport): string {
  const structural = r.findings.filter((f) => f.cls === "structural");
  const name = r.findings.filter((f) => f.cls === "name");
  const lines: string[] = [];
  lines.push(`# fuzz report ${r.generatedAt}`);
  lines.push("");
  lines.push(`- playground: ${r.playgroundUrl}`);
  lines.push(`- seeds run: ${r.seedsRun}`);
  lines.push(`- self-test: ${r.selfTestOk ? "✓ PASS" : "✗ FAIL"}`);
  if (r.quarantined.length > 0) {
    lines.push(`- quarantined primitives: ${r.quarantined.join(", ")}`);
  }
  lines.push(`- structural findings: ${structural.length}  |  name findings: ${name.length}`);
  lines.push(`- promoted fixtures: ${r.promoted.length ? r.promoted.join(", ") : "(none)"}`);
  lines.push("");

  lines.push(`## structural(漏报/误报,高置信,已沉淀)`);
  if (structural.length === 0) lines.push("(none — observe 在生成空间内无结构盲点)");
  for (const f of structural) {
    lines.push(`- seed=${f.seed} **${f.kind}** ${f.oracleId ? `#${f.oracleId} ` : ""}— ${f.detail}`);
  }
  lines.push("");
  lines.push(`## name(命名不符,低置信,仅报)`);
  if (name.length === 0) lines.push("(none)");
  for (const f of name) {
    lines.push(`- seed=${f.seed} ${f.oracleId ? `#${f.oracleId} ` : ""}— ${f.detail}`);
  }
  lines.push("");
  return lines.join("\n");
}
