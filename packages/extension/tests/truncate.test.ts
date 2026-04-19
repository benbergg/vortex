import { describe, it, expect } from "vitest";
import { truncateByCodePoints, truncateWithTextTrailer, truncateWithHtmlTrailer } from "../src/lib/truncate.js";

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

describe("truncateWithTextTrailer", () => {
  it("returns original when under limit", () => {
    const out = truncateWithTextTrailer("small text", 100);
    expect(out).toBe("small text");
  });

  it("appends plain-text trailer when truncated", () => {
    const input = "x".repeat(200);
    const out = truncateWithTextTrailer(input, 100);
    expect(out.startsWith("x".repeat(100))).toBe(true);
    expect(out).toContain("\n\n[VORTEX_TRUNCATED");
    expect(out).toContain("original=200");
    expect(out).toContain("limit=100");
    expect(out).toContain("vortex_observe");
  });

  it("keeps truncated content length at exactly limit code points", () => {
    const input = "a".repeat(200);
    const out = truncateWithTextTrailer(input, 100);
    const prefix = out.split("\n\n[VORTEX_TRUNCATED")[0];
    expect([...prefix].length).toBe(100);
  });
});

describe("truncateWithHtmlTrailer", () => {
  it("returns original when under limit", () => {
    const out = truncateWithHtmlTrailer("<p>small</p>", 100);
    expect(out).toBe("<p>small</p>");
  });

  it("appends HTML-comment trailer when truncated", () => {
    const input = "<p>" + "x".repeat(200) + "</p>";
    const out = truncateWithHtmlTrailer(input, 50);
    expect(out).toContain("<!-- [VORTEX_TRUNCATED");
    expect(out).toContain("original=");
    expect(out).toContain("limit=50");
    expect(out).toContain("vortex_observe");
    expect(out.endsWith("-->")).toBe(true);
  });
});
