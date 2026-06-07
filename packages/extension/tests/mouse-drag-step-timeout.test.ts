import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ActionRouter } from "../src/lib/router.js";
import { registerMouseHandlers } from "../src/handlers/mouse.js";

/**
 * VORTEX_FEEDBACK v3.4 BUG-007: vortex_mouse_drag 步数大 timeout + 错误信息误导
 * 根因:page.ts:358 stepDelay=10ms 累积耗时 + 22 个 CDP 命令 round-trip 在 MV3 messageChannel
 * 上累计 > 30s。mcp 端 timeout 错误信息 hardcode 通用提示,不论真实原因。
 *
 * 修复:
 *   - stepDelay 默认 10 → 0(允许 LLM 显式 opt-in 慢速,适配 HTML5 DnD 库)
 *   - 加 stepDelay 参数让 LLM 微调
 *
 * 关键守卫:
 *   - 步数 20 在合理 timeout 内完成
 *   - 默认 stepDelay 0
 *   - 显式 stepDelay 慢路径仍工作
 */

interface NmRequest {
  type: "tool_request";
  tool: string;
  args: Record<string, unknown>;
  requestId: string;
  tabId: number;
}

function mkReq(tool: string, args: Record<string, unknown> = {}, tabId = 42): NmRequest {
  return { type: "tool_request", tool, args, requestId: "r-1", tabId };
}

describe("vortex_mouse_drag stepDelay (BUG-007)", () => {
  let router: ActionRouter;
  let sendCommand: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.unstubAllGlobals();
    router = new ActionRouter();
    sendCommand = vi.fn().mockResolvedValue({});
    vi.stubGlobal("chrome", {
      tabs: { query: vi.fn().mockResolvedValue([{ id: 42 }]) },
      debugger: {
        attach: vi.fn().mockResolvedValue(undefined),
        sendCommand,
        onEvent: { addListener: vi.fn(), removeListener: vi.fn() },
        onDetach: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      runtime: { getManifest: vi.fn().mockReturnValue({ host_permissions: ["<all_urls>"] }) },
    });
    registerMouseHandlers(router, {
      attach: vi.fn().mockResolvedValue(undefined),
      sendCommand,
      onEvent: vi.fn(),
      offEvent: vi.fn(),
      isAttached: vi.fn().mockReturnValue(false),
      getAttachedTabs: vi.fn().mockReturnValue([]),
      enableDomain: vi.fn().mockResolvedValue(undefined),
      disableDomain: vi.fn().mockResolvedValue(undefined),
    } as any);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("steps=20 默认 stepDelay=0 → < 2s 完成 (非 30s timeout)", async () => {
    const start = Date.now();
    const r = await router.dispatch(mkReq("mouse.drag", { fromX: 700, fromY: 400, toX: 700, toY: 500, steps: 20 })) as
      { result?: { success?: boolean; steps?: number } };
    const elapsed = Date.now() - start;
    expect(r.result?.success).toBe(true);
    expect(r.result?.steps).toBe(20);
    expect(elapsed).toBeLessThan(2000);
  });

  it("steps=30 不传 stepDelay → 默认 0 → < 3s 完成", async () => {
    const start = Date.now();
    const r = await router.dispatch(mkReq("mouse.drag", { fromX: 0, fromY: 0, toX: 100, toY: 100, steps: 30 })) as
      { result?: { success?: boolean } };
    const elapsed = Date.now() - start;
    expect(r.result?.success).toBe(true);
    expect(elapsed).toBeLessThan(3000);
  });

  it("显式 stepDelay=50 (5 步) → 至少 250ms 走慢路径 (DnD 兼容)", async () => {
    const start = Date.now();
    const r = await router.dispatch(mkReq("mouse.drag", { fromX: 0, fromY: 0, toX: 100, toY: 100, steps: 5, stepDelay: 50 })) as
      { result?: { success?: boolean } };
    const elapsed = Date.now() - start;
    expect(r.result?.success).toBe(true);
    expect(elapsed).toBeGreaterThan(200);  // 5 × 50ms = 250ms - 漂移
  });

  // BUG-007 根因修复:快路径(stepDelay=0)的中间 move 不再逐个串行 await round-trip,
  // 而是流水线化(Promise.all,CDP 单 session 保序)。真 Chrome 上 round-trip 非 0 时,
  // 串行 = N×RTT(steps=30+ 撞 30s mcp timeout),流水线 = ~1×RTT。
  // mock 每条命令 15ms RTT:串行 (40+3)×15≈645ms,流水线 press/move/release ~3×RTT≈45ms。
  it("steps=40 stepDelay=0 → 流水线化:总耗时 ≈ 单次 RTT 而非 N×RTT", async () => {
    sendCommand.mockImplementation(() => new Promise((r) => setTimeout(() => r({}), 15)));
    const start = Date.now();
    const r = await router.dispatch(mkReq("mouse.drag", { fromX: 0, fromY: 0, toX: 400, toY: 400, steps: 40 })) as
      { result?: { success?: boolean } };
    const elapsed = Date.now() - start;
    expect(r.result?.success).toBe(true);
    expect(elapsed).toBeLessThan(200);  // 串行会 ~645ms → 此断言现失败,流水线后通过
  });

  it("流水线化仍保中间 move 坐标递进顺序", async () => {
    await router.dispatch(mkReq("mouse.drag", { fromX: 0, fromY: 0, toX: 100, toY: 0, steps: 10 }));
    // 提取所有 mouseMoved 的 x(跳过初始 hover move),应单调递增
    const moveXs = sendCommand.mock.calls
      .filter((c) => c[1] === "Input.dispatchMouseEvent" && (c[2] as { type: string }).type === "mouseMoved")
      .map((c) => (c[2] as { x: number }).x);
    // 首个是 hover 到起点(x=0),其后 10 步递进到 100
    const dragXs = moveXs.slice(1);
    for (let i = 1; i < dragXs.length; i++) {
      expect(dragXs[i]).toBeGreaterThanOrEqual(dragXs[i - 1]);
    }
    expect(dragXs[dragXs.length - 1]).toBe(100);
  });
});
