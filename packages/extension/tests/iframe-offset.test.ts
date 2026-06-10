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

// queryIframeRectInParent 的 inject func 用深度遍历穿 open shadow 找 iframe（浅
// querySelectorAll('iframe') 漏掉 shadow 内嵌 iframe → offset {0,0} → realMouse
// 点空）。inject func 不导出，这里用与之字面一致的 collectIframes 复刻验证「穿
// open shadow 找得到」。须与 iframe-offset.ts 的内联实现同步（真源+测试副本）。
// 注：jsdom 不做布局，getBoundingClientRect 恒 0，故只验 count（能否找到），
// 实际 offset 值由 live bench(oopif-in-osr / spif-in-shadow) 验证。
const COLLECT_IFRAMES = `
  const collectIframes = (root, acc) => {
    for (const el of Array.from(root.querySelectorAll("*"))) {
      if (el.tagName === "IFRAME") acc.push(el);
      const sr = el.shadowRoot;
      if (sr) collectIframes(sr, acc);
    }
    return acc;
  };
  return collectIframes(document, []).length;
`;
const collectCount = (doc: Document): number =>
  new Function("document", COLLECT_IFRAMES)(doc);

describe("getIframeOffset — CDP 兜底(DOM 够不到 closed shadow 内嵌 iframe)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  // 新 CDP 兜底走 DOM.getDocument({pierce:true}) 穿 closed shadow 拿全树,按 src 找
  // owner <iframe>(OOPIF 是独立 target,getFrameTree 不收录,但 owner 元素在主 DOM),
  // 再 DOM.getBoxModel。mock 返回:document 树里一个嵌在 shadowRoots 内、src 匹配的 iframe。
  function mockDebuggerMgr(opts: {
    iframeSrc?: string;
    boxQuad?: number[] | null;
  }) {
    const iframeNode =
      opts.iframeSrc === undefined
        ? null
        : {
            nodeName: "IFRAME",
            backendNodeId: 99,
            attributes: ["src", opts.iframeSrc],
          };
    return {
      enableDomain: vi.fn().mockResolvedValue(undefined),
      sendCommand: vi.fn(async (_tabId: number, method: string) => {
        if (method === "DOM.getDocument")
          return {
            root: {
              nodeName: "#document",
              children: [
                {
                  nodeName: "DIV",
                  // iframe 嵌在 closed shadow(pierce:true 才可见)
                  shadowRoots: iframeNode ? [{ nodeName: "#document-fragment", children: [iframeNode] }] : [],
                },
              ],
            },
          };
        if (method === "DOM.getBoxModel")
          return opts.boxQuad ? { model: { content: opts.boxQuad } } : {};
        return {};
      }),
    } as any;
  }

  it("falls back to CDP getDocument(pierce)+getBoxModel when DOM rect is null", async () => {
    // DOM 路径返回 null(rects 空 → queryIframeRectInParent 找不到 → null)。
    stubChrome({
      frames: [
        { frameId: 0, parentFrameId: -1, url: "https://a/" },
        { frameId: 30, parentFrameId: 0, url: "https://cross/child" },
      ],
      rects: {}, // closed shadow：DOM 找不到 iframe 元素
    });
    const dbg = mockDebuggerMgr({
      iframeSrc: "https://cross/child",
      boxQuad: [42, 20, 142, 20, 142, 60, 42, 60],
    });
    // 不传 dbg → DOM 失败 → {0,0}（旧行为）
    await expect(getIframeOffset(1, 30)).resolves.toEqual({ x: 0, y: 0 });
    // 传 dbg → CDP 穿 shadow 找到 owner iframe，box content 左上角 (42,20)
    await expect(getIframeOffset(1, 30, dbg)).resolves.toEqual({ x: 42, y: 20 });
    expect(dbg.sendCommand).toHaveBeenCalledWith(1, "DOM.getDocument", { depth: -1, pierce: true });
  });

  it("returns {0,0} when CDP also cannot locate (no matching iframe / no box)", async () => {
    stubChrome({
      frames: [
        { frameId: 0, parentFrameId: -1, url: "https://a/" },
        { frameId: 30, parentFrameId: 0, url: "https://cross/child" },
      ],
      rects: {},
    });
    // 树里无 iframe → 找不到
    const dbg = mockDebuggerMgr({});
    await expect(getIframeOffset(1, 30, dbg)).resolves.toEqual({ x: 0, y: 0 });
  });
});

describe("queryIframeRectInParent collectIframes — 穿 open shadow", () => {
  it("finds an iframe nested in an open shadow root (shallow querySelectorAll misses it)", async () => {
    const { JSDOM } = await import("jsdom");
    const doc = new JSDOM(
      `<!DOCTYPE html><body><div id="host"></div></body>`,
    ).window.document;
    const host = doc.getElementById("host")!;
    const sr = host.attachShadow({ mode: "open" });
    const ifr = doc.createElement("iframe");
    ifr.src = "https://child/";
    sr.appendChild(ifr);
    // 浅查（light DOM only）找不到；深查穿 shadow 找到 1 个。
    expect(doc.querySelectorAll("iframe").length).toBe(0);
    expect(collectCount(doc)).toBe(1);
  });

  it("still finds light-DOM iframes (no regression)", async () => {
    const { JSDOM } = await import("jsdom");
    const doc = new JSDOM(
      `<!DOCTYPE html><body><iframe src="https://a/"></iframe></body>`,
    ).window.document;
    expect(collectCount(doc)).toBe(1);
  });
});
