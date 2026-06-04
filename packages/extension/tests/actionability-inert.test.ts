import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { isEnabledElement } from "../src/page-side/shadow-walk.js";

/**
 * 回归锁:inert 子树内的元素视为非交互(2026-06-04 多 agent 审计 actionability)。
 *
 * 现象:inert 属性使元素及其子树不可聚焦/不可点(浏览器层禁用交互),但 actionability
 * 的 checkVisibility 默认不计 inert → 元素过 visible/enabled,act 投递的点击静默无效
 * (silent false-success)。isEnabledElement 是门与 dom-resolve 探测的单一真源(已含
 * aria-disabled/.disabled/fieldset[disabled] 级联),inert 子树同理应判非交互,使两处
 * 一致报 DISABLED 而非静默挂超时。
 */
describe("isEnabledElement inert 子树 → 非交互 (2026-06-04 审计)", () => {
  beforeEach(() => {
    const dom = new JSDOM(
      `<div inert><button id="in">X</button></div><button id="ok">Y</button>`,
    );
    (globalThis as any).document = dom.window.document;
    (globalThis as any).HTMLElement = dom.window.HTMLElement;
  });

  it("inert 祖先内的元素 isEnabledElement=false", () => {
    const el = document.getElementById("in")!;
    expect(isEnabledElement(el)).toBe(false);
  });

  it("自身带 inert 的元素 isEnabledElement=false", () => {
    const dom = new JSDOM(`<button id="self" inert>Z</button>`);
    (globalThis as any).document = dom.window.document;
    (globalThis as any).HTMLElement = dom.window.HTMLElement;
    expect(isEnabledElement(document.getElementById("self")!)).toBe(false);
  });

  it("非 inert 元素 isEnabledElement=true(不回归)", () => {
    expect(isEnabledElement(document.getElementById("ok")!)).toBe(true);
  });
});
