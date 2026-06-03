// packages/vortex-bench/tests/eval-tier.test.ts
// 真实任务评测门 P1:SynthManifest 难度档 tier 字段 + scan 报告按 tier 分档聚合。
// 注:tier 字段本身是类型层契约,真 RED/GREEN 在 `npm run build`(tsc);
// 本文件的运行时断言锁定字段名/取值与分档聚合的实际渲染行为。

import { describe, it, expect } from "vitest";
import { renderScanMarkdown } from "../src/scan-report.js";
import type { FixtureScanResult, ScanReport, SynthManifest } from "../src/scan-types.js";

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

describe("scan 报告按 tier 分档聚合", () => {
  const fx = (
    fixture: string,
    tier: FixtureScanResult["tier"],
    matched: number,
    expected: number,
    noise: number,
  ): FixtureScanResult => ({
    fixture,
    pattern: fixture,
    path: `/synth/${fixture}.html`,
    tier,
    recall: { matched, expected },
    precision: { matchedNoise: noise, emitted: expected + noise },
    invariants: { inv1: true, inv2: true, inv3: true, inv4: true },
    findings: [],
  });

  it("按 tier 汇总 Σmatched/Σexpected + Σnoise(FP),easy→medium→hard 排序", () => {
    const report: ScanReport = {
      generatedAt: "t",
      playgroundUrl: "u",
      fixtures: [
        fx("native-form", "easy", 3, 3, 0),
        fx("el-form-a", "medium", 5, 6, 1),
        fx("el-form-b", "medium", 3, 4, 0),
      ],
      findings: [],
    };
    const md = renderScanMarkdown(report);
    expect(md).toContain("分档召回汇总");
    // easy:1 fixture,3/3,0 FP
    expect(md).toMatch(/easy[^\n]*3\/3/);
    // medium:2 fixture 合并,8/10,1 FP
    expect(md).toMatch(/medium[^\n]*8\/10/);
    // easy 段必须出现在 medium 段之前
    expect(md.indexOf("easy")).toBeLessThan(md.indexOf("medium"));
  });

  it("fixture 未带 tier 时按 medium 聚合(缺省档)", () => {
    const noTier: FixtureScanResult = {
      fixture: "legacy",
      pattern: "legacy",
      path: "/synth/legacy.html",
      recall: { matched: 2, expected: 2 },
      precision: { matchedNoise: 0, emitted: 2 },
      invariants: { inv1: true, inv2: true, inv3: true, inv4: true },
      findings: [],
    };
    const md = renderScanMarkdown({
      generatedAt: "t",
      playgroundUrl: "u",
      fixtures: [noTier],
      findings: [],
    });
    expect(md).toMatch(/medium[^\n]*2\/2/);
  });
});
