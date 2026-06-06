import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { NmRequest } from "@vortex-browser/shared";
import { truncateWithTextTrailer } from "../src/lib/truncate.js";
import { ActionRouter } from "../src/lib/router.js";
import { registerContentHandlers } from "../src/handlers/content.js";

/**
 * TDD: vortex_extract 加 maxLength 截断参数 (B3-7, v3.1 P2).
 *
 * Background: content.ts GET_TEXT 已有 maxBytes (默认 128KB) 截断 (line 224-235),
 * 走 truncateWithTextTrailer。但默认 128KB 实际≈无限, 淘宝首页 innerText 就 ~5KB,
 * 大页面 100KB 也不截 → token 成本爆表.
 *
 * 现状与 v3.1 §9 文档差异:
 *   - 文档说"handler 无 resultText 变量": 错, handler 已用 truncateWithTextTrailer(obj.text,...)
 *   - 文档说"无 maxLength 限制": 错, 已有 maxBytes 但默认偏大
 *   - 文档说"落点须进 page-side func": 不必要, handler 截断已正确
 *
 * 实施: 新加 maxLength (char count, 默认 10KB = 10240) 作为更紧的"默认".
 * 优先级 maxLength > maxBytes. truncate 仍用 truncateWithTextTrailer (已 100% 正确).
 * 真测 truncateWithTextTrailer 喂真实字符串断言截断行为 (v3.1 复核要求).
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_SRC = readFileSync(
  join(__dirname, "..", "src", "handlers", "content.ts"),
  "utf8",
);

describe("vortex_extract maxLength 截断 (B3-7, v3.1) - handler 改动", () => {
  it("handler 读 args.maxLength 并默认 10240 (10KB)", () => {
    // maxLength 存在且默认 10240
    expect(CONTENT_SRC).toMatch(/maxLength\s*=.*args\.maxLength/);
    // 兼容两种写法: const maxLength = X ?? 10240  或  const x = X ?? 10240 (含 type cast)
    expect(CONTENT_SRC).toMatch(/args\.maxLength[\s\S]{0,80}\?\?[\s\S]{0,5}10240/);
  });

  it("maxLength 优先于 maxBytes (B3-7 设计)", () => {
    // 优先级: maxLength > maxBytes (用 ?? 链路)
    expect(CONTENT_SRC).toMatch(/args\.maxLength[\s\S]{0,150}\?\?[\s\S]{0,20}maxBytes/);
  });

  it("保留向后兼容的 maxBytes 字段 (回归保护)", () => {
    // 旧契约 maxBytes 仍工作
    expect(CONTENT_SRC).toMatch(/maxBytes/);
  });
});

describe("truncateWithTextTrailer 纯函数真测 (B3-7 复核要求)", () => {
  it("text.length <= limit 返回原文本不变 (无 trailer)", () => {
    const r = truncateWithTextTrailer("hello", 100);
    expect(r).toBe("hello");
  });

  it("text.length > limit 截断 + 加 [VORTEX_TRUNCATED] trailer (总长 > limit)", () => {
    const text = "a".repeat(200);
    const r = truncateWithTextTrailer(text, 100);
    // 实际行为: 截断到 100 + trailer (~160 chars) = 总 ~260 chars
    expect(r.length).toBeGreaterThan(text.length);  // 截断反而更长, 因 trailer
    expect(r).toMatch(/^\s*a{100}/);  // 开头是 100 个 a
    expect(r).toMatch(/\[VORTEX_TRUNCATED original=200 limit=100\]/);
  });

  it("默认 maxLength 10240 截断大页面: 50KB 文本截到 ~10KB+trailer (~10.2KB)", () => {
    const text = "x".repeat(50000);
    const limit = 10240;  // B3-7 默认
    const r = truncateWithTextTrailer(text, limit);
    // trailer ~150 chars, 总 ~10400 chars (限 10500)
    expect(r.length).toBeLessThan(limit + 250);
    expect(r.length).toBeGreaterThan(limit);
    expect(r).toMatch(/\[VORTEX_TRUNCATED original=50000 limit=10240\]/);
  });

  it("边界: limit=0 截到空 + trailer (trailer 仍加, 0 字符截断)", () => {
    const r = truncateWithTextTrailer("hello", 0);
    expect(r).toMatch(/\[VORTEX_TRUNCATED/);
    expect(r).not.toMatch(/^[a-z]/);  // 不应以 "hello" 开头
  });

  it("maxBytes 显式 128KB 时放宽: 100KB 文本不截断", () => {
    // 显式传 maxBytes=131072 时, 100KB 文本不应截断(向后兼容)
    const text = "z".repeat(100 * 1024);
    const r = truncateWithTextTrailer(text, 131072);  // 128KB
    expect(r).toBe(text);  // 不超限, 不截断
  });
});

/**
 * handler 真实行为测试(填补 v3.1 复核盲点):mock executeScript 返回超长串,
 * 经 router 走真实 GET_TEXT handler, 断言"默认/override"的实际截断行为。
 * 这能抓住此前的死代码缺陷——effectiveLimit 误读 args.maxLength ?? maxBytes(128KB),
 * 导致省略 maxLength 时默认 10KB 从未生效(纯函数/regex 测试都抓不到)。
 */
function mkReq(tool: string, args: Record<string, unknown> = {}, tabId = 42): NmRequest {
  return { type: "tool_request", tool, args, requestId: "r-1", tabId };
}

describe("vortex_extract maxLength handler 真实行为 (B3-7, v3.1 复核)", () => {
  let router: ActionRouter;
  // 区分两类 executeScript 调用: loadPageSideModule 用 files(忽略返回), GET_TEXT 用 func+args
  function stubChrome(longText: string) {
    const executeScript = vi.fn().mockImplementation((opts: Record<string, unknown>) => {
      if (Array.isArray((opts as { files?: unknown }).files)) return Promise.resolve([]);
      return Promise.resolve([{ result: { result: longText } }]);
    });
    vi.stubGlobal("chrome", {
      tabs: { query: vi.fn().mockResolvedValue([{ id: 42, active: true }]) },
      scripting: { executeScript },
    });
  }

  beforeEach(() => {
    router = new ActionRouter();
    registerContentHandlers(router);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("省略 maxLength → 默认截到 10240 (此前死代码 bug: 误用 128KB)", async () => {
    stubChrome("a".repeat(50000));
    const resp = await router.dispatch(mkReq("content.getText", {}));
    expect(resp.error).toBeUndefined();
    const out = resp.result as string;
    // 截到 10240 + trailer(~150), 远小于原 50000; 含截断标记 limit=10240
    expect(out.length).toBeLessThan(10240 + 300);
    expect(out).toMatch(/\[VORTEX_TRUNCATED original=50000 limit=10240\]/);
  });

  it("显式 maxLength=1024 → 截到 1024", async () => {
    stubChrome("b".repeat(50000));
    const resp = await router.dispatch(mkReq("content.getText", { maxLength: 1024 }));
    const out = resp.result as string;
    expect(out).toMatch(/\[VORTEX_TRUNCATED original=50000 limit=1024\]/);
  });

  it("maxBytes 向后兼容: 显式 131072 → 50000 文本不截断", async () => {
    stubChrome("c".repeat(50000));
    const resp = await router.dispatch(mkReq("content.getText", { maxBytes: 131072 }));
    expect(resp.result).toBe("c".repeat(50000));
  });

  it("maxLength 优先于 maxBytes: maxLength=1024 + maxBytes=131072 → 截到 1024", async () => {
    stubChrome("d".repeat(50000));
    const resp = await router.dispatch(mkReq("content.getText", { maxLength: 1024, maxBytes: 131072 }));
    expect(resp.result as string).toMatch(/limit=1024\]/);
  });

  it("maxLength 越界(0)抛 INVALID_PARAMS", async () => {
    stubChrome("e".repeat(100));
    const resp = await router.dispatch(mkReq("content.getText", { maxLength: 0 }));
    expect(resp.error?.code ?? resp.error).toMatch(/INVALID_PARAMS/);
  });

  it("maxBytes 越界(<4096)抛 INVALID_PARAMS", async () => {
    stubChrome("f".repeat(100));
    const resp = await router.dispatch(mkReq("content.getText", { maxBytes: 100 }));
    expect(resp.error?.code ?? resp.error).toMatch(/INVALID_PARAMS|maxBytes/);
  });
});
