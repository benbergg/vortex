import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { hasFrameworkClickHandler } from "../src/page-side/framework-handlers.js";

function el(html = "<div></div>"): HTMLElement {
  const dom = new JSDOM(`<body>${html}</body>`);
  return dom.window.document.body.firstElementChild as HTMLElement;
}

describe("hasFrameworkClickHandler — React", () => {
  it("__reactProps$ 上 onClick 是函数 → true", () => {
    const d = el();
    (d as any).__reactProps$abc123 = { onClick: () => {} };
    expect(hasFrameworkClickHandler(d)).toBe(true);
  });

  it("onClickCapture → true", () => {
    const d = el();
    (d as any).__reactProps$x = { onClickCapture: () => {} };
    expect(hasFrameworkClickHandler(d)).toBe(true);
  });

  it("React props 无点击处理器(仅 onChange)→ false", () => {
    const d = el();
    (d as any).__reactProps$x = { onChange: () => {}, children: "x" };
    expect(hasFrameworkClickHandler(d)).toBe(false);
  });

  it("onClick 非函数(null)→ false(不被误当处理器)", () => {
    const d = el();
    (d as any).__reactProps$x = { onClick: null };
    expect(hasFrameworkClickHandler(d)).toBe(false);
  });

  it("淘宝实测形态:cursor:auto 裸 div + React onClick → true", () => {
    // ShowButton--fMu7HZNs /「查看全部评价」复现
    const d = el('<div class="ShowButton--fMu7HZNs">查看全部评价</div>');
    (d as any).__reactProps$r7 = { onClick: () => {}, className: "ShowButton--fMu7HZNs" };
    expect(hasFrameworkClickHandler(d)).toBe(true);
  });
});

describe("hasFrameworkClickHandler — Vue3", () => {
  it("_vei.onClick 直接是函数 → true", () => {
    const d = el();
    (d as any)._vei = { onClick: () => {} };
    expect(hasFrameworkClickHandler(d)).toBe(true);
  });

  it("_vei.onClick invoker {value:fn} 形态 → true", () => {
    const d = el();
    (d as any)._vei = { onClick: { value: () => {} } };
    expect(hasFrameworkClickHandler(d)).toBe(true);
  });

  it("_vei 只有非点击事件(onInput)→ false", () => {
    const d = el();
    (d as any)._vei = { onInput: () => {} };
    expect(hasFrameworkClickHandler(d)).toBe(false);
  });
});

describe("hasFrameworkClickHandler — 裸元素 / 噪声防护", () => {
  it("无任何框架 expando → false", () => {
    expect(hasFrameworkClickHandler(el())).toBe(false);
  });

  it("普通文本节点容器(无 expando)→ false", () => {
    expect(hasFrameworkClickHandler(el("<p>纯文本</p>"))).toBe(false);
  });
});
