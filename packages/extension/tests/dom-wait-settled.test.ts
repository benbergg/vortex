import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NmRequest } from "@bytenew/vortex-shared";
import { VtxErrorCode } from "@bytenew/vortex-shared";
import { ActionRouter } from "../src/lib/router.js";
import { registerDomHandlers } from "../src/handlers/dom.js";

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
  return {
    attach: vi.fn().mockResolvedValue(undefined),
    sendCommand: vi.fn(),
    onEvent: vi.fn(),
    offEvent: vi.fn(),
    isAttached: vi.fn().mockReturnValue(true),
    enableDomain: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe("dom.waitSettled (@since 0.4.0)", () => {
  let router: ActionRouter;
  let executeScript: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.unstubAllGlobals();
    router = new ActionRouter();
    executeScript = vi.fn();
    vi.stubGlobal("chrome", {
      tabs: { query: vi.fn().mockResolvedValue([{ id: 42 }]) },
      scripting: { executeScript },
    });
    registerDomHandlers(router, makeDebuggerMock());
  });

  it("returns settled result from page func", async () => {
    executeScript.mockResolvedValue([
      { result: { result: { settled: true, waitedMs: 320, mutationsSeen: 0 } } },
    ]);
    const resp = await router.dispatch(
      mkReq("dom.waitSettled", { quietMs: 300, timeout: 8000 }, 42),
    );
    expect(resp.error).toBeUndefined();
    expect(resp.result).toEqual({ settled: true, waitedMs: 320, mutationsSeen: 0 });
  });

  it("passes null selector to page func when selector omitted (default = document.body)", async () => {
    executeScript.mockResolvedValue([
      { result: { result: { settled: true, waitedMs: 300, mutationsSeen: 0 } } },
    ]);
    await router.dispatch(mkReq("dom.waitSettled", {}, 42));
    expect(executeScript).toHaveBeenCalledTimes(1);
    const call = executeScript.mock.calls[0][0];
    expect(call.args[0]).toBeNull(); // selector arg
    expect(call.args[1]).toBe(300); // default quietMs
    expect(call.args[2]).toBe(8000); // default timeout
  });

  it("passes selector through when provided", async () => {
    executeScript.mockResolvedValue([
      { result: { result: { settled: true, waitedMs: 500, mutationsSeen: 2 } } },
    ]);
    await router.dispatch(
      mkReq(
        "dom.waitSettled",
        { selector: ".evaluation-list", quietMs: 400, timeout: 5000 },
        42,
      ),
    );
    const call = executeScript.mock.calls[0][0];
    expect(call.args).toEqual([".evaluation-list", 400, 5000]);
  });

  it("maps 'DOM did not settle...' error to TIMEOUT", async () => {
    executeScript.mockResolvedValue([
      { result: { error: "DOM did not settle within 5000ms (42 mutations observed)" } },
    ]);
    const resp = await router.dispatch(
      mkReq("dom.waitSettled", { selector: "#root", timeout: 5000 }, 42),
    );
    expect(resp.error?.code).toBe(VtxErrorCode.TIMEOUT);
    expect(resp.error?.message).toContain("42 mutations observed");
  });

  it("maps 'Element not found:' error to ELEMENT_NOT_FOUND", async () => {
    executeScript.mockResolvedValue([
      { result: { error: "Element not found: #missing" } },
    ]);
    const resp = await router.dispatch(
      mkReq("dom.waitSettled", { selector: "#missing" }, 42),
    );
    expect(resp.error?.code).toBe(VtxErrorCode.ELEMENT_NOT_FOUND);
  });

  it("maps 'document.body not found' error to ELEMENT_NOT_FOUND", async () => {
    executeScript.mockResolvedValue([
      { result: { error: "document.body not found" } },
    ]);
    const resp = await router.dispatch(mkReq("dom.waitSettled", {}, 42));
    expect(resp.error?.code).toBe(VtxErrorCode.ELEMENT_NOT_FOUND);
  });

  it("maps arbitrary errors to JS_EXECUTION_ERROR", async () => {
    executeScript.mockResolvedValue([
      { result: { error: "random runtime blowup" } },
    ]);
    const resp = await router.dispatch(mkReq("dom.waitSettled", {}, 42));
    expect(resp.error?.code).toBe(VtxErrorCode.JS_EXECUTION_ERROR);
  });
});
