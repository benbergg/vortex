// LLM judge 兜底：L2/L3 里文本类任务无法纯程序断言（例如"提取商品名"），
// 让一个 LLM 读 task.md + agent 最终状态 + 执行轨迹，给出 pass/fail 判定。

import Anthropic from "@anthropic-ai/sdk";
import type { ProviderConfig } from "./provider.js";
import type { AgentResult } from "./agent.js";
import type { CheckResult } from "./judge.js";

const SYSTEM = `You are a strict bench evaluator for a browser-automation agent.
Given a task description, a grading rubric, and the agent's execution trace,
determine if the agent completed the task correctly.

Respond with ONLY a single JSON object, no markdown fences, no preamble:
{"pass": boolean, "reason": "one concise sentence explaining the verdict"}`;

export interface LlmJudgeInput {
  task: string;
  rubric: string;
  agent: AgentResult;
  provider: ProviderConfig;
}

export async function runLlmJudge(input: LlmJudgeInput): Promise<CheckResult> {
  const client = new Anthropic({
    ...(input.provider.authToken ? { authToken: input.provider.authToken } : {}),
    ...(input.provider.apiKey ? { apiKey: input.provider.apiKey } : {}),
    ...(input.provider.baseURL ? { baseURL: input.provider.baseURL } : {}),
  });

  const trace = input.agent.toolCalls
    .slice(0, 30)
    .map((c) => `- ${c.isError ? "✗" : "✓"} ${c.name}  ${JSON.stringify(c.args).slice(0, 100)}`)
    .join("\n");

  const user = `## Task
${input.task}

## Grading rubric (additional criteria)
${input.rubric}

## Agent final text
${input.agent.finalText.slice(0, 2000) || "(empty)"}

## Agent tool-call sequence (first 30)
${trace || "(no tool calls)"}

## Errors encountered
${input.agent.errorCodes.join(", ") || "(none)"}

## Termination
${input.agent.terminationReason}`;

  try {
    const resp = await client.messages.create({
      model: input.provider.model,
      max_tokens: 256,
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
    });
    const text = resp.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    const parsed = parseJudgeJson(text);
    return {
      ok: parsed.pass,
      name: "llm_judge",
      detail: parsed.reason,
    };
  } catch (err) {
    return {
      ok: false,
      name: "llm_judge",
      detail: `LLM judge call failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function parseJudgeJson(text: string): { pass: boolean; reason: string } {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { pass: false, reason: `unparseable: ${text.slice(0, 120)}` };
  try {
    const obj = JSON.parse(match[0]) as { pass?: unknown; reason?: unknown };
    return {
      pass: obj.pass === true,
      reason: typeof obj.reason === "string" ? obj.reason : "(no reason)",
    };
  } catch {
    return { pass: false, reason: `json parse failed: ${text.slice(0, 120)}` };
  }
}
