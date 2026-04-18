import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { VtxErrorCode } from "@bytenew/vortex-shared";
import type { NmRequest } from "@bytenew/vortex-shared";
import { ActionRouter } from "../src/lib/router.js";
import {
  registerMutationHandlers,
  getWatchedTabs,
  __resetMutationWatchers,
} from "../src/handlers/mutations.js";

function mkReq(
  tool: string,
  args: Record<string, unknown> = {},
  tabId?: number,
): NmRequest {
  return {
    type: "tool_request",
    tool,
    args,
    requestId: "r-1",
    ...(tabId != null ? { tabId } : {}),
  };
}

describe("mutations handler (DOM_MUTATED 激活)", () => {
  let router: ActionRouter;
  let tabsSendMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    router = new ActionRouter();
    tabsSendMessage = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", {
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 10, active: true }]),
        sendMessage: tabsSendMessage,
        onRemoved: { addListener: vi.fn() },
      },
    });
    __resetMutationWatchers();
    registerMutationHandlers(router);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("watchMutations", () => {
    it("记录 tabId 并发 start 消息到 content script", async () => {
      const resp = await router.dispatch(mkReq("dom.watchMutations", {}, 42));
      expect(resp.result).toMatchObject({ watching: true, tabId: 42 });
      expect(tabsSendMessage).toHaveBeenCalledWith(42, {
        source: "vortex-bg",
        action: "start-mutation-watch",
      });
      expect(getWatchedTabs()).toContain(42);
    });

    it("args.tabId 优先于顶层 tabId", async () => {
      await router.dispatch(mkReq("dom.watchMutations", { tabId: 99 }, 42));
      expect(tabsSendMessage).toHaveBeenCalledWith(99, expect.anything());
      expect(getWatchedTabs()).toEqual([99]);
    });

    it("无 tabId 时使用活跃 tab", async () => {
      await router.dispatch(mkReq("dom.watchMutations", {}));
      expect(tabsSendMessage).toHaveBeenCalledWith(10, expect.anything());
      expect(getWatchedTabs()).toEqual([10]);
    });

    it("sendMessage 失败 → JS_EXECUTION_ERROR + hint，watchedTabs 不更新", async () => {
      tabsSendMessage.mockRejectedValueOnce(new Error("Receiving end does not exist"));
      const resp = await router.dispatch(mkReq("dom.watchMutations", {}, 42));
      expect(resp.error?.code).toBe(VtxErrorCode.JS_EXECUTION_ERROR);
      expect(resp.error?.hint).toMatch(/Content script/);
      expect(getWatchedTabs()).not.toContain(42);
    });
  });

  describe("unwatchMutations", () => {
    it("移除 tabId 并发 stop 消息", async () => {
      await router.dispatch(mkReq("dom.watchMutations", {}, 42));
      tabsSendMessage.mockClear();

      const resp = await router.dispatch(mkReq("dom.unwatchMutations", {}, 42));
      expect(resp.result).toMatchObject({
        watching: false,
        tabId: 42,
        wasWatching: true,
      });
      expect(tabsSendMessage).toHaveBeenCalledWith(42, {
        source: "vortex-bg",
        action: "stop-mutation-watch",
      });
      expect(getWatchedTabs()).not.toContain(42);
    });

    it("对未订阅的 tab 取消订阅是幂等的（wasWatching=false）", async () => {
      const resp = await router.dispatch(mkReq("dom.unwatchMutations", {}, 99));
      expect(resp.result).toMatchObject({
        watching: false,
        wasWatching: false,
      });
    });

    it("stop 消息失败也不抛错（content 可能已卸载）", async () => {
      await router.dispatch(mkReq("dom.watchMutations", {}, 42));
      tabsSendMessage.mockRejectedValueOnce(new Error("No receiver"));
      const resp = await router.dispatch(mkReq("dom.unwatchMutations", {}, 42));
      expect(resp.error).toBeUndefined();
      expect(resp.result).toMatchObject({ wasWatching: true });
    });
  });

  describe("watched tabs 集合", () => {
    it("多个 tab 同时订阅", async () => {
      await router.dispatch(mkReq("dom.watchMutations", {}, 1));
      await router.dispatch(mkReq("dom.watchMutations", {}, 2));
      await router.dispatch(mkReq("dom.watchMutations", {}, 3));
      expect(getWatchedTabs().sort()).toEqual([1, 2, 3]);
    });
  });
});
