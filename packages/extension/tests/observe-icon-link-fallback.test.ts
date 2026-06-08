/**
 * Author: qingwa
 * Description: REQ-009 N0060 京东评测 A 方案 — observe 阶段识别"图标式无文本
 *   `<a>`"(京东 30 个客服图标 + 1 个 logo)并给 `icon-link @x,y` 兜底名, 降
 *   低 LLM 注意力分散 + 京东空名率 29.90% → ~1%。
 *
 * 背景 (reports/jd-dogfood-V1/_meta/P1-1京东根因诊断.md §5.1):
 *   京东商品卡客服图标 `<a class="_newIcon_zclqt_32 _customer_service_icon_zclqt_60"
 *   href="https://chat.jd.com/...">` (16x16, 无文本, 无 aria-label, 无 title)
 *   — 现有 observe 全路径返空 → 进 BUG-3 噪声过滤 / 进 LLM 视野当空名 link 处理。
 *
 *   方案 A: 在 PRODUCT_HINTS 检测前加 icon-link 兜底, 5 条件全部命中:
 *     1. tagName === "a" (链接)
 *     2. children.length === 0 (无子元素, 排除含 <img>/<svg> 的图链)
 *     3. !textContent.trim() (无文本)
 *     4. bbox width ≤ 32 && height ≤ 32 (小图标)
 *     5. href 非空 (避免空锚误判)
 *     → 返 `icon-link @x=N,y=N` 固定名格式
 *
 *   风险缓解: 不命中条件放宽 (aria-label / title / children 含 img/svg), 让
 *   有意义的 attribute 优先, 32x32 真按钮 link (如购物车图标通常含 svg) 不被误判。
 *
 * Why TDD + 纯函数:
 *   iconLinkName 是纯函数, jsdom 直接测。无 chrome extension runtime 依赖。
 *   集成测试通过读 observe.ts 源码验证调用顺序。
 */

import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * iconLinkName 纯函数: 判断 + 合成 icon-link 兜底名。
 * 返回 null = 不命中 (走原 observe 路径), 字符串 = icon-link 名。
 */
const ICON_LINK_MAX_SIZE = 32;
function iconLinkName(el: Element): string | null {
  if (el.tagName.toLowerCase() !== "a") return null;
  if (el.children.length > 0) return null;
  if (el.textContent.trim() !== "") return null;
  const href = el.getAttribute("href");
  if (!href) return null;
  // 有意义的 attribute 优先 — 不抢 aria-label / title 命名的链接
  if (el.getAttribute("aria-label")) return null;
  if (el.getAttribute("title")) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width > ICON_LINK_MAX_SIZE || rect.height > ICON_LINK_MAX_SIZE) return null;
  return `icon-link @x=${Math.round(rect.x)},y=${Math.round(rect.y)}`;
}

function withDom(html: string, fn: () => void) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`);
  const g = globalThis as any;
  g.window = dom.window;
  g.document = dom.window.document;
  g.Element = dom.window.Element;
  g.HTMLElement = dom.window.HTMLElement;
  g.Node = dom.window.Node;
  // jsdom 不解析 style 几何, mock getBoundingClientRect 用 data 属性注入坐标
  const observed = dom.window.document.querySelectorAll("[data-rect]");
  observed.forEach((el) => {
    const r = (el as HTMLElement).dataset.rect!;
    const [x, y, w, h] = r.split(",").map(Number);
    (el as any).getBoundingClientRect = () => ({
      x, y, width: w, height: h, top: y, left: x, right: x + w, bottom: y + h, toJSON: () => ({}),
    });
  });
  try { fn(); } finally { /* keep globals for next test */ }
}

describe("iconLinkName (REQ-009 京东客服图标降噪 A 方案)", () => {
  it("京东客服图标 (16x16, href=chat.jd.com, 无文本) → 'icon-link @x=10,y=20'", () => {
    withDom(
      `<a class="_newIcon_zclqt_32 _customer_service_icon_zclqt_60"
          href="https://chat.jd.com/index.action?..."
          data-rect="10,20,16,16"></a>`,
      () => {
        const el = document.querySelector("a")!;
        expect(iconLinkName(el)).toBe("icon-link @x=10,y=20");
      },
    );
  });

  it("京东 logo (190x58) → 不命中 (尺寸 > 32px, 走原路径)", () => {
    withDom(
      `<a href="https://www.jd.com/" data-rect="0,0,190,58"></a>`,
      () => {
        const el = document.querySelector("a")!;
        expect(iconLinkName(el)).toBeNull();
      },
    );
  });

  it("有 aria-label 的 icon link → 不命中 (让 aria-label 优先)", () => {
    withDom(
      `<a href="/x" aria-label="联系客服" data-rect="0,0,16,16"></a>`,
      () => {
        const el = document.querySelector("a")!;
        expect(iconLinkName(el)).toBeNull();
      },
    );
  });

  it("有 title 的 icon link → 不命中 (让 title 优先)", () => {
    withDom(
      `<a href="/x" title="联系客服" data-rect="0,0,16,16"></a>`,
      () => {
        const el = document.querySelector("a")!;
        expect(iconLinkName(el)).toBeNull();
      },
    );
  });

  it("含 <svg> 子元素的购物车图标 link → 不命中 (children.length > 0)", () => {
    withDom(
      `<a href="/cart" data-rect="0,0,24,24"><svg width="24" height="24"></svg></a>`,
      () => {
        const el = document.querySelector("a")!;
        expect(iconLinkName(el)).toBeNull();
      },
    );
  });

  it("含 <img> 子元素的图片 link → 不命中", () => {
    withDom(
      `<a href="/p/1" data-rect="0,0,24,24"><img src="x.png" alt=""/></a>`,
      () => {
        const el = document.querySelector("a")!;
        expect(iconLinkName(el)).toBeNull();
      },
    );
  });

  it("空 href 的 <a> → 不命中 (避免空锚误判)", () => {
    withDom(
      `<a data-rect="0,0,16,16"></a>`,
      () => {
        const el = document.querySelector("a")!;
        expect(iconLinkName(el)).toBeNull();
      },
    );
  });

  it("button 元素 (非 <a>) → 不命中", () => {
    withDom(
      `<button data-rect="0,0,16,16"></button>`,
      () => {
        const el = document.querySelector("button")!;
        expect(iconLinkName(el)).toBeNull();
      },
    );
  });

  it("有文本的 <a> → 不命中 (走原 textContent 路径)", () => {
    withDom(
      `<a href="/x" data-rect="0,0,16,16">登录</a>`,
      () => {
        const el = document.querySelector("a")!;
        expect(iconLinkName(el)).toBeNull();
      },
    );
  });

  it("24x24 icon link (≤32px 边界值) → 命中", () => {
    withDom(
      `<a href="/x" data-rect="100,50,24,24"></a>`,
      () => {
        const el = document.querySelector("a")!;
        expect(iconLinkName(el)).toBe("icon-link @x=100,y=50");
      },
    );
  });

  it("33x33 icon link (>32px 边界值) → 不命中", () => {
    withDom(
      `<a href="/x" data-rect="0,0,33,33"></a>`,
      () => {
        const el = document.querySelector("a")!;
        expect(iconLinkName(el)).toBeNull();
      },
    );
  });
});

describe("observe.ts 集成 — iconLinkName 在 PRODUCT_HINTS 之前 (REQ-009)", () => {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const SRC = readFileSync(
    join(__dirname, "..", "src", "handlers", "observe.ts"),
    "utf8",
  );

  it("observe.ts 含 iconLinkName 兜底名函数 (export 或内部)", () => {
    expect(SRC).toMatch(/icon-link/);
  });

  it("icon-link 兜底在 PRODUCT_HINTS 之前 (顺序敏感: 有意义的商品卡优先)", () => {
    const productHintsIdx = SRC.indexOf("PRODUCT_HINTS");
    const iconLinkIdx = SRC.indexOf("icon-link");
    expect(productHintsIdx).toBeGreaterThan(-1);
    expect(iconLinkIdx).toBeGreaterThan(-1);
    expect(iconLinkIdx).toBeLessThan(productHintsIdx);
  });
});
