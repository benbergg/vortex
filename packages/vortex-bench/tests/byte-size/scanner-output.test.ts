import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { scan } from "../../src/scanner.js";

function loadFixture(relPath: string) {
  const html = readFileSync(
    new URL(`../../fixtures/real-worldish/${relPath}`, import.meta.url),
    "utf-8",
  );
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  // jsdom 不算布局；给所有元素一个非零 bbox 让 scanner 不过滤
  Object.defineProperty(dom.window.Element.prototype, "getBoundingClientRect", {
    value() { return { x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 24, width: 100, height: 24 }; },
    configurable: true,
  });
  return { doc: dom.window.document, win: dom.window as unknown as Window };
}

describe("scanner output across real-world fixtures", () => {
  const cases = [
    { name: "ep-erp-goods", path: "ep-erp-goods/index.static.html", minElements: 10 },
    { name: "ep-login-cascader", path: "ep-login-cascader/index.static.html", minElements: 6 },
    { name: "antd-dashboard", path: "antd-dashboard/index.html", minElements: 12 },
    { name: "shadcn-saas", path: "shadcn-saas/index.html", minElements: 10 },
    { name: "vuetify-settings", path: "vuetify-settings/index.static.html", minElements: 5 },
    { name: "raw-html-long", path: "raw-html-long/index.html", minElements: 200 },
  ];

  const EXPECTED_ROLES: Record<string, string[]> = {
    "ep-erp-goods": ["button", "textbox"],
    "ep-login-cascader": ["button", "textbox", "checkbox"],
    "antd-dashboard": ["button", "link", "combobox", "textbox"],
    "shadcn-saas": ["button", "tab", "combobox", "textbox"],
    "vuetify-settings": ["button", "checkbox", "textbox"],
    "raw-html-long": ["button"],
  };

  for (const c of cases) {
    it(`${c.name}: scanner 找到至少 ${c.minElements} 个元素且含预期 role`, () => {
      const deps = loadFixture(c.path);
      const { elements } = scan(deps, { viewport: "full", maxElements: 500 });
      expect(elements.length).toBeGreaterThanOrEqual(c.minElements);
      for (const e of elements) {
        expect(e.role).toBeTruthy();
        expect(e._sel).toBeTruthy();
      }
      // 更紧断言：至少包含每种预期 role
      const rolesFound = new Set(elements.map((e) => e.role));
      for (const expected of EXPECTED_ROLES[c.name]) {
        expect(rolesFound.has(expected), `${c.name} should have role=${expected}, got: ${[...rolesFound].join(",")}`).toBe(true);
      }
    });
  }

  it("compact 模式不含 bbox/attrs", () => {
    const deps = loadFixture("antd-dashboard/index.html");
    const { elements } = scan(deps, { viewport: "full", detail: "compact" });
    for (const e of elements) {
      expect(e.bbox).toBeUndefined();
      expect(e.attrs).toBeUndefined();
    }
  });

  it("full 模式包含 bbox + attrs", () => {
    const deps = loadFixture("antd-dashboard/index.html");
    const { elements } = scan(deps, { viewport: "full", detail: "full" });
    const hasBbox = elements.some((e) => e.bbox !== undefined);
    const hasAttrs = elements.some((e) => e.attrs !== undefined && Object.keys(e.attrs).length > 0);
    expect(hasBbox).toBe(true);
    expect(hasAttrs).toBe(true);
  });

  it("raw-html-long: maxElements 生效", () => {
    const deps = loadFixture("raw-html-long/index.html");
    const { elements, truncated } = scan(deps, { viewport: "full", maxElements: 50 });
    expect(elements.length).toBe(50);
    expect(truncated).toBe(true);
  });
});
