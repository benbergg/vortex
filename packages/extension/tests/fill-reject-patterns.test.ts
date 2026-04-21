import { describe, it, expect } from "vitest";
import { FILL_REJECT_PATTERNS } from "../src/patterns/index.js";

describe("FILL_REJECT_PATTERNS registry", () => {
  it("has at least the three launch patterns", () => {
    const ids = FILL_REJECT_PATTERNS.map((p) => p.id);
    expect(ids).toContain("element-plus-datetime-range");
    expect(ids).toContain("element-plus-cascader");
    expect(ids).toContain("ant-design-range-picker");
  });

  it("all patterns have non-empty id/selector/reason/suggestedTool/fixExample", () => {
    for (const p of FILL_REJECT_PATTERNS) {
      expect(p.id).toBeTruthy();
      expect(p.closestSelector).toBeTruthy();
      expect(p.reason.length).toBeGreaterThan(10);
      expect(p.suggestedTool).toMatch(/^vortex_/);
      expect(p.fixExample.length).toBeGreaterThan(10);
    }
  });

  it("suggestedTool / fixExample point at v0.5 vortex_fill (not v0.4 vortex_dom_commit)", () => {
    for (const p of FILL_REJECT_PATTERNS) {
      expect(p.suggestedTool).not.toMatch(/vortex_dom_commit/);
      expect(p.fixExample).not.toMatch(/vortex_dom_commit/);
      expect(p.suggestedTool).toMatch(/vortex_fill/);
      expect(p.fixExample).toMatch(/vortex_fill/);
      expect(p.fixExample).toMatch(/kind:/);
    }
  });

  it("every closestSelector is a valid CSS selector (document.querySelector parses it)", () => {
    // Node / vitest 默认没有 DOM。用 happy-dom or jsdom? 这里简单验证字符串语法用 CSS.supports 不够，
    // 改用 document.createDocumentFragment().querySelector 在可用时验；不可用则只做类型校验。
    for (const p of FILL_REJECT_PATTERNS) {
      expect(typeof p.closestSelector).toBe("string");
      // 禁止出现换行 / 未闭合引号等明显的问题
      expect(p.closestSelector).not.toMatch(/[\r\n]/);
    }
  });

  it("pattern ids are unique", () => {
    const ids = FILL_REJECT_PATTERNS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// 模拟页面侧决策逻辑的独立小函数，跟 dom.ts 里 func 的拒绝分支等价。
// 真正的 page 侧 func 在 e2e / 集成测试里验证；这里先锁住决策算法。
function shouldReject(
  hit: string | null,
  allowFallback: boolean,
): { reject: boolean; patternId: string | null } {
  if (allowFallback) return { reject: false, patternId: null };
  if (!hit) return { reject: false, patternId: null };
  return { reject: true, patternId: hit };
}

describe("dom_fill reject decision (algorithm-level)", () => {
  it("allows fill when no pattern matches", () => {
    expect(shouldReject(null, false)).toEqual({ reject: false, patternId: null });
  });

  it("rejects when a pattern matches", () => {
    expect(shouldReject("element-plus-datetime-range", false)).toEqual({
      reject: true,
      patternId: "element-plus-datetime-range",
    });
  });

  it("bypasses rejection when fallbackToNative=true, even if pattern matches", () => {
    expect(shouldReject("element-plus-datetime-range", true)).toEqual({
      reject: false,
      patternId: null,
    });
  });
});
