import { describe, it, expect } from "vitest";
import { truncateByCodePoints } from "../src/lib/truncate.js";

describe("truncateByCodePoints", () => {
  it("returns original string when length is within limit", () => {
    expect(truncateByCodePoints("hello", 10)).toBe("hello");
  });

  it("truncates to exact code point count", () => {
    expect(truncateByCodePoints("abcdefgh", 4)).toBe("abcd");
  });

  it("preserves surrogate pair at boundary (emoji at end)", () => {
    // ASCII "abcd" (4 cu) + 😀 U+1F600 (2 cu) = 6 code units, 5 code points
    const str = "abcd😀";
    const result = truncateByCodePoints(str, 5);
    expect(result).toBe("abcd😀"); // 5 code points fits exactly
    for (let i = 0; i < result.length; i++) {
      const cc = result.charCodeAt(i);
      const next = result.charCodeAt(i + 1);
      if (cc >= 0xd800 && cc <= 0xdbff) {
        expect(next).toBeGreaterThanOrEqual(0xdc00);
        expect(next).toBeLessThanOrEqual(0xdfff);
      }
    }
  });

  it("drops full emoji when limit would cut it", () => {
    // 5 code points total (abcd + 😀); limit 4 must drop the emoji entirely
    const result = truncateByCodePoints("abcd😀", 4);
    expect(result).toBe("abcd");
    expect(result.length).toBe(4);
  });

  it("handles consecutive emoji", () => {
    expect(truncateByCodePoints("😀😀😀😀", 2)).toBe("😀😀");
  });

  it("returns empty string when limit is 0", () => {
    expect(truncateByCodePoints("hello", 0)).toBe("");
  });
});
