import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NmRequest } from "@bytenew/vortex-shared";
import { ActionRouter } from "../src/lib/router.js";
import { registerDiagnosticsHandlers } from "../src/handlers/diagnostics.js";
import { registerTabHandlers } from "../src/handlers/tab.js";

function mkReq(tool: string): NmRequest {
  return {
    type: "tool_request",
    tool,
    args: {},
    requestId: "r-1",
  };
}

describe("diagnostics.version handler (@since 0.4.0)", () => {
  let router: ActionRouter;

  beforeEach(() => {
    vi.unstubAllGlobals();
    router = new ActionRouter();
    vi.stubGlobal("chrome", {
      tabs: {
        query: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
        get: vi.fn(),
      },
      windows: { update: vi.fn() },
    });
    // register more than diagnostics so actionCount > 1
    registerTabHandlers(router);
    registerDiagnosticsHandlers(router);
  });

  it("returns extensionVersion (may be 'unknown' in test env)", async () => {
    const resp = await router.dispatch(mkReq("diagnostics.version"));
    expect(resp.error).toBeUndefined();
    const r = resp.result as {
      extensionVersion: string;
      actionCount: number;
      actions: string[];
    };
    expect(typeof r.extensionVersion).toBe("string");
    expect(r.extensionVersion.length).toBeGreaterThan(0);
  });

  it("reports actionCount > 0 and actions are sorted", async () => {
    const resp = await router.dispatch(mkReq("diagnostics.version"));
    const r = resp.result as { actionCount: number; actions: string[] };
    expect(r.actionCount).toBeGreaterThan(0);
    expect(r.actions).toEqual([...r.actions].sort());
    // diagnostics.version should be in the registered list
    expect(r.actions).toContain("diagnostics.version");
    expect(r.actions).toContain("tab.list");
  });

  it("includes tab.* actions after tab handlers registered", async () => {
    const resp = await router.dispatch(mkReq("diagnostics.version"));
    const r = resp.result as { actions: string[] };
    expect(r.actions.filter((a) => a.startsWith("tab.")).length).toBeGreaterThanOrEqual(3);
  });
});
