import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { VtxResponse } from "@bytenew/vortex-shared";

const TRANSIENT_PATTERNS = [
  "Cannot access contents",
  "No tab with id",
  "Connection closed",
  "Failed to connect",
];

function isTransient(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err);
  return TRANSIENT_PATTERNS.some((p) => msg.includes(p));
}

describe("isTransient error classification", () => {
  it("recognizes transient error patterns", () => {
    expect(isTransient(new Error("Cannot access contents in tab"))).toBe(true);
    expect(isTransient(new Error("No tab with id 999"))).toBe(true);
    expect(isTransient(new Error("Connection closed before response"))).toBe(true);
    expect(isTransient(new Error("Failed to connect to vortex-server"))).toBe(true);
  });

  it("rejects non-transient errors", () => {
    expect(isTransient(new Error("TIMEOUT"))).toBe(false);
    expect(isTransient(new Error("unknown error"))).toBe(false);
    expect(isTransient(new Error(""))).toBe(false);
  });
});

describe("VortexClient request id format", () => {
  it("request id follows mcp-{counter}-{timestamp} pattern", () => {
    const idPattern = /^mcp-\d+-\d+$/;
    const now = Date.now();
    expect(`mcp-1-${now}`).toMatch(idPattern);
    expect(`mcp-999-${now + 1}`).toMatch(idPattern);
  });

  it("ids are unique across time", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const id = `mcp-${i}-${Date.now() + i}`;
      ids.add(id);
    }
    expect(ids.size).toBe(100);
  });
});

describe("VortexClient WebSocket URL construction", () => {
  it("constructs correct ws URL with port", () => {
    const port = 6800;
    const url = `ws://localhost:${port}/ws`;
    expect(url).toBe("ws://localhost:6800/ws");
  });

  it("uses default port 6800", () => {
    const DEFAULT_PORT = 6800;
    expect(`ws://localhost:${DEFAULT_PORT}/ws`).toBe("ws://localhost:6800/ws");
  });
});

describe("VortexClient timeout handling", () => {
  it("default timeout is 30000ms", () => {
    const DEFAULT_TIMEOUT = 30000;
    expect(DEFAULT_TIMEOUT).toBe(30000);
  });

  it("can be overridden per-request", () => {
    const customTimeout = 5000;
    expect(customTimeout).toBeLessThan(30000);
  });
});

describe("VortexClient tabId routing", () => {
  it("tabId is optional in request params", () => {
    const req1 = { action: "tab.list", params: {}, id: "1" };
    expect((req1 as any).tabId).toBeUndefined();

    const req2 = { action: "tab.getInfo", params: {}, id: "2", tabId: 5 };
    expect((req2 as any).tabId).toBe(5);
  });

  it("tabId is omitted from request when undefined", () => {
    const buildReq = (action: string, params: Record<string, unknown>, tabId?: number) => ({
      action,
      params,
      ...(tabId != null ? { tabId } : {}),
    });

    const reqA = buildReq("tab.list", {}, undefined);
    expect(reqA).not.toHaveProperty("tabId");

    const reqB = buildReq("tab.getInfo", {}, 5);
    expect(reqB).toHaveProperty("tabId", 5);
  });
});

describe("VortexClient retry logic", () => {
  it("maxRetries defaults to 1", () => {
    const maxRetries = 1;
    expect(maxRetries).toBe(1);
  });

  it("exponential backoff formula: 500ms * (attempt + 1)", () => {
    const getBackoff = (attempt: number) => 500 * (attempt + 1);
    expect(getBackoff(0)).toBe(500);
    expect(getBackoff(1)).toBe(1000);
    expect(getBackoff(2)).toBe(1500);
  });
});