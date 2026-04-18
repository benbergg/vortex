import { describe, it, expect } from "vitest";
import { VtxError, VtxErrorCode } from "@bytenew/vortex-shared";
import { vtxError } from "@bytenew/vortex-shared";
import { ActionRouter } from "../src/lib/router.js";
import type { NmRequest } from "@bytenew/vortex-shared";

function mkReq(tool: string, args: Record<string, unknown> = {}): NmRequest {
  return {
    type: "tool_request",
    tool,
    args,
    requestId: "r-test-1",
  };
}

describe("ActionRouter.dispatch", () => {
  it("returns UNKNOWN_ACTION for unregistered tool", async () => {
    const router = new ActionRouter();
    const resp = await router.dispatch(mkReq("nonexistent.action"));
    expect(resp.error?.code).toBe(VtxErrorCode.UNKNOWN_ACTION);
  });

  it("forwards handler result on success", async () => {
    const router = new ActionRouter();
    router.register("foo.bar", async () => ({ ok: true, n: 42 }));
    const resp = await router.dispatch(mkReq("foo.bar"));
    expect(resp.result).toEqual({ ok: true, n: 42 });
    expect(resp.error).toBeUndefined();
  });

  it("🔴 REGRESSION: VtxError from handler preserves full payload (code/hint/context)", async () => {
    const router = new ActionRouter();
    router.register("dom.click", async () => {
      throw vtxError(
        VtxErrorCode.ELEMENT_NOT_FOUND,
        "Element not found: .missing",
        { selector: ".missing" },
      );
    });
    const resp = await router.dispatch(mkReq("dom.click"));
    expect(resp.error?.code).toBe(VtxErrorCode.ELEMENT_NOT_FOUND);
    expect(resp.error?.message).toBe("Element not found: .missing");
    // hint 来自 DEFAULT_ERROR_META
    expect(resp.error?.hint).toBeTruthy();
    expect(resp.error?.recoverable).toBe(true);
    expect(resp.error?.context).toEqual({ selector: ".missing" });
  });

  it("preserves OCCLUDED error code and extras.blocker", async () => {
    const router = new ActionRouter();
    router.register("dom.click", async () => {
      throw vtxError(
        VtxErrorCode.ELEMENT_OCCLUDED,
        "covered by modal",
        { selector: "#btn", extras: { blocker: "div.modal-overlay" } },
      );
    });
    const resp = await router.dispatch(mkReq("dom.click"));
    expect(resp.error?.code).toBe(VtxErrorCode.ELEMENT_OCCLUDED);
    expect(resp.error?.context).toEqual({
      selector: "#btn",
      extras: { blocker: "div.modal-overlay" },
    });
  });

  it("raw VtxError (no extra) still serializes minimal payload", async () => {
    const router = new ActionRouter();
    router.register("some.action", async () => {
      throw new VtxError(VtxErrorCode.TIMEOUT, "waited too long");
    });
    const resp = await router.dispatch(mkReq("some.action"));
    expect(resp.error).toEqual({
      code: VtxErrorCode.TIMEOUT,
      message: "waited too long",
    });
  });

  describe("non-VtxError fallback (legacy code paths)", () => {
    it("plain Error with 'No tab' → TAB_NOT_FOUND", async () => {
      const router = new ActionRouter();
      router.register("x", async () => {
        throw new Error("No tab with id 42");
      });
      const resp = await router.dispatch(mkReq("x"));
      expect(resp.error?.code).toBe(VtxErrorCode.TAB_NOT_FOUND);
    });

    it("plain Error with 'Cannot access' → PERMISSION_DENIED", async () => {
      const router = new ActionRouter();
      router.register("x", async () => {
        throw new Error("Cannot access chrome:// URL");
      });
      const resp = await router.dispatch(mkReq("x"));
      expect(resp.error?.code).toBe(VtxErrorCode.PERMISSION_DENIED);
    });

    it("unrecognized plain Error → JS_EXECUTION_ERROR", async () => {
      const router = new ActionRouter();
      router.register("x", async () => {
        throw new Error("something weird broke");
      });
      const resp = await router.dispatch(mkReq("x"));
      expect(resp.error?.code).toBe(VtxErrorCode.JS_EXECUTION_ERROR);
    });

    it("thrown non-Error value is stringified", async () => {
      const router = new ActionRouter();
      router.register("x", async () => {
        throw "string error"; // eslint-disable-line no-throw-literal
      });
      const resp = await router.dispatch(mkReq("x"));
      expect(resp.error?.code).toBe(VtxErrorCode.JS_EXECUTION_ERROR);
      expect(resp.error?.message).toBe("string error");
    });
  });
});
