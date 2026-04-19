#!/usr/bin/env node
// vortex-bench CLI 入口。

import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { config as loadEnv } from "dotenv";
import { createMcpConnection, closeMcpConnection } from "./runner/mcp-client.js";
import { runAgent, DEFAULT_SYSTEM, type AgentResult } from "./runner/agent.js";
import { loadScenario, type Scenario } from "./runner/scenario.js";
import { resolveProvider, type ProviderConfig } from "./runner/provider.js";
import { startFixtureServer, type FixtureServer } from "./runner/fixtures.js";
import { runJudge, type JudgeReport } from "./runner/judge.js";
import { runLlmJudge } from "./runner/judge-llm.js";
import {
  computeScenarioMetrics,
  aggregateLayer,
  aggregateL1b,
  computeRoi,
  vbIndex,
  computeUsageStats,
  type ScenarioDataPoint,
  type LayerAggregate,
} from "./runner/metrics.js";
import { renderMarkdown, writeJsonReport, type Report } from "./runner/reporter.js";
import { diffReports, renderDiffMarkdown } from "./runner/diff.js";
import { pickRepresentativeIndex, computeVariance } from "./runner/aggregate-runs.js";

loadEnv();

const USAGE = `vortex-bench <command> [options]

Commands:
  run <scenarioDir>              Run a single scenario or all subdirs; emits JSON + MD report
  score <report.json>            Re-render MD report card from a saved JSON
  diff <baseline> <latest>       Compare two reports (exit non-zero on critical regressions)
  --help                         Show this message

Provider auto-pick (by env): zhipu > anthropic > minimax
Override with BENCH_PROVIDER=zhipu|anthropic|minimax.

Env:
  ZHIPU_API_KEY / ANTHROPIC_API_KEY / MINIMAX_API_KEY
  BENCH_PROVIDER / BENCH_BASE_URL / BENCH_MODEL
  BENCH_MAX_STEPS (30) / BENCH_MAX_TOKENS (unlimited)
  VORTEX_MCP_BIN   (default: ../mcp/dist/src/server.js)
  REPORT_NAME      Override report filename (e.g. baseline.json)
`;

function printUsage(): void {
  process.stdout.write(USAGE);
}

function resolveMcpBin(): string {
  if (process.env.VORTEX_MCP_BIN) return resolve(process.env.VORTEX_MCP_BIN);
  const here = fileURLToPath(import.meta.url);
  return resolve(here, "../../..", "mcp", "dist", "src", "server.js");
}

function reportsDir(): string {
  const here = fileURLToPath(import.meta.url);
  return resolve(here, "../..", "reports");
}

function gitCommitSafe(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: reportsDir(), stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

interface ScenarioOutcome {
  scenario: Scenario;
  agent: AgentResult;
  judge: JudgeReport;
  elapsedMs: number;
  data: ScenarioDataPoint;
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

  const disabled = scenario.expected.disabledTools ?? [];

  const mcp = await createMcpConnection({
    command: process.execPath,
    args: [opts.mcpBin],
    env: { ...(process.env as Record<string, string>) },
  });

  if (disabled.length > 0) {
    const allNames = new Set(mcp.tools.map((t) => t.name));
    const unknown = disabled.filter((d) => !allNames.has(d));
    if (unknown.length > 0) {
      throw new Error(
        `scenario ${scenario.id}: disabledTools contains unknown tool names: ${unknown.join(", ")}. ` +
        `Available: ${[...allNames].sort().join(", ")}`,
      );
    }
  }
  const toolsForAgent = disabled.length > 0
    ? mcp.tools.filter((t) => !disabled.includes(t.name))
    : mcp.tools;

  const systemPrompt = disabled.length > 0
    ? `${DEFAULT_SYSTEM}\n\nTools unavailable in this scenario: ${disabled.join(", ")}. Do not attempt to call them.`
    : undefined;

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
      tools: toolsForAgent,
      ...(systemPrompt !== undefined ? { systemPrompt } : {}),
    });
    const elapsedMs = Date.now() - started;

    let judge = await runJudge(scenario.expected.assertions, {
      agentResult: agent,
      mcp,
    });

    // LLM judge 兜底（仅当 expected.llmRubric 存在）
    if (scenario.expected.llmRubric) {
      const llmCheck = await runLlmJudge({
        task: scenario.task,
        rubric: scenario.expected.llmRubric,
        agent,
        provider: opts.provider,
      });
      judge = {
        pass: judge.pass && llmCheck.ok,
        checks: [...judge.checks, llmCheck],
      };
    }

    const data = computeScenarioMetrics({ scenario, agent, judge, elapsedMs });

    const pass = judge.pass;
    const flag = pass ? "✓ PASS" : "✗ FAIL";
    process.stdout.write(
      `${flag}  steps=${agent.steps} tokens=${agent.inputTokens + agent.outputTokens} ` +
        `tools=${agent.toolCalls.length} errors=[${agent.errorCodes.join(",")}] ${elapsedMs}ms\n`,
    );
    if (scenario.expected.expectedErrorCode) {
      const hit = data.metrics.encountered_expected_error;
      process.stdout.write(
        `   [ROI-B] expected=${scenario.expected.expectedErrorCode} ${hit ? "↻ recovered" : "→ direct"}${pass ? "" : " (task failed)"}\n`,
      );
    }
    for (const c of judge.checks) {
      const mark = c.ok ? "✓" : "✗";
      process.stdout.write(
        `   ${mark} ${c.name}${c.detail ? `  — ${c.detail}` : ""}\n`,
      );
    }
    process.stdout.write(
      `   [metrics] C=${data.metrics.correctness.toFixed(2)} E=${data.metrics.efficiency.toFixed(2)} ` +
        `R=${data.metrics.robustness.toFixed(2)} U=${data.metrics.utilization.toFixed(2)}\n`,
    );

    return { scenario, agent, judge, elapsedMs, data, pass };
  } finally {
    await closeMcpConnection(mcp);
  }
}

async function runOneScenarioN(
  opts: Parameters<typeof runOneScenario>[0],
  n: number,
): Promise<{
  outcomes: Awaited<ReturnType<typeof runOneScenario>>[];
  errors: Array<{ index: number; reason: string }>;
}> {
  const outcomes: Awaited<ReturnType<typeof runOneScenario>>[] = [];
  const errors: Array<{ index: number; reason: string }> = [];
  for (let i = 0; i < n; i++) {
    try {
      const out = await runOneScenario(opts);
      outcomes.push(out);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      errors.push({ index: i, reason });
      process.stderr.write(`[vortex-bench] ${opts.scenarioDir} run ${i} failed: ${reason}\n`);
    }
  }
  return { outcomes, errors };
}

async function collectScenarios(dir: string): Promise<string[]> {
  const absRoot = resolve(dir);
  const s = await stat(absRoot);
  if (!s.isDirectory()) throw new Error(`Not a directory: ${absRoot}`);

  const selfTask = join(absRoot, "task.md");
  try {
    await stat(selfTask);
    return [absRoot];
  } catch {
    // batch
  }

  const out: string[] = [];
  const entries = await readdir(absRoot, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const child = join(absRoot, e.name);
    try {
      await stat(join(child, "task.md"));
      out.push(child);
    } catch {
      // recurse one more level (e.g. run scenarios/v1 → expand L0-smoke/L1-...)
      const sub = await collectScenarios(child).catch(() => []);
      out.push(...sub);
    }
  }
  out.sort();
  return out;
}

export interface RunArgs {
  scenarioDir: string;
  repeats: number;
  verboseRuns: boolean;
}

export function parseRunArgs(argv: string[]): RunArgs {
  const envRepeats = process.env.BENCH_REPEATS;
  let repeats = envRepeats ? parseInt(envRepeats, 10) : 1;
  let verboseRuns = false;
  let scenarioDir: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--verbose-runs") {
      verboseRuns = true;
    } else if (a === "--repeats" || a.startsWith("--repeats=")) {
      const val = a.includes("=") ? a.split("=")[1] : argv[++i];
      const n = parseInt(val ?? "", 10);
      if (!Number.isInteger(n) || n < 1) {
        throw new Error(`--repeats must be a positive integer, got: ${val}`);
      }
      repeats = n;
    } else if (!a.startsWith("-") && scenarioDir === undefined) {
      scenarioDir = a;
    }
  }

  if (!scenarioDir) throw new Error("run requires <scenarioDir>");
  return { scenarioDir, repeats, verboseRuns };
}

async function cmdRun(args: string[]): Promise<number> {
  let parsed: RunArgs;
  try {
    parsed = parseRunArgs(args);
  } catch (err) {
    process.stderr.write(`[vortex-bench] ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
  const target = parsed.scenarioDir;

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
  const incompleteIds: string[] = [];
  let allTools: string[] = [];

  const n = parsed.repeats;

  try {
    // 每 scenario 跑 N 次
    const perScenario: Array<{
      outcomes: Awaited<ReturnType<typeof runOneScenario>>[];
      errors: Array<{ index: number; reason: string }>;
      dir: string;
    }> = [];

    for (const s of scenarios) {
      const { outcomes: sOutcomes, errors } = await runOneScenarioN(
        { scenarioDir: s, provider, fixture, mcpBin, maxSteps, maxTokens },
        n,
      );
      perScenario.push({ outcomes: sOutcomes, errors, dir: s });
    }

    // 挑 representative / 处理 incomplete
    for (const ps of perScenario) {
      if (ps.outcomes.length === 0) {
        incompleteIds.push(ps.dir.split(/[\\/]/).pop() ?? ps.dir);
        continue;
      }
      if (ps.outcomes.length < Math.ceil(n / 2)) {
        incompleteIds.push(ps.outcomes[0].scenario.id);
        continue;
      }
      const dataPoints = ps.outcomes.map((o) => o.data);
      const repIdx = pickRepresentativeIndex(dataPoints);
      const rep = ps.outcomes[repIdx];

      // 把 v2 字段挂到 rep 对象上（用类型断言为 any），report 构造段读取
      (rep as unknown as Record<string, unknown>)._v2 = {
        runs: n,
        runs_completed: ps.outcomes.length,
        incomplete: false,
        error_runs: ps.errors,
        pass_rate: `${ps.outcomes.filter((o) => o.pass).length}/${ps.outcomes.length}`,
        pass_stable: new Set(ps.outcomes.map((o) => o.pass)).size === 1,
        representative_index: repIdx,
        variance: computeVariance(dataPoints),
        allRuns: parsed.verboseRuns ? dataPoints : undefined,
      };

      outcomes.push(rep);
    }

    // 拉一次 tool 列表用于 unused_tools 统计
    const mcp = await createMcpConnection({
      command: process.execPath,
      args: [mcpBin],
      env: { ...(process.env as Record<string, string>) },
    });
    allTools = mcp.tools.map((t) => t.name);
    await closeMcpConnection(mcp);
  } finally {
    await fixture.close();
  }

  // 聚合 + 报告
  const points = outcomes.map((o) => o.data);
  const layers: Record<string, LayerAggregate> = {};
  for (const l of ["L0", "L1", "L2", "L3"] as const) {
    const pts = points.filter((p) => p.layer === l);
    if (pts.length > 0) layers[l] = aggregateLayer(pts, l);
  }
  const roi = computeRoi(points);
  const layerScores = Object.fromEntries(
    Object.entries(layers).map(([k, v]) => [k, v.score]),
  ) as Parameters<typeof vbIndex>[0];
  const vb = vbIndex(layerScores);
  const usage = computeUsageStats(points, allTools);
  const l1b = aggregateL1b(points);

  const report: Report = {
    schema_version: n > 1 ? 2 : 1,
    dataset_version: "v1",
    generated_at: new Date().toISOString(),
    git_commit: gitCommitSafe(),
    provider: {
      name: provider.provider,
      model: provider.model,
      baseURL: provider.baseURL,
    },
    scenarios: outcomes.map((o) => {
      const v2 = (o as unknown as Record<string, unknown>)._v2 as Record<string, unknown> | undefined;
      return {
        ...o.data,
        judge_checks: o.judge.checks,
        ...(v2 ?? {}),
      };
    }),
    aggregate: {
      layers,
      roi,
      vb_index: vb,
      usage,
      ...(l1b ? { l1b } : {}),
      ...(incompleteIds.length > 0 ? { incomplete_scenarios: incompleteIds } : {}),
    },
  };

  const jsonPath = await writeJsonReport(report, reportsDir(), process.env.REPORT_NAME);
  const md = renderMarkdown(report);
  process.stdout.write("\n" + md);
  process.stdout.write(`\n[report] JSON written to: ${jsonPath}\n`);

  const totalPass = outcomes.filter((o) => o.pass).length;
  return totalPass === outcomes.length ? 0 : 2;
}

async function cmdScore(args: string[]): Promise<number> {
  const path = args[0];
  if (!path) {
    process.stderr.write("[vortex-bench] score requires <report.json>\n");
    return 1;
  }
  const raw = await readFile(resolve(path), "utf-8");
  const report = JSON.parse(raw) as Report;
  process.stdout.write(renderMarkdown(report));
  return 0;
}

async function cmdDiff(args: string[]): Promise<number> {
  const [basePath, latestPath] = args;
  if (!basePath || !latestPath) {
    process.stderr.write("[vortex-bench] diff requires <baseline> <latest>\n");
    return 1;
  }
  const baseline = JSON.parse(await readFile(resolve(basePath), "utf-8")) as Report;
  const latest = JSON.parse(await readFile(resolve(latestPath), "utf-8")) as Report;
  const d = diffReports(baseline, latest);
  process.stdout.write(renderDiffMarkdown(baseline, latest, d));
  process.stdout.write("\n");
  const hasCritical = d.regressions.some((r) => r.severity === "critical");
  return hasCritical ? 2 : 0;
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
      return cmdScore(rest);
    case "diff":
      return cmdDiff(rest);
    default:
      process.stderr.write(`[vortex-bench] unknown command: ${cmd}\n\n`);
      printUsage();
      return 1;
  }
}

// ESM entry-point guard：仅当作为 CLI 直接启动时才运行（import 时不运行，测试友好）
const isDirectRun = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1]
  : false;
if (isDirectRun) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`[vortex-bench] fatal: ${err instanceof Error ? err.message : String(err)}\n`);
      if (err instanceof Error && err.stack) process.stderr.write(err.stack + "\n");
      process.exit(1);
    },
  );
}
