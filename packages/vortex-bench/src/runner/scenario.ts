// 场景加载：读 task.md + expected.json，并对 task.md 做占位符替换。

import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { Assertion } from "./judge.js";

export type Layer = "L0" | "L1" | "L1b" | "L2" | "L3";

export interface ExpectedSpec {
  layer?: Layer;
  /** 预算步数（Efficiency 指标） */
  budgetSteps?: number;
  /** 预算 token（近似 cost 代理） */
  budgetTokens?: number;
  /** 本次场景预期必须撞到的错误码（L1 用） */
  expectedErrorCode?: string;
  /** 场景禁用的工具列表（L1b 用） */
  disabledTools?: string[];
  /** 断言序列 */
  assertions: Assertion[];
  /** LLM judge 兜底：提供 rubric 则跑一次 LLM judge，结果合并到 checks 最终 pass 为 AND */
  llmRubric?: string;
}

export interface Scenario {
  id: string;
  dir: string;
  task: string;
  expected: ExpectedSpec;
}

export interface LoadOptions {
  placeholders?: Record<string, string>;
}

export async function loadScenario(
  scenarioDir: string,
  options: LoadOptions = {},
): Promise<Scenario> {
  const dir = resolve(scenarioDir);
  const id = dir.split(/[\\/]/).pop() ?? dir;

  // task.md 必选
  const taskPath = resolve(dir, "task.md");
  let task = (await readFile(taskPath, "utf-8")).trim();
  if (!task) throw new Error(`Empty task.md in ${dir}`);
  task = applyPlaceholders(task, options.placeholders ?? {});

  // expected.json 可选（无则空 assertions + budgetSteps 默认值）
  const expectedPath = resolve(dir, "expected.json");
  let expected: ExpectedSpec = { assertions: [] };
  if (await exists(expectedPath)) {
    const raw = await readFile(expectedPath, "utf-8");
    const parsed = JSON.parse(raw) as ExpectedSpec;
    expected = {
      ...parsed,
      assertions: Array.isArray(parsed.assertions) ? parsed.assertions : [],
    };
  }

  return { id, dir, task, expected };
}

function applyPlaceholders(
  text: string,
  placeholders: Record<string, string>,
): string {
  return text.replace(/\{\{([A-Z_][A-Z0-9_]*)\}\}/g, (_, key: string) => {
    return placeholders[key] ?? `{{${key}}}`;
  });
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
