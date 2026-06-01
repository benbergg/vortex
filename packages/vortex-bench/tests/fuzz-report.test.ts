import { describe, it, expect } from "vitest";
import { renderFuzzMarkdown } from "../src/fuzz-report.js";
import type { FuzzReport } from "../src/fuzz-types.js";

const report: FuzzReport = {
  generatedAt: "2026-06-01T00:00:00Z",
  playgroundUrl: "http://localhost:5173",
  seedsRun: 50,
  selfTestOk: true,
  quarantined: [],
  findings: [
    { seed: 7, cls: "structural", kind: "recall-miss", detail: "漏识别 #p1", oracleId: "p1" },
    { seed: 9, cls: "name", kind: "name-mismatch", detail: "名不符", oracleId: "p2" },
  ],
  promoted: ["fuzz-abc123"],
};

describe("renderFuzzMarkdown", () => {
  it("includes seedsRun, structural/name counts, promoted list", () => {
    const md = renderFuzzMarkdown(report);
    expect(md).toContain("50");
    expect(md).toContain("structural");
    expect(md).toContain("fuzz-abc123");
    expect(md).toMatch(/self-?test/i);
  });
  it("flags quarantined primitives when present", () => {
    const md = renderFuzzMarkdown({ ...report, selfTestOk: false, quarantined: ["srcdoc-button"] });
    expect(md).toContain("srcdoc-button");
  });
});
