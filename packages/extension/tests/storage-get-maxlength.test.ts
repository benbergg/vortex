import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ActionRouter } from "../src/lib/router.js";
import { registerStorageHandlers } from "../src/handlers/storage.js";

/**
 * VORTEX_FEEDBACK v3.4 BUG-002: vortex_storage get 单大 key 无 maxLength 截断
 * 根因:storage.ts GET_LOCAL_STORAGE handler 无 maxLength 校验,单大 key (淘宝 5 个 >90KB)
 * 100% 截断无 trailer。
 *
 * 修复:对齐 B3-7 (extract maxLength) — 加 maxLength 参数(默认 10KB),超长走
 * truncateWithTextTrailer。
 *
 * 关键守卫:
 *   - handler 真注入测试 + stub localStorage 真跑
 *   - 不传 maxLength 默认 10KB 截断
 *   - trailer 完整 + 引导用户用 list-keys
 *   - 小值不截断
 */

interface NmRequest {
  type: "tool_request";
  tool: string;
  args: Record<string, unknown>;
  requestId: string;
  tabId: number;
}

class StubStorage implements Storage {
  private store: Record<string, string>;
  length: number = 0;
  constructor(init: Record<string, string>) {
    this.store = { ...init };
    this.length = Object.keys(init).length;
  }
  key(i: number): string | null { return Object.keys(this.store)[i] ?? null; }
  getItem(k: string): string | null { return this.store[k] ?? null; }
  setItem(k: string, v: string): void { this.store[k] = v; this.length = Object.keys(this.store).length; }
  removeItem(k: string): void { delete this.store[k]; this.length = Object.keys(this.store).length; }
  clear(): void { this.store = {}; this.length = 0; }
}

function mkReq(tool: string, args: Record<string, unknown> = {}, tabId = 42): NmRequest {
  return { type: "tool_request", tool, args, requestId: "r-1", tabId };
}

describe("GET_LOCAL_STORAGE maxLength — BUG-002", () => {
  let router: ActionRouter;
  let executeScript: ReturnType<typeof vi.fn>;
  let stubStore: StubStorage;

  beforeEach(() => {
    vi.unstubAllGlobals();
    stubStore = new StubStorage({ small: "x", big: "y".repeat(20000) });
    vi.stubGlobal("localStorage", stubStore);
    router = new ActionRouter();
    executeScript = vi.fn();
    vi.stubGlobal("chrome", {
      tabs: { query: vi.fn().mockResolvedValue([{ id: 42 }]) },
      webNavigation: {
        getAllFrames: vi.fn().mockResolvedValue([
          { frameId: 0, parentFrameId: -1, url: "https://x/" },
        ]),
      },
      scripting: { executeScript },
      runtime: { getManifest: vi.fn().mockReturnValue({ host_permissions: ["<all_urls>"] }) },
    });
    registerStorageHandlers(router);
  });
  afterEach(() => vi.unstubAllGlobals());

  async function captureFunc(): Promise<(k: string | null, m: any, ml?: number) => Promise<{ result?: unknown; error?: string }>> {
    executeScript.mockResolvedValue([{ result: { result: null } }]);
    await router.dispatch(mkReq("storage.getLocalStorage", {}, 42));
    const fn = executeScript.mock.calls[0][0].func;
    executeScript.mockClear();
    return fn;
  }

  it("传 key='big' + maxLength=100 → 截断 + trailer (原 BUG-002)", async () => {
    const fn = await captureFunc();
    const out = await fn("big", null, 100);
    // trailer 在末尾,内容是 'y' * 100 + trailer
    expect(out.result).toMatch(/^y{100}\n\n\[VORTEX_TRUNCATED original=20000 limit=100\]/);
  });

  it("传 key='small' + 不传 maxLength → 返完整 (≤ 10KB 默认)", async () => {
    const fn = await captureFunc();
    const out = await fn("small", null, undefined);
    expect(out.result).toBe("x");
  });

  it("传 key='big' + 不传 maxLength → 默认 10KB 截断 + trailer", async () => {
    const fn = await captureFunc();
    const out = await fn("big", null, undefined);
    // 10240 chars + trailer (~80 chars)
    expect((out.result as string).length).toBeLessThanOrEqual(10240 + 200);
    expect(out.result).toMatch(/\[VORTEX_TRUNCATED original=20000 limit=10240\]/);
  });

  it("传 key='small' + maxLength=10000 → 返完整(未超 10KB)", async () => {
    const fn = await captureFunc();
    const out = await fn("small", null, 10000);
    expect(out.result).toBe("x");
  });

  it("maxLength=0 或负数 → handler 抛 INVALID_PARAMS (tool_response.error)", async () => {
    const out1 = await router.dispatch(
      mkReq("storage.getLocalStorage", { key: "small", maxLength: 0 }, 42),
    ) as { error?: { code: string; message: string } };
    expect(out1.error?.code).toBe("INVALID_PARAMS");
    expect(out1.error?.message).toMatch(/maxLength/i);

    const out2 = await router.dispatch(
      mkReq("storage.getLocalStorage", { key: "small", maxLength: -1 }, 42),
    ) as { error?: { code: string; message: string } };
    expect(out2.error?.code).toBe("INVALID_PARAMS");
  });

  it("list-all 模式 + maxLength 不影响 keys 数组(只截断 values)", async () => {
    const fn = await captureFunc();
    const out = await fn(null, "all", 50);
    expect(out.result).toMatchObject({
      keys: expect.any(Array),
      totalKeys: 2,
    });
    const r = out.result as { values: Record<string, string> };
    // values.big 应被截断
    expect(r.values.big).toMatch(/\[VORTEX_TRUNCATED original=20000 limit=50\]/);
    expect(r.values.small).toBe("x");
  });
});
