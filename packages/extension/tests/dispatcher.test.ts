import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventDispatcher } from "../src/events/dispatcher.js";

function makeNm() {
  const send = vi.fn();
  return {
    nm: { send } as unknown as ConstructorParameters<typeof EventDispatcher>[0],
    send,
  };
}

describe("EventDispatcher 三级节流（F10）", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("urgent 事件", () => {
    it("立即 send，零延迟", () => {
      const { nm, send } = makeNm();
      const d = new EventDispatcher(nm);
      d.emit("user.switched_tab", { windowId: 1 }, { tabId: 5 });
      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "event",
          event: "user.switched_tab",
          level: "urgent",
          tabId: 5,
        }),
      );
    });

    it("多条 urgent 事件按顺序立即 send", () => {
      const { nm, send } = makeNm();
      const d = new EventDispatcher(nm);
      d.emit("user.switched_tab", { a: 1 }, { tabId: 1 });
      d.emit("dialog.opened", { b: 2 }, { tabId: 1 });
      d.emit("download.completed", { c: 3 });
      expect(send).toHaveBeenCalledTimes(3);
    });
  });

  describe("notice 批量（不合并）", () => {
    it("200ms 窗口内累积，flush 后依次 send 每一条", () => {
      const { nm, send } = makeNm();
      const d = new EventDispatcher(nm);

      d.emit("page.navigated", { url: "a" }, { tabId: 1 });
      d.emit("page.navigated", { url: "b" }, { tabId: 1 });
      d.emit("console.error", { msg: "x" }, { tabId: 1 });
      expect(send).not.toHaveBeenCalled();

      vi.advanceTimersByTime(200);
      expect(send).toHaveBeenCalledTimes(3);
    });

    it("窗口未到不 flush", () => {
      const { nm, send } = makeNm();
      const d = new EventDispatcher(nm);
      d.emit("page.navigated", { url: "a" }, { tabId: 1 });
      vi.advanceTimersByTime(199);
      expect(send).not.toHaveBeenCalled();
    });

    it("flush 后新事件开启新窗口", () => {
      const { nm, send } = makeNm();
      const d = new EventDispatcher(nm);
      d.emit("page.navigated", {}, { tabId: 1 });
      vi.advanceTimersByTime(200);
      expect(send).toHaveBeenCalledTimes(1);
      d.emit("page.navigated", {}, { tabId: 1 });
      vi.advanceTimersByTime(200);
      expect(send).toHaveBeenCalledTimes(2);
    });
  });

  describe("info 批量 + 合并", () => {
    it("同 (type, tabId) 的 info 事件合并为一条（含 mergedCount 与 samples）", () => {
      const { nm, send } = makeNm();
      const d = new EventDispatcher(nm);

      for (let i = 0; i < 5; i++) {
        d.emit("dom.mutated", { n: i }, { tabId: 1 });
      }
      vi.advanceTimersByTime(1000);

      expect(send).toHaveBeenCalledTimes(1);
      const call = send.mock.calls[0][0];
      expect(call.event).toBe("dom.mutated");
      expect(call.data.mergedCount).toBe(5);
      expect(call.data.samples).toHaveLength(3); // SAMPLE_LIMIT
      expect(call.level).toBe("info");
    });

    it("不同 tabId 的 info 事件不合并", () => {
      const { nm, send } = makeNm();
      const d = new EventDispatcher(nm);
      d.emit("dom.mutated", {}, { tabId: 1 });
      d.emit("dom.mutated", {}, { tabId: 1 });
      d.emit("dom.mutated", {}, { tabId: 2 });
      vi.advanceTimersByTime(1000);
      expect(send).toHaveBeenCalledTimes(2); // tab1 合并 × 1 + tab2 × 1
    });

    it("单次 info 事件不包装 mergedCount（直接透传 data）", () => {
      const { nm, send } = makeNm();
      const d = new EventDispatcher(nm);
      d.emit("dom.mutated", { alone: true }, { tabId: 1 });
      vi.advanceTimersByTime(1000);
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0].data).toEqual({ alone: true });
    });

    it("不同类型的 info 事件同窗口各自合并", () => {
      const { nm, send } = makeNm();
      const d = new EventDispatcher(nm);
      d.emit("dom.mutated", {}, { tabId: 1 });
      d.emit("dom.mutated", {}, { tabId: 1 });
      d.emit("network.request", {}, { tabId: 1 });
      vi.advanceTimersByTime(1000);
      expect(send).toHaveBeenCalledTimes(2);
    });
  });

  describe("flushAll（手动/退出时）", () => {
    it("立即 flush notice 和 info buffer，清理定时器", () => {
      const { nm, send } = makeNm();
      const d = new EventDispatcher(nm);
      d.emit("page.navigated", {}, { tabId: 1 });
      d.emit("dom.mutated", {}, { tabId: 1 });
      d.emit("dom.mutated", {}, { tabId: 1 });
      d.flushAll();
      // notice 1 + info 合并后 1
      expect(send).toHaveBeenCalledTimes(2);
    });
  });

  describe("自定义窗口时长", () => {
    it("opts.noticeFlushMs / infoFlushMs 可覆盖默认值", () => {
      const { nm, send } = makeNm();
      const d = new EventDispatcher(nm, {
        noticeFlushMs: 50,
        infoFlushMs: 100,
      });
      d.emit("page.navigated", {}, { tabId: 1 });
      vi.advanceTimersByTime(50);
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe("level 显式 override", () => {
    it("opts.level 强制覆盖默认 level 映射", () => {
      const { nm, send } = makeNm();
      const d = new EventDispatcher(nm);
      d.emit("dom.mutated", {}, { tabId: 1, level: "urgent" });
      expect(send).toHaveBeenCalledTimes(1); // 不经过 info 批量
    });
  });
});
