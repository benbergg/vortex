import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NmRequest } from "@bytenew/vortex-shared";
import { VtxErrorCode } from "@bytenew/vortex-shared";
import { ActionRouter } from "../src/lib/router.js";
import { registerDomHandlers } from "../src/handlers/dom.js";
import { COMMIT_DRIVERS, findDriver } from "../src/patterns/index.js";

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

describe("commit-drivers registry", () => {
  it("has datetime-range + date-range drivers for Element Plus", () => {
    const ids = COMMIT_DRIVERS.map((d) => d.id);
    expect(ids).toContain("element-plus-datetimerange");
    expect(ids).toContain("element-plus-daterange");
  });

  it("findDriver(kind) returns first matching driver", () => {
    const d = findDriver("datetimerange");
    expect(d?.id).toBe("element-plus-datetimerange");
  });

  it("findDriver unknown kind returns undefined", () => {
    expect(findDriver("cascader")).toBeUndefined();
    expect(findDriver("select")).toBeUndefined();
  });

  it("every driver has id/kind/closestSelector/summary", () => {
    for (const d of COMMIT_DRIVERS) {
      expect(d.id).toBeTruthy();
      expect(d.kind).toBeTruthy();
      expect(d.closestSelector).toBeTruthy();
      expect(d.summary.length).toBeGreaterThan(10);
    }
  });
});

describe("dom.commit handler (@since 0.4.0)", () => {
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

  it("returns INVALID_PARAMS when kind missing", async () => {
    const resp = await router.dispatch(
      mkReq(
        "dom.commit",
        { value: { start: "2026-01-01", end: "2026-03-31" }, selector: ".el-date-editor" },
        42,
      ),
    );
    expect(resp.error?.code).toBe(VtxErrorCode.INVALID_PARAMS);
    expect(resp.error?.message).toContain("kind");
  });

  it("returns INVALID_PARAMS when value missing", async () => {
    const resp = await router.dispatch(
      mkReq("dom.commit", { kind: "datetimerange", selector: ".el-date-editor" }, 42),
    );
    expect(resp.error?.code).toBe(VtxErrorCode.INVALID_PARAMS);
    expect(resp.error?.message).toContain("value");
  });

  it("returns INVALID_PARAMS when kind has no driver", async () => {
    const resp = await router.dispatch(
      mkReq(
        "dom.commit",
        {
          kind: "cascader",
          value: ["a", "b"],
          selector: ".el-cascader",
        },
        42,
      ),
    );
    expect(resp.error?.code).toBe(VtxErrorCode.INVALID_PARAMS);
    expect(resp.error?.message).toContain("No commit driver");
  });

  it("passes driverId + closestSelector + value into executeScript func", async () => {
    executeScript.mockResolvedValue([
      {
        result: {
          result: {
            success: true,
            driver: "element-plus-datetimerange",
            startValue: "2026-01-01 00:00:00",
            endValue: "2026-03-31 23:59:59",
          },
        },
      },
    ]);
    const resp = await router.dispatch(
      mkReq(
        "dom.commit",
        {
          kind: "datetimerange",
          value: { start: "2026-01-01", end: "2026-03-31" },
          selector: ".el-date-editor",
          timeout: 5000,
        },
        42,
      ),
    );
    expect(resp.error).toBeUndefined();
    expect(resp.result).toMatchObject({
      success: true,
      driver: "element-plus-datetimerange",
    });
    const call = executeScript.mock.calls[0][0];
    expect(call.args[0]).toBe(".el-date-editor"); // selector
    expect(call.args[1]).toBe("element-plus-datetimerange"); // driverId
    expect(call.args[2]).toBe(".el-date-editor.el-range-editor"); // closestSelector
    expect(call.args[3]).toEqual({ start: "2026-01-01", end: "2026-03-31" });
    expect(call.args[4]).toBe(5000);
  });

  it("maps page-side COMMIT_FAILED result to COMMIT_FAILED error with stage in context", async () => {
    executeScript.mockResolvedValue([
      {
        result: {
          error: "Picker did not open within timeout",
          errorCode: "COMMIT_FAILED",
          stage: "open-picker",
        },
      },
    ]);
    const resp = await router.dispatch(
      mkReq(
        "dom.commit",
        {
          kind: "datetimerange",
          value: { start: "2026-01-01", end: "2026-03-31" },
          selector: ".el-date-editor",
        },
        42,
      ),
    );
    expect(resp.error?.code).toBe(VtxErrorCode.COMMIT_FAILED);
    expect(resp.error?.context?.extras).toMatchObject({
      driverId: "element-plus-datetimerange",
      stage: "open-picker",
    });
  });

  it("maps page-side UNSUPPORTED_TARGET (closest mismatch) to UNSUPPORTED_TARGET", async () => {
    executeScript.mockResolvedValue([
      {
        result: {
          error: 'Target does not match driver closestSelector ".el-date-editor.el-range-editor"',
          errorCode: "UNSUPPORTED_TARGET",
          extras: { driverId: "element-plus-datetimerange" },
        },
      },
    ]);
    const resp = await router.dispatch(
      mkReq(
        "dom.commit",
        {
          kind: "datetimerange",
          value: { start: "2026-01-01", end: "2026-03-31" },
          selector: "button.unrelated",
        },
        42,
      ),
    );
    expect(resp.error?.code).toBe(VtxErrorCode.UNSUPPORTED_TARGET);
  });

  it("maps ELEMENT_NOT_FOUND correctly", async () => {
    executeScript.mockResolvedValue([
      {
        result: {
          error: "Element not found: .missing",
          errorCode: "ELEMENT_NOT_FOUND",
        },
      },
    ]);
    const resp = await router.dispatch(
      mkReq(
        "dom.commit",
        {
          kind: "datetimerange",
          value: { start: "2026-01-01", end: "2026-03-31" },
          selector: ".missing",
        },
        42,
      ),
    );
    expect(resp.error?.code).toBe(VtxErrorCode.ELEMENT_NOT_FOUND);
  });
});
