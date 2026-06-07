/**
 * Author: qingwa
 * Description: V4 淘宝选品评测 P1-1 修复方向重做: <a> 整卡是链接,
 *   textContent 含商品特征(¥/人付款/回头客/已售/月销)时不再判空名。
 *
 * 背景 (V4 报告 §7.3.1): d4b7330 修复"判直属文本节点"在淘宝商品卡上
 *   directTextNodes=[] → 修复不生效。V4 推荐改"判 textContent 含商品特征"。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OBSERVE_SRC = readFileSync(
  join(__dirname, "..", "src", "handlers", "observe.ts"),
  "utf8",
);

describe("P1-1 修复方向重做 (V4 评测): <a> 整卡 textContent 含商品特征不再判空名", () => {
  it("observe.ts 应含 const PRODUCT_HINTS 声明 (商品特征 regex)", () => {
    expect(OBSERVE_SRC).toMatch(/const\s+PRODUCT_HINTS\s*=\s*\//);
  });

  it("PRODUCT_HINTS regex 应覆盖 ¥/￥/人付款/回头客/已售/月销 商品特征", () => {
    const hintsMatch = OBSERVE_SRC.match(
      /const\s+PRODUCT_HINTS\s*=\s*\/([^\/]+)\//,
    );
    expect(hintsMatch).not.toBeNull();
    const regexSource = hintsMatch?.[1] ?? "";
    expect(regexSource).toMatch(/[\u00a5￥]/);
    expect(regexSource).toMatch(/人付款|回头客|已售|月销/);
  });

  it("观察顺序: PRODUCT_HINTS 判定应早于 isContainer 判定", () => {
    const hintsIdx = OBSERVE_SRC.search(/const\s+PRODUCT_HINTS\s*=/);
    const isContainerIdx = OBSERVE_SRC.indexOf("const isContainer =");
    expect(hintsIdx).toBeGreaterThan(0);
    expect(isContainerIdx).toBeGreaterThan(0);
    expect(hintsIdx).toBeLessThan(isContainerIdx);
  });

  it("PRODUCT_HINTS 命中时, 应返 normName(textContent) 而非空名", () => {
    // 语义: PRODUCT_HINTS.test(text) 命中 → return text (text === normName(el.textContent))
    expect(OBSERVE_SRC).toMatch(
      /PRODUCT_HINTS\.test\(text\)[\s\S]{0,40}?return\s+text;/,
    );
  });

  it("不破坏现有 isContainer leaf 行为 (text && !isContainer 仍返 text)", () => {
    expect(OBSERVE_SRC).toMatch(/if \(text && !isContainer\) return text;/);
  });

  it("不破坏现有 Ghost container 链路 (isContainer=true 仍返空名)", () => {
    expect(OBSERVE_SRC).toMatch(/if \(isContainer\) return "";/);
  });
});
