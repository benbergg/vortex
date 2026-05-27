import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { queryDeep, queryAllDeep } from "../src/page-side/shadow-walk.js";

function setup(html: string): Document {
  const dom = new JSDOM(html);
  globalThis.document = dom.window.document as unknown as Document;
  (globalThis as any).HTMLElement = dom.window.HTMLElement;
  return dom.window.document as unknown as Document;
}

describe("shadow-walk queryDeep", () => {
  it("light-DOM 优先：直接命中不走 shadow", () => {
    const doc = setup('<button id="b">x</button>');
    const found = queryDeep("#b", doc as unknown as Document);
    expect(found).toBe(doc.getElementById("b"));
  });

  it("穿 open shadow 命中 shadow-internal 元素", () => {
    const doc = setup('<div id="host"></div>');
    const host = doc.getElementById("host")!;
    const sr = host.attachShadow({ mode: "open" });
    const btn = doc.createElement("button");
    btn.setAttribute("data-vortex-rid", "r1");
    sr.appendChild(btn);
    const found = queryDeep('[data-vortex-rid="r1"]', doc as unknown as Document);
    expect(found).toBe(btn);
  });

  it("嵌套两层 open shadow 也能命中（递归）", () => {
    const doc = setup('<div id="host"></div>');
    const sr1 = doc.getElementById("host")!.attachShadow({ mode: "open" });
    const inner = doc.createElement("div");
    sr1.appendChild(inner);
    const sr2 = inner.attachShadow({ mode: "open" });
    const btn = doc.createElement("button");
    btn.setAttribute("data-vortex-rid", "r2");
    sr2.appendChild(btn);
    expect(queryDeep('[data-vortex-rid="r2"]', doc as unknown as Document)).toBe(btn);
  });

  it("closed shadow 不可见（CE spec）", () => {
    const doc = setup('<div id="host"></div>');
    const sr = doc.getElementById("host")!.attachShadow({ mode: "closed" });
    const btn = doc.createElement("button");
    btn.setAttribute("data-vortex-rid", "r3");
    sr.appendChild(btn);
    expect(queryDeep('[data-vortex-rid="r3"]', doc as unknown as Document)).toBeNull();
  });

  it("queryAllDeep 跨 light + shadow 计数（消歧用）", () => {
    const doc = setup('<button class="x"></button><div id="host"></div>');
    const sr = doc.getElementById("host")!.attachShadow({ mode: "open" });
    const btn2 = doc.createElement("button");
    btn2.className = "x";
    sr.appendChild(btn2);
    expect(queryAllDeep("button.x", doc as unknown as Document).length).toBe(2);
  });
});
