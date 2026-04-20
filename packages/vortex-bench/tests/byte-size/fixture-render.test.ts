import { describe, it, expect } from "vitest";
import baseline from "../../baselines/v0.4.json" with { type: "json" };

describe("baseline sanity", () => {
  it("baseline 文件有 toolsList + fixtures 字段", () => {
    expect(baseline).toHaveProperty("toolsList");
    expect(baseline).toHaveProperty("fixtures");
    const fixtures = (baseline as { fixtures: Record<string, unknown> }).fixtures;
    expect(Object.keys(fixtures).length).toBeGreaterThanOrEqual(6);
  });
  it("toolsList bytes 已记录", () => {
    const tl = (baseline as { toolsList: { bytes: number; tokens: number; toolCount: number } }).toolsList;
    expect(tl.bytes).toBeGreaterThan(0);
    expect(tl.tokens).toBeGreaterThan(0);
    console.log(`v0.4 baseline tools/list: ${tl.bytes} bytes / ${tl.tokens} tokens / ${tl.toolCount} tools`);
  });
});
