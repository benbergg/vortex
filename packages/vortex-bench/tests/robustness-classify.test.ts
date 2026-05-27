// packages/vortex-bench/tests/robustness-classify.test.ts
import { describe, it, expect } from "vitest";
import { classifyAct, type ActResult } from "../src/runner/robustness-classify.js";

const r = (over: Partial<ActResult>): ActResult => ({ text: "", threw: false, timedOut: false, ...over });

describe("classifyAct", () => {
  it("无错误文本 → ok", () => {
    expect(classifyAct(r({ text: "clicked" }))).toEqual({ kind: "ok", code: null });
  });
  it("Error [OBSCURED]: ... → typed-error + code", () => {
    expect(classifyAct(r({ text: "Error [OBSCURED]: element covered" }))).toEqual({
      kind: "typed-error",
      code: "OBSCURED",
    });
  });
  it("Error [ELEMENT_NOT_FOUND]: ... → typed-error + code", () => {
    expect(classifyAct(r({ text: "Error [ELEMENT_NOT_FOUND]: @x not found\nhint: ..." }))).toEqual({
      kind: "typed-error",
      code: "ELEMENT_NOT_FOUND",
    });
  });
  it("threw(reject)→ crash", () => {
    expect(classifyAct(r({ threw: true, text: "boom" }))).toEqual({ kind: "crash", code: null });
  });
  it("timedOut → timeout(优先于 threw)", () => {
    expect(classifyAct(r({ timedOut: true, threw: true }))).toEqual({ kind: "timeout", code: null });
  });
  it("错误码非行首 → 仍 ok(避免误把正文里的 Error[..] 当 typed-error)", () => {
    expect(classifyAct(r({ text: "result: see Error [X]: above" }))).toEqual({ kind: "ok", code: null });
  });
});

import { classifyExtract, type ExtractResult } from "../src/runner/robustness-classify.js";

const ex = (over: Partial<ExtractResult>): ExtractResult => ({ text: "", threw: false, timedOut: false, ...over });

describe("classifyExtract", () => {
  it("含 tag 的元素 JSON → ok", () => {
    expect(classifyExtract(ex({ text: '{"tag":"button","text":"保存","attributes":{}}' })))
      .toEqual({ kind: "ok", code: null });
  });
  it("null-result envelope(无 tag)→ typed-error ELEMENT_NOT_FOUND", () => {
    expect(classifyExtract(ex({ text: '{\n  "result": null\n}' })))
      .toEqual({ kind: "typed-error", code: "ELEMENT_NOT_FOUND" });
  });
  it("裸 null 文本 → ELEMENT_NOT_FOUND", () => {
    expect(classifyExtract(ex({ text: "null" })))
      .toEqual({ kind: "typed-error", code: "ELEMENT_NOT_FOUND" });
  });
  it("Error [STALE_SNAPSHOT]: 文本(content error,未 throw)→ typed-error + code", () => {
    expect(classifyExtract(ex({ text: "Error [STALE_SNAPSHOT]: page changed\nhint: ..." })))
      .toEqual({ kind: "typed-error", code: "STALE_SNAPSHOT" });
  });
  it("threw 且无 Error 码 → crash", () => {
    expect(classifyExtract(ex({ threw: true, text: "socket hang up" })))
      .toEqual({ kind: "crash", code: null });
  });
  it("timedOut → timeout(优先)", () => {
    expect(classifyExtract(ex({ timedOut: true, threw: true })))
      .toEqual({ kind: "timeout", code: null });
  });
  it("空文本 → ELEMENT_NOT_FOUND(无 element 数据)", () => {
    expect(classifyExtract(ex({ text: "" })))
      .toEqual({ kind: "typed-error", code: "ELEMENT_NOT_FOUND" });
  });
});
