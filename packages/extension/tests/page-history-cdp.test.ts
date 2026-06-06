import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { VtxErrorCode } from "@vortex-browser/shared";

/**
 * Bug 修复:vortex_history (page.back / page.forward) 在「vortex_navigate
 * (chrome.tabs.update 发起、无页面内用户手势)建立的历史」上失败。
 *
 * 根因(2026-06-06 白盒+e2e 确诊):chrome.tabs.goBack/goForward 受 Chrome
 * history-manipulation intervention 影响,跳过扩展导航 entry,报原生错误
 * "Cannot find a next page in history" —— 即便 window.history.length 正确、
 * 页面级 history.back() 能后退。实证:同一 tab 同一历史栈同一位置,页面级
 * back 成功、扩展级 chrome.tabs.goBack 失败。
 *
 * 修复:改用 CDP Page.getNavigationHistory(拿 currentIndex + entries)+
 * Page.navigateToHistoryEntry(按 entryId 精确导航),绕过 UI-skip。边界
 * (已在栈底/顶)抛 NO_EFFECT 而非裸 Error 被 router 兜底成 JS_EXECUTION_ERROR。
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAGE_SRC = readFileSync(
  join(__dirname, "..", "src", "handlers", "page.ts"),
  "utf8",
);

type NavHistory = {
  currentIndex: number;
  entries: Array<{ id: number; url: string }>;
};

function mkDebuggerMgr(history: NavHistory) {
  return {
    attach: vi.fn().mockResolvedValue(undefined),
    sendCommand: vi.fn().mockImplementation((_tid: number, method: string) => {
      if (method === "Page.getNavigationHistory") return Promise.resolve(history);
      return Promise.resolve(undefined);
    }),
  };
}

async function importPage() {
  vi.resetModules();
  return import("../src/handlers/page.js");
}

describe("navigateHistory — CDP 按 index 后退/前进(绕过 chrome.tabs.goBack skip)", () => {
  it("back(delta=-1): 精确导航到 currentIndex-1 的 entryId", async () => {
    const { navigateHistory } = await importPage();
    const dbg = mkDebuggerMgr({
      currentIndex: 2,
      entries: [
        { id: 10, url: "a" },
        { id: 20, url: "b" },
        { id: 30, url: "c" },
      ],
    });
    await navigateHistory(dbg as never, 42, -1);
    expect(dbg.sendCommand).toHaveBeenCalledWith(42, "Page.navigateToHistoryEntry", {
      entryId: 20,
    });
  });

  it("forward(delta=+1): 精确导航到 currentIndex+1 的 entryId", async () => {
    const { navigateHistory } = await importPage();
    const dbg = mkDebuggerMgr({
      currentIndex: 0,
      entries: [
        { id: 10, url: "a" },
        { id: 20, url: "b" },
      ],
    });
    await navigateHistory(dbg as never, 42, 1);
    expect(dbg.sendCommand).toHaveBeenCalledWith(42, "Page.navigateToHistoryEntry", {
      entryId: 20,
    });
  });

  it("先 attach(tid) 再发 CDP 命令", async () => {
    const { navigateHistory } = await importPage();
    const dbg = mkDebuggerMgr({
      currentIndex: 1,
      entries: [
        { id: 1, url: "a" },
        { id: 2, url: "b" },
      ],
    });
    await navigateHistory(dbg as never, 42, -1);
    expect(dbg.attach).toHaveBeenCalledWith(42);
  });

  it("back 边界(currentIndex=0): 抛 NO_EFFECT 且不调 navigateToHistoryEntry", async () => {
    const { navigateHistory } = await importPage();
    const dbg = mkDebuggerMgr({ currentIndex: 0, entries: [{ id: 10, url: "a" }] });
    const err = await navigateHistory(dbg as never, 42, -1).catch((e: unknown) => e);
    // 不用 toBeInstanceOf(VtxError):vi.resetModules() 使 page.ts 内的
    // VtxError 与此处 import 的不是同一构造器(模块重复)。Error 是全局唯一,
    // 加字符串 code(跨实例稳定)断言被测行为契约。
    expect(err).toBeInstanceOf(Error);
    expect((err as VtxError).code).toBe(VtxErrorCode.NO_EFFECT);
    const methods = dbg.sendCommand.mock.calls.map((c) => c[1]);
    expect(methods).not.toContain("Page.navigateToHistoryEntry");
  });

  it("forward 边界(currentIndex=末尾): 抛 NO_EFFECT", async () => {
    const { navigateHistory } = await importPage();
    const dbg = mkDebuggerMgr({
      currentIndex: 1,
      entries: [
        { id: 10, url: "a" },
        { id: 20, url: "b" },
      ],
    });
    const err = await navigateHistory(dbg as never, 42, 1).catch((e: unknown) => e);
    // 不用 toBeInstanceOf(VtxError):vi.resetModules() 使 page.ts 内的
    // VtxError 与此处 import 的不是同一构造器(模块重复)。Error 是全局唯一,
    // 加字符串 code(跨实例稳定)断言被测行为契约。
    expect(err).toBeInstanceOf(Error);
    expect((err as VtxError).code).toBe(VtxErrorCode.NO_EFFECT);
  });
});

describe("page.back/forward 源码契约:改用 CDP 历史导航", () => {
  it("BACK/FORWARD 不再调用 chrome.tabs.goBack/goForward(注释提及不算)", () => {
    // 带左括号 = 实际调用;裸词出现在「为何弃用」的文档注释中是允许的。
    expect(PAGE_SRC).not.toMatch(/chrome\.tabs\.goBack\(/);
    expect(PAGE_SRC).not.toMatch(/chrome\.tabs\.goForward\(/);
  });

  it("使用 Page.getNavigationHistory + Page.navigateToHistoryEntry", () => {
    expect(PAGE_SRC).toMatch(/Page\.getNavigationHistory/);
    expect(PAGE_SRC).toMatch(/Page\.navigateToHistoryEntry/);
  });

  it("BACK/FORWARD handler 调用 navigateHistory", () => {
    expect(PAGE_SRC).toMatch(/navigateHistory\(/);
  });
});
