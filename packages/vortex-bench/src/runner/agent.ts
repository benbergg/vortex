// 极简 ReAct loop：Anthropic SDK（可指向 MiniMax Anthropic-compat 端点）+ MCP stdio dispatch。
//
// 终止条件：
//   - 模型返回纯 text（无 tool_use）→ done（success=true）
//   - steps >= maxSteps → max_steps（success=false）
//   - 累计 tokens >= maxTokens（若配） → max_tokens（success=false）
//   - SDK 抛错 → model_error（success=false）

import Anthropic from "@anthropic-ai/sdk";
import type { Tool as MCPTool } from "@modelcontextprotocol/sdk/types.js";
import type { McpConnection } from "./mcp-client.js";
import { Trace, extractErrorCodes } from "./trace.js";

export interface AgentOptions {
  task: string;
  mcp: McpConnection;
  model: string;
  /** Set when target endpoint expects `Authorization: Bearer` (e.g. MiniMax Anthropic-compat). */
  authToken?: string;
  /** Set when target endpoint expects `x-api-key` (official Anthropic API). */
  apiKey?: string;
  baseURL?: string;
  maxSteps?: number;
  maxTokens?: number;
  maxOutputPerStep?: number;
  systemPrompt?: string;
}

export interface ToolCallSummary {
  name: string;
  args: unknown;
  resultText: string;
  isError: boolean;
  errorCodes: string[];
}

export type TerminationReason =
  | "done"
  | "max_steps"
  | "max_tokens"
  | "model_error";

export interface AgentResult {
  success: boolean;
  steps: number;
  toolCalls: ToolCallSummary[];
  errorCodes: string[];
  inputTokens: number;
  outputTokens: number;
  terminationReason: TerminationReason;
  terminationDetail?: string;
  finalText: string;
  trace: Trace;
}

function mcpToAnthropicTool(t: MCPTool): Anthropic.Tool {
  return {
    name: t.name,
    description: t.description ?? "",
    input_schema: (t.inputSchema ?? {
      type: "object",
      properties: {},
    }) as Anthropic.Tool["input_schema"],
  };
}

const DEFAULT_SYSTEM = `You are an autonomous browser-automation agent operating via the Vortex MCP toolchain.
Rules:
- Use the provided tools to accomplish the user task.
- Each tool response may include structured error fields { code, hint, recoverable, context } — read hint before retrying.
- On unknown or complex pages, call vortex_observe BEFORE any vortex_content_get_text / _html / vortex_dom_query to avoid filling context with 100KB+ of DOM. Then use index-based dom.* tools over brittle selectors.
- Stop and return a short summary when the task is done (no more tool_use blocks).`;

export async function runAgent(opts: AgentOptions): Promise<AgentResult> {
  const maxSteps = opts.maxSteps ?? 30;
  const maxTokens = opts.maxTokens ?? Number.POSITIVE_INFINITY;
  const maxOutputPerStep = opts.maxOutputPerStep ?? 4096;

  if (!opts.authToken && !opts.apiKey) {
    throw new Error("runAgent: need authToken or apiKey");
  }
  const anthropic = new Anthropic({
    ...(opts.authToken ? { authToken: opts.authToken } : {}),
    ...(opts.apiKey ? { apiKey: opts.apiKey } : {}),
    ...(opts.baseURL ? { baseURL: opts.baseURL } : {}),
  });

  const tools = opts.mcp.tools.map(mcpToAnthropicTool);
  const trace = new Trace();
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: opts.task },
  ];
  trace.push({ kind: "user", text: opts.task, at: trace.now() });

  const toolCalls: ToolCallSummary[] = [];
  const allErrorCodes: string[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let finalText = "";

  for (let step = 0; step < maxSteps; step++) {
    let resp: Anthropic.Message;
    try {
      resp = await anthropic.messages.create({
        model: opts.model,
        max_tokens: maxOutputPerStep,
        ...(opts.systemPrompt ?? DEFAULT_SYSTEM
          ? { system: opts.systemPrompt ?? DEFAULT_SYSTEM }
          : {}),
        tools,
        messages,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      trace.push({ kind: "terminate", reason: `model_error: ${detail}`, at: trace.now() });
      return buildResult({
        success: false,
        steps: step,
        toolCalls,
        allErrorCodes,
        inputTokens,
        outputTokens,
        terminationReason: "model_error",
        terminationDetail: detail,
        finalText,
        trace,
      });
    }

    inputTokens += resp.usage.input_tokens;
    outputTokens += resp.usage.output_tokens;
    trace.push({
      kind: "usage",
      inputTokens: resp.usage.input_tokens,
      outputTokens: resp.usage.output_tokens,
      at: trace.now(),
    });

    messages.push({ role: "assistant", content: resp.content });

    const textBlocks: string[] = [];
    const toolUses: Array<{ id: string; name: string; input: unknown }> = [];
    for (const block of resp.content) {
      if (block.type === "text") {
        textBlocks.push(block.text);
        trace.push({ kind: "assistant_text", text: block.text, at: trace.now() });
      } else if (block.type === "tool_use") {
        toolUses.push({ id: block.id, name: block.name, input: block.input });
      }
    }
    finalText = textBlocks.join("\n").trim();

    if (toolUses.length === 0) {
      trace.push({ kind: "terminate", reason: "done", at: trace.now() });
      return buildResult({
        success: true,
        steps: step + 1,
        toolCalls,
        allErrorCodes,
        inputTokens,
        outputTokens,
        terminationReason: "done",
        finalText,
        trace,
      });
    }

    // 每个 tool_use 分派到 MCP
    const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      trace.push({ kind: "tool_call", name: use.name, args: use.input, at: trace.now() });

      let resultText: string;
      let isError = false;
      try {
        const callRes = await opts.mcp.client.callTool({
          name: use.name,
          arguments: (use.input ?? {}) as Record<string, unknown>,
        });
        isError = callRes.isError === true;
        const parts: string[] = [];
        const rawContent = callRes.content as Array<{ type: string; text?: string }> | undefined;
        if (Array.isArray(rawContent)) {
          for (const c of rawContent) {
            if (c.type === "text" && typeof c.text === "string") parts.push(c.text);
          }
        }
        resultText = parts.length > 0 ? parts.join("\n") : JSON.stringify(callRes.content ?? {});
      } catch (err) {
        isError = true;
        resultText = err instanceof Error ? err.message : String(err);
      }

      const codes = extractErrorCodes(resultText);
      allErrorCodes.push(...codes);

      toolCalls.push({
        name: use.name,
        args: use.input,
        resultText,
        isError,
        errorCodes: codes,
      });

      trace.push({
        kind: "tool_result",
        name: use.name,
        isError,
        resultText: resultText.slice(0, 500),
        errorCodes: codes,
        at: trace.now(),
      });

      toolResultBlocks.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: resultText,
        is_error: isError,
      });
    }

    messages.push({ role: "user", content: toolResultBlocks });

    if (inputTokens + outputTokens >= maxTokens) {
      trace.push({ kind: "terminate", reason: "max_tokens", at: trace.now() });
      return buildResult({
        success: false,
        steps: step + 1,
        toolCalls,
        allErrorCodes,
        inputTokens,
        outputTokens,
        terminationReason: "max_tokens",
        finalText,
        trace,
      });
    }
  }

  trace.push({ kind: "terminate", reason: "max_steps", at: trace.now() });
  return buildResult({
    success: false,
    steps: maxSteps,
    toolCalls,
    allErrorCodes,
    inputTokens,
    outputTokens,
    terminationReason: "max_steps",
    finalText,
    trace,
  });
}

function buildResult(args: {
  success: boolean;
  steps: number;
  toolCalls: ToolCallSummary[];
  allErrorCodes: string[];
  inputTokens: number;
  outputTokens: number;
  terminationReason: TerminationReason;
  terminationDetail?: string;
  finalText: string;
  trace: Trace;
}): AgentResult {
  return {
    success: args.success,
    steps: args.steps,
    toolCalls: args.toolCalls,
    errorCodes: Array.from(new Set(args.allErrorCodes)),
    inputTokens: args.inputTokens,
    outputTokens: args.outputTokens,
    terminationReason: args.terminationReason,
    terminationDetail: args.terminationDetail,
    finalText: args.finalText,
    trace: args.trace,
  };
}
