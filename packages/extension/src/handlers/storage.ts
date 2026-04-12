// packages/extension/src/handlers/storage.ts

import { StorageActions } from "@bytenew/vortex-shared";
import type { ActionRouter } from "../lib/router.js";

async function getActiveTabId(tabId?: number): Promise<number> {
  if (tabId) return tabId;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found");
  return tab.id;
}

/**
 * 从 tab URL 提取域名，用于 cookies API
 */
async function getTabUrl(tabId: number): Promise<string> {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url) throw new Error("Cannot access tab URL");
  return tab.url;
}

export function registerStorageHandlers(router: ActionRouter): void {
  router.registerAll({
    // ===== Cookies（使用 chrome.cookies API）=====

    [StorageActions.GET_COOKIES]: async (args, tabId) => {
      const domain = args.domain as string | undefined;
      const url = args.url as string | undefined;
      const name = args.name as string | undefined;

      if (url) {
        // 按 URL 查询
        const details: chrome.cookies.GetAllDetails = { url };
        if (name) details.name = name;
        return chrome.cookies.getAll(details);
      }

      if (domain) {
        return chrome.cookies.getAll({ domain });
      }

      // 默认：获取当前 tab URL 的 cookies
      const tid = await getActiveTabId((args.tabId as number | undefined) ?? tabId);
      const tabUrl = await getTabUrl(tid);
      return chrome.cookies.getAll({ url: tabUrl });
    },

    [StorageActions.SET_COOKIE]: async (args) => {
      const url = args.url as string;
      const name = args.name as string;
      const value = args.value as string;
      if (!url || !name) throw new Error("Missing required params: url, name");

      const details: chrome.cookies.SetDetails = {
        url,
        name,
        value: value ?? "",
      };
      if (args.domain) details.domain = args.domain as string;
      if (args.path) details.path = args.path as string;
      if (args.secure != null) details.secure = args.secure as boolean;
      if (args.httpOnly != null) details.httpOnly = args.httpOnly as boolean;
      if (args.expirationDate) details.expirationDate = args.expirationDate as number;
      if (args.sameSite) details.sameSite = args.sameSite as chrome.cookies.SameSiteStatus;

      const cookie = await chrome.cookies.set(details);
      return cookie;
    },

    [StorageActions.DELETE_COOKIE]: async (args) => {
      const url = args.url as string;
      const name = args.name as string;
      if (!url || !name) throw new Error("Missing required params: url, name");
      await chrome.cookies.remove({ url, name });
      return { deleted: true, url, name };
    },

    // ===== localStorage / sessionStorage（通过 executeScript）=====

    [StorageActions.GET_LOCAL_STORAGE]: async (args, tabId) => {
      const key = args.key as string | undefined;
      const tid = await getActiveTabId((args.tabId as number | undefined) ?? tabId);
      const results = await chrome.scripting.executeScript({
        target: { tabId: tid },
        func: (k: string | null) => {
          try {
            if (k) {
              return { result: localStorage.getItem(k) };
            }
            // 返回所有 key-value
            const all: Record<string, string> = {};
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key) all[key] = localStorage.getItem(key) ?? "";
            }
            return { result: all };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
        args: [key ?? null],
        world: "MAIN",
      });
      const res = results[0]?.result as { result?: unknown; error?: string };
      if (res?.error) throw new Error(res.error);
      return res?.result;
    },

    [StorageActions.SET_LOCAL_STORAGE]: async (args, tabId) => {
      const key = args.key as string;
      const value = args.value as string;
      if (!key) throw new Error("Missing required param: key");
      const tid = await getActiveTabId((args.tabId as number | undefined) ?? tabId);
      const results = await chrome.scripting.executeScript({
        target: { tabId: tid },
        func: (k: string, v: string) => {
          try {
            localStorage.setItem(k, v);
            return { result: { success: true } };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
        args: [key, value ?? ""],
        world: "MAIN",
      });
      const res = results[0]?.result as { result?: unknown; error?: string };
      if (res?.error) throw new Error(res.error);
      return res?.result;
    },

    [StorageActions.GET_SESSION_STORAGE]: async (args, tabId) => {
      const key = args.key as string | undefined;
      const tid = await getActiveTabId((args.tabId as number | undefined) ?? tabId);
      const results = await chrome.scripting.executeScript({
        target: { tabId: tid },
        func: (k: string | null) => {
          try {
            if (k) {
              return { result: sessionStorage.getItem(k) };
            }
            const all: Record<string, string> = {};
            for (let i = 0; i < sessionStorage.length; i++) {
              const key = sessionStorage.key(i);
              if (key) all[key] = sessionStorage.getItem(key) ?? "";
            }
            return { result: all };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
        args: [key ?? null],
        world: "MAIN",
      });
      const res = results[0]?.result as { result?: unknown; error?: string };
      if (res?.error) throw new Error(res.error);
      return res?.result;
    },

    [StorageActions.SET_SESSION_STORAGE]: async (args, tabId) => {
      const key = args.key as string;
      const value = args.value as string;
      if (!key) throw new Error("Missing required param: key");
      const tid = await getActiveTabId((args.tabId as number | undefined) ?? tabId);
      const results = await chrome.scripting.executeScript({
        target: { tabId: tid },
        func: (k: string, v: string) => {
          try {
            sessionStorage.setItem(k, v);
            return { result: { success: true } };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
        args: [key, value ?? ""],
        world: "MAIN",
      });
      const res = results[0]?.result as { result?: unknown; error?: string };
      if (res?.error) throw new Error(res.error);
      return res?.result;
    },
  });
}
