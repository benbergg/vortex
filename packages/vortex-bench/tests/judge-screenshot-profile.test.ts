import { describe, it, expect } from "vitest";
import { PROFILES, resolveProfile, profilePromptHint } from "../src/runner/judge-screenshot-profile.js";

describe("judge-screenshot-profile", () => {
  it("PROFILES 包含 5 个预设", () => {
    expect(Object.keys(PROFILES).sort()).toEqual(
      ["q70", "q85", "q85+dpr2", "q85+dpr2+png", "q85+dpr2+png+per-frame"].sort(),
    );
  });

  it("resolveProfile(undefined) 返回 q70 baseline", () => {
    expect(resolveProfile(undefined).name).toBe("q70");
    expect(resolveProfile(undefined).format).toBe("jpeg");
    expect(resolveProfile(undefined).quality).toBe(70);
    expect(resolveProfile(undefined).deviceScaleFactor).toBe(1);
    expect(resolveProfile(undefined).perFrame).toBe(false);
  });

  it("resolveProfile(q85) 返回 q85 profile", () => {
    const p = resolveProfile("q85");
    expect(p.format).toBe("jpeg");
    expect(p.quality).toBe(85);
    expect(p.deviceScaleFactor).toBe(1);
  });

  it("resolveProfile(q85+dpr2) DPR=2", () => {
    expect(resolveProfile("q85+dpr2").deviceScaleFactor).toBe(2);
  });

  it("resolveProfile(q85+dpr2+png) format=png 且无 quality", () => {
    const p = resolveProfile("q85+dpr2+png");
    expect(p.format).toBe("png");
    expect(p.quality).toBeUndefined();
  });

  it("resolveProfile(q85+dpr2+png+per-frame) perFrame=true", () => {
    expect(resolveProfile("q85+dpr2+png+per-frame").perFrame).toBe(true);
  });

  it("resolveProfile(unknown) throw 含 known 列表", () => {
    expect(() => resolveProfile("bogus")).toThrow(/unknown screenshot profile: bogus/);
    expect(() => resolveProfile("bogus")).toThrow(/q70/);
  });

  it("profilePromptHint(dpr1) 返回空串", () => {
    expect(profilePromptHint(PROFILES.q70)).toBe("");
    expect(profilePromptHint(PROFILES.q85)).toBe("");
  });

  it("profilePromptHint(dpr2) 含 deviceScaleFactor=2 提示", () => {
    const hint = profilePromptHint(PROFILES["q85+dpr2"]);
    expect(hint).toContain("deviceScaleFactor=2");
    expect(hint).toContain("CSS pixels");
  });
});
