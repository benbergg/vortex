import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ActionRouter } from "../src/lib/router.js";
import { registerConsoleHandlers } from "../src/handlers/console.js";

/**
 * F3 regression：Runtime.consoleAPICalled 的 error 级 CDP 事件，
 * 原本会同时发 legacy "console.message" + 新 "console.error"，
 * 订阅方会收到重复。修复后：error 仅走 CONSOLE_ERROR，其他级别
 * 保留 legacy console.message。
 */
describe("console handler dedup (F3)", () => {
  let router: ActionRouter;
  let nmSend: ReturnType<typeof vi.fn>;
  let dispatcherEmit: ReturnType<typeof vi.fn>;
  let cdpEventHandler: (tabId: number, method: string, params: unknown) => void;

  beforeEach(() => {
    router = new ActionRouter();
    nmSend = vi.fn();
    dispatcherEmit = vi.fn();

    const debuggerMgr = {
      onEvent: vi.fn((handler) => {
        cdpEventHandler = handler;
      }),
      enableDomain: vi.fn(),
      attach: vi.fn(),
      sendCommand: vi.fn(),
    } as unknown as Parameters<typeof registerConsoleHandlers>[1];

    const nm = { send: nmSend } as unknown as Parameters<
      typeof registerConsoleHandlers
    >[2];

    const dispatcher = { emit: dispatcherEmit } as unknown as Parameters<
      typeof registerConsoleHandlers
    >[3];

    // stub chrome.tabs.onRemoved（console.ts 需要它清缓存）
    vi.stubGlobal("chrome", {
      tabs: {
        query: vi.fn().mockResolvedValue([]),
        onRemoved: { addListener: vi.fn() },
      },
    });

    registerConsoleHandlers(router, debuggerMgr, nm, dispatcher);

    // 模拟 console 订阅：router dispatch subscribe 将 tabId 加入 subscribedTabs
    router.dispatch({
      type: "tool_request",
      tool: "console.subscribe",
      args: {},
      requestId: "r-sub",
      tabId: 42,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("🔴 F3: error-level console.log only emits CONSOLE_ERROR, not legacy console.message", () => {
    cdpEventHandler(42, "Runtime.consoleAPICalled", {
      type: "error",
      args: [{ type: "string", value: "boom" }],
    });
    expect(dispatcherEmit).toHaveBeenCalledTimes(1);
    expect(dispatcherEmit).toHaveBeenCalledWith(
      "console.error",
      expect.objectContaining({ level: "error", text: "boom" }),
      { tabId: 42 },
    );
    expect(nmSend).not.toHaveBeenCalled();
  });

  it("non-error levels still emit legacy console.message (backwards-compat)", () => {
    cdpEventHandler(42, "Runtime.consoleAPICalled", {
      type: "log",
      args: [{ type: "string", value: "hello" }],
    });
    expect(nmSend).toHaveBeenCalledTimes(1);
    expect(nmSend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "event",
        event: "console.message",
        tabId: 42,
      }),
    );
    expect(dispatcherEmit).not.toHaveBeenCalled();
  });

  it("warn level (CDP name 'warning') goes through legacy only", () => {
    cdpEventHandler(42, "Runtime.consoleAPICalled", {
      type: "warning",
      args: [{ type: "string", value: "deprecated" }],
    });
    expect(nmSend).toHaveBeenCalledTimes(1);
    expect(dispatcherEmit).not.toHaveBeenCalled();
    // level 被规范化为 "warn"
    const payload = nmSend.mock.calls[0][0] as { data: { level: string } };
    expect(payload.data.level).toBe("warn");
  });

  it("Runtime.exceptionThrown only emits CONSOLE_ERROR (no legacy duplicate)", () => {
    cdpEventHandler(42, "Runtime.exceptionThrown", {
      exceptionDetails: {
        exception: { description: "TypeError: null.foo" },
        url: "https://x/main.js",
        lineNumber: 10,
        columnNumber: 5,
      },
    });
    expect(dispatcherEmit).toHaveBeenCalledTimes(1);
    expect(dispatcherEmit).toHaveBeenCalledWith(
      "console.error",
      expect.objectContaining({
        level: "error",
        text: "TypeError: null.foo",
      }),
      { tabId: 42 },
    );
    expect(nmSend).not.toHaveBeenCalled();
  });

  it("events from unsubscribed tabs are ignored (sanity)", () => {
    cdpEventHandler(999, "Runtime.consoleAPICalled", {
      type: "error",
      args: [{ type: "string", value: "from-other-tab" }],
    });
    expect(dispatcherEmit).not.toHaveBeenCalled();
    expect(nmSend).not.toHaveBeenCalled();
  });
});
