// 场景加载（最小版，B3 会扩展 setup/judge/expected）。

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface Scenario {
  id: string;
  dir: string;
  task: string;
}

export async function loadScenario(scenarioDir: string): Promise<Scenario> {
  const dir = resolve(scenarioDir);
  const id = dir.split(/[\\/]/).pop() ?? dir;
  const taskPath = resolve(dir, "task.md");
  const task = (await readFile(taskPath, "utf-8")).trim();
  if (!task) {
    throw new Error(`Empty task.md in ${dir}`);
  }
  return { id, dir, task };
}
