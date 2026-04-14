// packages/extension/src/handlers/capture.ts

import { CaptureActions } from "@bytenew/vortex-shared";
import type { ActionRouter } from "../lib/router.js";
import type { DebuggerManager } from "../lib/debugger-manager.js";
import { getActiveTabId, buildExecuteTarget } from "../lib/tab-utils.js";

// GIF 录制状态
interface GifSession {
  tabId: number;
  frames: string[]; // data URL 数组
  interval: ReturnType<typeof setInterval>;
  startTime: number;
}

let activeGifSession: GifSession | null = null;

/**
 * 截取指定 tab 的可视区域截图
 */
async function captureTab(
  tabId: number,
  format: "png" | "jpeg" = "png",
  quality?: number,
): Promise<string> {
  // captureVisibleTab 需要 tab 所在的 windowId
  const tab = await chrome.tabs.get(tabId);
  if (!tab.windowId) throw new Error("Cannot determine window for tab");

  // 确保 tab 是活跃的（captureVisibleTab 只能截当前活跃 tab）
  if (!tab.active) {
    await chrome.tabs.update(tabId, { active: true });
    // 等待 tab 激活
    await new Promise((r) => setTimeout(r, 100));
  }

  const options: chrome.tabs.CaptureVisibleTabOptions = { format };
  if (format === "jpeg" && quality != null) {
    options.quality = quality;
  }

  return chrome.tabs.captureVisibleTab(tab.windowId, options);
}

export function registerCaptureHandlers(
  router: ActionRouter,
  debuggerMgr: DebuggerManager,
): void {
  router.registerAll({
    [CaptureActions.SCREENSHOT]: async (args, tabId) => {
      const tid = await getActiveTabId((args.tabId as number | undefined) ?? tabId);
      const format = (args.format as "png" | "jpeg") ?? "png";
      const quality = args.quality as number | undefined;

      const dataUrl = await captureTab(tid, format, quality);

      return {
        dataUrl,
        format,
        timestamp: Date.now(),
      };
    },

    [CaptureActions.ELEMENT]: async (args, tabId) => {
      const selector = args.selector as string;
      if (!selector) throw new Error("Missing required param: selector");
      const tid = await getActiveTabId((args.tabId as number | undefined) ?? tabId);
      const frameId = args.frameId as number | undefined;

      // 1. 在目标 frame 内取元素 rect
      const rectResults = await chrome.scripting.executeScript({
        target: buildExecuteTarget(tid, frameId),
        func: (sel: string) => {
          const el = document.querySelector(sel);
          if (!el) return { error: `Element not found: ${sel}` };
          const r = el.getBoundingClientRect();
          return {
            result: {
              x: r.left, y: r.top, width: r.width, height: r.height,
            },
          };
        },
        args: [selector],
        world: "MAIN",
      });
      const rectRes = rectResults[0]?.result as { result?: any; error?: string };
      if (rectRes?.error) throw new Error(rectRes.error);
      const rect = rectRes.result;

      // 2. iframe 坐标偏移：如果 frameId 非 0，找 iframe 在父文档的位置
      let offsetX = 0, offsetY = 0;
      if (frameId != null && frameId !== 0) {
        const frames = await chrome.webNavigation.getAllFrames({ tabId: tid });
        const frameInfo = frames?.find((f) => f.frameId === frameId);
        if (frameInfo) {
          const parentFrameId = frameInfo.parentFrameId ?? 0;
          const iframeRect = await chrome.scripting.executeScript({
            target: buildExecuteTarget(tid, parentFrameId),
            func: (frameUrl: string) => {
              const frameOrigin = new URL(frameUrl).origin;
              const iframes = Array.from(document.querySelectorAll("iframe"));
              // 优先 src 完全匹配，其次 origin 匹配（应对重定向后 src 不更新）
              let iframe = iframes.find((f) => f.src === frameUrl);
              if (!iframe) {
                iframe = iframes.find((f) => {
                  try { return new URL(f.src).origin === frameOrigin; }
                  catch { return false; }
                });
              }
              // 最后兜底：只有一个 iframe 就是它
              if (!iframe && iframes.length === 1) iframe = iframes[0];
              if (!iframe) return null;
              const r = iframe.getBoundingClientRect();
              return { x: r.left, y: r.top };
            },
            args: [frameInfo.url],
            world: "MAIN",
          });
          const offset = iframeRect[0]?.result as { x: number; y: number } | null;
          if (offset) { offsetX = offset.x; offsetY = offset.y; }
        }
      }

      // 3. CDP 裁剪截图
      await debuggerMgr.enableDomain(tid, "Page");
      const screenshot = await debuggerMgr.sendCommand(tid, "Page.captureScreenshot", {
        format: "png",
        clip: {
          x: rect.x + offsetX,
          y: rect.y + offsetY,
          width: rect.width,
          height: rect.height,
          scale: 1,
        },
        captureBeyondViewport: true,
      }) as { data: string };

      return {
        dataUrl: `data:image/png;base64,${screenshot.data}`,
        selector,
        rect: {
          x: rect.x + offsetX,
          y: rect.y + offsetY,
          width: rect.width,
          height: rect.height,
        },
        timestamp: Date.now(),
      };
    },

    [CaptureActions.GIF_START]: async (args, tabId) => {
      if (activeGifSession) throw new Error("GIF recording already in progress");

      const tid = await getActiveTabId((args.tabId as number | undefined) ?? tabId);
      const fps = (args.fps as number) ?? 2;
      const intervalMs = Math.round(1000 / fps);

      activeGifSession = {
        tabId: tid,
        frames: [],
        startTime: Date.now(),
        interval: setInterval(async () => {
          if (!activeGifSession) return;
          try {
            const dataUrl = await captureTab(activeGifSession.tabId, "png");
            activeGifSession.frames.push(dataUrl);
          } catch (err) {
            console.error("[capture] gif frame error:", err);
          }
        }, intervalMs),
      };

      return { recording: true, tabId: tid, fps };
    },

    [CaptureActions.GIF_FRAME]: async () => {
      if (!activeGifSession) throw new Error("No GIF recording in progress");

      const dataUrl = await captureTab(activeGifSession.tabId, "png");
      activeGifSession.frames.push(dataUrl);

      return { frameCount: activeGifSession.frames.length };
    },

    [CaptureActions.GIF_STOP]: async () => {
      if (!activeGifSession) throw new Error("No GIF recording in progress");

      clearInterval(activeGifSession.interval);
      const session = activeGifSession;
      activeGifSession = null;

      return {
        frames: session.frames,
        frameCount: session.frames.length,
        duration: Date.now() - session.startTime,
        tabId: session.tabId,
      };
    },
  });
}
