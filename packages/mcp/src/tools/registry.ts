// packages/mcp/src/tools/registry.ts

import { getAllToolDefs, type ToolDef } from "./schemas.js";

const toolMap = new Map<string, ToolDef>();

export function getToolDefs(): ToolDef[] {
  if (toolMap.size === 0) {
    for (const def of getAllToolDefs()) {
      toolMap.set(def.name, def);
    }
  }
  return [...toolMap.values()];
}

export function getToolDef(name: string): ToolDef | undefined {
  if (toolMap.size === 0) getToolDefs();
  return toolMap.get(name);
}
