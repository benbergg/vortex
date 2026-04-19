import { describe, it, expect, vi, beforeEach } from "vitest";
import { getIframeOffset } from "../src/lib/iframe-offset.js";

type FrameInfo = { frameId: number; parentFrameId: number; url: string };

function stubChrome(opts: {
  frames: FrameInfo[];
  /** frameId -> iframe rect returned by executeScript (null = cross-origin / 失败) */
  rects: Record<number, { x: number; y: number } | null>;
  /** executeScript 抛错（模拟跨源）的 parentFrameId 集合 */
  throwOn?: Set<number>;
}): { executeScript: ReturnType<typeof vi.fn> } {
  const executeScript = vi.fn(async ({ target, args }: any) => {
    const parentId = target.frameIds?.[0] ?? 0;
    if (opts.throwOn?.has(parentId)) throw new Error("cross-origin");
    // args[0] = child frame url —— 查 frames，找 parentId 匹配且 url 匹配的 child
    const childUrl = args[0];
    const child = opts.frames.find(
      (f) => f.parentFrameId === parentId && f.url === childUrl,
    );
    if (!child) return [{ result: null }];
    const r = opts.rects[child.frameId];
    return [{ result: r ?? null }];
  });
  vi.stubGlobal("chrome", {
    webNavigation: {
      getAllFrames: vi.fn().mockResolvedValue(opts.frames),
    },
    scripting: {
      executeScript,
    },
  });
  return { executeScript };
}

describe("getIframeOffset", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns {0,0} for main frame (frameId=0)", async () => {
    stubChrome({ frames: [{ frameId: 0, parentFrameId: -1, url: "https://a/" }], rects: {} });
    await expect(getIframeOffset(1, 0)).resolves.toEqual({ x: 0, y: 0 });
  });

  it("returns {0,0} when frameId undefined", async () => {
    stubChrome({ frames: [], rects: {} });
    await expect(getIframeOffset(1)).resolves.toEqual({ x: 0, y: 0 });
  });

  it("returns direct iframe offset for single-level nesting", async () => {
    stubChrome({
      frames: [
        { frameId: 0, parentFrameId: -1, url: "https://a/" },
        { frameId: 10, parentFrameId: 0, url: "https://a/child" },
      ],
      rects: { 10: { x: 60, y: 0 } },
    });
    await expect(getIframeOffset(1, 10)).resolves.toEqual({ x: 60, y: 0 });
  });

  it("accumulates offsets across nested iframes", async () => {
    stubChrome({
      frames: [
        { frameId: 0, parentFrameId: -1, url: "https://a/" },
        { frameId: 10, parentFrameId: 0, url: "https://a/child" },
        { frameId: 20, parentFrameId: 10, url: "https://a/grandchild" },
      ],
      rects: {
        10: { x: 60, y: 0 },
        20: { x: 5, y: 15 },
      },
    });
    await expect(getIframeOffset(1, 20)).resolves.toEqual({ x: 65, y: 15 });
  });

  it("returns {0,0} when any ancestor rect is unresolvable (cross-origin)", async () => {
    stubChrome({
      frames: [
        { frameId: 0, parentFrameId: -1, url: "https://a/" },
        { frameId: 10, parentFrameId: 0, url: "https://a/child" },
        { frameId: 20, parentFrameId: 10, url: "https://a/grandchild" },
      ],
      rects: {
        10: { x: 60, y: 0 },
        20: null,
      },
    });
    await expect(getIframeOffset(1, 20)).resolves.toEqual({ x: 0, y: 0 });
  });

  it("handles executeScript throwing (cross-origin parent)", async () => {
    stubChrome({
      frames: [
        { frameId: 0, parentFrameId: -1, url: "https://a/" },
        { frameId: 10, parentFrameId: 0, url: "https://a/child" },
      ],
      rects: {},
      throwOn: new Set([0]),
    });
    await expect(getIframeOffset(1, 10)).resolves.toEqual({ x: 0, y: 0 });
  });

  it("returns {0,0} when frame id is not in webNavigation result", async () => {
    stubChrome({
      frames: [{ frameId: 0, parentFrameId: -1, url: "https://a/" }],
      rects: {},
    });
    await expect(getIframeOffset(1, 99)).resolves.toEqual({ x: 0, y: 0 });
  });
});
