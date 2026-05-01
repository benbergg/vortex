#!/usr/bin/env node
// Extract dogfood metrics from a Claude Code transcript file.
//
// Usage:
//   node scripts/dogfood-extract.mjs <session.jsonl> \
//        [--task <name>] [--version v0.5|v0.6] [--run <N>] \
//        [--start <ISO>] [--end <ISO>]
//
// Each Claude Code session writes one .jsonl per session under
// ~/.claude/projects/<cwd-encoded>/<session-uuid>.jsonl.
// Each line is a record; assistant lines carry `message.usage` with the
// model call's token totals.
//
// We sum across the slice (optionally bounded by --start / --end) and emit
// JSON to stdout suitable for dogfood-report.md aggregation.

import { readFileSync } from "node:fs";
import { argv, exit, stdout, stderr } from "node:process";

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      out[a.slice(2)] = argv[i + 1];
      i++;
    } else {
      out._.push(a);
    }
  }
  return out;
}

const args = parseArgs(argv);
const filePath = args._[0];
if (!filePath) {
  stderr.write(
    "usage: dogfood-extract.mjs <session.jsonl> [--task name] [--version v0.5|v0.6] [--run N] [--start ISO] [--end ISO]\n",
  );
  exit(1);
}

const startTs = args.start ? Date.parse(args.start) : -Infinity;
const endTs = args.end ? Date.parse(args.end) : Infinity;
if (Number.isNaN(startTs) || Number.isNaN(endTs)) {
  stderr.write("error: --start / --end must be ISO timestamps\n");
  exit(1);
}

const raw = readFileSync(filePath, "utf8").split("\n").filter(Boolean);

let modelCallCount = 0;
let inputTokens = 0;
let outputTokens = 0;
let cacheReadTokens = 0;
let cacheCreationTokens = 0;
let firstAt = null;
let lastAt = null;
let model = null;
const toolCalls = {};

for (const line of raw) {
  let rec;
  try {
    rec = JSON.parse(line);
  } catch {
    continue;
  }
  if (rec.type !== "assistant") continue;

  const ts = rec.timestamp ? Date.parse(rec.timestamp) : null;
  if (ts != null && (ts < startTs || ts > endTs)) continue;

  const msg = rec.message ?? {};
  if (msg.role !== "assistant") continue;

  modelCallCount++;
  if (!model && msg.model) model = msg.model;
  if (ts != null) {
    if (firstAt == null || ts < firstAt) firstAt = ts;
    if (lastAt == null || ts > lastAt) lastAt = ts;
  }

  const u = msg.usage ?? {};
  inputTokens += u.input_tokens ?? 0;
  outputTokens += u.output_tokens ?? 0;
  cacheReadTokens += u.cache_read_input_tokens ?? 0;
  cacheCreationTokens += u.cache_creation_input_tokens ?? 0;

  for (const part of msg.content ?? []) {
    if (part?.type === "tool_use" && typeof part.name === "string") {
      const name = part.name;
      if (name.startsWith("vortex_") || name.startsWith("mcp__vortex__")) {
        toolCalls[name] = (toolCalls[name] ?? 0) + 1;
      }
    }
  }
}

if (modelCallCount === 0) {
  stderr.write(
    `warning: no assistant messages matched (file=${filePath}${args.start ? `, start=${args.start}` : ""}${args.end ? `, end=${args.end}` : ""})\n`,
  );
}

const totalTokens = inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens;
const durationSeconds =
  firstAt != null && lastAt != null ? Math.round((lastAt - firstAt) / 1000) : 0;

const summary = {
  task: args.task ?? null,
  version: args.version ?? null,
  run: args.run ? Number(args.run) : null,
  session_file: filePath,
  started_at: firstAt ? new Date(firstAt).toISOString() : null,
  ended_at: lastAt ? new Date(lastAt).toISOString() : null,
  duration_seconds: durationSeconds,
  model,
  model_call_count: modelCallCount,
  input_tokens: inputTokens,
  output_tokens: outputTokens,
  cache_read_tokens: cacheReadTokens,
  cache_creation_tokens: cacheCreationTokens,
  total_tokens: totalTokens,
  vortex_tool_calls: toolCalls,
  vortex_tool_call_total: Object.values(toolCalls).reduce((a, b) => a + b, 0),
};

stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
