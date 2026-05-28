// packages/vortex-bench/tests/judge-calibrate.test.ts
import { describe, it, expect } from "vitest";
import { ablateRows, computeCalibration } from "../src/runner/judge-calibrate.js";
import type { ObserveRow } from "../src/scan-types.js";
import type { ClaimedMiss } from "../src/judge-types.js";

const row = (ref: string, bbox: ObserveRow["bbox"], frameId = 0): ObserveRow => ({
  ref, role: "button", name: ref, flags: [], bbox, frameId,
});
const miss = (bbox: [number, number, number, number]): ClaimedMiss => ({ label: "m", bbox, reason: "r" });

describe("ablateRows", () => {
  it("抽 bbox 面积最大的前 k 行,kept 去掉它们", () => {
    const rows = [row("@1", [0, 0, 10, 10]), row("@2", [0, 0, 100, 100]), row("@3", [0, 0, 50, 50])];
    const { kept, ablated } = ablateRows(rows, 1);
    expect(ablated.map((r) => r.ref)).toEqual(["@2"]);
    expect(kept.map((r) => r.ref)).toEqual(["@1", "@3"]);
  });
  it("跳过离屏行与非主 frame 行", () => {
    const rows = [row("@1", null), row("@2", [0, 0, 10, 10], 2), row("@3", [0, 0, 20, 20])];
    const { ablated } = ablateRows(rows, 5);
    expect(ablated.map((r) => r.ref)).toEqual(["@3"]); // 只 @3 合格
  });
});

describe("computeCalibration", () => {
  it("查全:抽行被判官重发现计入 ablatedRecovered", () => {
    const ablated = [row("@2", [0, 0, 100, 100]), row("@3", [200, 0, 50, 50])];
    const tpMisses = [miss([5, 5, 90, 90])]; // 命中 @2,未命中 @3
    const stats = computeCalibration([], tpMisses, ablated);
    expect(stats.ablatedCount).toBe(2);
    expect(stats.ablatedRecovered).toBe(1);
  });
  it("假阳:原样交集 miss 数计入 fpConfirmed", () => {
    const stats = computeCalibration([miss([0, 0, 5, 5]), miss([9, 9, 5, 5])], [], []);
    expect(stats.fpConfirmed).toBe(2);
  });
});
