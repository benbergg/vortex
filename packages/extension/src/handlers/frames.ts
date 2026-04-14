import { FramesActions } from "@bytenew/vortex-shared";
import type { ActionRouter } from "../lib/router.js";
import { getActiveTabId } from "../lib/tab-utils.js";

export function registerFramesHandlers(router: ActionRouter): void {
  router.registerAll({
    [FramesActions.LIST]: async (args, tabId) => {
      const tid = await getActiveTabId(
        (args.tabId as number | undefined) ?? tabId,
      );
      const frames = await chrome.webNavigation.getAllFrames({ tabId: tid });
      if (!frames) return [];
      return frames.map((f) => ({
        frameId: f.frameId,
        parentFrameId: f.parentFrameId,
        url: f.url,
        errorOccurred: f.errorOccurred ?? false,
      }));
    },

    [FramesActions.FIND]: async (args, tabId) => {
      const tid = await getActiveTabId(
        (args.tabId as number | undefined) ?? tabId,
      );
      const urlPattern = args.urlPattern as string;
      if (!urlPattern) throw new Error("urlPattern is required");

      const frames = await chrome.webNavigation.getAllFrames({ tabId: tid });
      if (!frames) return null;
      const matched = frames.find((f) => f.url.includes(urlPattern));
      if (!matched) return null;
      return {
        frameId: matched.frameId,
        parentFrameId: matched.parentFrameId,
        url: matched.url,
      };
    },
  });
}
