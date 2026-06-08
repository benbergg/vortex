/**
 * Author: qingwa
 * Description: BUG-010 N0060 京东选品评测 V1
 *   observe 暴露带 onclick + cursor:pointer 的 div 为可点击 ref 标记。
 *   京东 React 重写后商品卡 div 含 onClick 桩函数, el.click() 触发失败
 *   (isTrusted=false, React 18 root delegation 拦截)。observe 在 emit
 *   阶段打标 (data-vortex-react-clickable="1" + clickHint) 提示评测者
 *   改用 vortex_mouse_drag / useRealMouse=true 兜底。
 *
 *   跨品类 100% 复现: 3C / 家电 / 服饰 hash class _card_1fqso_83 完全
 *   相同 (同 React 应用), D3 主路径 1 步降级为 mouse_drag。
 *
 * Why source-level + jsdom: 检测逻辑是 live DOM property/attribute + computed
 *   style 组合, 用 jsdom 元素直接调用 applyReactClickableMarker 验证
 *   (1) 命中条件 (2) dataset 副作用 (3) out 对象字段, 跨页面端到端无需 chrome
 *   extension runtime。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { applyReactClickableMarker } from "../src/handlers/observe.js";

describe("observe react-clickable marker (BUG-010 N0060 京东评测)", () => {
  beforeEach(() => {
    const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
    globalThis.window = dom.window as unknown as Window & typeof globalThis;
    globalThis.document = dom.window.document as unknown as Document;
    (globalThis as unknown as { HTMLElement: typeof HTMLElement }).HTMLElement =
      dom.window.HTMLElement;
    (globalThis as unknown as { getComputedStyle: typeof getComputedStyle }).getComputedStyle =
      dom.window.getComputedStyle.bind(dom.window);
  });

  it("marks div with onClick property as reactClickable (京东 React 桩 onClick={kd()})", () => {
    const el = document.createElement("div");
    el.id = "react-card";
    el.style.cursor = "pointer";
    el.textContent = "商品标题 ¥100";
    document.body.appendChild(el);
    el.onclick = () => {
      (window as unknown as { __clicked: boolean }).__clicked = true;
    };

    const out: Record<string, unknown> = {};
    const result = applyReactClickableMarker(el, out);

    expect(result).not.toBeNull();
    expect(out.reactClickable).toBe(true);
    expect(out.clickHint as string).toContain("useRealMouse");
    expect(el.dataset.vortexReactClickable).toBe("1");
  });

  it("marks div with cursor:pointer (no onclick) as reactClickable (祖传 onClick 钩子 in framework)", () => {
    const el = document.createElement("div");
    el.id = "cursor-card";
    el.style.cursor = "pointer";
    el.textContent = "商品标题";
    document.body.appendChild(el);

    const out: Record<string, unknown> = {};
    const result = applyReactClickableMarker(el, out);

    expect(result).not.toBeNull();
    expect(out.reactClickable).toBe(true);
    expect(out.clickHint as string).toContain("useRealMouse");
    expect(el.dataset.vortexReactClickable).toBe("1");
  });

  it("marks div with [onclick] HTML attribute as reactClickable (jQuery-era PHP 后台)", () => {
    const el = document.createElement("div");
    el.id = "attr-card";
    el.setAttribute("onclick", "return false");
    el.style.padding = "20px";
    el.textContent = "商品标题";
    document.body.appendChild(el);

    const out: Record<string, unknown> = {};
    const result = applyReactClickableMarker(el, out);

    expect(result).not.toBeNull();
    expect(out.reactClickable).toBe(true);
    expect(el.dataset.vortexReactClickable).toBe("1");
  });

  it("does NOT mark plain div (no onclick + no cursor:pointer) as reactClickable", () => {
    const el = document.createElement("div");
    el.id = "plain-card";
    el.style.padding = "20px";
    el.textContent = "商品标题";
    document.body.appendChild(el);

    const out: Record<string, unknown> = {};
    const result = applyReactClickableMarker(el, out);

    expect(result).toBeNull();
    expect(out.reactClickable).toBeUndefined();
    expect(out.clickHint).toBeUndefined();
    expect(el.dataset.vortexReactClickable).toBeUndefined();
  });
});
