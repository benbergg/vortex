// case 公共辅助（文件名以 _ 开头，runner 的 listCaseNames 只收 .case.ts，不会当 case 跑）

import type { CaseContext } from "../src/types.js";

/** MCP 工具返回值 → 纯文本 */
export function extractText(res: unknown): string {
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

/** evaluate 返回值 → JS 原生值（vortex_evaluate 的 content 是 JSON 字符串）*/
export function extractEvalJson<T = unknown>(res: unknown): T {
  const text = extractText(res);
  return JSON.parse(text) as T;
}

/** 读取 [data-testid="result"] 的可见文本 */
export async function readResult(ctx: CaseContext): Promise<string> {
  const res = await ctx.call("vortex_extract", {
    target: "[data-testid=\"result\"]",
    include: ["text"],
  });
  return extractText(res);
}

/** 断言 result 区包含子串（自带重试，避免 v-model 异步 commit 导致的 flaky）。
 * retry 窗口 6×500ms = 3s，覆盖 Element Plus 某些场景 Vue flush 的 tail 延迟。*/
export async function assertResultContains(ctx: CaseContext, expected: string): Promise<void> {
  let lastText = "";
  for (let i = 0; i < 6; i++) {
    lastText = await readResult(ctx);
    if (lastText.includes(expected)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  ctx.assert(
    false,
    `result 区应包含 "${expected}"，实际: ${lastText.slice(0, 200)}`,
  );
}
