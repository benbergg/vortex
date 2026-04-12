// packages/extension/src/handlers/console.ts

import { ConsoleActions } from "@bytenew/vortex-shared";
import type { ActionRouter } from "../lib/router.js";
import type { DebuggerManager } from "../lib/debugger-manager.js";
import type { NativeMessagingClient } from "../lib/native-messaging.js";

interface ConsoleEntry {
  level: string; // "log" | "warn" | "error" | "info" | "debug"
  text: string;
  args?: unknown[];
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  timestamp: number;
}

// 每个 tab 的 console 日志缓存（扩展侧）
const consoleLogs = new Map<number, ConsoleEntry[]>();
const MAX_LOGS = 500;
// 已订阅 console 的 tab
const subscribedTabs = new Set<number>();

async function getActiveTabId(tabId?: number): Promise<number> {
  if (tabId) return tabId;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found");
  return tab.id;
}

function addLog(tabId: number, entry: ConsoleEntry): void {
  if (!consoleLogs.has(tabId)) {
    consoleLogs.set(tabId, []);
  }
  const logs = consoleLogs.get(tabId)!;
  logs.push(entry);
  if (logs.length > MAX_LOGS) {
    logs.shift();
  }
}

/**
 * 将 CDP Runtime.RemoteObject 转为可序列化的值
 */
function remoteObjectToValue(obj: any): unknown {
  if (obj.type === "string") return obj.value;
  if (obj.type === "number") return obj.value;
  if (obj.type === "boolean") return obj.value;
  if (obj.type === "undefined") return undefined;
  if (obj.subtype === "null") return null;
  if (obj.type === "object" && obj.preview) {
    // 尝试从 preview 构建对象
    const result: Record<string, unknown> = {};
    if (obj.preview.properties) {
      for (const prop of obj.preview.properties) {
        result[prop.name] = prop.value;
      }
    }
    return result;
  }
  // fallback: 描述字符串
  return obj.description ?? obj.value ?? `[${obj.type}]`;
}

export function registerConsoleHandlers(
  router: ActionRouter,
  debuggerMgr: DebuggerManager,
  nm: NativeMessagingClient,
): void {
  // 监听 CDP Runtime 事件
  debuggerMgr.onEvent((tabId, method, params: any) => {
    if (!subscribedTabs.has(tabId)) return;

    if (method === "Runtime.consoleAPICalled") {
      const entry: ConsoleEntry = {
        level: params.type, // "log", "warning", "error", "info", "debug"
        text: (params.args ?? [])
          .map((a: any) => {
            const val = remoteObjectToValue(a);
            return typeof val === "string" ? val : JSON.stringify(val);
          })
          .join(" "),
        args: (params.args ?? []).map(remoteObjectToValue),
        timestamp: Date.now(),
      };
      // CDP 用 "warning" 表示 console.warn
      if (entry.level === "warning") entry.level = "warn";

      addLog(tabId, entry);

      // 推送事件给中间件
      nm.send({
        type: "event",
        event: "console.message",
        data: entry,
        tabId,
      });
    }

    if (method === "Runtime.exceptionThrown") {
      const exDetail = params.exceptionDetails;
      const entry: ConsoleEntry = {
        level: "error",
        text:
          exDetail?.exception?.description ??
          exDetail?.text ??
          "Unknown exception",
        url: exDetail?.url ?? null,
        lineNumber: exDetail?.lineNumber ?? null,
        columnNumber: exDetail?.columnNumber ?? null,
        timestamp: Date.now(),
      };

      addLog(tabId, entry);

      nm.send({
        type: "event",
        event: "console.message",
        data: entry,
        tabId,
      });
    }
  });

  // tab 关闭时清理
  chrome.tabs.onRemoved.addListener((tabId) => {
    consoleLogs.delete(tabId);
    subscribedTabs.delete(tabId);
  });

  router.registerAll({
    [ConsoleActions.SUBSCRIBE]: async (args, tabId) => {
      const tid = await getActiveTabId(
        (args.tabId as number | undefined) ?? tabId,
      );
      await debuggerMgr.enableDomain(tid, "Runtime");
      subscribedTabs.add(tid);
      return { subscribed: true, tabId: tid };
    },

    [ConsoleActions.GET_LOGS]: async (args, tabId) => {
      const tid = await getActiveTabId(
        (args.tabId as number | undefined) ?? tabId,
      );
      const level = args.level as string | undefined;
      let logs = consoleLogs.get(tid) ?? [];
      if (level) {
        logs = logs.filter((l) => l.level === level);
      }
      return logs;
    },

    [ConsoleActions.GET_ERRORS]: async (args, tabId) => {
      const tid = await getActiveTabId(
        (args.tabId as number | undefined) ?? tabId,
      );
      const logs = consoleLogs.get(tid) ?? [];
      return logs.filter((l) => l.level === "error");
    },

    [ConsoleActions.CLEAR]: async (args, tabId) => {
      const tid = await getActiveTabId(
        (args.tabId as number | undefined) ?? tabId,
      );
      consoleLogs.delete(tid);
      return { cleared: true, tabId: tid };
    },
  });
}
