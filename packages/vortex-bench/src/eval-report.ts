// 评测门 eval 报告渲染:分档汇总 markdown。纯函数,无浏览器。

import { taskScore } from "./runner/eval.js";
import type { EvalResult } from "./runner/eval.js";

// taskScore 核心评分在 eval.ts(供 gateEval 共用),此处 re-export 保持向后兼容。
export { taskScore };

function pct(n: number, d: number): string {
  if (d === 0) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

export function renderEvalMarkdown(r: EvalResult): string {
  const lines: string[] = [];
  lines.push("# vortex 评测门(eval)");
  lines.push("");
  lines.push(`生成: ${r.generatedAt}`);
  lines.push("");
  lines.push("## 分档汇总");
  lines.push("");
  lines.push("| tier | A层召回 | 召回率 | FP | B层任务(pass/降级/fail) | 任务分 |");
  lines.push("|---|---|---|---|---|---|");
  for (const t of r.tiers) {
    const recall = `${t.recallMatched}/${t.recallExpected}`;
    const task = `${t.taskPass}/${t.taskDegraded}/${t.taskFail}`;
    lines.push(
      `| ${t.tier} | ${recall} (${t.fixtureCount}fx) | ${pct(t.recallMatched, t.recallExpected)} | ${t.recallNoise} | ${task} (${t.caseCount}) | ${pct(Math.round(taskScore(t) * 1000), 1000)} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}
