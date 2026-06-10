import { buildExecuteTarget } from "./tab-utils.js";
import type { DebuggerManager } from "./debugger-manager.js";

/** CDP DOM.getDocument(pierce:true) 返回的精简 node 形状(只取用到的字段)。 */
interface CdpNode {
  nodeName?: string;
  backendNodeId?: number;
  attributes?: string[];
  children?: CdpNode[];
  shadowRoots?: CdpNode[];
}

/** 从 CDP node 的扁平 attributes [name,val,...] 取 src。 */
function nodeSrc(n: CdpNode): string | null {
  const a = n.attributes ?? [];
  for (let i = 0; i + 1 < a.length; i += 2) if (a[i] === "src") return a[i + 1];
  return null;
}

/**
 * DOM 法够不到 iframe 元素时(closed shadow 内嵌)的 CDP 兜底。
 * 关键洞察:跨源 OOPIF 是独立 CDP target,Page.getFrameTree(顶层 target)不收录
 * 它的子帧,故 getFrameOwner 拿不到。但 owner <iframe> **元素本身在主 frame DOM
 * 里**(仅嵌在 closed shadow)。DOM.getDocument({pierce:true}) 穿 open+closed shadow
 * 返回全树,据此按 src 找到该 <iframe> 元素,再 DOM.getBoxModel 取其 content quad
 * 左上角(top-page CSS px)。返回 null 表示找不到匹配 iframe。
 * 注:返回 top-page 坐标。单层 shadow-nested(父为主 frame,如 oopif-in-csr)时
 * top-page == 父相对偏移,与 getIframeOffset 逐层累加一致;多层 shadow 嵌套极罕见,
 * 此时会过加,接受(仍严格优于 {0,0})。
 */
async function queryIframeRectViaCdp(
  debuggerMgr: DebuggerManager,
  tabId: number,
  frameUrl: string,
): Promise<{ x: number; y: number } | null> {
  try {
    await debuggerMgr.enableDomain(tabId, "DOM");
    const doc = (await debuggerMgr.sendCommand(tabId, "DOM.getDocument", {
      depth: -1,
      pierce: true,
    })) as { root?: CdpNode };

    // 走 node 树(穿 shadow,pierce:true 含 closed shadow)收集所有 <iframe>。
    // 不下钻 contentDocument(那是 iframe 内部文档,不含 owner 元素)。
    const iframes: CdpNode[] = [];
    const walk = (node: CdpNode | undefined): void => {
      if (!node) return;
      if (node.nodeName === "IFRAME") iframes.push(node);
      for (const c of node.children ?? []) walk(c);
      for (const sr of node.shadowRoots ?? []) walk(sr);
    };
    walk(doc?.root);

    // 匹配:src 完全相等 → 解析后 pathname 相等(应对相对/跨源 host 差异) → 单一兜底。
    let framePath: string | null = null;
    try {
      framePath = new URL(frameUrl).pathname;
    } catch {
      framePath = null;
    }
    let target = iframes.find((n) => nodeSrc(n) === frameUrl);
    if (!target && framePath) {
      target = iframes.find((n) => {
        const s = nodeSrc(n);
        if (!s) return false;
        try {
          return new URL(s, frameUrl).pathname === framePath;
        } catch {
          return false;
        }
      });
    }
    if (!target && iframes.length === 1) target = iframes[0];
    if (!target || target.backendNodeId == null) return null;

    const box = (await debuggerMgr.sendCommand(tabId, "DOM.getBoxModel", {
      backendNodeId: target.backendNodeId,
    })) as { model?: { content?: number[] } };
    const quad = box?.model?.content;
    if (!quad || quad.length < 2) return null;
    return { x: quad[0], y: quad[1] };
  } catch {
    return null;
  }
}

/**
 * 在指定父 frame 中，查目标 iframe 元素的 `getBoundingClientRect()` 左上角。
 * 跨源父 frame 导致 executeScript 失败时返回 null，由上层决定如何降级。
 * 匹配策略：完全 url 匹配 → origin 匹配（应对重定向）→ 单一 iframe 兜底。
 */
async function queryIframeRectInParent(
  tabId: number,
  parentFrameId: number,
  childFrameUrl: string,
): Promise<{ x: number; y: number } | null> {
  try {
    const iframeRect = await chrome.scripting.executeScript({
      target: buildExecuteTarget(tabId, parentFrameId),
      func: (frameUrl: string) => {
        let frameOrigin: string | null = null;
        try {
          frameOrigin = new URL(frameUrl).origin;
        } catch {
          frameOrigin = null;
        }
        // 穿 open shadow 深度收集 iframe：浅 querySelectorAll('iframe') 漏掉嵌在
        // shadow root 里的 iframe，导致 shadow-nested iframe 的 offset 被算成
        // {0,0} → realMouse 用 frame-local 坐标点空（oopif-in-osr / spif-in-shadow）。
        // 与 observe 走 querySelectorAllDeep 穿 shadow 同源。closed shadow 仍够不到
        // (el.shadowRoot=null)，由 getIframeOffset 上层降级处理。
        const collectIframes = (
          root: Document | ShadowRoot,
          acc: HTMLIFrameElement[],
        ): HTMLIFrameElement[] => {
          for (const el of Array.from(root.querySelectorAll("*"))) {
            if (el.tagName === "IFRAME") acc.push(el as HTMLIFrameElement);
            const sr = (el as HTMLElement).shadowRoot;
            if (sr) collectIframes(sr, acc);
          }
          return acc;
        };
        const iframes = collectIframes(document, []);
        let iframe = iframes.find((f) => f.src === frameUrl);
        if (!iframe && frameOrigin) {
          iframe = iframes.find((f) => {
            try {
              return new URL(f.src).origin === frameOrigin;
            } catch {
              return false;
            }
          });
        }
        if (!iframe && iframes.length === 1) iframe = iframes[0];
        if (!iframe) return null;
        const r = iframe.getBoundingClientRect();
        return { x: r.left, y: r.top };
      },
      args: [childFrameUrl],
      world: "MAIN",
    });
    return (iframeRect[0]?.result as { x: number; y: number } | null) ?? null;
  } catch {
    // executeScript 在跨源或无权限父 frame 上会抛，视为不可定位
    return null;
  }
}

/**
 * 计算 frame 在顶层视口中的左上角累加偏移（跨越整条祖先 iframe 链）。
 * 主 frame 或找不到时返回 { x: 0, y: 0 }。
 * 任一层无法定位（如跨源父 frame）视为整体失败，返回 { x: 0, y: 0 }。
 */
export async function getIframeOffset(
  tabId: number,
  frameId?: number,
  debuggerMgr?: DebuggerManager,
): Promise<{ x: number; y: number }> {
  if (frameId == null || frameId === 0) return { x: 0, y: 0 };

  const frames = await chrome.webNavigation.getAllFrames({ tabId });
  if (!frames) return { x: 0, y: 0 };

  // 从目标 frame 向主 frame 回溯，拿到整条祖先链（包含目标，不含主 frame）。
  const chain: chrome.webNavigation.GetAllFrameResultDetails[] = [];
  const byId = new Map(frames.map((f) => [f.frameId, f]));
  let cur = byId.get(frameId);
  const visited = new Set<number>();
  while (cur && cur.frameId !== 0 && !visited.has(cur.frameId)) {
    visited.add(cur.frameId);
    chain.push(cur);
    const parentId = cur.parentFrameId ?? 0;
    if (parentId === 0) break;
    cur = byId.get(parentId);
  }

  // 从最外层祖先开始（即最靠近主 frame 的那层）依次累加每一层 iframe 在其父中的偏移。
  let acc = { x: 0, y: 0 };
  for (const f of chain.reverse()) {
    const parentId = f.parentFrameId ?? 0;
    let rect = await queryIframeRectInParent(tabId, parentId, f.url);
    // DOM 够不到(closed shadow 内嵌 iframe / 极端跨源)→ CDP 兜底穿 shadow。
    // 仅当调用方传入 debuggerMgr 时启用(real-mouse 路径)。
    if (!rect && debuggerMgr) {
      rect = await queryIframeRectViaCdp(debuggerMgr, tabId, f.url);
    }
    if (!rect) return { x: 0, y: 0 };
    acc = { x: acc.x + rect.x, y: acc.y + rect.y };
  }
  return acc;
}
