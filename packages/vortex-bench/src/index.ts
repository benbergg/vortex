#!/usr/bin/env node
// vortex-bench CLI 入口（B2：run 已接入，score/diff 待 B5）

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createMcpConnection, closeMcpConnection } from "./runner/mcp-client.js";
import { runAgent } from "./runner/agent.js";
import { loadScenario } from "./runner/scenario.js";
import { resolveProvider } from "./runner/provider.js";

loadEnv();

const USAGE = `vortex-bench <command> [options]

Commands:
  run <scenarioDir>              Run a single scenario directory
  score <report.json>            Compute VB_Index (B5, not yet implemented)
  diff <baseline> <latest>       Compare two reports (B5, not yet implemented)
  --help                         Show this message

Provider auto-pick (by env var presence): zhipu > anthropic > minimax
Override with BENCH_PROVIDER=zhipu|anthropic|minimax.

Env:
  ZHIPU_API_KEY        Zhipu (智谱) key — default provider, glm-4.7
  ANTHROPIC_API_KEY    Anthropic official key — claude-haiku-4-5
  MINIMAX_API_KEY      MiniMax key (sk- not sk-cp-) — MiniMax-M2.7
  BENCH_PROVIDER       Force provider (zhipu|anthropic|minimax)
  BENCH_BASE_URL       Override Anthropic-compatible base URL
  BENCH_MODEL          Override model id
  BENCH_MAX_STEPS      Hard step cap per scenario (default: 30)
  BENCH_MAX_TOKENS     Hard total-token cap (default: unlimited)
  VORTEX_MCP_BIN       Path to vortex-mcp server.js (default: ../mcp/dist/src/server.js)
`;

function printUsage(): void {
  process.stdout.write(USAGE);
}

function resolveMcpBin(): string {
  if (process.env.VORTEX_MCP_BIN) return resolve(process.env.VORTEX_MCP_BIN);
  // 默认 workspace 相对路径：packages/vortex-bench/dist → packages/mcp/dist/src/server.js
  const here = fileURLToPath(import.meta.url);
  return resolve(here, "../../..", "mcp", "dist", "src", "server.js");
}

async function cmdRun(args: string[]): Promise<number> {
  const scenarioDir = args[0];
  if (!scenarioDir) {
    process.stderr.write("[vortex-bench] run requires <scenarioDir>\n");
    return 1;
  }

  const provider = resolveProvider();
  const maxSteps = parseInt(process.env.BENCH_MAX_STEPS ?? "30", 10);
  const maxTokens = process.env.BENCH_MAX_TOKENS
    ? parseInt(process.env.BENCH_MAX_TOKENS, 10)
    : Number.POSITIVE_INFINITY;

  const scenario = await loadScenario(scenarioDir);
  process.stdout.write(`[vortex-bench] scenario=${scenario.id}\n`);
  process.stdout.write(
    `[vortex-bench] provider=${provider.provider} model=${provider.model} base=${provider.baseURL}\n`,
  );

  const mcpBin = resolveMcpBin();
  process.stdout.write(`[vortex-bench] spawning vortex-mcp: ${mcpBin}\n`);

  const mcp = await createMcpConnection({
    command: process.execPath,
    args: [mcpBin],
    env: { ...(process.env as Record<string, string>) },
  });
  process.stdout.write(`[vortex-bench] mcp tools loaded: ${mcp.tools.length}\n`);

  try {
    const started = Date.now();
    const result = await runAgent({
      task: scenario.task,
      mcp,
      model: provider.model,
      ...(provider.authToken ? { authToken: provider.authToken } : {}),
      ...(provider.apiKey ? { apiKey: provider.apiKey } : {}),
      baseURL: provider.baseURL,
      maxSteps,
      maxTokens,
    });
    const elapsedMs = Date.now() - started;

    process.stdout.write("\n━━━ result ━━━\n");
    process.stdout.write(`success:           ${result.success}\n`);
    process.stdout.write(`terminationReason: ${result.terminationReason}`);
    if (result.terminationDetail) process.stdout.write(` (${result.terminationDetail})`);
    process.stdout.write("\n");
    process.stdout.write(`steps:             ${result.steps}\n`);
    process.stdout.write(`tokens:            in=${result.inputTokens} out=${result.outputTokens}\n`);
    process.stdout.write(`toolCalls:         ${result.toolCalls.length}\n`);
    for (const tc of result.toolCalls) {
      const flag = tc.isError ? "✗" : "✓";
      process.stdout.write(`  ${flag} ${tc.name}  (errorCodes=${JSON.stringify(tc.errorCodes)})\n`);
    }
    if (result.errorCodes.length > 0) {
      process.stdout.write(`errorCodes seen:   ${result.errorCodes.join(", ")}\n`);
    }
    process.stdout.write(`elapsed:           ${elapsedMs}ms\n`);
    process.stdout.write(`finalText:         ${result.finalText || "(none)"}\n`);

    return result.success ? 0 : 2;
  } finally {
    await closeMcpConnection(mcp);
  }
}

async function main(): Promise<number> {
  const [, , cmd, ...rest] = process.argv;

  if (!cmd || cmd === "--help" || cmd === "-h") {
    printUsage();
    return 0;
  }

  switch (cmd) {
    case "run":
      return cmdRun(rest);
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
    if (err instanceof Error && err.stack) process.stderr.write(err.stack + "\n");
    process.exit(1);
  },
);
