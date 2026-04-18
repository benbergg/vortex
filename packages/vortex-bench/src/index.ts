#!/usr/bin/env node
// vortex-bench CLI 入口 · 骨架阶段（B1）
// 三个子命令：run / score / diff
// 具体实现将在 B2~B5 逐步填充

import { config as loadEnv } from "dotenv";

loadEnv();

const USAGE = `vortex-bench <command> [options]

Commands:
  run <scenario>                 Run a single scenario directory
  run --layer L0|L1|L2|L3        Run all scenarios in a layer (repeatable)
  score <report.json>            Compute VB_Index from a report JSON
  diff <baseline.json> <latest.json>   Compare two reports, exit non-zero if regressed
  --help                         Show this message

Env:
  MINIMAX_API_KEY      Agent LLM key (required for run)
  BENCH_BASE_URL       Anthropic-compatible base URL (default: https://api.minimax.io/anthropic)
  BENCH_MODEL          Model id (default: MiniMax-M2.7)
  BENCH_MAX_STEPS      Hard step cap per scenario (default: 30)
  BENCH_MAX_COST_USD   Hard cost cap per scenario (default: 0.5)
`;

function printUsage(): void {
  process.stdout.write(USAGE);
}

async function main(): Promise<number> {
  const [, , cmd, ...rest] = process.argv;

  if (!cmd || cmd === "--help" || cmd === "-h") {
    printUsage();
    return 0;
  }

  switch (cmd) {
    case "run":
      process.stderr.write("[vortex-bench] 'run' not implemented yet (B2~B3)\n");
      return 2;
    case "score":
      process.stderr.write("[vortex-bench] 'score' not implemented yet (B5)\n");
      return 2;
    case "diff":
      process.stderr.write("[vortex-bench] 'diff' not implemented yet (B5)\n");
      return 2;
    default:
      process.stderr.write(`[vortex-bench] unknown command: ${cmd}\n\n`);
      printUsage();
      return 1;
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`[vortex-bench] fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
