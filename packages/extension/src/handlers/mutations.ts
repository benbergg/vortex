import { DomActions, VtxErrorCode, vtxError } from "@bytenew/vortex-shared";
import type { ActionRouter } from "../lib/router.js";
import { getActiveTabId } from "../lib/tab-utils.js";

/**
 * DOM mutation 观察的按需激活 handler（DOM_MUTATED 事件源）。
 *
 * - watchMutations(tabId): 向目标 tab 的 content-isolated 发激活消息
 * - unwatchMutations(tabId): 发去激活消息
 *
 * content 侧收到消息后挂 / 解除 MutationObserver。背景侧维护
 * watchedTabs 集合，方便列表查询、tab 关闭时自动清理。
 */
const watchedTabs = new Set<number>();

export function registerMutationHandlers(router: ActionRouter): void {
  // tab 关闭时清理订阅状态
  chrome.tabs.onRemoved.addListener((tabId) => {
    watchedTabs.delete(tabId);
  });

  router.registerAll({
    [DomActions.WATCH_MUTATIONS]: async (args, tabId) => {
      const tid = await getActiveTabId(
        (args.tabId as number | undefined) ?? tabId,
      );
      try {
        await chrome.tabs.sendMessage(tid, {
          source: "vortex-bg",
          action: "start-mutation-watch",
        });
      } catch (err) {
        throw vtxError(
          VtxErrorCode.JS_EXECUTION_ERROR,
          `Failed to reach content script on tab ${tid}: ${err instanceof Error ? err.message : String(err)}`,
          { tabId: tid },
          {
            hint: "Content script may not be injected yet (chrome:// / extension pages / pre-0.2.0 tabs). Reload the page and retry.",
          },
        );
      }
      watchedTabs.add(tid);
      return {
        watching: true,
        tabId: tid,
        note: "DOM mutations will be reported as 'dom.mutated' events at info level (merged by dispatcher).",
      };
    },

    [DomActions.UNWATCH_MUTATIONS]: async (args, tabId) => {
      const tid = await getActiveTabId(
        (args.tabId as number | undefined) ?? tabId,
      );
      try {
        await chrome.tabs.sendMessage(tid, {
          source: "vortex-bg",
          action: "stop-mutation-watch",
        });
      } catch {
        // 目标 content 可能已卸载（tab 关闭 / 页面跳转），忽略
      }
      const wasWatching = watchedTabs.delete(tid);
      return { watching: false, tabId: tid, wasWatching };
    },
  });
}

/** 供测试 / 诊断：读当前正在观察的 tab 集合 */
export function getWatchedTabs(): number[] {
  return Array.from(watchedTabs);
}

/** 测试用：重置状态（勿在生产调用） */
export function __resetMutationWatchers(): void {
  watchedTabs.clear();
}
