// packages/extension/src/handlers/file.ts

import { FileActions, VtxErrorCode, vtxError, VtxEventType } from "@bytenew/vortex-shared";
import type { ActionRouter } from "../lib/router.js";
import type { NativeMessagingClient } from "../lib/native-messaging.js";
import type { EventDispatcher } from "../events/dispatcher.js";

async function getActiveTabId(tabId?: number): Promise<number> {
  if (tabId) return tabId;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw vtxError(VtxErrorCode.TAB_NOT_FOUND, "No active tab found");
  return tab.id;
}

export function registerFileHandlers(
  router: ActionRouter,
  nm: NativeMessagingClient,
  dispatcher: EventDispatcher,
): void {
  // 下载完成事件：模块加载即挂载（订阅不再必要）
  chrome.downloads.onChanged.addListener((delta) => {
    if (delta.state?.current !== "complete") return;
    chrome.downloads.search({ id: delta.id }, (items) => {
      if (items.length === 0) return;
      const it = items[0];
      dispatcher.emit(VtxEventType.DOWNLOAD_COMPLETED, {
        id: it.id,
        url: it.url,
        filename: it.filename,
        totalBytes: it.totalBytes,
        mime: it.mime,
      });
    });
  });

  router.registerAll({
    [FileActions.UPLOAD]: async (args, tabId) => {
      const selector = args.selector as string;
      const fileName = args.fileName as string;
      const fileContent = args.fileContent as string; // base64
      const mimeType = (args.mimeType as string) ?? "application/octet-stream";
      if (!selector || !fileName || !fileContent) {
        throw vtxError(VtxErrorCode.INVALID_PARAMS, "Missing required params: selector, fileName, fileContent (base64)");
      }
      const tid = await getActiveTabId((args.tabId as number | undefined) ?? tabId);

      const results = await chrome.scripting.executeScript({
        target: { tabId: tid },
        func: (sel: string, name: string, b64: string, mime: string) => {
          try {
            const input = document.querySelector(sel) as HTMLInputElement | null;
            if (!input) return { error: `Element not found: ${sel}` };
            if (input.type !== "file") return { error: "Element is not a file input" };

            // base64 -> Uint8Array
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }

            const file = new File([bytes], name, { type: mime });
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;

            // 触发 change 事件
            input.dispatchEvent(new Event("change", { bubbles: true }));
            input.dispatchEvent(new Event("input", { bubbles: true }));

            return { result: { success: true, fileName: name, size: bytes.length } };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
        args: [selector, fileName, fileContent, mimeType],
        world: "MAIN",
      });

      const res = results[0]?.result as { result?: unknown; error?: string };
      if (res?.error) {
        let code: VtxErrorCode = VtxErrorCode.JS_EXECUTION_ERROR;
        if (res.error.startsWith("Element not found:")) code = VtxErrorCode.ELEMENT_NOT_FOUND;
        else if (res.error === "Element is not a file input") code = VtxErrorCode.INVALID_PARAMS;
        throw vtxError(code, res.error, { selector });
      }
      return res?.result;
    },

    [FileActions.DOWNLOAD]: async (args) => {
      const url = args.url as string;
      if (!url) throw vtxError(VtxErrorCode.INVALID_PARAMS, "Missing required param: url");
      const filename = args.filename as string | undefined;
      const saveAs = (args.saveAs as boolean) ?? false;

      const options: chrome.downloads.DownloadOptions = { url, saveAs };
      if (filename) options.filename = filename;

      const downloadId = await chrome.downloads.download(options);
      return { downloadId, url, filename };
    },

    [FileActions.GET_DOWNLOADS]: async (args) => {
      const limit = (args.limit as number) ?? 20;
      const query = args.query as string | undefined;

      const searchOptions: chrome.downloads.DownloadQuery = {
        limit,
        orderBy: ["-startTime"],
      };
      if (query) searchOptions.filenameRegex = query;

      const items = await chrome.downloads.search(searchOptions);
      return items.map((item) => ({
        id: item.id,
        url: item.url,
        filename: item.filename,
        state: item.state,
        totalBytes: item.totalBytes,
        bytesReceived: item.bytesReceived,
        startTime: item.startTime,
        endTime: item.endTime,
        mime: item.mime,
        error: item.error,
      }));
    },

    [FileActions.ON_DOWNLOAD_COMPLETE]: async () => {
      // 保持向后兼容：download.completed 事件已默认由 dispatcher 广播，
      // 无需显式订阅。客户端通过 vortex_events_subscribe 订阅。
      return {
        subscribed: true,
        note: "download.completed events are now always broadcast. Subscribe via vortex_events_subscribe.",
      };
    },
  });
}
