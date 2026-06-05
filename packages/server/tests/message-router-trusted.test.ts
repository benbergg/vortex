import { describe, it, expect, vi } from "vitest";
// detectTrustedMode 跑 execSync,单测里 mock 掉,固定返回 true。
vi.mock("../src/trusted-mode.js", () => ({ detectTrustedMode: vi.fn(() => true) }));
import { MessageRouter } from "../src/message-router.js";
import type { VtxRequest } from "@vortex-browser/shared";

function mkStdout() {
  return { write: vi.fn() } as unknown as NodeJS.WritableStream;
}
function mkSessions() {
  return { getClient: () => ({ readyState: 1, send: vi.fn() }) } as any;
}
function req(id: string, action: string): VtxRequest {
  return { action, id, params: {} };
}
// writeNmMessage 先写 4 字节 header 再写 json buffer,取末次 write 解析。
function lastNmReq(stdout: NodeJS.WritableStream) {
  const calls = (stdout.write as any).mock.calls;
  return JSON.parse(calls[calls.length - 1][0].toString());
}

describe("message-router 注入 trustedMode", () => {
  it("dom.click → args.trustedMode = true", () => {
    const stdout = mkStdout();
    const router = new MessageRouter(stdout, mkSessions());
    router.setNmConnected(true);
    router.routeToExtension(req("mcp-1", "dom.click"));
    const nm = lastNmReq(stdout);
    expect(nm.tool).toBe("dom.click");
    expect(nm.args.trustedMode).toBe(true);
  });

  it("非 click(page.info)→ 不注入 trustedMode", () => {
    const stdout = mkStdout();
    const router = new MessageRouter(stdout, mkSessions());
    router.setNmConnected(true);
    router.routeToExtension(req("mcp-2", "page.info"));
    const nm = lastNmReq(stdout);
    expect(nm.args.trustedMode).toBeUndefined();
  });
});
