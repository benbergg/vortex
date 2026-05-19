import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveTargetFrames } from "../src/handlers/observe.js";

/**
 * Regression coverage for https://github.com/benbergg/vortex/issues/15 #1
 *
 * `all-same-origin` previously filtered frames by
 * `safeOrigin(frame.url) === mainOrigin`. For a `<iframe srcdoc>` the
 * URL is `about:srcdoc` → `new URL().origin === "null"`, so the
 * comparison failed and the srcdoc body was silently excluded from the
 * frame set. The fix walks the parent chain past opaque (`"null"`)
 * origins to the first concrete one — matching the HTML spec which
 * says srcdoc inherits its parent document's origin (recursively).
 */
describe("resolveTargetFrames — srcdoc inheritance (issue #15-1)", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", {
      webNavigation: {
        getAllFrames: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockFrames(frames: { frameId: number; parentFrameId: number; url: string }[]): void {
    (chrome.webNavigation.getAllFrames as ReturnType<typeof vi.fn>).mockResolvedValue(frames);
  }

  it("all-same-origin includes a direct srcdoc child of the main frame", async () => {
    mockFrames([
      { frameId: 0, parentFrameId: -1, url: "https://example.com/page" },
      { frameId: 1, parentFrameId: 0, url: "about:srcdoc" },
      { frameId: 2, parentFrameId: 0, url: "https://other.com/widget" }, // cross-origin
    ]);
    const out = await resolveTargetFrames(99, undefined, "all-same-origin");
    const ids = out.map((f) => f.frameId).sort();
    expect(ids).toEqual([0, 1]);
  });

  it("all-same-origin includes a srcdoc nested inside a srcdoc", async () => {
    mockFrames([
      { frameId: 0, parentFrameId: -1, url: "https://example.com/" },
      { frameId: 1, parentFrameId: 0, url: "about:srcdoc" },
      { frameId: 2, parentFrameId: 1, url: "about:srcdoc" }, // nested srcdoc inside srcdoc
    ]);
    const out = await resolveTargetFrames(99, undefined, "all-same-origin");
    expect(out.map((f) => f.frameId).sort()).toEqual([0, 1, 2]);
  });

  it("all-same-origin excludes srcdoc whose ancestor chain ends on cross-origin", async () => {
    // Cross-origin iframe contains a srcdoc — the srcdoc inherits the
    // cross-origin parent's origin, NOT the main page's, so it stays out.
    mockFrames([
      { frameId: 0, parentFrameId: -1, url: "https://example.com/" },
      { frameId: 1, parentFrameId: 0, url: "https://other.com/widget" },
      { frameId: 2, parentFrameId: 1, url: "about:srcdoc" },
    ]);
    const out = await resolveTargetFrames(99, undefined, "all-same-origin");
    expect(out.map((f) => f.frameId).sort()).toEqual([0]);
  });

  it("all-same-origin with no main frame degrades gracefully", async () => {
    mockFrames([
      { frameId: 5, parentFrameId: -1, url: "https://orphan.com/" },
    ]);
    const out = await resolveTargetFrames(99, undefined, "all-same-origin");
    expect(out).toEqual([]);
  });

  it("explicit frameId still narrows to just that frame", async () => {
    mockFrames([
      { frameId: 0, parentFrameId: -1, url: "https://example.com/" },
      { frameId: 1, parentFrameId: 0, url: "about:srcdoc" },
    ]);
    const out = await resolveTargetFrames(99, 1, "all-same-origin");
    expect(out).toEqual([{ frameId: 1, url: "about:srcdoc", parentFrameId: 0 }]);
  });

});
