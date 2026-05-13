import { describe, it, expect } from "vitest";
import { computeSnapshotHash } from "../src/server.js";
import { createHash } from "node:crypto";

const expected = (id: string) =>
  createHash("sha256").update(id).digest("hex").slice(0, 4);

describe("computeSnapshotHash (v0.8)", () => {
  it("returns sha256[0:4] lowercase hex for a non-empty id", () => {
    const id = "s_1a2b3c4d";
    const h = computeSnapshotHash(id);
    expect(h).toBe(expected(id));
    expect(h).toMatch(/^[a-f0-9]{4}$/);
  });

  it("returns null for a null input", () => {
    expect(computeSnapshotHash(null)).toBe(null);
  });

  it("returns null for an empty string input", () => {
    expect(computeSnapshotHash("")).toBe(null);
  });

  it("is deterministic across calls", () => {
    expect(computeSnapshotHash("s_test")).toBe(computeSnapshotHash("s_test"));
  });

  it("produces different hashes for different ids", () => {
    expect(computeSnapshotHash("s_a")).not.toBe(computeSnapshotHash("s_b"));
  });
});
