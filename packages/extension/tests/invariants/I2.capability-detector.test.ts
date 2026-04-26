// I2: CapabilityDetector 在 chrome.debugger 不可用时返回 canUseCDP=false。
// 实现见 ../../src/adapter/detector.ts（T1.8 task 完成）。

import { describe, it, expect, vi, beforeEach } from "vitest";
import { capabilityDetector } from "../../src/adapter/detector";

declare global {
  // eslint-disable-next-line no-var
  var chrome: any;
}

describe("I2: CapabilityDetector fallback to native when CDP unavailable", () => {
  beforeEach(() => {
    // 重置 chrome.debugger mock
    globalThis.chrome = {
      debugger: undefined,
    };
  });

  it("chrome.debugger 完全不存在时 canUseCDP 返回 false", async () => {
    const ok = await capabilityDetector.canUseCDP(1);
    expect(ok).toBe(false);
  });

  it("chrome.debugger.attach 失败时 canUseCDP 返回 false", async () => {
    globalThis.chrome = {
      debugger: {
        attach: vi.fn((_target, _ver, cb) => {
          // 模拟权限拒绝
          (globalThis.chrome.runtime ??= {}).lastError = { message: "Permission denied" };
          cb?.();
        }),
        detach: vi.fn((_t, cb) => cb?.()),
      },
      runtime: { lastError: undefined },
    };
    const ok = await capabilityDetector.canUseCDP(1);
    expect(ok).toBe(false);
  });

  it("needsTrustedEvent 对 drag 永远返回 true", () => {
    expect(capabilityDetector.needsTrustedEvent("drag")).toBe(true);
  });

  it("needsTrustedEvent 对普通 click 返回 false", () => {
    expect(capabilityDetector.needsTrustedEvent("click", { tagName: "button" })).toBe(false);
  });
});
