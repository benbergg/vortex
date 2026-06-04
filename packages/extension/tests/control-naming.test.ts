import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { controlRoleFromClass } from "../src/page-side/control-naming.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

function el(className: string): Element {
  const dom = new JSDOM(`<body><span class="${className}"></span></body>`);
  return dom.window.document.body.firstElementChild as Element;
}

describe("controlRoleFromClass — 正例(终末 token = 控件词)", () => {
  it("vxe-cell--checkbox → checkbox(BEM -- 切词,末位 checkbox)", () => {
    expect(controlRoleFromClass(el("vxe-cell--checkbox"))).toBe("checkbox");
  });
  it("x-radio → radio", () => {
    expect(controlRoleFromClass(el("x-radio"))).toBe("radio");
  });
  it("x-switch → switch", () => {
    expect(controlRoleFromClass(el("x-switch"))).toBe("switch");
  });
  it("x-toggle → switch(toggle 规范化为 switch)", () => {
    expect(controlRoleFromClass(el("x-toggle"))).toBe("switch");
  });
  it("多 class 取首个命中(foo vxe-cell--checkbox)", () => {
    expect(controlRoleFromClass(el("foo vxe-cell--checkbox"))).toBe("checkbox");
  });
});

describe("controlRoleFromClass — 负例(终末 token 非控件词)", () => {
  it("switch-language → \"\"(末位 language)", () => {
    expect(controlRoleFromClass(el("switch-language"))).toBe("");
  });
  it("checkbox-wrapper → \"\"(末位 wrapper)", () => {
    expect(controlRoleFromClass(el("checkbox-wrapper"))).toBe("");
  });
  it("el-checkbox__input → \"\"(末位 input)", () => {
    expect(controlRoleFromClass(el("el-checkbox__input"))).toBe("");
  });
  it("vxe-icon-checkbox-unchecked → \"\"(末位 unchecked)", () => {
    expect(controlRoleFromClass(el("vxe-icon-checkbox-unchecked"))).toBe("");
  });
  it("裸 div(无 class)→ \"\"", () => {
    const dom = new JSDOM("<body><div></div></body>");
    const d = dom.window.document.body.firstElementChild as Element;
    expect(controlRoleFromClass(d)).toBe("");
  });
  it("SVGAnimatedString className(非字符串)→ \"\" 不抛", () => {
    const dom = new JSDOM("<body><svg></svg></body>");
    const svg = dom.window.document.body.firstElementChild as Element;
    expect(controlRoleFromClass(svg)).toBe("");
  });
  it("原型属性词不误命中(constructor → \"\")", () => {
    expect(controlRoleFromClass(el("x-constructor"))).toBe("");
  });
});

const __observeDir = dirname(fileURLToPath(import.meta.url));
const OBSERVE_SRC = readFileSync(
  join(__observeDir, "..", "src", "handlers", "observe.ts"),
  "utf8",
);

describe("observe.ts 接入 controlRoleFromClass(注入体内联副本)", () => {
  it("注入体内联 controlRoleFromClass helper", () => {
    expect(OBSERVE_SRC).toMatch(/const controlRoleFromClass = /);
  });
  it("gate 入池门 probe 含 controlRoleFromClass", () => {
    expect(OBSERVE_SRC).toMatch(/const probe =[\s\S]*?controlRoleFromClass\(el\)/);
  });
  it("round-12 守护:gate probe 仍不含 iconFontName", () => {
    const probeMatch = OBSERVE_SRC.match(/const probe =([\s\S]*?);/);
    expect(probeMatch).not.toBeNull();
    expect(probeMatch![1]).not.toMatch(/iconFontName/);
  });
  it("getAccessibleName 尾部:controlRoleFromClass 接在 iconNameFromClass 之后、iconFontName 之前", () => {
    const ctrlIdx = OBSERVE_SRC.indexOf("const ctrlRole = controlRoleFromClass(el);");
    const fromIconIdx = OBSERVE_SRC.indexOf("const fromIcon = iconNameFromClass(el);");
    const iconFontIdx = OBSERVE_SRC.indexOf("return iconFontName(el);");
    expect(fromIconIdx).toBeGreaterThan(0);
    expect(ctrlIdx).toBeGreaterThan(fromIconIdx);
    expect(iconFontIdx).toBeGreaterThan(ctrlIdx);
  });
});
