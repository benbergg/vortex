import { describe, it, expect, beforeEach, vi } from "vitest";
import { JSDOM } from "jsdom";

describe("dom-resolve page-side module", () => {
  beforeEach(() => {
    const dom = new JSDOM('<div id="host"></div>');
    globalThis.window = dom.window as any;
    globalThis.document = dom.window.document as unknown as Document;
    (globalThis as any).HTMLElement = dom.window.HTMLElement;
  });

  it("挂载 window.__vortexQueryDeep / __vortexQueryAllDeep", async () => {
    vi.resetModules();
    await import("../src/page-side/dom-resolve.js");
    expect(typeof (window as any).__vortexQueryDeep).toBe("function");
    expect(typeof (window as any).__vortexQueryAllDeep).toBe("function");
  });

  it("__vortexQueryDeep 穿 open shadow 命中", async () => {
    vi.resetModules();
    await import("../src/page-side/dom-resolve.js");
    const sr = document.getElementById("host")!.attachShadow({ mode: "open" });
    const btn = document.createElement("button");
    btn.setAttribute("data-vortex-rid", "r9");
    sr.appendChild(btn);
    expect((window as any).__vortexQueryDeep('[data-vortex-rid="r9"]')).toBe(btn);
  });

  it("无效 CSS selector 当作未命中（不抛）", async () => {
    vi.resetModules();
    await import("../src/page-side/dom-resolve.js");
    expect((window as any).__vortexQueryDeep(":::bad")).toBeNull();
    expect((window as any).__vortexQueryAllDeep(":::bad")).toEqual([]);
  });
});
