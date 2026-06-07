/**
 * Author: qingwa
 * Description: Regression lock for P1-1 修复的 isContainer 链路 (AJ focus-wrapper
 *   修复 + 评审 §1.3): observe getAccessibleName 把 focus 管理用 `<div tabindex=0>`
 *   包整个内容区的元素判为噪声容器, 返空名 → BUG-3 噪声过滤器丢弃。
 *
 * 历史:
 *   - d4b7330 P1-1 v1 修复: "判 <a> 直属文本节点" → 已被 V4 方案取代 (商品卡
 *     directTextNodes=[] 时修复不生效, 复跑 3 品类空名率仍 ~30%)。见
 *     observe-anchor-product-card-textcontent.test.ts。
 *   - 本文件保留 isContainer 容器/leaf 行为的不变量, 防止后续改动误破坏
 *     focus-wrapper 容器链路。
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

describe("P1-1 isContainer 链路不变量 (vortex-bench 2026-06-07 淘宝评测)", () => {
  it("isContainer 容器判据 (AJ focus-wrapper 修复) 仍保留", () => {
    expect(OBSERVE_SRC).toMatch(
      /const isContainer\s*=\s*el\.querySelector\(\s*["']a\[href\],button,input,select,textarea,\[tabindex\],\[contenteditable=true\]["']/,
    );
  });

  it("isContainer=true 且无 label/title 时仍返空 (Ghost container 链路完整)", () => {
    expect(OBSERVE_SRC).toMatch(/if \(isContainer\) return "";/);
  });

  it("text 仅在非容器(leaf)时作名源 (现有 leaf 行为保留)", () => {
    expect(OBSERVE_SRC).toMatch(/if \(text && !isContainer\) return text;/);
  });
});
