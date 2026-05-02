// 跑一个 case：启 MCP 连接，navigate 到 playground 页面，执行 run(ctx)，收集指标。

import { createMcpConnection, closeMcpConnection, type McpConnection } from "./mcp-client.js";
import { Trace, extractErrorCodes } from "./trace.js";
import type { CaseContext, CaseDefinition, CaseMetrics } from "../types.js";

export interface RunCaseOptions {
  mcpBin: string;
  playgroundUrl: string;
}

class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssertionError";
  }
}

export async function runCase(def: CaseDefinition, opts: RunCaseOptions): Promise<CaseMetrics> {
  const mcp = await createMcpConnection({
    command: process.execPath,
    args: [opts.mcpBin],
    env: { ...(process.env as Record<string, string>) },
  });

  const trace = new Trace();
  let callCount = 0;
  let fallback = 0;
  let missed = 0;
  let outputBytes = 0;
  const outputBytesByTool: Record<string, number> = {};
  const customMetrics: Record<string, number> = {};

  async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    callCount++;
    trace.push({ kind: "tool_call", name, args, at: trace.now() });
    const res = await mcp.client.callTool({ name, arguments: args });
    const text = extractText(res);
    const errorCodes = extractErrorCodes(text);
    // v0.7.1 instrument: 累加 utf-8 字节数（Buffer.byteLength 比 .length 准——
    // 中文 3 倍）。LLM token 估算用 bytes/4 粗算或专用 tokenizer。
    const bytes = Buffer.byteLength(text, "utf-8");
    outputBytes += bytes;
    outputBytesByTool[name] = (outputBytesByTool[name] ?? 0) + bytes;
    trace.push({
      kind: "tool_result",
      name,
      isError: Boolean((res as { isError?: boolean }).isError),
      resultText: text,
      errorCodes,
      at: trace.now(),
    });
    return res;
  }

  const ctx: CaseContext = {
    async call(name, args) {
      return callTool(name, args);
    },
    async fallbackEvaluate(args) {
      fallback++;
      return callTool("vortex_evaluate", args as unknown as Record<string, unknown>);
    },
    recordObserveMiss(n) {
      missed += n;
    },
    assert(cond, message) {
      if (!cond) throw new AssertionError(message);
    },
    recordMetric(key, value) {
      customMetrics[key] = value;
    },
  };

  const started = Date.now();
  try {
    // 每个 case 开头固定动作：先 about:blank 卸载旧组件，再 navigate 到目标
    // （同 URL navigate 在 Vue hash router 下不会重 mount，导致跨次 state 残留）
    await ctx.call("vortex_navigate", { url: "about:blank" });
    await ctx.call("vortex_navigate", {
      url: opts.playgroundUrl + def.playgroundPath,
    });
    await ctx.call("vortex_wait_idle", { kind: "dom", timeout: 5000 });

    await def.run(ctx);

    return buildMetrics(def, true, undefined, callCount, fallback, missed, outputBytes, outputBytesByTool, Date.now() - started, customMetrics);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return buildMetrics(def, false, reason, callCount, fallback, missed, outputBytes, outputBytesByTool, Date.now() - started, customMetrics);
  } finally {
    await closeMcpConnection(mcp);
    void trace; void mcp as unknown as McpConnection; // 保留引用抑制 unused 警告
  }
}

function buildMetrics(
  def: CaseDefinition,
  passed: boolean,
  reason: string | undefined,
  callCount: number,
  fallback: number,
  missed: number,
  outputBytes: number,
  outputBytesByTool: Record<string, number>,
  durationMs: number,
  customMetrics: Record<string, number>,
): CaseMetrics {
  const m: CaseMetrics = {
    case: def.name,
    passed,
    callCount,
    fallbackToEvaluate: fallback,
    observeMissedPopperItems: missed,
    outputBytes,
    durationMs,
  };
  if (Object.keys(outputBytesByTool).length > 0) m.outputBytesByTool = { ...outputBytesByTool };
  if (reason !== undefined) m.failureReason = reason;
  if (Object.keys(customMetrics).length > 0) m.customMetrics = { ...customMetrics };
  return m;
}

function extractText(res: unknown): string {
  const content = (res as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const item of content) {
    if (item && typeof item === "object" && "text" in item) {
      parts.push(String((item as { text: unknown }).text));
    }
  }
  return parts.join("\n");
}
