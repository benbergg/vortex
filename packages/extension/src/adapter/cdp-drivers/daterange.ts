// element-plus daterange / datetimerange CDP 真鼠标驱动。
// 抽取自 dom.ts L1414-L1794（v0.5.0 → v0.6 PR #1 T1.7a），保持函数体不变。
//
// 原因：Element Plus 的 date picker 某些 handler 检查 event.isTrusted。
// scripting.executeScript + dispatchMouseEvent 得到的是 untrusted 事件，
// UI 看着有动作（day cell 能选中）但 v-model 不更新。只有 CDP
// Input.dispatchMouseEvent 产生的 isTrusted=true 事件能完整驱动。

import { VtxErrorCode, vtxError } from "@bytenew/vortex-shared";
import type { DebuggerManager } from "../../lib/debugger-manager.js";
import { pageQuery as nativePageQuery } from "../native.js";
import { clickBBox as cdpClickBBox } from "../cdp.js";

function parseYMDLocal(s: string): { year: number; month: number; day: number } | null {
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  return { year: +m[1], month: +m[2], day: +m[3] };
}

export async function runDateRangeDriverCDP(opts: {
  tid: number;
  frameId: number | undefined;
  selector: string;
  closestSelector: string;
  isDateTime: boolean;
  value: { start?: string; end?: string };
  timeout: number;
  debuggerMgr: DebuggerManager;
}): Promise<unknown> {
  const { tid, frameId, selector, closestSelector, isDateTime, value, timeout, debuggerMgr } = opts;

  if (!value?.start || !value?.end) {
    throw vtxError(VtxErrorCode.INVALID_PARAMS, `value must be { start, end }, got ${JSON.stringify(value)}`);
  }
  const ts = parseYMDLocal(value.start);
  const te = parseYMDLocal(value.end);
  if (!ts || !te) {
    throw vtxError(
      VtxErrorCode.INVALID_PARAMS,
      `value.start/end must start with YYYY-MM-DD, got ${value.start} / ${value.end}`,
    );
  }

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  // 本地 alias：复用统一 pageQuery / clickBBox，绑定 tid+frameId+debuggerMgr。
  const pageQuery = <T>(fn: (...args: unknown[]) => T, args: unknown[] = []) =>
    nativePageQuery<T>(tid, frameId, fn, args);
  const clickBBox = (cx: number, cy: number) =>
    cdpClickBBox(debuggerMgr, tid, frameId, cx, cy);

  // step 1: resolve root + start input bbox
  const openInfo = await pageQuery(
    (sel, closestSel) => {
      const els = document.querySelectorAll(sel as string);
      if (els.length === 0) return { err: `Element not found: ${sel}` };
      if (els.length > 1) return { err: `Selector "${sel}" matched ${els.length} elements` };
      const target = els[0] as HTMLElement;
      const root = (target.closest(closestSel as string) ??
        target.querySelector(closestSel as string)) as HTMLElement | null;
      if (!root) return { err: `Target does not match driver closestSelector "${closestSel}"` };
      const sIn = root.querySelector("input.el-range-input") as HTMLElement | null;
      if (!sIn) return { err: "Range inputs not found under .el-date-editor" };
      sIn.scrollIntoView({ block: "center", inline: "center" });
      const r = sIn.getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    },
    [selector, closestSelector],
  );
  if ("err" in openInfo) {
    throw vtxError(VtxErrorCode.COMMIT_FAILED, openInfo.err, { selector });
  }
  await clickBBox(openInfo.cx, openInfo.cy);

  // step 2: wait picker visible
  const deadline = Date.now() + timeout;
  let panelReady = false;
  while (Date.now() < deadline) {
    const ok = await pageQuery(() => {
      const p = document.querySelector(".el-date-range-picker");
      if (!p) return false;
      const r = p.getBoundingClientRect();
      // Vue transition 完成后 height 才撑开（enter-to），100 为稳态阈值
      return r.width > 100 && r.height > 100;
    });
    if (ok) { panelReady = true; break; }
    await sleep(50);
  }
  if (!panelReady) {
    throw vtxError(VtxErrorCode.COMMIT_FAILED, "Picker did not open within timeout", {
      selector, extras: { stage: "open-picker" },
    });
  }

  // helper: 读取某个 panel 的 YM + 月箭头 + 年箭头 bbox
  async function readPanelState(hdrIndex: 0 | 1): Promise<{
    year: number; month: number;
    arrLeft: { cx: number; cy: number } | null;
    arrRight: { cx: number; cy: number } | null;
    dArrLeft: { cx: number; cy: number } | null;
    dArrRight: { cx: number; cy: number } | null;
  } | { err: string }> {
    return pageQuery(
      (idx) => {
        const p = document.querySelector(".el-date-range-picker");
        if (!p) return { err: "no panel" };
        const hdrs = p.querySelectorAll(".el-date-range-picker__header");
        const hdr = hdrs[idx as number];
        if (!hdr) return { err: `no header[${idx}]` };
        const raw = ((hdr as HTMLElement).innerText || hdr.textContent || "").toLowerCase();
        const y = raw.match(/\b(\d{4})\b/);
        if (!y) return { err: `no year in "${raw}"` };
        const year = +y[1];
        let month: number | null = null;
        const numAfter = raw.match(/\d{4}\D+(\d{1,2})/);
        if (numAfter && +numAfter[1] >= 1 && +numAfter[1] <= 12) {
          month = +numAfter[1];
        } else {
          const EN = ["january","february","march","april","may","june","july","august","september","october","november","december"];
          for (let i = 0; i < 12; i++) {
            if (new RegExp(`\\b${EN[i]}\\b`).test(raw)) { month = i + 1; break; }
          }
        }
        if (month === null) return { err: `no month in "${raw}"` };
        const aL = p.querySelector(".arrow-left") as HTMLElement | null;
        const aR = p.querySelector(".arrow-right") as HTMLElement | null;
        const daL = p.querySelector(".d-arrow-left") as HTMLElement | null;
        const daR = p.querySelector(".d-arrow-right") as HTMLElement | null;
        const toC = (el: HTMLElement | null) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
        };
        return { year, month, arrLeft: toC(aL), arrRight: toC(aR), dArrLeft: toC(daL), dArrRight: toC(daR) };
      },
      [hdrIndex],
    );
  }

  // 优先走年箭头（.d-arrow-left/right）减少跨多年时的 click 次数和 driver 耗时。
  async function navigateMonth(
    hdrIndex: 0 | 1,
    target: { year: number; month: number },
  ): Promise<void> {
    for (let safety = 60; safety > 0; safety--) {
      const info = await readPanelState(hdrIndex);
      if ("err" in info) throw vtxError(VtxErrorCode.COMMIT_FAILED, `read header ${hdrIndex}: ${info.err}`);
      const yearDelta = info.year - target.year;
      const monthDelta = yearDelta * 12 + (info.month - target.month);
      if (monthDelta === 0) return;
      // 相差 >= 1 整年时走 d-arrow
      if (Math.abs(yearDelta) >= 1) {
        const yBtn = yearDelta > 0 ? info.dArrLeft : info.dArrRight;
        if (yBtn) {
          await clickBBox(yBtn.cx, yBtn.cy);
          await sleep(80);
          continue;
        }
      }
      const mBtn = monthDelta > 0 ? info.arrLeft : info.arrRight;
      if (!mBtn) throw vtxError(VtxErrorCode.COMMIT_FAILED, `arrow button missing (monthDelta=${monthDelta})`);
      await clickBBox(mBtn.cx, mBtn.cy);
      await sleep(80);
    }
    throw vtxError(VtxErrorCode.COMMIT_FAILED, `navigate month safety overflow for hdr ${hdrIndex}`);
  }

  // helper: 点某侧 panel 的某天
  async function clickDayCell(side: "left" | "right", day: number): Promise<void> {
    const info = await pageQuery(
      (s, d) => {
        const content = document.querySelector(`.el-date-range-picker__content.is-${s}`);
        if (!content) return { err: `no ${s} content` };
        const tds = content.querySelectorAll("td");
        for (const td of Array.from(tds)) {
          const cls = (td as HTMLElement).className;
          if (cls.includes("disabled") || cls.includes("prev-month") || cls.includes("next-month")) continue;
          const cell = ((td as HTMLElement).querySelector(".cell") as HTMLElement) ?? (td as HTMLElement);
          if ((cell.innerText || "").trim() === String(d)) {
            const r = (td as HTMLElement).getBoundingClientRect();
            return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
          }
        }
        return { err: `day ${d} not found in ${s} panel` };
      },
      [side, day],
    );
    if ("err" in info) throw vtxError(VtxErrorCode.COMMIT_FAILED, info.err);
    await clickBBox(info.cx, info.cy);
  }

  // step 3: navigate left to start month
  await navigateMonth(0, { year: ts.year, month: ts.month });
  // step 4: click start day
  await clickDayCell("left", ts.day);
  await sleep(80);

  const sameMonth = ts.year === te.year && ts.month === te.month;
  if (sameMonth) {
    // start/end 同月份：不翻 right（Element Plus 强制 right > left，
    // 翻 right 回到 start 月会反向把 left 推到更早月，污染 start click 的 panel）
    await clickDayCell("left", te.day);
  } else {
    // step 5: navigate right to end month
    await navigateMonth(1, { year: te.year, month: te.month });
    // step 6: click end day
    await clickDayCell("right", te.day);
  }
  await sleep(80);

  // step 6.5: datetime 场景，day click 后还需显式 set Time inputs 才会 enable OK。
  // 从 value.start/end 解析 "HH:MM:SS" 部分，用 nativeInputValueSetter + dispatch input
  // 让 Element Plus 识别为用户键入。
  if (isDateTime) {
    const startTimeStr = (value.start.split(" ")[1] ?? "00:00:00").trim() || "00:00:00";
    const endTimeStr = (value.end.split(" ")[1] ?? "00:00:00").trim() || "00:00:00";
    const setRes = await pageQuery(
      (startTime, endTime) => {
        const p = document.querySelector(".el-date-range-picker");
        if (!p) return { err: "no panel for time set" };
        const inputs = Array.from(p.querySelectorAll("input.el-input__inner")) as HTMLInputElement[];
        const sT = inputs.find((i) =>
          ["Start Time", "开始时间"].includes(i.placeholder),
        );
        const eT = inputs.find((i) =>
          ["End Time", "结束时间"].includes(i.placeholder),
        );
        if (!sT || !eT) {
          return {
            err: `time inputs not found, placeholders: ${inputs.map((i) => i.placeholder).join("|")}`,
          };
        }
        const proto = HTMLInputElement.prototype as unknown as { value: unknown };
        const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
        const setter = descriptor?.set as ((v: string) => void) | undefined;
        if (!setter) return { err: "no native value setter" };
        const set = (el: HTMLInputElement, v: string) => {
          setter.call(el, v);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        };
        set(sT, startTime as string);
        set(eT, endTime as string);
        return { ok: true };
      },
      [startTimeStr, endTimeStr],
    );
    if (setRes && "err" in setRes) {
      throw vtxError(VtxErrorCode.COMMIT_FAILED, `set time inputs: ${setRes.err}`, {
        selector, extras: { stage: "set-time" },
      });
    }
    await sleep(100);
  }

  // step 7: datetime 场景点"确定"
  if (isDateTime) {
    // 轮询等 OK button enable（两个 day click 后 Element Plus 需要 nextTick 才更新 disabled 状态）
    const okDeadline = Date.now() + 2000;
    let okInfo:
      | { cx: number; cy: number; disabled: boolean }
      | { err: string }
      | null = null;
    while (Date.now() < okDeadline) {
      okInfo = await pageQuery(() => {
        const p = document.querySelector(".el-date-range-picker");
        if (!p || !p.classList.contains("has-time")) return null;
        const btns = Array.from(p.querySelectorAll("button")) as HTMLElement[];
        const hit = btns.find((b) => {
          const t = (b.innerText || "").trim();
          return t === "确定" || t === "OK";
        });
        if (!hit) return { err: "no confirm button" };
        const r = hit.getBoundingClientRect();
        const btn = hit as HTMLButtonElement;
        const disabled =
          btn.disabled ||
          btn.classList.contains("is-disabled") ||
          btn.hasAttribute("disabled");
        return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, disabled };
      });
      if (okInfo && "disabled" in okInfo && !okInfo.disabled) break;
      await sleep(100);
    }
    if (okInfo && "err" in okInfo) {
      throw vtxError(VtxErrorCode.COMMIT_FAILED, okInfo.err, {
        selector, extras: { stage: "confirm" },
      });
    }
    if (okInfo && "disabled" in okInfo) {
      if (okInfo.disabled) {
        throw vtxError(
          VtxErrorCode.COMMIT_FAILED,
          "OK/确定 button still disabled after selecting start+end days (time inputs may need explicit set)",
          { selector, extras: { stage: "confirm" } },
        );
      }
      await clickBBox(okInfo.cx, okInfo.cy);
      await sleep(200);
    }
  }

  // step 8a: 等 picker close (height 归 0 或 element 消失)，Element Plus 在 close 时 emit
  // 对外 change event 让 v-model commit。verify 前必须等这一步。
  const closeDeadline = Date.now() + 2000;
  while (Date.now() < closeDeadline) {
    const closed = await pageQuery(() => {
      const p = document.querySelector(".el-date-range-picker");
      if (!p) return true;
      return p.getBoundingClientRect().height === 0;
    });
    if (closed) break;
    await sleep(50);
  }
  await sleep(150); // 额外一个 Vue tick，让 v-model commit 稳

  // step 8b: verify input values
  const verifyDeadline = Date.now() + 2000;
  let verified:
    | { sVal: string; eVal: string; ok: boolean; expectStart: string; expectEnd: string }
    | null = null;
  while (Date.now() < verifyDeadline) {
    const info = await pageQuery(
      (sel, closestSel, tsJson, teJson) => {
        const els = document.querySelectorAll(sel as string);
        const target = els[0] as HTMLElement | undefined;
        if (!target) return { err: "target gone" };
        const root = (target.closest(closestSel as string) ??
          target.querySelector(closestSel as string)) as HTMLElement | null;
        if (!root) return { err: "root gone" };
        const ins = root.querySelectorAll("input.el-range-input");
        const sIn = ins[0] as HTMLInputElement | undefined;
        const eIn = ins[1] as HTMLInputElement | undefined;
        if (!sIn || !eIn) return { err: "inputs gone" };
        const tsv = JSON.parse(tsJson as string);
        const tev = JSON.parse(teJson as string);
        const pad = (n: number) => String(n).padStart(2, "0");
        const expectStart = `${tsv.year}-${pad(tsv.month)}-${pad(tsv.day)}`;
        const expectEnd = `${tev.year}-${pad(tev.month)}-${pad(tev.day)}`;
        return {
          sVal: sIn.value,
          eVal: eIn.value,
          ok: sIn.value.startsWith(expectStart) && eIn.value.startsWith(expectEnd),
          expectStart, expectEnd,
        };
      },
      [selector, closestSelector, JSON.stringify(ts), JSON.stringify(te)],
    );
    if ("err" in info) {
      throw vtxError(VtxErrorCode.COMMIT_FAILED, info.err);
    }
    if (info.ok) {
      verified = info;
      break;
    }
    verified = info; // 最近一次状态，便于 else 报错
    await sleep(100);
  }
  if (!verified || !verified.ok) {
    throw vtxError(
      VtxErrorCode.COMMIT_FAILED,
      `Inputs did not commit: got "${verified?.sVal}" / "${verified?.eVal}", expected to start with "${verified?.expectStart}" / "${verified?.expectEnd}"`,
      { selector, extras: { stage: "verify" } },
    );
  }

  // 保底：click body 强制让任何残留 popper 关闭（blur 事件 → Element Plus emit
  // change → Vue 更新 modelValue），再等一段时间让 reactive flush 完成。
  // 这步修复了"driver verify 通过但 result 区仍空"的 flaky 场景。
  await debuggerMgr.sendCommand(tid, "Input.dispatchMouseEvent", {
    type: "mouseMoved", x: 5, y: 5,
  });
  await debuggerMgr.sendCommand(tid, "Input.dispatchMouseEvent", {
    type: "mousePressed", x: 5, y: 5, button: "left", clickCount: 1,
  });
  await debuggerMgr.sendCommand(tid, "Input.dispatchMouseEvent", {
    type: "mouseReleased", x: 5, y: 5, button: "left", clickCount: 1,
  });
  await sleep(400);

  return {
    success: true,
    driver: isDateTime ? "element-plus-datetimerange" : "element-plus-daterange",
    startValue: verified.sVal,
    endValue: verified.eVal,
    transport: "cdp-real-mouse",
  };
}
