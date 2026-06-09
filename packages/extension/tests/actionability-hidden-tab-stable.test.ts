/**
 * Author: qingwa
 * Description: actionability 稳定性检查(isStable/probeStable)在后台(hidden)标签
 *   不能阻塞在被节流的 requestAnimationFrame 上。
 *
 * 背景 (2026-06-09 京东搜索性能 终极真因):
 *   Chrome 在后台 hidden 标签暂停/节流 requestAnimationFrame。isStable 用
 *   `await requestAnimationFrame` 采两帧 bbox 判稳定 —— 后台 rAF 不触发(实测
 *   js.evaluateAsync 单次 rAF 在后台 5000ms 内从未回调),稳定性探测卡到超时,
 *   京东搜索 fill/click 在后台标签慢 ~2s(前台仅 ~50ms)。
 *
 *   修复:hidden 标签无可见动画、rAF 又不可靠,跳过 rAF 采样直接视作稳定
 *   (实际交互仍走 CDP/合成路径,持续不稳由 force 兜底)。
 *
 * 关键契约:
 *   1. hidden + rAF 永不触发 → probeStable 立即 resolve {ok:true}(不挂死)
 *   2. visible → 仍走 rAF 采样(行为不变,回归保护)
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { setupActionabilityEnv } from "./helpers/actionability-test-setup.js";

vi.mock("../src/adapter/page-side-loader.js", () => ({
  loadPageSideModule: async () => {},
  _resetPageSideLoader: () => {},
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

const raceHung = <T>(p: Promise<T>, ms = 300) =>
  Promise.race([p, new Promise((r) => setTimeout(() => r("HUNG"), ms))]);

describe("actionability isStable 后台标签不阻塞 rAF (京东搜索性能终极真因)", () => {
  it("契约 1: hidden + rAF 永不触发 → probeStable 立即 {ok:true}, 不挂死", async () => {
    vi.resetModules();
    const dom = setupActionabilityEnv({ html: '<button id="b">搜索</button>' });
    // 模拟后台:rAF 永不回调(Chrome hidden 标签节流)
    (globalThis as any).requestAnimationFrame = () => 1;
    (dom.window as any).requestAnimationFrame = () => 1;
    // 标签 hidden
    Object.defineProperty(dom.window.document, "visibilityState", { value: "hidden", configurable: true });
    Object.defineProperty(dom.window.document, "hidden", { value: true, configurable: true });

    await import("../src/page-side/actionability.js");
    const probeStable = (globalThis.window as any).__vortexActionability.probeStable;

    const res = await raceHung(probeStable("#b"));
    expect(res).toEqual({ ok: true });
  });

  it("契约 2: visible → 仍走 rAF 采样 (行为不变)", async () => {
    vi.resetModules();
    const dom = setupActionabilityEnv({ html: '<button id="b">搜索</button>' });
    // visible (默认),rAF shim 用 setTimeout-0 会触发
    const el = dom.window.document.getElementById("b")!;
    // 稳定 bbox:两次读相同 → stable
    (el as any).getBoundingClientRect = () => ({ x: 10, y: 20, width: 80, height: 30, top: 20, left: 10, right: 90, bottom: 50 });

    await import("../src/page-side/actionability.js");
    const probeStable = (globalThis.window as any).__vortexActionability.probeStable;

    const res = await raceHung(probeStable("#b"));
    expect(res).toEqual({ ok: true });
  });
});
