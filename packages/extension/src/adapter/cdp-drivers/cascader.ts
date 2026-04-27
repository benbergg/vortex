// element-plus cascader CDP 真鼠标驱动。
// 抽取自 dom.ts L1419-L1545（v0.5.0 → v0.6 PR #1 T1.7b），保持函数体不变。
//
// 触发区（.el-cascader）对 untrusted click 不响应，但面板内 .el-cascader-node__label
// 用 page-side .click() 可以逐级展开。混合：worker CDP 开 panel + page JS 走 path。

import { VtxErrorCode, vtxError } from "@bytenew/vortex-shared";
import type { DebuggerManager } from "../../lib/debugger-manager.js";
import { getIframeOffset } from "../../lib/iframe-offset.js";
import { pageQuery as nativePageQuery } from "../native.js";
import { clickBBox as cdpClickBBox } from "../cdp.js";

export async function runCascaderDriverCDP(opts: {
  tid: number;
  frameId: number | undefined;
  selector: string;
  closestSelector: string;
  value: unknown[];
  timeout: number;
  debuggerMgr: DebuggerManager;
}): Promise<unknown> {
  const { tid, frameId, selector, closestSelector, value, timeout, debuggerMgr } = opts;

  if (!Array.isArray(value) || value.length === 0) {
    throw vtxError(
      VtxErrorCode.INVALID_PARAMS,
      `value must be a non-empty label path array, got ${JSON.stringify(value)}`,
    );
  }
  const path = value.map((v) => String(v));

  // 本地 alias：复用统一 pageQuery / clickBBox，绑定 tid+frameId+debuggerMgr。
  const pageQuery = <T>(fn: (...args: unknown[]) => T, args: unknown[] = []) =>
    nativePageQuery<T>(tid, frameId, fn, args);
  const clickBBox = async (cx: number, cy: number) => {
    const { x: ox, y: oy } = await getIframeOffset(tid, frameId);
    await cdpClickBBox(debuggerMgr, tid, cx + ox, cy + oy);
  };

  // step 1: locate cascader root + get bbox
  const rootInfo = await pageQuery(
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
  if ("err" in rootInfo) {
    throw vtxError(VtxErrorCode.COMMIT_FAILED, rootInfo.err, { selector });
  }

  // step 2: CDP click to open panel
  await clickBBox(rootInfo.cx, rootInfo.cy);

  // step 3: wait panel visible
  const deadline = Date.now() + timeout;
  let panelReady = false;
  while (Date.now() < deadline) {
    const ok = await pageQuery(() => {
      const p = document.querySelector(".el-cascader-panel");
      if (!p) return false;
      const r = p.getBoundingClientRect();
      return r.width > 50 && r.height > 50;
    });
    if (ok) { panelReady = true; break; }
    await new Promise<void>((r) => setTimeout(r, 50));
  }
  if (!panelReady) {
    throw vtxError(VtxErrorCode.COMMIT_FAILED, "Cascader panel did not open within timeout", {
      selector, extras: { stage: "open-panel" },
    });
  }

  // step 4: walk label path, click each level.
  // page-side 一次 executeScript 跑完所有 level，避免多次往返。
  const walkRes = await pageQuery(
    (labelsArg) => {
      const labels = labelsArg as string[];
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      return (async () => {
        const clicked: string[] = [];
        for (let i = 0; i < labels.length; i++) {
          const want = labels[i];
          // wait menu[i] to appear (展开过渡可能慢)
          let menu: Element | null = null;
          for (let attempt = 0; attempt < 20; attempt++) {
            const menus = document.querySelectorAll(".el-cascader-menu");
            if (menus[i]) { menu = menus[i]; break; }
            await sleep(50);
          }
          if (!menu) return { err: `cascader menu level ${i} did not appear`, clicked };
          // find label
          let hit: HTMLElement | null = null;
          for (const nl of Array.from(menu.querySelectorAll(".el-cascader-node__label"))) {
            if ((nl.textContent || "").trim() === want) {
              hit = nl as HTMLElement;
              break;
            }
          }
          if (!hit) {
            const avail = Array.from(menu.querySelectorAll(".el-cascader-node__label"))
              .map((e) => (e.textContent || "").trim());
            return { err: `label "${want}" not found at level ${i}. Available: ${avail.join(",")}`, clicked };
          }
          hit.click();
          clicked.push(want);
          // 最后一级点完后 panel 会自己关闭 (single-select cascader)；
          // 非最后级需等 next menu 展开
          if (i < labels.length - 1) {
            await sleep(80);
          }
        }
        return { ok: true, clicked };
      })();
    },
    [path],
  );
  if ("err" in walkRes) {
    throw vtxError(VtxErrorCode.COMMIT_FAILED, walkRes.err, {
      selector, extras: { stage: "walk-path", clicked: walkRes.clicked },
    });
  }

  // step 5: wait panel close + 小 sleep 让 v-model commit
  await new Promise<void>((r) => setTimeout(r, 200));

  return {
    success: true,
    driver: "element-plus-cascader",
    path,
    transport: "cdp-real-mouse+page-click",
  };
}
