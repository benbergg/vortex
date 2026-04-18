// 声明式程序化 judge。
// expected.json 里声明一组 assertions，judge 逐项评估。
// 必要时通过 mcp connection 查询真实页面状态（agent 跑完后 tab 仍在）。

import type { McpConnection } from "./mcp-client.js";
import type { AgentResult } from "./agent.js";

export type Assertion =
  | { type: "url_contains"; value: string }
  | { type: "url_matches"; pattern: string }
  | { type: "text_in_page"; value: string }
  | { type: "no_error_codes" }
  | { type: "error_code_seen"; value: string }
  | { type: "tool_called"; name: string }
  | { type: "max_steps_below"; value: number }
  | { type: "agent_success" };

export interface CheckResult {
  ok: boolean;
  name: string;
  detail?: string;
}

export interface JudgeReport {
  pass: boolean;
  checks: CheckResult[];
}

export interface JudgeContext {
  agentResult: AgentResult;
  mcp: McpConnection;
}

export async function runJudge(
  assertions: Assertion[],
  ctx: JudgeContext,
): Promise<JudgeReport> {
  const checks: CheckResult[] = [];
  for (const a of assertions) {
    checks.push(await evalAssertion(a, ctx));
  }
  return { pass: checks.every((c) => c.ok), checks };
}

async function evalAssertion(a: Assertion, ctx: JudgeContext): Promise<CheckResult> {
  switch (a.type) {
    case "url_contains": {
      const url = await getActiveTabUrl(ctx.mcp);
      const ok = url?.includes(a.value) ?? false;
      return {
        ok,
        name: `url_contains("${a.value}")`,
        detail: ok ? undefined : `actual url=${url ?? "(none)"}`,
      };
    }
    case "url_matches": {
      const url = await getActiveTabUrl(ctx.mcp);
      const ok = url ? new RegExp(a.pattern).test(url) : false;
      return {
        ok,
        name: `url_matches(/${a.pattern}/)`,
        detail: ok ? undefined : `actual url=${url ?? "(none)"}`,
      };
    }
    case "text_in_page": {
      const text = await getActivePageText(ctx.mcp);
      const ok = text?.includes(a.value) ?? false;
      return {
        ok,
        name: `text_in_page("${a.value.slice(0, 30)}")`,
        detail: ok ? undefined : `page length=${text?.length ?? 0}, not found`,
      };
    }
    case "no_error_codes": {
      const codes = ctx.agentResult.errorCodes;
      return {
        ok: codes.length === 0,
        name: "no_error_codes",
        detail: codes.length > 0 ? `saw: ${codes.join(", ")}` : undefined,
      };
    }
    case "error_code_seen": {
      const ok = ctx.agentResult.errorCodes.includes(a.value);
      return {
        ok,
        name: `error_code_seen(${a.value})`,
        detail: ok ? undefined : `saw: ${ctx.agentResult.errorCodes.join(", ") || "(none)"}`,
      };
    }
    case "tool_called": {
      const ok = ctx.agentResult.toolCalls.some((c) => c.name === a.name);
      return {
        ok,
        name: `tool_called(${a.name})`,
        detail: ok ? undefined : `tools used: ${uniq(ctx.agentResult.toolCalls.map((c) => c.name)).join(",")}`,
      };
    }
    case "max_steps_below": {
      const ok = ctx.agentResult.steps < a.value;
      return {
        ok,
        name: `max_steps_below(${a.value})`,
        detail: ok ? undefined : `actual steps=${ctx.agentResult.steps}`,
      };
    }
    case "agent_success": {
      return {
        ok: ctx.agentResult.success,
        name: "agent_success",
        detail: ctx.agentResult.success
          ? undefined
          : `terminationReason=${ctx.agentResult.terminationReason}`,
      };
    }
  }
}

function uniq(xs: string[]): string[] {
  return Array.from(new Set(xs));
}

async function getActiveTabUrl(mcp: McpConnection): Promise<string | undefined> {
  const res = await mcp.client.callTool({ name: "vortex_tab_list", arguments: {} });
  const text = extractText(res);
  if (!text) return undefined;
  try {
    const arr = JSON.parse(text);
    if (Array.isArray(arr)) {
      const active = arr.find((t) => t && typeof t === "object" && t.active === true);
      return typeof active?.url === "string" ? active.url : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function getActivePageText(mcp: McpConnection): Promise<string | undefined> {
  const res = await mcp.client.callTool({
    name: "vortex_content_get_text",
    arguments: {},
  });
  const text = extractText(res);
  return text ?? undefined;
}

function extractText(res: unknown): string | undefined {
  const r = res as { content?: Array<{ type: string; text?: string }> };
  if (!Array.isArray(r.content)) return undefined;
  const parts = r.content
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string);
  return parts.join("\n") || undefined;
}
