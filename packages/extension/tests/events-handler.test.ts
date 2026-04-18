import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NmRequest } from "@bytenew/vortex-shared";
import { ActionRouter } from "../src/lib/router.js";
import { EventDispatcher } from "../src/events/dispatcher.js";
import { registerEventHandlers } from "../src/handlers/events.js";

function makeNm() {
  const send = vi.fn();
  return {
    nm: { send } as unknown as ConstructorParameters<typeof EventDispatcher>[0],
    send,
  };
}

function mkReq(tool: string, args: Record<string, unknown> = {}): NmRequest {
  return {
    type: "tool_request",
    tool,
    args,
    requestId: "r-1",
  };
}

describe("events.drain handler", () => {
  let router: ActionRouter;
  let dispatcher: EventDispatcher;
  let send: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    router = new ActionRouter();
    const nm = makeNm();
    send = nm.send;
    dispatcher = new EventDispatcher(nm.nm);
    registerEventHandlers(router, dispatcher);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("无 buffer 事件时 drain 返回 {notice:0, info:0}", async () => {
    const resp = await router.dispatch(mkReq("events.drain"));
    expect(resp.result).toMatchObject({ flushed: { notice: 0, info: 0 } });
    expect(send).not.toHaveBeenCalled();
  });

  it("drain 强制立即发出 notice buffer 中的事件（绕过 200ms 窗口）", async () => {
    dispatcher.emit("page.navigated", { url: "https://a" }, { tabId: 1 });
    dispatcher.emit("page.navigated", { url: "https://b" }, { tabId: 2 });
    expect(send).not.toHaveBeenCalled(); // 尚未 flush

    const resp = await router.dispatch(mkReq("events.drain"));
    expect(resp.result).toMatchObject({ flushed: { notice: 2, info: 0 } });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("drain 强制立即发出并合并 info buffer（同 type/tab/frame 合并）", async () => {
    dispatcher.emit("dom.mutated", { batch: 1 }, { tabId: 10 });
    dispatcher.emit("dom.mutated", { batch: 2 }, { tabId: 10 });
    dispatcher.emit("dom.mutated", { batch: 3 }, { tabId: 10 });
    expect(send).not.toHaveBeenCalled();

    const resp = await router.dispatch(mkReq("events.drain"));
    // info 合并为 1 条（同 type + tabId）
    expect(resp.result).toMatchObject({ flushed: { notice: 0, info: 1 } });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "event",
        event: "dom.mutated",
        data: expect.objectContaining({ mergedCount: 3 }),
      }),
    );
  });

  it("drain 混合：notice + info buffer 同时 flush", async () => {
    dispatcher.emit("page.navigated", { url: "https://x" }, { tabId: 1 });
    dispatcher.emit("dom.mutated", { batch: 1 }, { tabId: 1 });

    const resp = await router.dispatch(mkReq("events.drain"));
    expect(resp.result).toMatchObject({ flushed: { notice: 1, info: 1 } });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("drain 不影响 urgent 事件（urgent 本就立即发）", async () => {
    dispatcher.emit("user.switched_tab", { windowId: 1 }, { tabId: 1 });
    expect(send).toHaveBeenCalledTimes(1); // urgent 已发
    send.mockClear();

    const resp = await router.dispatch(mkReq("events.drain"));
    expect(resp.result).toMatchObject({ flushed: { notice: 0, info: 0 } });
    expect(send).not.toHaveBeenCalled();
  });

  it("drain 后 buffer 清空，下次 emit info 不被合并", async () => {
    dispatcher.emit("dom.mutated", { batch: 1 }, { tabId: 1 });
    await router.dispatch(mkReq("events.drain"));
    send.mockClear();

    // 新一批
    dispatcher.emit("dom.mutated", { batch: 2 }, { tabId: 1 });
    const resp = await router.dispatch(mkReq("events.drain"));
    expect(resp.result).toMatchObject({ flushed: { notice: 0, info: 1 } });
    // 新批次只有 1 条，不会 merged（mergedCount 字段缺席）
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "dom.mutated",
        data: expect.not.objectContaining({ mergedCount: expect.anything() }),
      }),
    );
  });
});
