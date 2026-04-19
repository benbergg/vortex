import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NmRequest } from "@bytenew/vortex-shared";
import { VtxErrorCode } from "@bytenew/vortex-shared";
import { ActionRouter } from "../src/lib/router.js";
import { registerObserveHandlers } from "../src/handlers/observe.js";
import { getSnapshotEntry } from "../src/lib/snapshot-store.js";

function mkReq(
  tool: string,
  args: Record<string, unknown> = {},
  tabId?: number,
): NmRequest {
  return {
    type: "tool_request",
    tool,
    args,
    requestId: "r-1",
    ...(tabId != null ? { tabId } : {}),
  };
}

type FrameRow = { frameId: number; parentFrameId: number; url: string };

function stubChrome(opts: {
  frames: FrameRow[];
  /** frameId -> page result or null (cross-origin/failed) */
  scanResults: Record<number, any>;
  /** frameId -> iframe rect offset (for parent lookup) */
  iframeRects?: Record<number, { x: number; y: number } | null>;
}) {
  const executeScript = vi.fn(async ({ target, func, args }: any) => {
    const frameId = target.frameIds?.[0];
    if (frameId == null) return [{ result: opts.scanResults[0] ?? null }];

    // iframe-offset.ts 走同一个 executeScript（target 是父 frame，args 是 childFrameUrl）
    const fnSrc = func.toString();
    if (fnSrc.includes("getBoundingClientRect") && fnSrc.includes("iframes")) {
      // iframe-offset 的父 frame 探测：找 childUrl
      const childUrl = args?.[0];
      const child = opts.frames.find((f) => f.parentFrameId === frameId && f.url === childUrl);
      if (!child) return [{ result: null }];
      return [{ result: opts.iframeRects?.[child.frameId] ?? { x: 0, y: 0 } }];
    }

    // 否则是 observe 的扫描（目标 frame = frameId 本身）
    return [{ result: opts.scanResults[frameId] ?? null }];
  });

  vi.stubGlobal("chrome", {
    tabs: {
      query: vi.fn().mockResolvedValue([{ id: 42 }]),
    },
    webNavigation: {
      getAllFrames: vi.fn().mockResolvedValue(opts.frames),
    },
    scripting: { executeScript },
  });
  return executeScript;
}

/** 辅助：造一个最小合法的 page-side 扫描结果 */
function mkPage(elements: Array<{ selector: string; name?: string }>) {
  return {
    url: "https://a/",
    title: "T",
    viewport: { width: 1000, height: 800, scrollY: 0, scrollHeight: 800 },
    elements: elements.map((e, i) => ({
      index: i,
      tag: "button",
      role: "button",
      name: e.name ?? "",
      bbox: { x: 0, y: 0, w: 20, h: 20 },
      visible: true,
      inViewport: true,
      attrs: {},
      _sel: e.selector,
    })),
    candidateCount: elements.length,
    truncated: false,
  };
}

describe("observe multi-frame (@since 0.4.0)", () => {
  let router: ActionRouter;

  beforeEach(() => {
    vi.unstubAllGlobals();
    router = new ActionRouter();
    registerObserveHandlers(router);
  });

  it("default `frames: 'main'` scans only top frame and returns version 2", async () => {
    stubChrome({
      frames: [
        { frameId: 0, parentFrameId: -1, url: "https://a/" },
        { frameId: 65, parentFrameId: 0, url: "https://a/child" },
      ],
      scanResults: {
        0: mkPage([{ selector: "button.a" }, { selector: "button.b" }]),
        65: mkPage([{ selector: "button.iframe" }]),
      },
    });
    const resp = await router.dispatch(mkReq("observe.snapshot", {}, 42));
    expect(resp.error).toBeUndefined();
    const r = resp.result as any;
    expect(r.version).toBe(2);
    expect(r.frames).toHaveLength(1);
    expect(r.frames[0]).toMatchObject({ frameId: 0, elementCount: 2, scanned: true });
    expect(r.elements).toHaveLength(2);
    expect(r.elements.every((e: any) => e.frameId === 0)).toBe(true);
  });

  it("`frames: 'all-same-origin'` scans both frames and assigns global indexes", async () => {
    stubChrome({
      frames: [
        { frameId: 0, parentFrameId: -1, url: "https://a/" },
        { frameId: 65, parentFrameId: 0, url: "https://a/child" },
      ],
      scanResults: {
        0: mkPage([{ selector: "button.top-1" }, { selector: "button.top-2" }]),
        65: mkPage([{ selector: "button.child-1" }]),
      },
      iframeRects: { 65: { x: 60, y: 0 } },
    });
    const resp = await router.dispatch(
      mkReq("observe.snapshot", { frames: "all-same-origin" }, 42),
    );
    const r = resp.result as any;
    expect(r.elements).toHaveLength(3);
    expect(r.elements.map((e: any) => e.index)).toEqual([0, 1, 2]);
    expect(r.elements[0].frameId).toBe(0);
    expect(r.elements[1].frameId).toBe(0);
    expect(r.elements[2].frameId).toBe(65);
    expect(r.frames).toHaveLength(2);
    const child = r.frames.find((f: any) => f.frameId === 65);
    expect(child.offset).toEqual({ x: 60, y: 0 });
  });

  it("`frames: 'all-same-origin'` excludes cross-origin frames", async () => {
    stubChrome({
      frames: [
        { frameId: 0, parentFrameId: -1, url: "https://a/" },
        { frameId: 77, parentFrameId: 0, url: "https://b.other/" },
      ],
      scanResults: {
        0: mkPage([{ selector: "button.top" }]),
        77: mkPage([{ selector: "button.cross" }]),
      },
    });
    const resp = await router.dispatch(
      mkReq("observe.snapshot", { frames: "all-same-origin" }, 42),
    );
    const r = resp.result as any;
    expect(r.frames).toHaveLength(1);
    expect(r.frames[0].frameId).toBe(0);
    expect(r.elements.every((e: any) => e.frameId === 0)).toBe(true);
  });

  it("stores per-element frameId in snapshot for resolveTarget routing", async () => {
    stubChrome({
      frames: [
        { frameId: 0, parentFrameId: -1, url: "https://a/" },
        { frameId: 65, parentFrameId: 0, url: "https://a/child" },
      ],
      scanResults: {
        0: mkPage([{ selector: "button.top" }]),
        65: mkPage([{ selector: "button.child" }]),
      },
    });
    const resp = await router.dispatch(
      mkReq("observe.snapshot", { frames: "all-same-origin" }, 42),
    );
    const r = resp.result as any;
    const entry = getSnapshotEntry(r.snapshotId);
    expect(entry).toBeDefined();
    // 跨 frame：entry.frameId 不设置，元素各自带 frameId
    expect(entry!.frameId).toBeUndefined();
    expect(entry!.elements[0]).toMatchObject({
      index: 0,
      selector: "button.top",
      frameId: 0,
    });
    expect(entry!.elements[1]).toMatchObject({
      index: 1,
      selector: "button.child",
      frameId: 65,
    });
  });

  it("single-frame snapshot preserves backward-compat entry.frameId hint", async () => {
    stubChrome({
      frames: [{ frameId: 0, parentFrameId: -1, url: "https://a/" }],
      scanResults: { 0: mkPage([{ selector: "button.a" }]) },
    });
    const resp = await router.dispatch(mkReq("observe.snapshot", {}, 42));
    const r = resp.result as any;
    const entry = getSnapshotEntry(r.snapshotId);
    expect(entry!.frameId).toBe(0);
  });

  it("legacy `frameId` param scans only that frame (ignores `frames`)", async () => {
    stubChrome({
      frames: [
        { frameId: 0, parentFrameId: -1, url: "https://a/" },
        { frameId: 65, parentFrameId: 0, url: "https://a/child" },
      ],
      scanResults: {
        0: mkPage([{ selector: "button.top" }]),
        65: mkPage([{ selector: "button.child-only" }]),
      },
    });
    const resp = await router.dispatch(
      mkReq("observe.snapshot", { frameId: 65, frames: "all-same-origin" }, 42),
    );
    const r = resp.result as any;
    expect(r.frames).toHaveLength(1);
    expect(r.frames[0].frameId).toBe(65);
    expect(r.elements.every((e: any) => e.frameId === 65)).toBe(true);
  });

  it("cross-origin scan failure marks frame as scanned=false with 0 elements", async () => {
    stubChrome({
      frames: [
        { frameId: 0, parentFrameId: -1, url: "https://a/" },
        { frameId: 99, parentFrameId: 0, url: "https://a/xframe" },
      ],
      scanResults: {
        0: mkPage([{ selector: "button.top" }]),
        99: null, // 模拟 executeScript 返回 null（跨源 / 销毁）
      },
    });
    const resp = await router.dispatch(
      mkReq("observe.snapshot", { frames: "all-same-origin" }, 42),
    );
    const r = resp.result as any;
    expect(r.frames).toHaveLength(2);
    const bad = r.frames.find((f: any) => f.frameId === 99);
    expect(bad).toMatchObject({ scanned: false, elementCount: 0 });
  });

  it("throws IFRAME_NOT_READY when no target frames resolvable", async () => {
    stubChrome({
      frames: [],
      scanResults: {},
    });
    const resp = await router.dispatch(mkReq("observe.snapshot", {}, 42));
    expect(resp.error?.code).toBe(VtxErrorCode.IFRAME_NOT_READY);
  });
});
