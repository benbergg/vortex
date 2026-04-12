import { PageActions } from "@bytenew/vortex-shared";
import type { ActionRouter } from "../lib/router.js";

async function getActiveTabId(tabId?: number): Promise<number> {
  if (tabId) return tabId;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found");
  return tab.id;
}

function waitForTabLoad(tabId: number, timeoutMs: number = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error(`Navigation timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    function listener(updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

export function registerPageHandlers(router: ActionRouter): void {
  router.registerAll({
    [PageActions.NAVIGATE]: async (args, tabId) => {
      const url = args.url as string;
      if (!url) throw new Error("Missing required param: url");
      const tid = await getActiveTabId(tabId);
      const waitForLoad = (args.waitForLoad as boolean) ?? true;
      await chrome.tabs.update(tid, { url });
      if (waitForLoad) {
        await waitForTabLoad(tid, (args.timeout as number) ?? 30_000);
      }
      const tab = await chrome.tabs.get(tid);
      return { url: tab.url, title: tab.title, status: tab.status };
    },

    [PageActions.RELOAD]: async (args, tabId) => {
      const tid = await getActiveTabId(tabId);
      await chrome.tabs.reload(tid);
      await waitForTabLoad(tid);
      const tab = await chrome.tabs.get(tid);
      return { url: tab.url, title: tab.title };
    },

    [PageActions.BACK]: async (args, tabId) => {
      const tid = await getActiveTabId(tabId);
      await chrome.tabs.goBack(tid);
      await waitForTabLoad(tid);
      const tab = await chrome.tabs.get(tid);
      return { url: tab.url, title: tab.title };
    },

    [PageActions.FORWARD]: async (args, tabId) => {
      const tid = await getActiveTabId(tabId);
      await chrome.tabs.goForward(tid);
      await waitForTabLoad(tid);
      const tab = await chrome.tabs.get(tid);
      return { url: tab.url, title: tab.title };
    },

    [PageActions.WAIT]: async (args, tabId) => {
      const tid = await getActiveTabId(tabId);
      const selector = args.selector as string | undefined;
      const timeout = (args.timeout as number) ?? 10_000;

      if (selector) {
        const result = await chrome.scripting.executeScript({
          target: { tabId: tid },
          func: (sel: string, ms: number) => {
            return new Promise<boolean>((resolve) => {
              if (document.querySelector(sel)) { resolve(true); return; }
              const observer = new MutationObserver(() => {
                if (document.querySelector(sel)) { observer.disconnect(); resolve(true); }
              });
              observer.observe(document.body, { childList: true, subtree: true });
              setTimeout(() => { observer.disconnect(); resolve(false); }, ms);
            });
          },
          args: [selector, timeout],
        });
        const found = result[0]?.result;
        if (!found) throw new Error(`Selector "${selector}" not found within ${timeout}ms`);
        return { found: true, selector };
      }

      await new Promise((r) => setTimeout(r, timeout));
      return { waited: timeout };
    },

    [PageActions.INFO]: async (args, tabId) => {
      const tid = await getActiveTabId(tabId);
      const tab = await chrome.tabs.get(tid);
      return { url: tab.url, title: tab.title, status: tab.status, tabId: tab.id, windowId: tab.windowId };
    },
  });
}
