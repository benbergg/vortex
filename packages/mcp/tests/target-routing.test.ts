import { describe, it, expect } from "vitest";
import { resolveTargetParam } from "../src/lib/ref-parser.js";

describe("target routing contract", () => {
  it("@e3 with active snapshot → index+snapshotId", () => {
    const r = resolveTargetParam("@e3", "snap_abc");
    expect(r).toEqual({ index: 3, snapshotId: "snap_abc", frameId: 0 });
  });
  it("@f2e7 with active snapshot → index+snapshotId+frameId", () => {
    const r = resolveTargetParam("@f2e7", "snap_abc");
    expect(r.frameId).toBe(2);
  });
  it("CSS selector 透传", () => {
    const r = resolveTargetParam("#btn", "snap_abc");
    expect(r).toEqual({ selector: "#btn" });
  });
});
