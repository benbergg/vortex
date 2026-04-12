// packages/extension/src/handlers/capture.ts

import { CaptureActions } from "@bytenew/vortex-shared";
import type { ActionRouter } from "../lib/router.js";

async function getActiveTabId(tabId?: number): Promise<number> {
  if (tabId) return tabId;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found");
  return tab.id;
}

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

export function registerCaptureHandlers(router: ActionRouter): void {
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

      // 获取元素位置
      const rectResults = await chrome.scripting.executeScript({
        target: { tabId: tid },
        func: (sel: string) => {
          const el = document.querySelector(sel);
          if (!el) return { error: `Element not found: ${sel}` };
          const rect = el.getBoundingClientRect();
          return {
            result: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              dpr: window.devicePixelRatio,
            },
          };
        },
        args: [selector],
        world: "MAIN",
      });

      const rectRes = rectResults[0]?.result as { result?: any; error?: string };
      if (rectRes?.error) throw new Error(rectRes.error);
      const rect = rectRes.result;

      // 截全屏
      const fullDataUrl = await captureTab(tid, "png");

      // 通过 offscreen document 裁剪
      // 如果 offscreen 还没准备好，先创建
      try {
        await chrome.offscreen.createDocument({
          url: "offscreen.html",
          reasons: [chrome.offscreen.Reason.CANVAS as any],
          justification: "Crop screenshot",
        });
      } catch {
        // 已存在则忽略
      }

      const cropResult = await chrome.runtime.sendMessage({
        type: "crop-image",
        dataUrl: fullDataUrl,
        x: Math.round(rect.x * rect.dpr),
        y: Math.round(rect.y * rect.dpr),
        width: Math.round(rect.width * rect.dpr),
        height: Math.round(rect.height * rect.dpr),
      });

      if (cropResult?.error) throw new Error(cropResult.error);

      return {
        dataUrl: cropResult.dataUrl,
        selector,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
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
