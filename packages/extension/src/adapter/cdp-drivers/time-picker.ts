// element-plus time-picker CDP 真鼠标驱动。
// 抽取自 dom.ts L1415-L1614（v0.5.0 → v0.6 PR #1 T1.7c），保持函数体不变。
//
// 1) CDP click input 打开 .el-time-panel
// 2) 三列 spinner 各自 scrollIntoView 目标 li → CDP click
// 3) CDP click "OK"，等 panel close，verify input.value

import { VtxErrorCode, vtxError } from "@bytenew/vortex-shared";
import type { DebuggerManager } from "../../lib/debugger-manager.js";
import { pageQuery as nativePageQuery } from "../native.js";
import { clickBBox as cdpClickBBox } from "../cdp.js";

export async function runTimePickerDriverCDP(opts: {
  tid: number;
  frameId: number | undefined;
  selector: string;
  closestSelector: string;
  value: string;
  timeout: number;
  debuggerMgr: DebuggerManager;
}): Promise<unknown> {
  const { tid, frameId, selector, closestSelector, value, timeout, debuggerMgr } = opts;

  const m = value.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
  if (!m) {
    throw vtxError(
      VtxErrorCode.INVALID_PARAMS,
      `value must be HH:MM:SS, got ${JSON.stringify(value)}`,
    );
  }
  const targetParts = [m[1], m[2], m[3]].map((s) => s.padStart(2, "0"));

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  // 本地 alias：复用统一 pageQuery / clickBBox，绑定 tid+frameId+debuggerMgr。
  const pageQuery = <T>(fn: (...args: unknown[]) => T, args: unknown[] = []) =>
    nativePageQuery<T>(tid, frameId, fn, args);
  const clickBBox = (cx: number, cy: number) =>
    cdpClickBBox(debuggerMgr, tid, frameId, cx, cy);

  // step 1: locate input + open panel
  const openInfo = await pageQuery(
    (sel, cs) => {
      const els = document.querySelectorAll(sel as string);
      if (els.length === 0) return { err: `Element not found: ${sel}` };
      if (els.length > 1) return { err: `Selector "${sel}" matched ${els.length} elements` };
      const target = els[0] as HTMLElement;
      const root = (target.closest(cs as string) ??
        target.querySelector(cs as string)) as HTMLElement | null;
      if (!root) return { err: `Target does not match closestSelector "${cs}"` };
      root.scrollIntoView({ block: "center", inline: "center" });
      const r = root.getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    },
    [selector, closestSelector],
  );
  if ("err" in openInfo) {
    throw vtxError(VtxErrorCode.COMMIT_FAILED, openInfo.err, { selector });
  }
  await clickBBox(openInfo.cx, openInfo.cy);

  // step 2: wait .el-time-panel 可见
  const deadline = Date.now() + timeout;
  let panelReady = false;
  while (Date.now() < deadline) {
    const ok = await pageQuery(() => {
      const p = document.querySelector(".el-time-panel");
      if (!p) return false;
      const r = p.getBoundingClientRect();
      return r.width > 50 && r.height > 50;
    });
    if (ok) { panelReady = true; break; }
    await sleep(50);
  }
  if (!panelReady) {
    throw vtxError(VtxErrorCode.COMMIT_FAILED, "Time panel did not open within timeout", {
      selector, extras: { stage: "open-panel" },
    });
  }

  // step 3: 三列 spinner 各 click 目标 item
  for (let colIdx = 0; colIdx < 3; colIdx++) {
    const wantText = targetParts[colIdx];
    // 先 scrollIntoView 让 item 在 viewport 里再拿 bbox
    const info = await pageQuery(
      (idx, want) => {
        const cols = document.querySelectorAll(".el-time-panel .el-time-spinner__wrapper");
        const col = cols[idx as number];
        if (!col) return { err: `column ${idx} missing` };
        const items = col.querySelectorAll("li");
        let hit: HTMLElement | null = null;
        for (const it of Array.from(items)) {
          if ((it.textContent || "").trim() === want) {
            hit = it as HTMLElement;
            break;
          }
        }
        if (!hit) return { err: `item "${want}" not in column ${idx}` };
        // behavior:instant 避免平滑动画期间 bbox 漂移（Element Plus spinner 会在后续
        // click 时再次 scrollTop，造成"点偏一格"的 flaky）
        hit.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
        const r = hit.getBoundingClientRect();
        return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      },
      [colIdx, wantText],
    );
    if ("err" in info) {
      throw vtxError(VtxErrorCode.COMMIT_FAILED, info.err, {
        selector, extras: { stage: "spinner-click", column: colIdx, want: wantText },
      });
    }
    // 等 scroll 完全停（300ms 覆盖 Element Plus 内部 scrollTop 兜底），再查一次 bbox 取最新坐标
    await sleep(300);
    const freshBBox = await pageQuery(
      (idx, want) => {
        const cols = document.querySelectorAll(".el-time-panel .el-time-spinner__wrapper");
        const col = cols[idx as number];
        if (!col) return null;
        for (const it of Array.from(col.querySelectorAll("li"))) {
          if ((it.textContent || "").trim() === want) {
            const r = (it as HTMLElement).getBoundingClientRect();
            return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
          }
        }
        return null;
      },
      [colIdx, wantText],
    );
    const bb = freshBBox ?? info;
    await clickBBox(bb.cx, bb.cy);
    await sleep(120);
  }

  // step 4: click OK / 确定
  const okInfo = await pageQuery(() => {
    const panel = document.querySelector(".el-time-panel");
    if (!panel) return { err: "panel gone" };
    const btns = Array.from(panel.querySelectorAll("button")) as HTMLElement[];
    const hit = btns.find((b) => {
      const t = (b.innerText || "").trim();
      return t === "确定" || t === "OK" || t === "Confirm";
    });
    if (!hit) {
      const labels = btns.map((b) => (b.innerText || "").trim());
      return { err: `confirm button not found among [${labels.join(",")}]` };
    }
    const r = hit.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  });
  if ("err" in okInfo) {
    throw vtxError(VtxErrorCode.COMMIT_FAILED, okInfo.err, {
      selector, extras: { stage: "confirm" },
    });
  }
  await clickBBox(okInfo.cx, okInfo.cy);
  await sleep(150);

  // step 5: wait panel close + verify input.value
  const closeDeadline = Date.now() + 2000;
  while (Date.now() < closeDeadline) {
    const closed = await pageQuery(() => {
      const p = document.querySelector(".el-time-panel");
      return !p || p.getBoundingClientRect().height === 0;
    });
    if (closed) break;
    await sleep(50);
  }
  await sleep(150);

  // step 6: verify input value 是否含目标 HH:MM:SS
  const expect = targetParts.join(":");
  const verifyDeadline = Date.now() + 1500;
  let lastVal = "";
  while (Date.now() < verifyDeadline) {
    const v = await pageQuery(
      (sel, cs) => {
        const els = document.querySelectorAll(sel as string);
        const target = els[0] as HTMLElement | undefined;
        if (!target) return null;
        const root = (target.closest(cs as string) ??
          target.querySelector(cs as string)) as HTMLInputElement | null;
        return root?.value ?? null;
      },
      [selector, closestSelector],
    );
    if (v && v.includes(expect)) {
      lastVal = v;
      break;
    }
    if (v != null) lastVal = v;
    await sleep(100);
  }
  if (!lastVal.includes(expect)) {
    throw vtxError(
      VtxErrorCode.COMMIT_FAILED,
      `Time input did not commit: got "${lastVal}", expected "${expect}"`,
      { selector, extras: { stage: "verify" } },
    );
  }

  return {
    success: true,
    driver: "element-plus-time",
    value: lastVal,
    transport: "cdp-real-mouse",
  };
}
