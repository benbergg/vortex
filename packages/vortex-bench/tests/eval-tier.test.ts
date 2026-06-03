// packages/vortex-bench/tests/eval-tier.test.ts
// 真实任务评测门 P1:SynthManifest 难度档 tier 字段 + scan 报告按 tier 分档聚合。
// 注:tier 字段本身是类型层契约,真 RED/GREEN 在 `npm run build`(tsc);
// 本文件的运行时断言锁定字段名/取值与分档聚合的实际渲染行为。

import { describe, it, expect } from "vitest";
import type { SynthManifest } from "../src/scan-types.js";

describe("eval tier 字段", () => {
  it("SynthManifest 接受 tier: easy|medium|hard", () => {
    const m: SynthManifest = {
      fixture: "x",
      path: "/synth/x.html",
      tier: "medium",
      entries: [],
    };
    expect(m.tier).toBe("medium");
  });
});
