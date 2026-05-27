import { describe, it, expect, beforeEach, vi } from "vitest";
import { JSDOM } from "jsdom";

describe("dom-resolve page-side module", () => {
  // 每个 it 使用 vi.resetModules() + 新 JSDOM 窗口，保证 version 守卫对每个 case 均从干净状态开始。
  beforeEach(() => {
    const dom = new JSDOM('<div id="host"></div>');
    globalThis.window = dom.window as any;
    globalThis.document = dom.window.document as unknown as Document;
    (globalThis as any).HTMLElement = dom.window.HTMLElement;
  });

  it("挂载 __vortexDomResolve（version=1，含两个函数）", async () => {
    vi.resetModules();
    await import("../src/page-side/dom-resolve.js");
    const ns = (window as any).__vortexDomResolve;
    expect(ns.version).toBe(1);
    expect(typeof ns.queryDeep).toBe("function");
    expect(typeof ns.queryAllDeep).toBe("function");
  });

  it("queryDeep 穿 open shadow 命中", async () => {
    vi.resetModules();
    await import("../src/page-side/dom-resolve.js");
    const sr = document.getElementById("host")!.attachShadow({ mode: "open" });
    const btn = document.createElement("button");
    btn.setAttribute("data-vortex-rid", "r9");
    sr.appendChild(btn);
    expect((window as any).__vortexDomResolve.queryDeep('[data-vortex-rid="r9"]')).toBe(btn);
  });

  it("无效 CSS selector 当作未命中（不抛）", async () => {
    vi.resetModules();
    await import("../src/page-side/dom-resolve.js");
    const ns = (window as any).__vortexDomResolve;
    expect(ns.queryDeep(":::bad")).toBeNull();
    expect(ns.queryAllDeep(":::bad")).toEqual([]);
  });

  it("queryAllDeep 同时命中 light-DOM 和 shadow-internal 的 .x 元素（length=2）", async () => {
    vi.resetModules();
    await import("../src/page-side/dom-resolve.js");

    // light-DOM 中的 .x
    const lightEl = document.createElement("span");
    lightEl.className = "x";
    document.body.appendChild(lightEl);

    // shadow 内的 .x
    const sr = document.getElementById("host")!.attachShadow({ mode: "open" });
    const shadowEl = document.createElement("div");
    shadowEl.className = "x";
    sr.appendChild(shadowEl);

    const results = (window as any).__vortexDomResolve.queryAllDeep(".x");
    expect(results.length).toBe(2);
    expect(results).toContain(lightEl);
    expect(results).toContain(shadowEl);
  });
});
