// packages/mcp/src/tools/registry.ts
//
// v0.6: tools/list 仅返回 11 个 public 工具（spec L4 §0.2.1 字节预算 ≤ 4500 B）。
// v0.5 的 36 个工具中，25 个内部化（实现保留供 L4 act/extract/observe 内部 dispatch 调用），
// vortex_ping 删除。

import type { ToolDef } from "./schemas.js";
import { getAllToolDefs } from "./schemas.js";
import { PUBLIC_TOOLS } from "./schemas-public.js";

const publicMap = new Map<string, ToolDef>();
const internalMap = new Map<string, ToolDef>();

function ensureMaps(): void {
  if (publicMap.size === 0) {
    for (const def of PUBLIC_TOOLS) publicMap.set(def.name, def);
  }
  if (internalMap.size === 0) {
    for (const def of getAllToolDefs()) internalMap.set(def.name, def);
  }
}

/**
 * v0.6 public tools (11 个，对外暴露给 LLM via tools/list)。
 */
export function getToolDefs(): ToolDef[] {
  ensureMaps();
  return [...publicMap.values()];
}

/**
 * 按名查 public tool（用于 tools/call 入口校验）。
 */
export function getToolDef(name: string): ToolDef | undefined {
  ensureMaps();
  return publicMap.get(name);
}

/**
 * v0.5 全 36 工具（含已内部化的 25 个）。仅用于 L4 dispatch 内部 routing，
 * 不应在 tools/list 暴露。`vortex_ping` 已从 schemas.ts 删除。
 */
export function getInternalToolDef(name: string): ToolDef | undefined {
  ensureMaps();
  return internalMap.get(name);
}
