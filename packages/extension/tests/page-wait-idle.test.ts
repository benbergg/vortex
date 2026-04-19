import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NmRequest } from "@bytenew/vortex-shared";
import { VtxErrorCode } from "@bytenew/vortex-shared";
import { ActionRouter } from "../src/lib/router.js";
import { registerPageHandlers } from "../src/handlers/page.js";

type CdpEventCallback = (
  tabId: number,
  method: string,
  params: unknown,
) => void;

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

function makeDebuggerMock() {
  const callbacks: CdpEventCallback[] = [];
  const enableDomain = vi.fn().mockResolvedValue(undefined);
  const onEvent = vi.fn((cb: CdpEventCallback) => {
    callbacks.push(cb);
  });
  const offEvent = vi.fn((cb: CdpEventCallback) => {
    const i = callbacks.indexOf(cb);
    if (i >= 0) callbacks.splice(i, 1);
  });
  return {
    mgr: {
      enableDomain,
      onEvent,
      offEvent,
      sendCommand: vi.fn(),
      attach: vi.fn().mockResolvedValue(undefined),
      isAttached: vi.fn().mockReturnValue(true),
    } as any,
    fire(tabId: number, method: string, params: unknown) {
      for (const cb of [...callbacks]) cb(tabId, method, params);
    },
    callbacks,
  };
}

describe("page.waitForXhrIdle / waitForNetworkIdle (@since 0.4.0)", () => {
  let router: ActionRouter;
  let dbg: ReturnType<typeof makeDebuggerMock>;

  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.useFakeTimers();
    router = new ActionRouter();
    dbg = makeDebuggerMock();
    vi.stubGlobal("chrome", {
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 42 }]),
        get: vi.fn(),
        onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
        reload: vi.fn(),
      },
    });
    registerPageHandlers(router, dbg.mgr);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waitForXhrIdle resolves when no XHR pending (idleTime elapses)", async () => {
    const p = router.dispatch(
      mkReq("page.waitForXhrIdle", { idleTime: 200, timeout: 5000 }, 42),
    );
    // 触发 debuggerMgr.enableDomain 的 microtask 排空：
    await Promise.resolve();
    await Promise.resolve();
    // 没有请求事件发出 —— 期望 idleTime 后 resolve
    await vi.advanceTimersByTimeAsync(250);
    const resp = await p;
    expect(resp.error).toBeUndefined();
    expect(resp.result).toMatchObject({ idle: true, matchedRequests: 0 });
  });

  it("waitForXhrIdle ignores WebSocket / Image / Stylesheet", async () => {
    const p = router.dispatch(
      mkReq("page.waitForXhrIdle", { idleTime: 200, timeout: 5000 }, 42),
    );
    await Promise.resolve();
    await Promise.resolve();
    // 一堆非 XHR 请求；idleTime 到期前不应被视为"匹配"请求，idle 照常触发
    dbg.fire(42, "Network.requestWillBeSent", {
      requestId: "ws-1",
      type: "WebSocket",
      request: { url: "wss://telemetry/" },
    });
    dbg.fire(42, "Network.requestWillBeSent", {
      requestId: "img-1",
      type: "Image",
      request: { url: "https://cdn/avatar.png" },
    });
    await vi.advanceTimersByTimeAsync(250);
    const resp = await p;
    expect(resp.result).toMatchObject({ idle: true, matchedRequests: 0 });
  });

  it("waitForXhrIdle waits for XHR completion before idleTime starts", async () => {
    const p = router.dispatch(
      mkReq("page.waitForXhrIdle", { idleTime: 200, timeout: 5000 }, 42),
    );
    await Promise.resolve();
    await Promise.resolve();
    // XHR 开始；idleTime 不应立即启动
    dbg.fire(42, "Network.requestWillBeSent", {
      requestId: "xhr-1",
      type: "XHR",
      request: { url: "/api/query" },
    });
    await vi.advanceTimersByTimeAsync(1000);
    // 未结束 —— 仍挂起
    expect(dbg.callbacks.length).toBe(1);
    // 结束
    dbg.fire(42, "Network.loadingFinished", { requestId: "xhr-1" });
    await vi.advanceTimersByTimeAsync(250);
    const resp = await p;
    expect(resp.result).toMatchObject({ idle: true, matchedRequests: 1 });
  });

  it("waitForNetworkIdle with urlPattern only counts matching requests", async () => {
    const p = router.dispatch(
      mkReq(
        "page.waitForNetworkIdle",
        { idleTime: 200, timeout: 5000, urlPattern: "/api/query" },
        42,
      ),
    );
    await Promise.resolve();
    await Promise.resolve();
    // 非匹配 URL 不影响 idle
    dbg.fire(42, "Network.requestWillBeSent", {
      requestId: "other-1",
      type: "XHR",
      request: { url: "/api/other" },
    });
    await vi.advanceTimersByTimeAsync(250);
    const resp = await p;
    expect(resp.result).toMatchObject({ idle: true, matchedRequests: 0 });
  });

  it("waitForXhrIdle with minRequests=1 refuses to idle before a matching request has started", async () => {
    const p = router.dispatch(
      mkReq(
        "page.waitForXhrIdle",
        { idleTime: 200, timeout: 3000, minRequests: 1 },
        42,
      ),
    );
    await Promise.resolve();
    await Promise.resolve();
    // idleTime 到也不应 resolve，因为 minRequests=1 没满足
    await vi.advanceTimersByTimeAsync(500);
    expect(dbg.callbacks.length).toBe(1);
    // 发起并完成 1 个 XHR，minRequests 满足后应 resolve
    dbg.fire(42, "Network.requestWillBeSent", {
      requestId: "xhr-9",
      type: "XHR",
      request: { url: "/any" },
    });
    dbg.fire(42, "Network.loadingFinished", { requestId: "xhr-9" });
    await vi.advanceTimersByTimeAsync(250);
    const resp = await p;
    expect(resp.result).toMatchObject({ idle: true, matchedRequests: 1 });
  });

  it("waitForXhrIdle TIMEOUTs when a matching XHR never finishes", async () => {
    const p = router.dispatch(
      mkReq("page.waitForXhrIdle", { idleTime: 200, timeout: 500 }, 42),
    );
    await Promise.resolve();
    await Promise.resolve();
    dbg.fire(42, "Network.requestWillBeSent", {
      requestId: "long",
      type: "Fetch",
      request: { url: "/slow" },
    });
    await vi.advanceTimersByTimeAsync(600);
    const resp = await p;
    expect(resp.error?.code).toBe(VtxErrorCode.TIMEOUT);
  });

  it("loadingFinished for a filtered-out request does not drive pending below zero", async () => {
    const p = router.dispatch(
      mkReq("page.waitForXhrIdle", { idleTime: 200, timeout: 5000 }, 42),
    );
    await Promise.resolve();
    await Promise.resolve();
    // 只 fire loadingFinished（跳过 requestWillBeSent 过滤）—— 旧实现会 pending--
    // 变成 -1 造成假 idle；新实现要求 requestId 在 tracked 里
    dbg.fire(42, "Network.loadingFinished", { requestId: "ghost" });
    // 紧接着真的发起一个 XHR 并挂起，不能因为 ghost 让 idle 误触发
    dbg.fire(42, "Network.requestWillBeSent", {
      requestId: "real",
      type: "XHR",
      request: { url: "/ok" },
    });
    await vi.advanceTimersByTimeAsync(500);
    // XHR 还挂着，不应 idle
    expect(dbg.callbacks.length).toBe(1);
    dbg.fire(42, "Network.loadingFinished", { requestId: "real" });
    await vi.advanceTimersByTimeAsync(250);
    const resp = await p;
    expect(resp.result).toMatchObject({ idle: true, matchedRequests: 1 });
  });
});
