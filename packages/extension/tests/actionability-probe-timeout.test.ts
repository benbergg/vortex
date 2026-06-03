// 回归锁:actionability 探针 executeScript 加界(2026-06-03 press-combo flake 调查)。
//
// 根因:waitActionable 的 5000ms 预算只在 while 循环**顶部**检查;若某轮
// checkActionability 的探针 executeScript 在坏 SW/tab 态下**永不 settle**
// (chrome.scripting.executeScript 已知病:既不 resolve 也不 reject),那个 await
// 永不返回 → 循环回不到预算检查 → dom.click 挂到外层 30s MCP 超时(observe 走裸
// executeScript({func}) 无门故健康,dom.* 全挂)。loader 的 2026-06-02 修复只给
// **模块注入**加了界(INJECT_TIMEOUT_MS),**探针调用(pageQuery)没加**。
//
// 修复:pageQuery 加可选 timeoutMs 把无界 await 转成有界 reject;checkActionability
// 探针超时 → 映射可重试 NOT_ATTACHED → waitActionable 预算内复查 → 抛**有界 TIMEOUT**。

import { describe, it, expect, afterEach, vi } from "vitest";
import { setupActionabilityEnv } from "./helpers/actionability-test-setup.js";

vi.mock("../src/adapter/page-side-loader.js", () => ({
  loadPageSideModule: async () => {},
  _resetPageSideLoader: () => {},
}));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("pageQuery 探针 executeScript 加界(press-combo wedge 修复)", () => {
  it("带 timeoutMs:executeScript 永不 settle 时在 timeoutMs 后有界 reject", async () => {
    vi.useFakeTimers();
    vi.resetModules();
    // executeScript 永不 settle(模拟坏 tab 态)
    (globalThis as any).chrome = {
      scripting: { executeScript: () => new Promise(() => {}) },
    };
    const { pageQuery } = await import("../src/adapter/native.js");

    let caught: unknown;
    const p = pageQuery(1, undefined, () => 1, [], 2000).catch((e) => {
      caught = e;
    });
    await vi.advanceTimersByTimeAsync(2100);
    await p;

    expect(String((caught as Error)?.message)).toMatch(/timed out after 2000ms/);
  });

  it("不传 timeoutMs:行为不变(executeScript settle 即返回,不引入超时)", async () => {
    (globalThis as any).chrome = {
      scripting: { executeScript: async () => [{ result: 42 }] },
    };
    const { pageQuery } = await import("../src/adapter/native.js");
    const r = await pageQuery<number>(1, undefined, () => 42, []);
    expect(r).toBe(42);
  });
});

describe("waitActionable wedge 恢复:探针永不 settle → 有界 TIMEOUT(非 30s 静默挂)", () => {
  it("探针 executeScript 永不 settle 时,waitActionable 在预算内抛 TIMEOUT 而非挂死", async () => {
    vi.useFakeTimers();
    vi.resetModules();

    // setup jsdom + chrome mock,再覆写 executeScript 为「func 调用永不 settle」
    setupActionabilityEnv({ html: '<button id="btn">Click</button>' });
    (globalThis as any).chrome.scripting.executeScript = (callOpts: any) => {
      if (typeof callOpts.func === "function") return new Promise(() => {}); // wedge
      return Promise.resolve([{}]); // files-based no-op
    };

    await import("../src/page-side/actionability.js");
    const { waitActionable } = await import("../src/action/auto-wait.js");

    let caught: unknown;
    const waitPromise = waitActionable(1, undefined, "#btn", { timeout: 5000 }).catch(
      (err) => {
        caught = err;
      },
    );
    // 推进超过预算:每次探针在 PROBE_TIMEOUT_MS 后超时→NOT_ATTACHED→重试,
    // 直到 5000ms 预算耗尽抛 TIMEOUT。给足余量。
    await vi.advanceTimersByTimeAsync(8000);
    await waitPromise;

    expect(caught).toMatchObject({
      code: "TIMEOUT",
      extra: expect.objectContaining({
        context: expect.objectContaining({
          extras: expect.objectContaining({ lastReason: "NOT_ATTACHED" }),
        }),
      }),
    });
  });
});
