// packages/extension/src/handlers/capture.ts

import { CaptureActions, VtxErrorCode, vtxError } from "@bytenew/vortex-shared";
import type { ActionRouter } from "../lib/router.js";
import type { DebuggerManager } from "../lib/debugger-manager.js";
import { getActiveTabId, buildExecuteTarget } from "../lib/tab-utils.js";
import { getIframeOffset } from "../lib/iframe-offset.js";

// GIF 录制状态
interface GifSession {
  tabId: number;
  frames: string[]; // data URL 数组
  interval: ReturnType<typeof setInterval>;
  startTime: number;
}

let activeGifSession: GifSession | null = null;

// fullPage 截图的高度上限（超过会返回空图）
const MAX_FULLPAGE_HEIGHT = 8000;

/**
 * 基于 CDP Page.captureScreenshot 的截图实现。
 * 不要求 tab 活跃，支持 viewport / fullPage / clip 三种模式。
 */
async function captureTab(
  debuggerMgr: DebuggerManager,
  tabId: number,
  options: {
    format?: "png" | "jpeg";
    quality?: number;
    fullPage?: boolean;
    clip?: { x: number; y: number; width: number; height: number };
  } = {},
): Promise<string> {
  const { format = "png", quality, fullPage = false, clip } = options;

  await debuggerMgr.enableDomain(tabId, "Page");

  const params: any = {
    format,
    captureBeyondViewport: fullPage || !!clip,
  };

  if (format === "jpeg" && quality != null) {
    params.quality = quality;
  }

  if (clip) {
    params.clip = { ...clip, scale: 1 };
  } else if (fullPage) {
    const metrics = await debuggerMgr.sendCommand(tabId, "Page.getLayoutMetrics") as any;
    const contentSize = metrics.cssContentSize ?? metrics.contentSize;
    params.clip = {
      x: 0,
      y: 0,
      width: contentSize.width,
      height: Math.min(contentSize.height, MAX_FULLPAGE_HEIGHT),
      scale: 1,
    };
  }

  const result = await debuggerMgr.sendCommand(tabId, "Page.captureScreenshot", params) as { data: string };
  return `data:image/${format};base64,${result.data}`;
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
      const fullPage = args.fullPage as boolean | undefined;
      const clip = args.clip as { x: number; y: number; width: number; height: number } | undefined;

      const dataUrl = await captureTab(debuggerMgr, tid, { format, quality, fullPage, clip });

      return {
        dataUrl,
        format,
        fullPage: !!fullPage,
        timestamp: Date.now(),
      };
    },

    [CaptureActions.ELEMENT]: async (args, tabId) => {
      const selector = args.selector as string;
      if (!selector) throw vtxError(VtxErrorCode.INVALID_PARAMS, "Missing required param: selector");
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
            result: { x: r.left, y: r.top, width: r.width, height: r.height },
          };
        },
        args: [selector],
        world: "MAIN",
      });
      const rectRes = rectResults[0]?.result as { result?: any; error?: string };
      if (rectRes?.error) throw vtxError(rectRes.error.startsWith("Element not found:") ? VtxErrorCode.ELEMENT_NOT_FOUND : VtxErrorCode.JS_EXECUTION_ERROR, rectRes.error, { selector });
      const rect = rectRes.result;

      // 2. iframe 坐标偏移（复用共享工具）
      const { x: offsetX, y: offsetY } = await getIframeOffset(tid, frameId);

      // 3. CDP 裁剪截图
      const dataUrl = await captureTab(debuggerMgr, tid, {
        format: "png",
        clip: {
          x: rect.x + offsetX,
          y: rect.y + offsetY,
          width: rect.width,
          height: rect.height,
        },
      });

      return {
        dataUrl,
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
      if (activeGifSession) throw vtxError(VtxErrorCode.INVALID_PARAMS, "GIF recording already in progress", { extras: { state: "already_recording" } }, { hint: "Stop the current recording with vortex_capture_gif_stop before starting a new one." });

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
            const dataUrl = await captureTab(debuggerMgr, activeGifSession.tabId, { format: "png" });
            activeGifSession.frames.push(dataUrl);
          } catch (err) {
            console.error("[capture] gif frame error:", err);
          }
        }, intervalMs),
      };

      return { recording: true, tabId: tid, fps };
    },

    [CaptureActions.GIF_FRAME]: async () => {
      if (!activeGifSession) throw vtxError(VtxErrorCode.INVALID_PARAMS, "No GIF recording in progress", { extras: { state: "not_recording" } }, { hint: "Call vortex_capture_gif_start first." });

      const dataUrl = await captureTab(debuggerMgr, activeGifSession.tabId, { format: "png" });
      activeGifSession.frames.push(dataUrl);

      return { frameCount: activeGifSession.frames.length };
    },

    [CaptureActions.GIF_STOP]: async () => {
      if (!activeGifSession) throw vtxError(VtxErrorCode.INVALID_PARAMS, "No GIF recording in progress", { extras: { state: "not_recording" } }, { hint: "Call vortex_capture_gif_start first." });

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
