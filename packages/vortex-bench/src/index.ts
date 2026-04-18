#!/usr/bin/env node
// vortex-bench CLI 入口。

import { readdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createMcpConnection, closeMcpConnection } from "./runner/mcp-client.js";
import { runAgent, type AgentResult } from "./runner/agent.js";
import { loadScenario, type Scenario } from "./runner/scenario.js";
import { resolveProvider, type ProviderConfig } from "./runner/provider.js";
import { startFixtureServer, type FixtureServer } from "./runner/fixtures.js";
import { runJudge, type JudgeReport } from "./runner/judge.js";

loadEnv();

const USAGE = `vortex-bench <command> [options]

Commands:
  run <scenarioDir>              Run a single scenario directory
  run --layer <dir>              Run all subdirectories of <dir> (layer batch)
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
  const here = fileURLToPath(import.meta.url);
  return resolve(here, "../../..", "mcp", "dist", "src", "server.js");
}

interface ScenarioOutcome {
  scenario: Scenario;
  agent: AgentResult;
  judge: JudgeReport;
  elapsedMs: number;
  pass: boolean;
}

async function runOneScenario(opts: {
  scenarioDir: string;
  provider: ProviderConfig;
  fixture: FixtureServer;
  mcpBin: string;
  maxSteps: number;
  maxTokens: number;
}): Promise<ScenarioOutcome> {
  const scenario = await loadScenario(opts.scenarioDir, {
    placeholders: { FIXTURE_URL: opts.fixture.url },
  });

  process.stdout.write(`\n━━━ ${scenario.id} ━━━\n`);
  process.stdout.write(`task: ${scenario.task.split("\n")[0].slice(0, 100)}...\n`);

  const mcp = await createMcpConnection({
    command: process.execPath,
    args: [opts.mcpBin],
    env: { ...(process.env as Record<string, string>) },
  });

  try {
    const started = Date.now();
    const agent = await runAgent({
      task: scenario.task,
      mcp,
      model: opts.provider.model,
      ...(opts.provider.authToken ? { authToken: opts.provider.authToken } : {}),
      ...(opts.provider.apiKey ? { apiKey: opts.provider.apiKey } : {}),
      baseURL: opts.provider.baseURL,
      maxSteps: opts.maxSteps,
      maxTokens: opts.maxTokens,
    });
    const elapsedMs = Date.now() - started;

    const judge = await runJudge(scenario.expected.assertions, {
      agentResult: agent,
      mcp,
    });

    const pass = judge.pass;
    const flag = pass ? "✓ PASS" : "✗ FAIL";
    process.stdout.write(
      `${flag}  steps=${agent.steps} tokens=${agent.inputTokens + agent.outputTokens} ` +
        `tools=${agent.toolCalls.length} errors=[${agent.errorCodes.join(",")}] ${elapsedMs}ms\n`,
    );
    // L1 ROI 可视化：是否撞到预期错误码（即 B error-hint 恢复路径是否被触发）
    if (scenario.expected.expectedErrorCode) {
      const hit = agent.errorCodes.includes(scenario.expected.expectedErrorCode);
      const mark = hit ? "↻ recovered" : "→ direct";
      process.stdout.write(
        `   [ROI-B] expected=${scenario.expected.expectedErrorCode} ${mark}${pass ? "" : " (but task failed)"}\n`,
      );
    }
    for (const c of judge.checks) {
      const mark = c.ok ? "✓" : "✗";
      process.stdout.write(
        `   ${mark} ${c.name}${c.detail ? `  — ${c.detail}` : ""}\n`,
      );
    }
    if (agent.finalText) {
      process.stdout.write(`   text: ${agent.finalText.slice(0, 160)}\n`);
    }

    return { scenario, agent, judge, elapsedMs, pass };
  } finally {
    await closeMcpConnection(mcp);
  }
}

async function collectScenarios(dir: string): Promise<string[]> {
  const absRoot = resolve(dir);
  const s = await stat(absRoot);
  if (!s.isDirectory()) throw new Error(`Not a directory: ${absRoot}`);

  // task.md 存在 → 自身即 scenario；否则递归一层找子目录
  const selfTask = join(absRoot, "task.md");
  try {
    await stat(selfTask);
    return [absRoot];
  } catch {
    // 批量模式
  }

  const entries = await readdir(absRoot, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const child = join(absRoot, e.name);
    try {
      await stat(join(child, "task.md"));
      out.push(child);
    } catch {
      // skip
    }
  }
  out.sort();
  return out;
}

async function cmdRun(args: string[]): Promise<number> {
  const target = args[0];
  if (!target) {
    process.stderr.write("[vortex-bench] run requires <scenarioDir>\n");
    return 1;
  }

  const provider = resolveProvider();
  const maxSteps = parseInt(process.env.BENCH_MAX_STEPS ?? "30", 10);
  const maxTokens = process.env.BENCH_MAX_TOKENS
    ? parseInt(process.env.BENCH_MAX_TOKENS, 10)
    : Number.POSITIVE_INFINITY;

  const scenarios = await collectScenarios(target);
  if (scenarios.length === 0) {
    process.stderr.write(`[vortex-bench] no scenarios found under ${target}\n`);
    return 1;
  }

  process.stdout.write(
    `[vortex-bench] provider=${provider.provider} model=${provider.model}\n`,
  );
  process.stdout.write(`[vortex-bench] scenarios: ${scenarios.length}\n`);

  const fixture = await startFixtureServer();
  process.stdout.write(`[vortex-bench] fixture server: ${fixture.url}\n`);
  const mcpBin = resolveMcpBin();

  const outcomes: ScenarioOutcome[] = [];
  try {
    for (const s of scenarios) {
      try {
        const out = await runOneScenario({
          scenarioDir: s,
          provider,
          fixture,
          mcpBin,
          maxSteps,
          maxTokens,
        });
        outcomes.push(out);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[vortex-bench] scenario ${s} failed: ${msg}\n`);
      }
    }
  } finally {
    await fixture.close();
  }

  const passCount = outcomes.filter((o) => o.pass).length;
  const totalSteps = outcomes.reduce((s, o) => s + o.agent.steps, 0);
  const totalIn = outcomes.reduce((s, o) => s + o.agent.inputTokens, 0);
  const totalOut = outcomes.reduce((s, o) => s + o.agent.outputTokens, 0);

  process.stdout.write(
    `\n━━━ summary ━━━\npass: ${passCount}/${outcomes.length}  ` +
      `steps: ${totalSteps}  tokens: in=${totalIn} out=${totalOut}\n`,
  );

  return passCount === outcomes.length ? 0 : 2;
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
