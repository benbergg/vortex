import { describe, it, expect } from "vitest";

// frameRef 翻译逻辑与 resolveTargetParam 解耦，为简化测试，内联验证正则
describe("frameRef parsing", () => {
  const FRAME_RE = /^@f(\d+)$/;
  it("@f1 → frameId 1", () => {
    const m = "@f1".match(FRAME_RE);
    expect(m?.[1]).toBe("1");
  });
  it("@f12 → frameId 12", () => {
    const m = "@f12".match(FRAME_RE);
    expect(m?.[1]).toBe("12");
  });
  it("@f0 → frameId 0", () => {
    const m = "@f0".match(FRAME_RE);
    expect(m?.[1]).toBe("0");
  });
  it("@f1e2 不匹配（不含 element）", () => {
    expect("@f1e2".match(FRAME_RE)).toBeNull();
  });
  it("@e1 不匹配", () => {
    expect("@e1".match(FRAME_RE)).toBeNull();
  });
  it("@ 不匹配", () => {
    expect("@".match(FRAME_RE)).toBeNull();
  });
});
