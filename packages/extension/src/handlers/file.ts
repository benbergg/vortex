// packages/extension/src/handlers/file.ts

import { FileActions, VtxErrorCode, vtxError } from "@bytenew/vortex-shared";
import type { ActionRouter } from "../lib/router.js";
import type { NativeMessagingClient } from "../lib/native-messaging.js";

async function getActiveTabId(tabId?: number): Promise<number> {
  if (tabId) return tabId;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw vtxError(VtxErrorCode.TAB_NOT_FOUND, "No active tab found");
  return tab.id;
}

// 跟踪已订阅下载完成事件的状态
let downloadSubscribed = false;

export function registerFileHandlers(
  router: ActionRouter,
  nm: NativeMessagingClient,
): void {
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
      if (res?.error) throw vtxError(res.error.startsWith("Element not found:") ? VtxErrorCode.ELEMENT_NOT_FOUND : VtxErrorCode.JS_EXECUTION_ERROR, res.error, { selector });
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
      if (!downloadSubscribed) {
        chrome.downloads.onChanged.addListener((delta) => {
          if (delta.state?.current === "complete") {
            chrome.downloads.search({ id: delta.id }, (items) => {
              if (items.length > 0) {
                nm.send({
                  type: "event",
                  event: "file.downloadComplete",
                  data: {
                    id: items[0].id,
                    url: items[0].url,
                    filename: items[0].filename,
                    totalBytes: items[0].totalBytes,
                    mime: items[0].mime,
                  },
                });
              }
            });
          }
        });
        downloadSubscribed = true;
      }
      return { subscribed: true };
    },
  });
}
