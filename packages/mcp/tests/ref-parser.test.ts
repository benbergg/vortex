import { describe, it, expect } from "vitest";
import { parseRef, resolveTargetParam } from "../src/lib/ref-parser.js";

describe("parseRef", () => {
  it("@e3 → { index: 3, frameId: 0 }", () => {
    expect(parseRef("@e3")).toEqual({ kind: "ref", index: 3, frameId: 0 });
  });
  it("@f1e2 → { index: 2, frameId: 1 }", () => {
    expect(parseRef("@f1e2")).toEqual({ kind: "ref", index: 2, frameId: 1 });
  });
  it("@f12e345 → { index: 345, frameId: 12 }", () => {
    expect(parseRef("@f12e345")).toEqual({ kind: "ref", index: 345, frameId: 12 });
  });
  it("CSS selector 原样返回", () => {
    expect(parseRef("#my-btn")).toEqual({ kind: "selector", selector: "#my-btn" });
    expect(parseRef(".btn.primary")).toEqual({ kind: "selector", selector: ".btn.primary" });
  });
  it("空串抛错", () => {
    expect(() => parseRef("")).toThrow();
  });
  it("@ 开头但格式错误抛错", () => {
    expect(() => parseRef("@x3")).toThrow(/invalid ref format/i);
    expect(() => parseRef("@e")).toThrow();
    expect(() => parseRef("@f1")).toThrow();
  });
  // Regression: descriptor target object → friendly INVALID_PARAMS, not raw TypeError
  // Repro: agent passes target={role:"textbox", name:"密码"} → schema dist still ad-
  // vertised the old object form, runtime crashed with `input.startsWith is not a
  // function`. Source schema has since been narrowed to string-only; this guards
  // against any client (or stale schema cache) still sending a non-string target.
  it("非字符串输入 → INVALID_PARAMS（防 input.startsWith 崩溃）", () => {
    expect(() => parseRef({ role: "textbox", name: "密码" } as never)).toThrow(
      /target must be a string/i,
    );
    expect(() => parseRef(123 as never)).toThrow(/target must be a string/i);
    expect(() => parseRef(true as never)).toThrow(/target must be a string/i);
  });
});

describe("resolveTargetParam", () => {
  it("ref → { index, snapshotId, frameId }", () => {
    const out = resolveTargetParam("@e5", "s_abc");
    expect(out).toEqual({ index: 5, snapshotId: "s_abc", frameId: 0 });
  });
  it("跨 frame ref 携带 frameId", () => {
    const out = resolveTargetParam("@f2e7", "s_xyz");
    expect(out).toEqual({ index: 7, snapshotId: "s_xyz", frameId: 2 });
  });
  it("selector → { selector }", () => {
    const out = resolveTargetParam(".foo", "s_xyz");
    expect(out).toEqual({ selector: ".foo" });
  });
  it("ref 但无活跃 snapshot → 抛 StaleRef", () => {
    expect(() => resolveTargetParam("@e1", null)).toThrow(/no active snapshot/i);
  });
});
