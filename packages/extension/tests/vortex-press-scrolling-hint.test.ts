import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * VORTEX_FEEDBACK v3.3 B3-6: vortex_press description 引导(方向 A)
 *
 * 问题(v3.4 复测代码线命中):vortex_press 当前 description = "Press a key or
 * shortcut globally.",未引导用户用 window.scrollTo 替代 key:End 做滚动。
 *
 * V2 修复:description 加 scrolling 引导 + "无聚焦元素时按键多无效"提示
 * (claude-code §3 建议:更完整)。
 *
 * 测试:契约级 readFileSync(schemas-public.ts) + toMatch(/token/),锁定关键文案
 * 防止"看起来一样但少一行"。description 改动是文档,无 page-side 行为变更。
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// tests/vortex-press-scrolling-hint.test.ts -> ../../mcp/src/tools/schemas-public.ts
const SCHEMAS_PATH = join(__dirname, "..", "..", "mcp", "src", "tools", "schemas-public.ts");

describe("vortex_press description — B3-6 v3.3 方向 A", () => {
  const src = readFileSync(SCHEMAS_PATH, "utf8");

  it("vortex_press 名称块存在", () => {
    expect(src).toMatch(/name:\s*"vortex_press"/);
  });

  it("vortex_press description 含 'Press a key' (保留原意)", () => {
    const m = src.match(
      /name:\s*"vortex_press"[\s\S]*?description:\s*"([^"]+)"/,
    );
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/Press a key/);
  });

  it("vortex_press description 含 scrolling 引导(window.scrollTo 替代 key:End)", () => {
    const m = src.match(
      /name:\s*"vortex_press"[\s\S]*?description:\s*"([^"]+)"/,
    );
    expect(m).not.toBeNull();
    const desc = m![1];
    expect(desc).toMatch(/window\.scrollTo/i);
    expect(desc).toMatch(/key:\s*End/i);
    expect(desc).toMatch(/prefer|instead/i);
  });

  it("vortex_press description 顺带提'无聚焦元素时按键可能无效' (V2 补)", () => {
    const m = src.match(
      /name:\s*"vortex_press"[\s\S]*?description:\s*"([^"]+)"/,
    );
    expect(m).not.toBeNull();
    const desc = m![1];
    expect(desc).toMatch(/focused element|tabindex/i);
  });
});
