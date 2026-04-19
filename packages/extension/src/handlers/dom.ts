import { DomActions, VtxErrorCode, vtxError } from "@bytenew/vortex-shared";
import type { ActionRouter } from "../lib/router.js";
import type { DebuggerManager } from "../lib/debugger-manager.js";
import { getActiveTabId, buildExecuteTarget } from "../lib/tab-utils.js";
import { getIframeOffset } from "../lib/iframe-offset.js";
import { resolveTarget, resolveTargetOptional } from "../lib/resolve-target.js";
import {
  FILL_REJECT_PATTERNS,
  findDriver,
  type CommitKind,
} from "../patterns/index.js";

export function registerDomHandlers(
  router: ActionRouter,
  debuggerMgr: DebuggerManager,
): void {
  router.registerAll({
    [DomActions.QUERY]: async (args, tabId) => {
      const __t = resolveTarget(args);
      const selector = __t.selector;
      const tid = await getActiveTabId(__t.boundTabId ?? (args.tabId as number | undefined) ?? tabId);
      const frameId = __t.boundFrameId ?? (args.frameId as number | undefined);
      const results = await chrome.scripting.executeScript({
        target: buildExecuteTarget(tid, frameId),
        func: (sel: string) => {
          try {
            const el = document.querySelector(sel);
            if (!el) return { result: null };
            const attrs: Record<string, string> = {};
            for (const attr of Array.from(el.attributes)) {
              attrs[attr.name] = attr.value;
            }
            return {
              result: {
                tag: el.tagName.toLowerCase(),
                id: el.id || undefined,
                classes: Array.from(el.classList),
                text: (el as HTMLElement).innerText?.slice(0, 500),
                attributes: attrs,
              },
            };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
        args: [selector],
        world: "MAIN",
      });
      const res = results[0]?.result as { result?: unknown; error?: string };
      if (res?.error) throw vtxError((res.error.startsWith("Element not found:") || res.error.startsWith("Container not found:")) ? VtxErrorCode.ELEMENT_NOT_FOUND : VtxErrorCode.JS_EXECUTION_ERROR, res.error, selector ? { selector } : undefined);
      return res?.result;
    },

    [DomActions.QUERY_ALL]: async (args, tabId) => {
      const __t = resolveTarget(args);
      const selector = __t.selector;
      const tid = await getActiveTabId(__t.boundTabId ?? (args.tabId as number | undefined) ?? tabId);
      const frameId = __t.boundFrameId ?? (args.frameId as number | undefined);
      const results = await chrome.scripting.executeScript({
        target: buildExecuteTarget(tid, frameId),
        func: (sel: string) => {
          try {
            const elements = Array.from(document.querySelectorAll(sel)).slice(0, 100);
            return {
              result: elements.map((el) => {
                const attrs: Record<string, string> = {};
                for (const attr of Array.from(el.attributes)) {
                  attrs[attr.name] = attr.value;
                }
                return {
                  tag: el.tagName.toLowerCase(),
                  id: el.id || undefined,
                  classes: Array.from(el.classList),
                  text: (el as HTMLElement).innerText?.slice(0, 200),
                  attributes: attrs,
                };
              }),
            };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
        args: [selector],
        world: "MAIN",
      });
      const res = results[0]?.result as { result?: unknown; error?: string };
      if (res?.error) throw vtxError((res.error.startsWith("Element not found:") || res.error.startsWith("Container not found:")) ? VtxErrorCode.ELEMENT_NOT_FOUND : VtxErrorCode.JS_EXECUTION_ERROR, res.error, selector ? { selector } : undefined);
      return res?.result;
    },

    [DomActions.CLICK]: async (args, tabId) => {
      const __t = resolveTarget(args);
      const selector = __t.selector;
      const tid = await getActiveTabId(__t.boundTabId ?? (args.tabId as number | undefined) ?? tabId);
      const frameId = __t.boundFrameId ?? (args.frameId as number | undefined);
      const useRealMouse = args.useRealMouse as boolean | undefined;

      if (useRealMouse) {
        // 取元素中心坐标（含完整探测，与普通 CLICK 路径同步）
        const rectResults = await chrome.scripting.executeScript({
          target: buildExecuteTarget(tid, frameId),
          func: (sel: string) => {
            try {
              // === 探测 ===
              const els = document.querySelectorAll(sel);
              if (els.length === 0) {
                return { errorCode: "ELEMENT_NOT_FOUND", error: `Element not found: ${sel}` };
              }
              if (els.length > 1) {
                return {
                  errorCode: "SELECTOR_AMBIGUOUS",
                  error: `Selector "${sel}" matched ${els.length} elements`,
                  extras: { matchCount: els.length },
                };
              }
              const el = els[0] as HTMLElement;
              if ((el as HTMLInputElement).disabled === true) {
                return { errorCode: "ELEMENT_DISABLED", error: `Element ${sel} is disabled` };
              }
              const rect0 = el.getBoundingClientRect();
              if (rect0.width === 0 || rect0.height === 0) {
                return {
                  errorCode: "ELEMENT_DETACHED",
                  error: `Element ${sel} has zero dimensions (detached or hidden)`,
                };
              }
              // useRealMouse 会 scrollIntoView，所以不做 offscreen 检查
              el.scrollIntoView({ block: "center", inline: "center" });
              const rect = el.getBoundingClientRect();
              const cxInner = rect.left + rect.width / 2;
              const cyInner = rect.top + rect.height / 2;
              // occlusion 检查
              const topEl = document.elementFromPoint(cxInner, cyInner);
              if (topEl && topEl !== el && !el.contains(topEl) && !topEl.contains(el)) {
                const classStr =
                  typeof topEl.className === "string" && topEl.className
                    ? "." + topEl.className.split(" ").filter(Boolean).join(".")
                    : "";
                const desc =
                  topEl.tagName.toLowerCase() +
                  (topEl.id ? "#" + topEl.id : "") +
                  classStr;
                return {
                  errorCode: "ELEMENT_OCCLUDED",
                  error: `Element ${sel} is covered by <${desc}>`,
                  extras: { blocker: desc },
                };
              }
              return {
                result: {
                  x: cxInner,
                  y: cyInner,
                  tag: el.tagName.toLowerCase(),
                  text: el.innerText?.slice(0, 200),
                },
              };
            } catch (err) {
              return { error: err instanceof Error ? err.message : String(err) };
            }
          },
          args: [selector],
          world: "MAIN",
        });
        const rectRes = rectResults[0]?.result as {
          result?: { x: number; y: number; tag: string; text?: string };
          error?: string;
          errorCode?: string;
          extras?: Record<string, unknown>;
        };
        if (rectRes?.error) {
          const code: VtxErrorCode =
            rectRes.errorCode && rectRes.errorCode in VtxErrorCode
              ? (rectRes.errorCode as VtxErrorCode)
              : rectRes.error.startsWith("Element not found:")
                ? VtxErrorCode.ELEMENT_NOT_FOUND
                : VtxErrorCode.JS_EXECUTION_ERROR;
          throw vtxError(code, rectRes.error, { selector, extras: rectRes.extras });
        }
        const { x: cx, y: cy, tag, text } = rectRes.result!;

        // iframe 坐标偏移
        const { x: offsetX, y: offsetY } = await getIframeOffset(tid, frameId);
        const x = cx + offsetX;
        const y = cy + offsetY;

        // CDP 真实鼠标事件
        await debuggerMgr.attach(tid);
        await debuggerMgr.sendCommand(tid, "Input.dispatchMouseEvent", {
          type: "mouseMoved", x, y,
        });
        await debuggerMgr.sendCommand(tid, "Input.dispatchMouseEvent", {
          type: "mousePressed", x, y, button: "left", clickCount: 1,
        });
        await debuggerMgr.sendCommand(tid, "Input.dispatchMouseEvent", {
          type: "mouseReleased", x, y, button: "left", clickCount: 1,
        });

        return {
          success: true,
          element: { tag, text },
          x, y,
          mode: "realMouse",
        };
      }

      // 普通 element.click() 路径（含失败探测）
      const results = await chrome.scripting.executeScript({
        target: buildExecuteTarget(tid, frameId),
        func: (sel: string) => {
          try {
            // 探测阶段：逐项检查失败原因，细化错误码
            const els = document.querySelectorAll(sel);
            if (els.length === 0) {
              return { errorCode: "ELEMENT_NOT_FOUND", error: `Element not found: ${sel}` };
            }
            if (els.length > 1) {
              return {
                errorCode: "SELECTOR_AMBIGUOUS",
                error: `Selector "${sel}" matched ${els.length} elements`,
                extras: { matchCount: els.length },
              };
            }
            const el = els[0] as HTMLElement;
            if ((el as HTMLInputElement).disabled === true) {
              return { errorCode: "ELEMENT_DISABLED", error: `Element ${sel} is disabled` };
            }
            const rect0 = el.getBoundingClientRect();
            if (rect0.width === 0 || rect0.height === 0) {
              return {
                errorCode: "ELEMENT_DETACHED",
                error: `Element ${sel} has zero dimensions (detached or hidden)`,
              };
            }
            // offscreen 检查（滚入视口之前）
            const inView =
              rect0.top < window.innerHeight &&
              rect0.bottom > 0 &&
              rect0.left < window.innerWidth &&
              rect0.right > 0;
            if (!inView) {
              return {
                errorCode: "ELEMENT_OFFSCREEN",
                error: `Element ${sel} is outside the viewport`,
              };
            }
            // 滚入视口后做 occlusion 检查
            el.scrollIntoView({ block: "center", inline: "center" });
            const rect = el.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const topEl = document.elementFromPoint(cx, cy);
            if (topEl && topEl !== el && !el.contains(topEl) && !topEl.contains(el)) {
              const classStr =
                typeof topEl.className === "string" && topEl.className
                  ? "." + topEl.className.split(" ").filter(Boolean).join(".")
                  : "";
              const desc =
                topEl.tagName.toLowerCase() +
                (topEl.id ? "#" + topEl.id : "") +
                classStr;
              return {
                errorCode: "ELEMENT_OCCLUDED",
                error: `Element ${sel} is covered by <${desc}>`,
                extras: { blocker: desc },
              };
            }
            // 通过所有检查，执行 click
            el.click();
            return {
              result: {
                success: true,
                element: {
                  tag: el.tagName.toLowerCase(),
                  id: el.id || undefined,
                  text: el.innerText?.slice(0, 200),
                },
              },
            };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
        args: [selector],
        world: "MAIN",
      });
      const res = results[0]?.result as {
        result?: unknown;
        error?: string;
        errorCode?: string;
        extras?: Record<string, unknown>;
      };
      if (res?.error) {
        const code: VtxErrorCode =
          res.errorCode && res.errorCode in VtxErrorCode
            ? (res.errorCode as VtxErrorCode)
            : res.error.startsWith("Element not found:")
              ? VtxErrorCode.ELEMENT_NOT_FOUND
              : VtxErrorCode.JS_EXECUTION_ERROR;
        throw vtxError(code, res.error, { selector, extras: res.extras });
      }
      return res?.result;
    },

    [DomActions.TYPE]: async (args, tabId) => {
      const __t = resolveTarget(args);
      const selector = __t.selector;
      const text = args.text as string;
      const delay = (args.delay as number | undefined) ?? 0;
      if (text == null) throw vtxError(VtxErrorCode.INVALID_PARAMS, "Missing required param: text");
      const tid = await getActiveTabId(__t.boundTabId ?? (args.tabId as number | undefined) ?? tabId);
      const frameId = __t.boundFrameId ?? (args.frameId as number | undefined);
      const results = await chrome.scripting.executeScript({
        target: buildExecuteTarget(tid, frameId),
        func: async (sel: string, txt: string, delayMs: number) => {
          try {
            // === 探测（与 CLICK 同步；见 CLICK 普通路径）===
            const els = document.querySelectorAll(sel);
            if (els.length === 0) {
              return { errorCode: "ELEMENT_NOT_FOUND", error: `Element not found: ${sel}` };
            }
            if (els.length > 1) {
              return {
                errorCode: "SELECTOR_AMBIGUOUS",
                error: `Selector "${sel}" matched ${els.length} elements`,
                extras: { matchCount: els.length },
              };
            }
            const el = els[0] as HTMLInputElement;
            if (el.disabled === true) {
              return { errorCode: "ELEMENT_DISABLED", error: `Element ${sel} is disabled` };
            }
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
              return {
                errorCode: "ELEMENT_DETACHED",
                error: `Element ${sel} has zero dimensions (detached or hidden)`,
              };
            }
            const inView =
              rect.top < window.innerHeight &&
              rect.bottom > 0 &&
              rect.left < window.innerWidth &&
              rect.right > 0;
            if (!inView) {
              return {
                errorCode: "ELEMENT_OFFSCREEN",
                error: `Element ${sel} is outside the viewport`,
              };
            }
            // === type 操作 ===
            el.focus();
            for (const char of txt) {
              const eventInit = { key: char, bubbles: true, cancelable: true };
              el.dispatchEvent(new KeyboardEvent("keydown", eventInit));
              el.dispatchEvent(new KeyboardEvent("keypress", eventInit));
              if (el.value !== undefined) el.value += char;
              el.dispatchEvent(new InputEvent("input", { bubbles: true, data: char }));
              el.dispatchEvent(new KeyboardEvent("keyup", eventInit));
              if (delayMs > 0) {
                await new Promise((r) => setTimeout(r, delayMs));
              }
            }
            return { result: { success: true, typed: txt.length } };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
        args: [selector, text, delay ?? 0],
        world: "MAIN",
      });
      const res = results[0]?.result as {
        result?: unknown;
        error?: string;
        errorCode?: string;
        extras?: Record<string, unknown>;
      };
      if (res?.error) {
        const code: VtxErrorCode =
          res.errorCode && res.errorCode in VtxErrorCode
            ? (res.errorCode as VtxErrorCode)
            : res.error.startsWith("Element not found:")
              ? VtxErrorCode.ELEMENT_NOT_FOUND
              : VtxErrorCode.JS_EXECUTION_ERROR;
        throw vtxError(code, res.error, { selector, extras: res.extras });
      }
      return res?.result;
    },

    [DomActions.FILL]: async (args, tabId) => {
      const __t = resolveTarget(args);
      const selector = __t.selector;
      const value = args.value as string;
      const fallbackToNative = args.fallbackToNative === true;
      if (value == null) throw vtxError(VtxErrorCode.INVALID_PARAMS, "Missing required param: value");
      const tid = await getActiveTabId(__t.boundTabId ?? (args.tabId as number | undefined) ?? tabId);
      const frameId = __t.boundFrameId ?? (args.frameId as number | undefined);
      const results = await chrome.scripting.executeScript({
        target: buildExecuteTarget(tid, frameId),
        func: (
          sel: string,
          val: string,
          rejectPatterns: {
            id: string;
            closestSelector: string;
            reason: string;
            suggestedTool: string;
          }[],
          allowFallback: boolean,
        ) => {
          try {
            // === 探测（与 CLICK 同步）===
            const els = document.querySelectorAll(sel);
            if (els.length === 0) {
              return { errorCode: "ELEMENT_NOT_FOUND", error: `Element not found: ${sel}` };
            }
            if (els.length > 1) {
              return {
                errorCode: "SELECTOR_AMBIGUOUS",
                error: `Selector "${sel}" matched ${els.length} elements`,
                extras: { matchCount: els.length },
              };
            }
            const el = els[0] as HTMLInputElement;
            if (el.disabled === true) {
              return { errorCode: "ELEMENT_DISABLED", error: `Element ${sel} is disabled` };
            }
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
              return {
                errorCode: "ELEMENT_DETACHED",
                error: `Element ${sel} has zero dimensions (detached or hidden)`,
              };
            }
            const inView =
              rect.top < window.innerHeight &&
              rect.bottom > 0 &&
              rect.left < window.innerWidth &&
              rect.right > 0;
            if (!inView) {
              return {
                errorCode: "ELEMENT_OFFSCREEN",
                error: `Element ${sel} is outside the viewport`,
              };
            }
            // === framework-aware 拒绝（@since 0.4.0）===
            if (!allowFallback) {
              for (const p of rejectPatterns) {
                let hit = false;
                try { hit = !!el.closest(p.closestSelector); } catch { /* 无效选择器跳过 */ }
                if (hit) {
                  return {
                    errorCode: "UNSUPPORTED_TARGET",
                    error: `dom_fill rejected on framework-controlled target (${p.id}): ${p.reason}`,
                    extras: {
                      pattern: p.id,
                      suggestedTool: p.suggestedTool,
                      selector: sel,
                    },
                  };
                }
              }
            }
            // === fill 操作 ===
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype,
              "value",
            )?.set;
            if (nativeInputValueSetter) {
              nativeInputValueSetter.call(el, val);
            } else {
              el.value = val;
            }
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            return { result: { success: true } };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
        args: [selector, value, FILL_REJECT_PATTERNS, fallbackToNative],
        world: "MAIN",
      });
      const res = results[0]?.result as {
        result?: unknown;
        error?: string;
        errorCode?: string;
        extras?: Record<string, unknown>;
      };
      if (res?.error) {
        const code: VtxErrorCode =
          res.errorCode && res.errorCode in VtxErrorCode
            ? (res.errorCode as VtxErrorCode)
            : res.error.startsWith("Element not found:")
              ? VtxErrorCode.ELEMENT_NOT_FOUND
              : VtxErrorCode.JS_EXECUTION_ERROR;
        throw vtxError(code, res.error, { selector, extras: res.extras });
      }
      return res?.result;
    },

    [DomActions.SELECT]: async (args, tabId) => {
      const __t = resolveTarget(args);
      const selector = __t.selector;
      const value = args.value as string;
      if (value == null) throw vtxError(VtxErrorCode.INVALID_PARAMS, "Missing required param: value");
      const tid = await getActiveTabId(__t.boundTabId ?? (args.tabId as number | undefined) ?? tabId);
      const frameId = __t.boundFrameId ?? (args.frameId as number | undefined);
      const results = await chrome.scripting.executeScript({
        target: buildExecuteTarget(tid, frameId),
        func: (sel: string, val: string) => {
          try {
            // === 探测（与 CLICK 同步）===
            const els = document.querySelectorAll(sel);
            if (els.length === 0) {
              return { errorCode: "ELEMENT_NOT_FOUND", error: `Element not found: ${sel}` };
            }
            if (els.length > 1) {
              return {
                errorCode: "SELECTOR_AMBIGUOUS",
                error: `Selector "${sel}" matched ${els.length} elements`,
                extras: { matchCount: els.length },
              };
            }
            const el = els[0] as HTMLSelectElement;
            if (el.disabled === true) {
              return { errorCode: "ELEMENT_DISABLED", error: `Element ${sel} is disabled` };
            }
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
              return {
                errorCode: "ELEMENT_DETACHED",
                error: `Element ${sel} has zero dimensions (detached or hidden)`,
              };
            }
            const inView =
              rect.top < window.innerHeight &&
              rect.bottom > 0 &&
              rect.left < window.innerWidth &&
              rect.right > 0;
            if (!inView) {
              return {
                errorCode: "ELEMENT_OFFSCREEN",
                error: `Element ${sel} is outside the viewport`,
              };
            }
            // === select 操作 ===
            el.value = val;
            el.dispatchEvent(new Event("change", { bubbles: true }));
            return { result: { success: true, value: el.value } };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
        args: [selector, value],
        world: "MAIN",
      });
      const res = results[0]?.result as {
        result?: unknown;
        error?: string;
        errorCode?: string;
        extras?: Record<string, unknown>;
      };
      if (res?.error) {
        const code: VtxErrorCode =
          res.errorCode && res.errorCode in VtxErrorCode
            ? (res.errorCode as VtxErrorCode)
            : res.error.startsWith("Element not found:")
              ? VtxErrorCode.ELEMENT_NOT_FOUND
              : VtxErrorCode.JS_EXECUTION_ERROR;
        throw vtxError(code, res.error, { selector, extras: res.extras });
      }
      return res?.result;
    },

    [DomActions.SCROLL]: async (args, tabId) => {
      const __t = resolveTargetOptional(args);
      const selector = __t?.selector;
      const container = args.container as string | undefined;
      const position = args.position as string | undefined;
      const x = args.x as number | undefined;
      const y = args.y as number | undefined;
      if (!selector && !position && x === undefined && y === undefined) {
        throw vtxError(
          VtxErrorCode.INVALID_PARAMS,
          "Must specify selector/index, position, or x/y coordinates",
        );
      }
      const tid = await getActiveTabId(__t?.boundTabId ?? (args.tabId as number | undefined) ?? tabId);
      const frameId = __t?.boundFrameId ?? (args.frameId as number | undefined);
      const results = await chrome.scripting.executeScript({
        target: buildExecuteTarget(tid, frameId),
        func: (
          sel: string | undefined,
          cont: string | undefined,
          pos: string | undefined,
          sx: number | undefined,
          sy: number | undefined,
        ) => {
          try {
            // 确定滚动容器
            let scrollTarget: Element | Window = window;
            if (cont) {
              const containerEl = document.querySelector(cont);
              if (!containerEl) return { error: `Container not found: ${cont}` };
              scrollTarget = containerEl;
            }

            // 如果指定了目标元素，滚动到该元素
            if (sel) {
              const el = document.querySelector(sel);
              if (!el) return { error: `Element not found: ${sel}` };
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              return { result: { success: true } };
            }

            // 根据 position 滚动
            if (pos) {
              const scrollOpts: ScrollToOptions = { behavior: "smooth" };
              if (pos === "top") { scrollOpts.top = 0; }
              else if (pos === "bottom") { scrollOpts.top = 999999; }
              else if (pos === "left") { scrollOpts.left = 0; }
              else if (pos === "right") { scrollOpts.left = 999999; }
              if (scrollTarget instanceof Window) {
                scrollTarget.scrollTo(scrollOpts);
              } else {
                (scrollTarget as Element).scrollTo(scrollOpts);
              }
              return { result: { success: true } };
            }

            // 滚动到指定坐标
            if (sx !== undefined || sy !== undefined) {
              const scrollOpts: ScrollToOptions = { behavior: "smooth" };
              if (sx !== undefined) scrollOpts.left = sx;
              if (sy !== undefined) scrollOpts.top = sy;
              if (scrollTarget instanceof Window) {
                scrollTarget.scrollTo(scrollOpts);
              } else {
                (scrollTarget as Element).scrollTo(scrollOpts);
              }
              return { result: { success: true } };
            }

            return { error: "Must specify selector, position, or x/y coordinates" };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
        args: [selector ?? null, container ?? null, position ?? null, x ?? null, y ?? null],
        world: "MAIN",
      });
      const res = results[0]?.result as { result?: unknown; error?: string };
      if (res?.error) throw vtxError((res.error.startsWith("Element not found:") || res.error.startsWith("Container not found:")) ? VtxErrorCode.ELEMENT_NOT_FOUND : VtxErrorCode.JS_EXECUTION_ERROR, res.error, selector ? { selector } : undefined);
      return res?.result;
    },

    [DomActions.HOVER]: async (args, tabId) => {
      const __t = resolveTarget(args);
      const selector = __t.selector;
      const tid = await getActiveTabId(__t.boundTabId ?? (args.tabId as number | undefined) ?? tabId);
      const frameId = __t.boundFrameId ?? (args.frameId as number | undefined);
      const results = await chrome.scripting.executeScript({
        target: buildExecuteTarget(tid, frameId),
        func: (sel: string) => {
          try {
            // === 探测（与 CLICK 同步；HOVER 不检查 disabled，disabled 元素仍可收 hover 事件）===
            const els = document.querySelectorAll(sel);
            if (els.length === 0) {
              return { errorCode: "ELEMENT_NOT_FOUND", error: `Element not found: ${sel}` };
            }
            if (els.length > 1) {
              return {
                errorCode: "SELECTOR_AMBIGUOUS",
                error: `Selector "${sel}" matched ${els.length} elements`,
                extras: { matchCount: els.length },
              };
            }
            const el = els[0] as HTMLElement;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
              return {
                errorCode: "ELEMENT_DETACHED",
                error: `Element ${sel} has zero dimensions (detached or hidden)`,
              };
            }
            // === hover 操作 ===
            el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true, cancelable: true }));
            el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true }));
            return { result: { success: true } };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
        args: [selector],
        world: "MAIN",
      });
      const res = results[0]?.result as {
        result?: unknown;
        error?: string;
        errorCode?: string;
        extras?: Record<string, unknown>;
      };
      if (res?.error) {
        const code: VtxErrorCode =
          res.errorCode && res.errorCode in VtxErrorCode
            ? (res.errorCode as VtxErrorCode)
            : res.error.startsWith("Element not found:")
              ? VtxErrorCode.ELEMENT_NOT_FOUND
              : VtxErrorCode.JS_EXECUTION_ERROR;
        throw vtxError(code, res.error, { selector, extras: res.extras });
      }
      return res?.result;
    },

    [DomActions.GET_ATTRIBUTE]: async (args, tabId) => {
      const __t = resolveTarget(args);
      const selector = __t.selector;
      const attribute = args.attribute as string;
      if (!attribute) throw vtxError(VtxErrorCode.INVALID_PARAMS, "Missing required param: attribute");
      const tid = await getActiveTabId(__t.boundTabId ?? (args.tabId as number | undefined) ?? tabId);
      const frameId = __t.boundFrameId ?? (args.frameId as number | undefined);
      const results = await chrome.scripting.executeScript({
        target: buildExecuteTarget(tid, frameId),
        func: (sel: string, attr: string) => {
          try {
            const el = document.querySelector(sel);
            if (!el) return { error: `Element not found: ${sel}` };
            return { result: el.getAttribute(attr) };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
        args: [selector, attribute],
        world: "MAIN",
      });
      const res = results[0]?.result as { result?: unknown; error?: string };
      if (res?.error) throw vtxError((res.error.startsWith("Element not found:") || res.error.startsWith("Container not found:")) ? VtxErrorCode.ELEMENT_NOT_FOUND : VtxErrorCode.JS_EXECUTION_ERROR, res.error, selector ? { selector } : undefined);
      return res?.result;
    },

    [DomActions.GET_SCROLL_INFO]: async (args, tabId) => {
      const __t = resolveTargetOptional(args);
      const selector = __t?.selector;
      const tid = await getActiveTabId(__t?.boundTabId ?? (args.tabId as number | undefined) ?? tabId);
      const frameId = __t?.boundFrameId ?? (args.frameId as number | undefined);
      const results = await chrome.scripting.executeScript({
        target: buildExecuteTarget(tid, frameId),
        func: (sel: string | undefined) => {
          try {
            if (sel) {
              const el = document.querySelector(sel);
              if (!el) return { error: `Element not found: ${sel}` };
              return {
                result: {
                  scrollTop: el.scrollTop,
                  scrollLeft: el.scrollLeft,
                  scrollHeight: el.scrollHeight,
                  scrollWidth: el.scrollWidth,
                  clientHeight: el.clientHeight,
                  clientWidth: el.clientWidth,
                },
              };
            }
            return {
              result: {
                scrollTop: window.scrollY,
                scrollLeft: window.scrollX,
                scrollHeight: document.documentElement.scrollHeight,
                scrollWidth: document.documentElement.scrollWidth,
                clientHeight: document.documentElement.clientHeight,
                clientWidth: document.documentElement.clientWidth,
              },
            };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
        args: [selector ?? null],
        world: "MAIN",
      });
      const res = results[0]?.result as { result?: unknown; error?: string };
      if (res?.error) throw vtxError((res.error.startsWith("Element not found:") || res.error.startsWith("Container not found:")) ? VtxErrorCode.ELEMENT_NOT_FOUND : VtxErrorCode.JS_EXECUTION_ERROR, res.error, selector ? { selector } : undefined);
      return res?.result;
    },

    [DomActions.WAIT_FOR_MUTATION]: async (args, tabId) => {
      const __t = resolveTarget(args);
      const selector = __t.selector;
      const timeout = (args.timeout as number | undefined) ?? 10000;
      const tid = await getActiveTabId(__t.boundTabId ?? (args.tabId as number | undefined) ?? tabId);
      const frameId = __t.boundFrameId ?? (args.frameId as number | undefined);
      const results = await chrome.scripting.executeScript({
        target: buildExecuteTarget(tid, frameId),
        func: (sel: string, timeoutMs: number) => {
          return new Promise<{ result?: unknown; error?: string }>((resolve) => {
            try {
              const el = document.querySelector(sel);
              if (!el) {
                resolve({ error: `Element not found: ${sel}` });
                return;
              }
              let settled = false;
              const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                observer.disconnect();
                resolve({ result: { mutated: false } });
              }, timeoutMs);

              const observer = new MutationObserver(() => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                observer.disconnect();
                resolve({ result: { mutated: true } });
              });

              observer.observe(el, { childList: true, subtree: true });
            } catch (err) {
              resolve({ error: err instanceof Error ? err.message : String(err) });
            }
          });
        },
        args: [selector, timeout],
        world: "MAIN",
      });
      const res = results[0]?.result as { result?: unknown; error?: string };
      if (res?.error) throw vtxError((res.error.startsWith("Element not found:") || res.error.startsWith("Container not found:")) ? VtxErrorCode.ELEMENT_NOT_FOUND : VtxErrorCode.JS_EXECUTION_ERROR, res.error, selector ? { selector } : undefined);
      return res?.result;
    },

    [DomActions.WAIT_SETTLED]: async (args, tabId) => {
      // selector 可选；无 selector 时监视 document.body 整棵
      const __t = resolveTargetOptional(args);
      const selector = __t?.selector;
      const quietMs = (args.quietMs as number | undefined) ?? 300;
      const timeout = (args.timeout as number | undefined) ?? 8000;
      const tid = await getActiveTabId(
        __t?.boundTabId ?? (args.tabId as number | undefined) ?? tabId,
      );
      const frameId = __t?.boundFrameId ?? (args.frameId as number | undefined);
      const results = await chrome.scripting.executeScript({
        target: buildExecuteTarget(tid, frameId),
        func: (sel: string | null, quiet: number, to: number) => {
          return new Promise<{ result?: unknown; error?: string }>((resolve) => {
            try {
              const root = sel ? document.querySelector(sel) : document.body;
              if (!root) {
                resolve({ error: sel ? `Element not found: ${sel}` : "document.body not found" });
                return;
              }
              const start = Date.now();
              let settled = false;
              let quietTimer: ReturnType<typeof setTimeout> | null = null;
              let mutationsSeen = 0;

              const timeoutTimer = setTimeout(() => {
                if (settled) return;
                settled = true;
                obs.disconnect();
                if (quietTimer) clearTimeout(quietTimer);
                resolve({
                  error: `DOM did not settle within ${to}ms (${mutationsSeen} mutations observed)`,
                  // 标识 TIMEOUT，便于 handler 分类
                  // 约定：以 "DOM did not settle" 开头 → TIMEOUT
                });
              }, to);

              const startQuiet = () => {
                if (quietTimer) clearTimeout(quietTimer);
                quietTimer = setTimeout(() => {
                  if (settled) return;
                  settled = true;
                  obs.disconnect();
                  clearTimeout(timeoutTimer);
                  resolve({
                    result: {
                      settled: true,
                      waitedMs: Date.now() - start,
                      mutationsSeen,
                    },
                  });
                }, quiet);
              };

              const obs = new MutationObserver(() => {
                mutationsSeen++;
                startQuiet();
              });
              obs.observe(root, { childList: true, subtree: true, attributes: true });
              // 立即开 quiet 窗口（"已经静止"情况下直接到期 resolve）
              startQuiet();
            } catch (err) {
              resolve({ error: err instanceof Error ? err.message : String(err) });
            }
          });
        },
        args: [selector ?? null, quietMs, timeout],
        world: "MAIN",
      });
      const res = results[0]?.result as { result?: unknown; error?: string };
      if (res?.error) {
        const isTimeout = res.error.startsWith("DOM did not settle");
        const isNotFound =
          res.error.startsWith("Element not found:") ||
          res.error.startsWith("document.body not found");
        const code = isTimeout
          ? VtxErrorCode.TIMEOUT
          : isNotFound
            ? VtxErrorCode.ELEMENT_NOT_FOUND
            : VtxErrorCode.JS_EXECUTION_ERROR;
        throw vtxError(code, res.error, selector ? { selector } : undefined);
      }
      return res?.result;
    },

    [DomActions.COMMIT]: async (args, tabId) => {
      const kind = args.kind as CommitKind | undefined;
      const value = args.value as unknown;
      const timeout = (args.timeout as number | undefined) ?? 8000;
      if (!kind) throw vtxError(VtxErrorCode.INVALID_PARAMS, "Missing required param: kind");
      if (value == null) throw vtxError(VtxErrorCode.INVALID_PARAMS, "Missing required param: value");
      const driver = findDriver(kind);
      if (!driver)
        throw vtxError(
          VtxErrorCode.INVALID_PARAMS,
          `No commit driver for kind=${kind}. Known: ${["datetimerange", "daterange", "cascader", "select"].join(", ")}`,
        );

      const __t = resolveTarget(args);
      const selector = __t.selector;
      const tid = await getActiveTabId(__t.boundTabId ?? (args.tabId as number | undefined) ?? tabId);
      const frameId = __t.boundFrameId ?? (args.frameId as number | undefined);

      const results = await chrome.scripting.executeScript({
        target: buildExecuteTarget(tid, frameId),
        func: (
          sel: string,
          driverId: string,
          closestSelector: string,
          val: unknown,
          timeoutMs: number,
        ) => {
          // ---- 页面侧完整流程：返回 { result?, error?, errorCode?, stage? } ----
          const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
          async function waitFor<T>(
            probe: () => T | null | undefined,
            to: number,
            intervalMs = 50,
          ): Promise<T | null> {
            const deadline = Date.now() + to;
            while (Date.now() < deadline) {
              const r = probe();
              if (r) return r;
              await sleep(intervalMs);
            }
            return null;
          }

          function parseYMD(s: string): { year: number; month: number; day: number } | null {
            // 接受 "YYYY-MM-DD" 或 "YYYY-MM-DD HH:MM:SS"
            const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
            if (!m) return null;
            return { year: +m[1], month: +m[2], day: +m[3] };
          }

          function readHeaderYM(hdr: Element | null | undefined): { year: number; month: number } | null {
            if (!hdr) return null;
            const t = (hdr as HTMLElement).innerText || "";
            const m = t.match(/(\d{4})\D+(\d{1,2})/);
            return m ? { year: +m[1], month: +m[2] } : null;
          }

          function monthDelta(a: { year: number; month: number }, b: { year: number; month: number }): number {
            return (a.year - b.year) * 12 + (a.month - b.month);
          }

          function findDayCell(content: Element | null, day: number): HTMLElement | null {
            if (!content) return null;
            const tds = content.querySelectorAll("td");
            for (const td of Array.from(tds)) {
              const cls = td.className;
              if (cls.includes("disabled") || cls.includes("prev-month") || cls.includes("next-month")) continue;
              const cell = (td.querySelector(".cell") as HTMLElement | null) ?? (td as HTMLElement);
              if ((cell.innerText || "").trim() === String(day)) return td as HTMLElement;
            }
            return null;
          }

          function dispatchMouseClick(el: HTMLElement): void {
            const rect = el.getBoundingClientRect();
            const opts = {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: rect.left + rect.width / 2,
              clientY: rect.top + rect.height / 2,
            };
            el.dispatchEvent(new MouseEvent("mousedown", opts));
            el.dispatchEvent(new MouseEvent("mouseup", opts));
            el.dispatchEvent(new MouseEvent("click", opts));
          }

          try {
            const els = document.querySelectorAll(sel);
            if (els.length === 0) return { error: `Element not found: ${sel}`, errorCode: "ELEMENT_NOT_FOUND" };
            if (els.length > 1)
              return {
                error: `Selector "${sel}" matched ${els.length} elements`,
                errorCode: "SELECTOR_AMBIGUOUS",
                extras: { matchCount: els.length },
              };
            const target = els[0] as HTMLElement;
            const root = target.closest(closestSelector) as HTMLElement | null;
            if (!root)
              return {
                error: `Target does not match driver closestSelector "${closestSelector}"`,
                errorCode: "UNSUPPORTED_TARGET",
                extras: { driverId },
              };

            // -------- Element Plus datetime/date range driver --------
            if (driverId === "element-plus-datetimerange" || driverId === "element-plus-daterange") {
              const isDateTime = driverId === "element-plus-datetimerange";
              const v = val as { start?: string; end?: string };
              if (!v?.start || !v?.end)
                return {
                  error: `value must be { start, end }, got ${JSON.stringify(v)}`,
                  errorCode: "INVALID_PARAMS",
                };
              const ts = parseYMD(v.start);
              const te = parseYMD(v.end);
              if (!ts || !te)
                return {
                  error: `value.start/end must start with YYYY-MM-DD, got ${v.start} / ${v.end}`,
                  errorCode: "INVALID_PARAMS",
                };

              const startInput = root.querySelector(
                'input.el-range-input[placeholder*="开始"], input.el-range-input[placeholder*="Start"]',
              ) as HTMLInputElement | null;
              const endInput = root.querySelector(
                'input.el-range-input[placeholder*="结束"], input.el-range-input[placeholder*="End"]',
              ) as HTMLInputElement | null;
              const allRangeInputs = root.querySelectorAll("input.el-range-input");
              const sIn = startInput ?? (allRangeInputs[0] as HTMLInputElement | undefined);
              const eIn = endInput ?? (allRangeInputs[1] as HTMLInputElement | undefined);
              if (!sIn || !eIn)
                return {
                  error: "Range inputs not found under .el-date-editor",
                  errorCode: "COMMIT_FAILED",
                  stage: "resolve-inputs",
                };

              // 1. 打开 picker（click 起始输入）
              sIn.scrollIntoView({ block: "center", inline: "center" });
              sIn.focus();
              dispatchMouseClick(sIn);

              // 2. 等 picker 出现
              return (async () => {
                const panel = await waitFor(
                  () => document.querySelector(".el-date-range-picker") as HTMLElement | null,
                  timeoutMs,
                );
                if (!panel)
                  return {
                    error: "Picker did not open within timeout",
                    errorCode: "COMMIT_FAILED",
                    stage: "open-picker",
                  };

                const hdrs = () => panel.querySelectorAll(".el-date-range-picker__header");

                // 3. 导航左面板到 start 月
                let safety = 60;
                while (safety-- > 0) {
                  const cur = readHeaderYM(hdrs()[0]);
                  if (!cur) break;
                  const d = monthDelta(cur, ts);
                  if (d === 0) break;
                  const btn = panel.querySelector(d > 0 ? ".arrow-left" : ".arrow-right") as HTMLElement | null;
                  if (!btn) break;
                  dispatchMouseClick(btn);
                  await sleep(30);
                }

                // 4. 点击 start 日
                const leftContent = panel.querySelector(".el-date-range-picker__content.is-left");
                const startCell = findDayCell(leftContent, ts.day);
                if (!startCell)
                  return {
                    error: `Start day cell ${ts.year}-${ts.month}-${ts.day} not found`,
                    errorCode: "COMMIT_FAILED",
                    stage: "click-start",
                  };
                dispatchMouseClick(startCell);
                await sleep(30);

                // 5. 导航右面板到 end 月（右 header 往目标移动；点 arrow-right 使两面板前进）
                safety = 60;
                while (safety-- > 0) {
                  const cur = readHeaderYM(hdrs()[1]);
                  if (!cur) break;
                  const d = monthDelta(cur, te);
                  if (d === 0) break;
                  const btn = panel.querySelector(d > 0 ? ".arrow-left" : ".arrow-right") as HTMLElement | null;
                  if (!btn) break;
                  dispatchMouseClick(btn);
                  await sleep(30);
                }

                // 6. 点击 end 日（优先右面板，若右面板显示的还是 start 月则在左面板里找）
                let rightContent = panel.querySelector(".el-date-range-picker__content.is-right");
                let endCell = findDayCell(rightContent, te.day);
                if (!endCell) {
                  const leftNow = panel.querySelector(".el-date-range-picker__content.is-left");
                  endCell = findDayCell(leftNow, te.day);
                }
                if (!endCell)
                  return {
                    error: `End day cell ${te.year}-${te.month}-${te.day} not found`,
                    errorCode: "COMMIT_FAILED",
                    stage: "click-end",
                  };
                dispatchMouseClick(endCell);
                await sleep(30);

                // 7. has-time 时点底部"确定"
                if (isDateTime && panel.classList.contains("has-time")) {
                  const okBtn = Array.from(panel.querySelectorAll("button")).find(
                    (b) => ((b as HTMLElement).innerText || "").trim() === "确定" || ((b as HTMLElement).innerText || "").trim() === "OK",
                  ) as HTMLButtonElement | undefined;
                  if (okBtn) dispatchMouseClick(okBtn);
                }

                // 8. 等 picker 关闭
                await waitFor(() => {
                  const p = document.querySelector(".el-date-range-picker") as HTMLElement | null;
                  if (!p) return true;
                  return p.getBoundingClientRect().width === 0 ? true : null;
                }, 2000);

                // 9. 校验输入值
                const sVal = sIn.value;
                const eVal = eIn.value;
                const expectStart = `${ts.year}-${String(ts.month).padStart(2, "0")}-${String(ts.day).padStart(2, "0")}`;
                const expectEnd = `${te.year}-${String(te.month).padStart(2, "0")}-${String(te.day).padStart(2, "0")}`;
                if (!sVal.startsWith(expectStart) || !eVal.startsWith(expectEnd))
                  return {
                    error: `Inputs did not commit: got "${sVal}" / "${eVal}", expected to start with "${expectStart}" / "${expectEnd}"`,
                    errorCode: "COMMIT_FAILED",
                    stage: "verify",
                    extras: { startValue: sVal, endValue: eVal },
                  };

                return {
                  result: {
                    success: true,
                    driver: driverId,
                    startValue: sVal,
                    endValue: eVal,
                  },
                };
              })();
            }

            // -------- Element Plus checkbox-group driver (O-10, @since 0.4.0) --------
            if (driverId === "element-plus-checkbox-group") {
              const v = val as { values?: string[] };
              if (!v || !Array.isArray(v.values)) {
                return {
                  error: `value must be { values: string[] }, got ${JSON.stringify(v)}`,
                  errorCode: "INVALID_PARAMS",
                };
              }
              const target = new Set(v.values.map((s) => String(s).trim()));

              return (async () => {
                const btns = Array.from(root.querySelectorAll(".el-checkbox-button")) as HTMLElement[];
                if (btns.length === 0) {
                  return {
                    error: "No .el-checkbox-button children found under .el-checkbox-group",
                    errorCode: "COMMIT_FAILED",
                    stage: "resolve-buttons",
                  };
                }
                const unknownTargets = [...target].filter(
                  (name) => !btns.some((b) => (b.innerText || "").trim() === name),
                );
                if (unknownTargets.length > 0) {
                  const available = btns.map((b) => (b.innerText || "").trim());
                  return {
                    error: `Unknown label(s): ${unknownTargets.join(",")}. Available: ${available.join(",")}`,
                    errorCode: "INVALID_PARAMS",
                    extras: { unknownTargets, available },
                  };
                }

                // 关键：逐个 click + 让 Vue 跑一个 microtask/动画帧再下一个。
                // 直接 forEach 同步点会被 Element Plus 的 click-group 合并成"只认最后一次"。
                const dispatchReal = (el: HTMLElement) => {
                  const input = el.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
                  // 点 label 比点 input 更稳：label 上有 @click.prevent + Vue 侧更新 v-model
                  if (input) input.click();
                  else el.click();
                };
                const tick = () => new Promise((r) => setTimeout(r, 40));

                const toggled: string[] = [];
                for (const b of btns) {
                  const name = (b.innerText || "").trim();
                  const isChecked = b.classList.contains("is-checked");
                  const shouldCheck = target.has(name);
                  if (isChecked === shouldCheck) continue;
                  dispatchReal(b);
                  toggled.push(name);
                  await tick();
                }

                // 校验：再读一遍实际 checked 状态，要求与目标一致
                const checkedNow = btns
                  .filter((b) => b.classList.contains("is-checked"))
                  .map((b) => (b.innerText || "").trim())
                  .sort();
                const wanted = [...target].sort();
                const ok =
                  checkedNow.length === wanted.length &&
                  checkedNow.every((n, i) => n === wanted[i]);
                if (!ok) {
                  return {
                    error: `Checkbox state did not converge: got [${checkedNow.join(",")}], expected [${wanted.join(",")}]`,
                    errorCode: "COMMIT_FAILED",
                    stage: "verify",
                    extras: { checkedNow, wanted, toggled },
                  };
                }

                return {
                  result: {
                    success: true,
                    driver: driverId,
                    checked: checkedNow,
                    toggled,
                  },
                };
              })();
            }

            return {
              error: `Unknown driver id: ${driverId}`,
              errorCode: "INVALID_PARAMS",
            };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
        args: [selector, driver.id, driver.closestSelector, value as never, timeout],
        world: "MAIN",
      });

      const res = results[0]?.result as {
        result?: unknown;
        error?: string;
        errorCode?: string;
        stage?: string;
        extras?: Record<string, unknown>;
      };
      if (res?.error) {
        const known = res.errorCode && res.errorCode in VtxErrorCode;
        const code = known ? (res.errorCode as VtxErrorCode) : VtxErrorCode.JS_EXECUTION_ERROR;
        const extras: Record<string, unknown> = { ...(res.extras ?? {}), driverId: driver.id };
        if (res.stage) extras.stage = res.stage;
        throw vtxError(code, res.error, { selector, extras });
      }
      return res?.result;
    },
  });
}
