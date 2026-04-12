// packages/extension/src/handlers/network.ts

import { NetworkActions } from "@bytenew/vortex-shared";
import type { ActionRouter } from "../lib/router.js";
import type { DebuggerManager } from "../lib/debugger-manager.js";
import type { NativeMessagingClient } from "../lib/native-messaging.js";

interface NetworkEntry {
  requestId: string;
  url: string;
  method: string;
  status?: number;
  statusText?: string;
  type?: string; // "Document", "XHR", "Fetch", "Script", "Stylesheet", ...
  mimeType?: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  error?: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
}

const networkLogs = new Map<number, NetworkEntry[]>();
// 请求进行中的临时存储（等待 response）
const pendingRequests = new Map<string, NetworkEntry>();
const MAX_LOGS = 500;
const subscribedTabs = new Set<number>();

async function getActiveTabId(tabId?: number): Promise<number> {
  if (tabId) return tabId;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found");
  return tab.id;
}

function addLog(tabId: number, entry: NetworkEntry): void {
  if (!networkLogs.has(tabId)) {
    networkLogs.set(tabId, []);
  }
  const logs = networkLogs.get(tabId)!;
  logs.push(entry);
  if (logs.length > MAX_LOGS) {
    logs.shift();
  }
}

export function registerNetworkHandlers(
  router: ActionRouter,
  debuggerMgr: DebuggerManager,
  nm: NativeMessagingClient,
): void {
  debuggerMgr.onEvent((tabId, method, params: any) => {
    if (!subscribedTabs.has(tabId)) return;

    if (method === "Network.requestWillBeSent") {
      const entry: NetworkEntry = {
        requestId: params.requestId,
        url: params.request.url,
        method: params.request.method,
        type: params.type ?? null,
        startTime: Date.now(),
        requestHeaders: params.request.headers,
      };
      // 暂存，等待 response
      pendingRequests.set(params.requestId, entry);

      nm.send({
        type: "event",
        event: "network.requestStart",
        data: {
          requestId: entry.requestId,
          url: entry.url,
          method: entry.method,
          type: entry.type ?? null,
        },
        tabId,
      });
    }

    if (method === "Network.responseReceived") {
      const pending = pendingRequests.get(params.requestId);
      if (pending) {
        pending.status = params.response.status;
        pending.statusText = params.response.statusText;
        pending.mimeType = params.response.mimeType;
        pending.responseHeaders = params.response.headers;
        pending.endTime = Date.now();
        pending.duration = pending.endTime - pending.startTime;

        addLog(tabId, pending);
        pendingRequests.delete(params.requestId);

        nm.send({
          type: "event",
          event: "network.responseReceived",
          data: {
            requestId: pending.requestId,
            url: pending.url,
            method: pending.method,
            status: pending.status,
            statusText: pending.statusText ?? null,
            mimeType: pending.mimeType ?? null,
            duration: pending.duration,
          },
          tabId,
        });
      }
    }

    if (method === "Network.loadingFailed") {
      const pending = pendingRequests.get(params.requestId);
      if (pending) {
        pending.error = params.errorText ?? "Loading failed";
        pending.endTime = Date.now();
        pending.duration = pending.endTime - pending.startTime;

        addLog(tabId, pending);
        pendingRequests.delete(params.requestId);

        nm.send({
          type: "event",
          event: "network.requestFailed",
          data: {
            requestId: pending.requestId,
            url: pending.url,
            method: pending.method,
            error: pending.error,
            duration: pending.duration,
          },
          tabId,
        });
      }
    }
  });

  // tab 关闭时清理
  chrome.tabs.onRemoved.addListener((tabId) => {
    networkLogs.delete(tabId);
    subscribedTabs.delete(tabId);
  });

  router.registerAll({
    [NetworkActions.SUBSCRIBE]: async (args, tabId) => {
      const tid = await getActiveTabId(
        (args.tabId as number | undefined) ?? tabId,
      );
      await debuggerMgr.enableDomain(tid, "Network");
      subscribedTabs.add(tid);
      return { subscribed: true, tabId: tid };
    },

    [NetworkActions.GET_LOGS]: async (args, tabId) => {
      const tid = await getActiveTabId(
        (args.tabId as number | undefined) ?? tabId,
      );
      return networkLogs.get(tid) ?? [];
    },

    [NetworkActions.GET_ERRORS]: async (args, tabId) => {
      const tid = await getActiveTabId(
        (args.tabId as number | undefined) ?? tabId,
      );
      const logs = networkLogs.get(tid) ?? [];
      return logs.filter((l) => l.error || (l.status && l.status >= 400));
    },

    [NetworkActions.FILTER]: async (args, tabId) => {
      const tid = await getActiveTabId(
        (args.tabId as number | undefined) ?? tabId,
      );
      const logs = networkLogs.get(tid) ?? [];
      const urlPattern = args.url as string | undefined;
      const methodFilter = args.method as string | undefined;
      const statusMin = args.statusMin as number | undefined;
      const statusMax = args.statusMax as number | undefined;

      return logs.filter((l) => {
        if (urlPattern && !l.url.includes(urlPattern)) return false;
        if (methodFilter && l.method !== methodFilter.toUpperCase())
          return false;
        if (statusMin != null && (l.status == null || l.status < statusMin))
          return false;
        if (statusMax != null && (l.status == null || l.status > statusMax))
          return false;
        return true;
      });
    },

    [NetworkActions.CLEAR]: async (args, tabId) => {
      const tid = await getActiveTabId(
        (args.tabId as number | undefined) ?? tabId,
      );
      networkLogs.delete(tid);
      return { cleared: true, tabId: tid };
    },
  });
}
