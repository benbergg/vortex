import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NmRequest } from "@bytenew/vortex-shared";
import { ActionRouter } from "../src/lib/router.js";
import { registerObserveHandlers } from "../src/handlers/observe.js";

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

function mkPage(elements: Array<{ selector: string }>) {
  return {
    url: "https://x/",
    title: "T",
    viewport: { width: 1000, height: 800, scrollY: 0, scrollHeight: 800 },
    elements: elements.map((e, i) => ({
      index: i,
      tag: "button",
      role: "button",
      name: "",
      bbox: { x: 0, y: 0, w: 10, h: 10 },
      visible: true,
      inViewport: true,
      attrs: {},
      _sel: e.selector,
    })),
    candidateCount: elements.length,
    truncated: false,
  };
}

function stubChrome(opts: {
  frames: FrameRow[];
  scanResults: Record<number, any>;
  hostPermissions?: string[];
}) {
  const executeScript = vi.fn(async ({ target, args }: any) => {
    const frameId = target.frameIds?.[0];
    if (frameId == null) return [{ result: opts.scanResults[0] ?? null }];
    const fnSrc = (arguments as any).length; // noop; placeholder for linter
    void fnSrc;
    // iframe-offset 本次测试不关心偏移，始终 {x:0,y:0}
    const childUrl = args?.[0];
    if (typeof childUrl === "string" && childUrl.startsWith("http")) {
      return [{ result: { x: 0, y: 0 } }];
    }
    return [{ result: opts.scanResults[frameId] ?? null }];
  });
  vi.stubGlobal("chrome", {
    tabs: { query: vi.fn().mockResolvedValue([{ id: 42 }]) },
    webNavigation: {
      getAllFrames: vi.fn().mockResolvedValue(opts.frames),
    },
    scripting: { executeScript },
    runtime: {
      getManifest: vi.fn().mockReturnValue({
        host_permissions: opts.hostPermissions ?? ["<all_urls>"],
      }),
    },
  });
}

describe("observe frames: 'all-permitted' (@since 0.4.0 O-6)", () => {
  let router: ActionRouter;

  beforeEach(() => {
    vi.unstubAllGlobals();
    router = new ActionRouter();
    registerObserveHandlers(router);
  });

  it("with host_permissions=<all_urls>: includes cross-origin frames that all-same-origin would skip", async () => {
    stubChrome({
      frames: [
        { frameId: 0, parentFrameId: -1, url: "https://a.io/" },
        { frameId: 22, parentFrameId: 0, url: "https://sub.b.io/app" },
      ],
      scanResults: {
        0: mkPage([{ selector: "button.top" }]),
        22: mkPage([{ selector: "button.sub" }]),
      },
    });
    const resp = await router.dispatch(
      mkReq("observe.snapshot", { frames: "all-permitted" }, 42),
    );
    const r = resp.result as any;
    // 跨 origin 的 frame 22 应被扫到
    expect(r.frames.map((f: any) => f.frameId).sort()).toEqual([0, 22]);
    expect(r.elements.map((e: any) => e.frameId).sort()).toEqual([0, 22]);
  });

  it("with restricted host_permissions: only matching origins are scanned", async () => {
    stubChrome({
      frames: [
        { frameId: 0, parentFrameId: -1, url: "https://a.io/" },
        { frameId: 22, parentFrameId: 0, url: "https://whitelisted.example/" },
        { frameId: 33, parentFrameId: 0, url: "https://blocked.other/" },
      ],
      scanResults: {
        0: mkPage([{ selector: "a" }]),
        22: mkPage([{ selector: "b" }]),
        33: mkPage([{ selector: "c" }]),
      },
      hostPermissions: [
        "https://a.io/*",
        "https://*.example/*",
      ],
    });
    const resp = await router.dispatch(
      mkReq("observe.snapshot", { frames: "all-permitted" }, 42),
    );
    const r = resp.result as any;
    expect(r.frames.map((f: any) => f.frameId).sort()).toEqual([0, 22]);
    // 33 blocked.other 不在 host_permissions，不应出现
    const ids = r.frames.map((f: any) => f.frameId);
    expect(ids).not.toContain(33);
  });

  it("skips non-HTTP(S) frames (chrome:// / about:blank) even under <all_urls>", async () => {
    stubChrome({
      frames: [
        { frameId: 0, parentFrameId: -1, url: "https://a.io/" },
        { frameId: 22, parentFrameId: 0, url: "about:blank" },
        { frameId: 33, parentFrameId: 0, url: "chrome://newtab/" },
      ],
      scanResults: {
        0: mkPage([{ selector: "a" }]),
        22: mkPage([{ selector: "b" }]),
        33: mkPage([{ selector: "c" }]),
      },
    });
    const resp = await router.dispatch(
      mkReq("observe.snapshot", { frames: "all-permitted" }, 42),
    );
    const r = resp.result as any;
    // 只主 frame 被 scan
    expect(r.frames.length).toBe(1);
    expect(r.frames[0].frameId).toBe(0);
  });

  it("coexists with 'all-same-origin' (still strict) and 'all' (unfiltered)", async () => {
    stubChrome({
      frames: [
        { frameId: 0, parentFrameId: -1, url: "https://a.io/" },
        { frameId: 22, parentFrameId: 0, url: "https://b.io/" },
      ],
      scanResults: {
        0: mkPage([{ selector: "a" }]),
        22: mkPage([{ selector: "b" }]),
      },
      hostPermissions: ["<all_urls>"],
    });

    const sameOrigin = (await router.dispatch(
      mkReq("observe.snapshot", { frames: "all-same-origin" }, 42),
    )).result as any;
    const permitted = (await router.dispatch(
      mkReq("observe.snapshot", { frames: "all-permitted" }, 42),
    )).result as any;
    const all = (await router.dispatch(
      mkReq("observe.snapshot", { frames: "all" }, 42),
    )).result as any;

    expect(sameOrigin.frames.map((f: any) => f.frameId)).toEqual([0]);
    expect(permitted.frames.map((f: any) => f.frameId).sort()).toEqual([0, 22]);
    expect(all.frames.map((f: any) => f.frameId).sort()).toEqual([0, 22]);
  });
});
