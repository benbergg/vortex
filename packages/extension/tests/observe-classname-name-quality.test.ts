import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Regression lock for the className accessible-name quality fix
 * (preview.pro.ant.design dogfood 2026-06-01).
 *
 * 现象:observe 把非交互背景层 `div.ant-pro-layout-bg-list.css-tql0nm`
 * 误报为可交互 `[div] "css-tql0nm"`。根因在 iconNameFromClass 的 className
 * 兜底:真语义类 `ant-pro-layout-bg-list` 先被 `ant-` 前缀 denylist 否决,
 * 名字级联回退到 emotion token `css-tql0nm`——这个假名又让本应被 BUG-3
 * 噪声过滤器(`!formLike && !hasExplicitRole && !name → continue`)丢弃的
 * 背景层凭非空名续命。
 *
 * 修复:iconNameFromClass 必须否决生成式原子类(emotion `css-*` /
 * styled-components `sc-*`)。否决后该背景层得到空名 → 被噪声过滤器丢弃。
 * 这是「名字质量」修复顺带解决「精度泄漏」的一例。
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const OBSERVE_SRC = readFileSync(
  join(__dirname, "..", "src", "handlers", "observe.ts"),
  "utf8",
);

describe("observe className name quality — emotion/generated-class denial (2026-06-01 antd-pro dogfood)", () => {
  it("iconNameFromClass denies emotion `css-*` tokens", () => {
    expect(OBSERVE_SRC).toMatch(/\/\^css-\/\.test\(lower\)/);
  });

  it("iconNameFromClass denies styled-components `sc-*` tokens", () => {
    expect(OBSERVE_SRC).toMatch(/\/\^sc-\[a-z\]\/\.test\(lower\)/);
  });

  it("the emotion/sc denial runs as a `continue` guard before `return cleaned`", () => {
    // 否决必须 continue(跳过该 token),而非污染返回值。
    const denyIdx = OBSERVE_SRC.search(/\/\^css-\/\.test\(lower\)\s*\|\|\s*\/\^sc-\[a-z\]\/\.test\(lower\)\)\s*continue;/);
    expect(denyIdx).toBeGreaterThan(0);
    // 且位于 framework-prefix denylist 之后、`return cleaned` 之前。
    const prefixDenyIdx = OBSERVE_SRC.search(/ICON_CLASS_DENY_PREFIXES\.some/);
    const returnCleanedIdx = OBSERVE_SRC.indexOf("return cleaned;");
    expect(prefixDenyIdx).toBeGreaterThan(0);
    expect(prefixDenyIdx).toBeLessThan(denyIdx);
    expect(denyIdx).toBeLessThan(returnCleanedIdx);
  });
});
