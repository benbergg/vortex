// packages/extension/src/handlers/storage.ts

import { StorageActions, VtxErrorCode, vtxError } from "@bytenew/vortex-shared";
import type { ActionRouter } from "../lib/router.js";

async function getActiveTabId(tabId?: number): Promise<number> {
  if (tabId) return tabId;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw vtxError(VtxErrorCode.TAB_NOT_FOUND, "No active tab found");
  return tab.id;
}

/**
 * 从 tab URL 提取域名，用于 cookies API
 */
async function getTabUrl(tabId: number): Promise<string> {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url) throw vtxError(VtxErrorCode.PERMISSION_DENIED, "Cannot access tab URL (tab may be chrome:// or restricted)", { tabId });
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
      if (!url || !name) throw vtxError(VtxErrorCode.INVALID_PARAMS, "Missing required params: url, name");

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
      if (!url || !name) throw vtxError(VtxErrorCode.INVALID_PARAMS, "Missing required params: url, name");
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
      if (res?.error) throw vtxError(VtxErrorCode.JS_EXECUTION_ERROR, res.error);
      return res?.result;
    },

    [StorageActions.SET_LOCAL_STORAGE]: async (args, tabId) => {
      const key = args.key as string;
      const value = args.value as string;
      if (!key) throw vtxError(VtxErrorCode.INVALID_PARAMS, "Missing required param: key");
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
      if (res?.error) throw vtxError(VtxErrorCode.JS_EXECUTION_ERROR, res.error);
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
      if (res?.error) throw vtxError(VtxErrorCode.JS_EXECUTION_ERROR, res.error);
      return res?.result;
    },

    [StorageActions.SET_SESSION_STORAGE]: async (args, tabId) => {
      const key = args.key as string;
      const value = args.value as string;
      if (!key) throw vtxError(VtxErrorCode.INVALID_PARAMS, "Missing required param: key");
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
      if (res?.error) throw vtxError(VtxErrorCode.JS_EXECUTION_ERROR, res.error);
      return res?.result;
    },

    // ===== Session 导入/导出（cookies + localStorage + sessionStorage）=====

    [StorageActions.EXPORT_SESSION]: async (args, tabId) => {
      const domain = args.domain as string;
      if (!domain) throw vtxError(VtxErrorCode.INVALID_PARAMS, "domain is required");

      // 1. 获取 cookies
      const cookies = await chrome.cookies.getAll({ domain });

      // 2. 获取 localStorage/sessionStorage（需要 tab 在匹配 domain）
      const tid = await getActiveTabId((args.tabId as number | undefined) ?? tabId);
      const tab = await chrome.tabs.get(tid);
      const tabUrl = tab.url ?? "";
      let tabDomain = "";
      try { tabDomain = new URL(tabUrl).hostname; } catch {}

      const cleanDomain = domain.replace(/^\./, "");
      const domainMatches = tabDomain === cleanDomain || tabDomain.endsWith("." + cleanDomain);

      let localStorageData: Record<string, string> = {};
      let sessionStorageData: Record<string, string> = {};
      let note: string | undefined;

      if (domainMatches) {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tid },
          func: () => ({
            local: Object.fromEntries(Object.entries(localStorage)) as Record<string, string>,
            session: Object.fromEntries(Object.entries(sessionStorage)) as Record<string, string>,
          }),
          world: "MAIN",
        });
        const data = results[0]?.result as { local: Record<string, string>; session: Record<string, string> } | undefined;
        localStorageData = data?.local ?? {};
        sessionStorageData = data?.session ?? {};
      } else {
        note = `Tab ${tid} (${tabDomain}) doesn't match domain ${domain}, localStorage/sessionStorage skipped. Navigate to the domain first to include them.`;
      }

      return {
        version: 1,
        exportedAt: Date.now(),
        domain,
        cookies: cookies.map((c) => ({
          name: c.name, value: c.value, domain: c.domain,
          path: c.path, secure: c.secure, httpOnly: c.httpOnly,
          sameSite: c.sameSite, expirationDate: c.expirationDate,
        })),
        localStorage: localStorageData,
        sessionStorage: sessionStorageData,
        ...(note ? { note } : {}),
      };
    },

    [StorageActions.IMPORT_SESSION]: async (args, tabId) => {
      const data = args.data as any;
      if (!data?.cookies || !Array.isArray(data.cookies)) {
        throw vtxError(VtxErrorCode.INVALID_PARAMS, "Invalid session data: missing cookies array");
      }
      if (!data.domain) throw vtxError(VtxErrorCode.INVALID_PARAMS, "Invalid session data: missing domain");

      const cleanDomain = data.domain.replace(/^\./, "");
      const cookieUrl = `https://${cleanDomain}`;

      let cookieCount = 0;
      const cookieErrors: string[] = [];
      for (const c of data.cookies) {
        try {
          // 按 cookie 自身的 domain 构造 URL；host-only cookie 用 domain 值
          const cookieHost = (c.domain ?? cleanDomain).replace(/^\./, "");
          const scheme = c.secure ? "https" : "https"; // 统一用 https 避免 secure cookie 被拒
          const urlForCookie = `${scheme}://${cookieHost}${c.path ?? "/"}`;

          const setPayload: chrome.cookies.SetDetails = {
            url: urlForCookie,
            name: c.name,
            value: c.value ?? "",
            path: c.path ?? "/",
            secure: c.secure ?? false,
            httpOnly: c.httpOnly ?? false,
          };
          // 只有 domain 以 "." 开头时才传（cross-subdomain），否则让它成为 host-only cookie
          if (c.domain && c.domain.startsWith(".")) {
            setPayload.domain = c.domain;
          }
          if (c.sameSite && c.sameSite !== "unspecified" && c.sameSite !== "no_restriction") {
            setPayload.sameSite = c.sameSite as chrome.cookies.SameSiteStatus;
          }
          if (c.expirationDate) setPayload.expirationDate = c.expirationDate;

          // chrome.cookies.set 返回 Promise<Cookie | null>
          const result = await chrome.cookies.set(setPayload);
          if (result) {
            cookieCount++;
          } else {
            const lastError = chrome.runtime.lastError?.message ?? "unknown";
            cookieErrors.push(`${c.name} (${cookieHost}): ${lastError}`);
          }
        } catch (err) {
          cookieErrors.push(`${c.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // localStorage / sessionStorage 写入（需要 tab 匹配 domain）
      const tid = await getActiveTabId((args.tabId as number | undefined) ?? tabId);
      const tab = await chrome.tabs.get(tid);
      const tabUrl = tab.url ?? "";
      let tabDomain = "";
      try { tabDomain = new URL(tabUrl).hostname; } catch {}
      const domainMatches = tabDomain === cleanDomain || tabDomain.endsWith("." + cleanDomain);

      let storageApplied = false;
      let storageNote: string | undefined;

      if (domainMatches) {
        await chrome.scripting.executeScript({
          target: { tabId: tid },
          func: (local: Record<string, string>, session: Record<string, string>) => {
            for (const [k, v] of Object.entries(local)) {
              try { localStorage.setItem(k, v); } catch {}
            }
            for (const [k, v] of Object.entries(session)) {
              try { sessionStorage.setItem(k, v); } catch {}
            }
          },
          args: [data.localStorage ?? {}, data.sessionStorage ?? {}],
          world: "MAIN",
        });
        storageApplied = true;
      } else {
        storageNote = `Tab ${tid} (${tabDomain}) doesn't match ${data.domain}, storage skipped. Navigate to ${cookieUrl} first.`;
      }

      return {
        success: true,
        cookieCount,
        cookieErrors: cookieErrors.length > 0 ? cookieErrors : undefined,
        storageApplied,
        localStorageCount: Object.keys(data.localStorage ?? {}).length,
        sessionStorageCount: Object.keys(data.sessionStorage ?? {}).length,
        ...(storageNote ? { note: storageNote } : {}),
      };
    },
  });
}
