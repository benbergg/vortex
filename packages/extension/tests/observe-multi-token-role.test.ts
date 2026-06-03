import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * 回归锁:多 token(回退列表)role 属性泄漏(2026-06-03 第十四轮 Wikipedia
 * 真实站 dogfood,AM)。
 *
 * 现象:Wikipedia 可排序表头 `role="columnheader button"`(ARIA 允许 role 是
 *   空格分隔的「回退角色列表」,浏览器取首个有效 token = columnheader)。
 *   getRole 旧逻辑 `const explicit = el.getAttribute("role"); if (explicit) return explicit;`
 *   逐字返回整串 → observe 输出畸形双词 role `[columnheader button]`,agent 无法
 *   匹配任何已知 role。这是真实 ARIA 渐进增强模式(role="menuitem button" 等)的
 *   通用 bug,影响所有 wikitable 排序表(数百万页面)。
 *
 * 修复:取首个空格分隔 token 近似 ARIA「首个有效 token」规则(作者惯例主角色置首)。
 *   role 仅空格时回落到隐式 role 推导(tag-based)。
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const OBSERVE_SRC = readFileSync(
  join(__dirname, "..", "src", "handlers", "observe.ts"),
  "utf8",
);

describe("observe 多 token role 取首 token(AM,2026-06-03 dogfood)", () => {
  it("getRole 对显式 role 取首个空格分隔 token(非逐字返回整串)", () => {
    // 不再有「if (explicit) return explicit;」逐字返回。
    expect(OBSERVE_SRC).not.toMatch(/if \(explicit\) return explicit;/);
    // 改为 split 取首 token。
    expect(OBSERVE_SRC).toMatch(/explicit\.trim\(\)\.split\(\/\\s\+\/\)\[0\]/);
  });

  it("getRole 首 token 为空(role 仅空格)时回落隐式 role 推导", () => {
    // split 后取 [0] 再判真值才 return,空则继续往下走 tag-based 推导。
    expect(OBSERVE_SRC).toMatch(/const first = explicit\.trim\(\)\.split\(\/\\s\+\/\)\[0\];\s*\n\s*if \(first\) return first;/);
  });
});
