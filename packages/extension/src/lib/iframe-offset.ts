import { buildExecuteTarget } from "./tab-utils.js";

/**
 * 计算 iframe 在父文档中的位置偏移（用于坐标系转换）。
 * 主 frame 或找不到时返回 { x: 0, y: 0 }。
 * 匹配策略：完全 url 匹配 → origin 匹配（应对重定向）→ 单一 iframe 兜底。
 */
export async function getIframeOffset(
  tabId: number,
  frameId?: number,
): Promise<{ x: number; y: number }> {
  if (frameId == null || frameId === 0) return { x: 0, y: 0 };

  const frames = await chrome.webNavigation.getAllFrames({ tabId });
  const frameInfo = frames?.find((f) => f.frameId === frameId);
  if (!frameInfo) return { x: 0, y: 0 };

  const parentFrameId = frameInfo.parentFrameId ?? 0;
  const iframeRect = await chrome.scripting.executeScript({
    target: buildExecuteTarget(tabId, parentFrameId),
    func: (frameUrl: string) => {
      const frameOrigin = new URL(frameUrl).origin;
      const iframes = Array.from(document.querySelectorAll("iframe"));
      let iframe = iframes.find((f) => f.src === frameUrl);
      if (!iframe) {
        iframe = iframes.find((f) => {
          try { return new URL(f.src).origin === frameOrigin; }
          catch { return false; }
        });
      }
      if (!iframe && iframes.length === 1) iframe = iframes[0];
      if (!iframe) return null;
      const r = iframe.getBoundingClientRect();
      return { x: r.left, y: r.top };
    },
    args: [frameInfo.url],
    world: "MAIN",
  });
  const offset = iframeRect[0]?.result as { x: number; y: number } | null;
  return offset ?? { x: 0, y: 0 };
}
