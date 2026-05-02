#!/usr/bin/env node
// vortex-bench v0.6 CLI
// 前置：playground 已起（pnpm playground）、vortex-server ws 6800、Chrome extension 已加载。

import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runCase } from "./runner/run-case.js";
import { diffReports, renderDiffTable, hasCritical } from "./runner/diff.js";
import type { BenchReport, CaseDefinition, CaseMetrics } from "./types.js";

const USAGE = `vortex-bench <command>

Commands:
  run <caseName>         跑单个 case（e.g. el-dropdown）
  run --all              跑 cases/ 下全部
  diff                   跟 reports/baseline.json 对比
  baseline               把最近一次 latest.json 存成 baseline.json
  --help                 显示帮助

Env:
  VORTEX_MCP_BIN         默认 ../mcp/dist/src/server.js
  PLAYGROUND_URL         默认 http://localhost:5173
`;

const HERE = dirname(fileURLToPath(import.meta.url));
// 本文件被 tsx 跑时在 src/，被 tsc build 后在 dist/；两种都从它的上级找资源。
const PKG_ROOT = resolve(HERE, "..");
const CASES_DIR = resolve(PKG_ROOT, "cases");
const REPORTS_DIR = resolve(PKG_ROOT, "reports");

function resolveMcpBin(): string {
  if (process.env.VORTEX_MCP_BIN) return resolve(process.env.VORTEX_MCP_BIN);
  return resolve(PKG_ROOT, "..", "mcp", "dist", "src", "server.js");
}

function playgroundUrl(): string {
  return process.env.PLAYGROUND_URL ?? "http://localhost:5173";
}

async function loadCase(name: string): Promise<CaseDefinition> {
  const path = resolve(CASES_DIR, `${name}.case.ts`);
  const mod = (await import(pathToFileURL(path).href)) as { default: CaseDefinition };
  if (!mod.default || typeof mod.default.run !== "function") {
    throw new Error(`case ${name} 导出不是 CaseDefinition (缺 default.run)`);
  }
  return mod.default;
}

async function listCaseNames(): Promise<string[]> {
  const entries = await readdir(CASES_DIR);
  return entries
    .filter((e) => e.endsWith(".case.ts"))
    .map((e) => e.replace(/\.case\.ts$/, ""))
    .sort();
}

function formatRow(m: CaseMetrics): string {
  const status = m.passed ? "✓" : "✗";
  const bytesKB = ((m.outputBytes ?? 0) / 1024).toFixed(1);
  return `${status} ${m.case.padEnd(32)} calls=${String(m.callCount).padStart(3)} fallback=${m.fallbackToEvaluate} missed=${m.observeMissedPopperItems} bytes=${bytesKB.padStart(6)}KB ${m.durationMs}ms${m.failureReason ? `  ← ${m.failureReason}` : ""}`;
}

async function writeLatest(report: BenchReport): Promise<string> {
  await mkdir(REPORTS_DIR, { recursive: true });
  const path = join(REPORTS_DIR, "latest.json");
  await writeFile(path, JSON.stringify(report, null, 2));
  return path;
}

async function cmdRun(args: string[]): Promise<number> {
  const runAll = args.includes("--all");
  const caseNames = runAll
    ? await listCaseNames()
    : args.filter((a) => !a.startsWith("-"));

  if (caseNames.length === 0) {
    process.stderr.write("[vortex-bench] run 需要 <caseName> 或 --all\n");
    return 1;
  }

  const mcpBin = resolveMcpBin();
  const url = playgroundUrl();
  process.stdout.write(`[vortex-bench] playground=${url}  mcp=${mcpBin}\n`);
  process.stdout.write(`[vortex-bench] 跑 ${caseNames.length} 个 case\n\n`);

  const results: CaseMetrics[] = [];
  for (const name of caseNames) {
    const def = await loadCase(name);
    const m = await runCase(def, { mcpBin, playgroundUrl: url });
    results.push(m);
    process.stdout.write(formatRow(m) + "\n");
  }

  const report: BenchReport = {
    generatedAt: new Date().toISOString(),
    playgroundUrl: url,
    cases: results,
  };
  const path = await writeLatest(report);
  process.stdout.write(`\n[report] ${path}\n`);

  const failed = results.filter((r) => !r.passed).length;
  return failed === 0 ? 0 : 2;
}

async function cmdDiff(): Promise<number> {
  const basePath = join(REPORTS_DIR, "baseline.json");
  const latestPath = join(REPORTS_DIR, "latest.json");
  let baseline: BenchReport;
  try {
    baseline = JSON.parse(await readFile(basePath, "utf-8")) as BenchReport;
  } catch {
    process.stderr.write(`[vortex-bench] baseline 不存在：${basePath}（先跑 run --all 再 baseline）\n`);
    return 1;
  }
  const latest = JSON.parse(await readFile(latestPath, "utf-8")) as BenchReport;
  const diffs = diffReports(baseline, latest);
  process.stdout.write(renderDiffTable(diffs) + "\n");
  return hasCritical(diffs) ? 2 : 0;
}

async function cmdBaseline(): Promise<number> {
  const latestPath = join(REPORTS_DIR, "latest.json");
  const basePath = join(REPORTS_DIR, "baseline.json");
  const raw = await readFile(latestPath, "utf-8");
  await writeFile(basePath, raw);
  process.stdout.write(`[vortex-bench] 更新 baseline: ${basePath}\n`);
  return 0;
}

async function main(): Promise<number> {
  const [, , cmd, ...rest] = process.argv;
  if (!cmd || cmd === "--help" || cmd === "-h") {
    process.stdout.write(USAGE);
    return 0;
  }
  switch (cmd) {
    case "run":
      return cmdRun(rest);
    case "diff":
      return cmdDiff();
    case "baseline":
      return cmdBaseline();
    default:
      process.stderr.write(`[vortex-bench] 未知命令: ${cmd}\n\n${USAGE}`);
      return 1;
  }
}

const isDirectRun = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1] ||
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)
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
