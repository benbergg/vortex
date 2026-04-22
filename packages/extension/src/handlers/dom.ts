import { DomActions, VtxErrorCode, vtxError } from "@bytenew/vortex-shared";
import type { ActionRouter } from "../lib/router.js";
import type { DebuggerManager } from "../lib/debugger-manager.js";
import { getActiveTabId, buildExecuteTarget } from "../lib/tab-utils.js";
import { getIframeOffset } from "../lib/iframe-offset.js";
import { resolveTarget, resolveTargetOptional } from "../lib/resolve-target.js";
import {
  FILL_REJECT_PATTERNS,
  findDriver,
  COMMIT_DRIVERS,
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
                    error:
                      `dom_fill rejected on framework-controlled target (${p.id}): ${p.reason} ` +
                      `Retry with ${p.suggestedTool}. Example: ${p.fixExample}`,
                    extras: {
                      pattern: p.id,
                      suggestedTool: p.suggestedTool,
                      fixExample: p.fixExample,
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
      if (!driver) {
        const known = COMMIT_DRIVERS.map((d) => d.kind);
        throw vtxError(
          VtxErrorCode.INVALID_PARAMS,
          `No commit driver for kind=${kind}. Known: ${known.join(", ")}`,
        );
      }

      const __t = resolveTarget(args);
      const selector = __t.selector;
      const tid = await getActiveTabId(__t.boundTabId ?? (args.tabId as number | undefined) ?? tabId);
      const frameId = __t.boundFrameId ?? (args.frameId as number | undefined);

      // daterange/datetimerange 走 CDP 真鼠标路径：dispatchMouseEvent 是 untrusted,
      // Element Plus 某些 handler 检查 isTrusted 后不同步 v-model。
      if (driver.kind === "daterange" || driver.kind === "datetimerange") {
        return await runDateRangeDriverCDP({
          tid,
          frameId,
          selector,
          closestSelector: driver.closestSelector,
          isDateTime: driver.kind === "datetimerange",
          value: value as { start?: string; end?: string },
          timeout,
          debuggerMgr,
        });
      }

      // cascader 也走 CDP：trigger 对 JS .click() 不响应，但 panel 内 node labels
      // 用 page-side .click() 可以逐级展开，混合路径省一堆 CDP 往返。
      if (driver.kind === "cascader") {
        return await runCascaderDriverCDP({
          tid,
          frameId,
          selector,
          closestSelector: driver.closestSelector,
          value: value as unknown[],
          timeout,
          debuggerMgr,
        });
      }

      // time picker：CDP 打开 panel + 三列 spinner click + 点 OK
      if (driver.kind === "time") {
        return await runTimePickerDriverCDP({
          tid,
          frameId,
          selector,
          closestSelector: driver.closestSelector,
          value: String(value),
          timeout,
          debuggerMgr,
        });
      }

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
            const raw = (hdr as HTMLElement).innerText || hdr.textContent || "";
            const t = raw.toLowerCase();
            // 先抓 4 位 year
            const yMatch = t.match(/\b(\d{4})\b/);
            if (!yMatch) return null;
            const year = +yMatch[1];
            // 中文 "2026 年 4 月" 或 "2026年4月"：year 后的数字月
            const numAfter = t.match(/\d{4}\D+(\d{1,2})/);
            if (numAfter && +numAfter[1] >= 1 && +numAfter[1] <= 12) {
              return { year, month: +numAfter[1] };
            }
            // 英文全月名（Element Plus 默认英文 locale 输出 "2026 April"）
            const EN_MONTHS = [
              "january", "february", "march", "april", "may", "june",
              "july", "august", "september", "october", "november", "december",
            ];
            for (let i = 0; i < EN_MONTHS.length; i++) {
              if (new RegExp(`\\b${EN_MONTHS[i]}\\b`).test(t)) {
                return { year, month: i + 1 };
              }
            }
            return null;
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
            // 允许 target 自身/祖先，或 target 子孙匹配 closestSelector。
            // 这样 agent 可以把 [data-testid=wrapper] 作为 target，不必精确指到 driver 根节点。
            const root = (target.closest(closestSelector) ??
              target.querySelector(closestSelector)) as HTMLElement | null;
            if (!root)
              return {
                error: `Target does not match driver closestSelector "${closestSelector}" (neither ancestor nor descendant)`,
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
              // 接受两种形状：value: string[]（推荐，简洁）或 { values: string[] }（兼容旧）
              const v = val as { values?: string[] } | string[];
              const labels: string[] | null = Array.isArray(v)
                ? (v as string[])
                : Array.isArray(v?.values)
                  ? (v.values as string[])
                  : null;
              if (!labels) {
                return {
                  error: `value must be string[] or { values: string[] }, got ${JSON.stringify(v)}`,
                  errorCode: "INVALID_PARAMS",
                };
              }
              const target = new Set(labels.map((s) => String(s).trim()));

              return (async () => {
                // 支持 button 风格（.el-checkbox-button）和 label 风格（.el-checkbox）
                const btns = Array.from(
                  root.querySelectorAll(".el-checkbox-button, .el-checkbox"),
                ) as HTMLElement[];
                if (btns.length === 0) {
                  return {
                    error: "No .el-checkbox-button or .el-checkbox children under .el-checkbox-group",
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

            // -------- Element Plus el-select driver --------
            if (driverId === "element-plus-select") {
              const labels = Array.isArray(val)
                ? (val as unknown[]).map((v) => String(v))
                : [String(val)];
              const isMultiple = Array.isArray(val) || root.classList.contains("is-multiple");

              // trigger：el-select 2.x 是 .el-select__wrapper，老版本是 .select-trigger
              const wrapper =
                (root.querySelector(".el-select__wrapper") as HTMLElement | null) ??
                (root.querySelector(".select-trigger") as HTMLElement | null) ??
                (root as HTMLElement);

              return (async () => {
                // 1. 点 wrapper 打开 popper
                wrapper.scrollIntoView({ block: "center", inline: "center" });
                dispatchMouseClick(wrapper);

                // 2. 等当前 select 的 dropdown 出现并可见
                //    el-select 的 wrapper 有 aria-controls 指向 popper id
                const popperId = wrapper.getAttribute("aria-controls");
                const dropdown = await waitFor(() => {
                  if (popperId) {
                    const el = document.getElementById(popperId);
                    if (el && el.getBoundingClientRect().width > 0) return el as HTMLElement;
                  }
                  // fallback：扫所有可见 dropdown，取第一个
                  const all = document.querySelectorAll(".el-select-dropdown");
                  for (const d of Array.from(all)) {
                    if ((d as HTMLElement).getBoundingClientRect().width > 0) return d as HTMLElement;
                  }
                  return null;
                }, timeoutMs);
                if (!dropdown) {
                  return {
                    error: "Select dropdown did not open within timeout",
                    errorCode: "COMMIT_FAILED",
                    stage: "open-dropdown",
                  };
                }

                // 3. 每个 label 找对应 option click
                const clicked: string[] = [];
                const unknown: string[] = [];
                for (const label of labels) {
                  const items = Array.from(
                    dropdown.querySelectorAll(".el-select-dropdown__item"),
                  ) as HTMLElement[];
                  const hit = items.find((it) => (it.textContent || "").trim() === label);
                  if (!hit) {
                    unknown.push(label);
                    continue;
                  }
                  dispatchMouseClick(hit);
                  clicked.push(label);
                  await sleep(40); // 让 Vue 跑一个 tick 再点下一个
                }

                // 4. multi-select 点 wrapper 关闭 popper；single-select 会自动关
                if (isMultiple && dropdown.getBoundingClientRect().width > 0) {
                  dispatchMouseClick(wrapper);
                  await sleep(40);
                }

                if (unknown.length > 0) {
                  const available = Array.from(
                    dropdown.querySelectorAll(".el-select-dropdown__item"),
                  ).map((i) => ((i as HTMLElement).textContent || "").trim());
                  return {
                    error: `Unknown option label(s): ${unknown.join(", ")}. Available: ${available.join(", ")}`,
                    errorCode: "INVALID_PARAMS",
                    extras: { unknown, available },
                  };
                }

                return {
                  result: {
                    success: true,
                    driver: driverId,
                    multiple: isMultiple,
                    clicked,
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

// ---- daterange / datetimerange CDP 真鼠标驱动 ----
// 原因：Element Plus 的 date picker 某些 handler 检查 event.isTrusted。
// scripting.executeScript + dispatchMouseEvent 得到的是 untrusted 事件，
// UI 看着有动作（day cell 能选中）但 v-model 不更新。只有 CDP
// Input.dispatchMouseEvent 产生的 isTrusted=true 事件能完整驱动。

function parseYMDLocal(s: string): { year: number; month: number; day: number } | null {
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  return { year: +m[1], month: +m[2], day: +m[3] };
}

async function runDateRangeDriverCDP(opts: {
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

  // page-side 查询 helper：传入 top-level func 字面量
  async function pageQuery<T>(
    fn: (...args: unknown[]) => T,
    args: unknown[] = [],
  ): Promise<T> {
    const r = await chrome.scripting.executeScript({
      target: buildExecuteTarget(tid, frameId),
      func: fn,
      args,
      world: "MAIN",
    });
    return r[0]?.result as T;
  }

  // CDP 真鼠标 click at page-coords
  async function clickBBox(cx: number, cy: number): Promise<void> {
    const { x: ox, y: oy } = await getIframeOffset(tid, frameId);
    const x = cx + ox;
    const y = cy + oy;
    await debuggerMgr.attach(tid);
    await debuggerMgr.sendCommand(tid, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await debuggerMgr.sendCommand(tid, "Input.dispatchMouseEvent", {
      type: "mousePressed", x, y, button: "left", clickCount: 1,
    });
    await debuggerMgr.sendCommand(tid, "Input.dispatchMouseEvent", {
      type: "mouseReleased", x, y, button: "left", clickCount: 1,
    });
  }

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

// ---- cascader CDP 真鼠标驱动 ----
// 触发区（.el-cascader）对 untrusted click 不响应，但面板内 .el-cascader-node__label
// 用 page-side .click() 可以逐级展开。混合：worker CDP 开 panel + page JS 走 path。

async function runCascaderDriverCDP(opts: {
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

  async function pageQuery<T>(
    fn: (...args: unknown[]) => T,
    args: unknown[] = [],
  ): Promise<T> {
    const r = await chrome.scripting.executeScript({
      target: buildExecuteTarget(tid, frameId),
      func: fn,
      args,
      world: "MAIN",
    });
    return r[0]?.result as T;
  }

  async function clickBBox(cx: number, cy: number): Promise<void> {
    const { x: ox, y: oy } = await getIframeOffset(tid, frameId);
    const x = cx + ox;
    const y = cy + oy;
    await debuggerMgr.attach(tid);
    await debuggerMgr.sendCommand(tid, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await debuggerMgr.sendCommand(tid, "Input.dispatchMouseEvent", {
      type: "mousePressed", x, y, button: "left", clickCount: 1,
    });
    await debuggerMgr.sendCommand(tid, "Input.dispatchMouseEvent", {
      type: "mouseReleased", x, y, button: "left", clickCount: 1,
    });
  }

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

// ---- el-time-picker spinner driver ----
// 1) CDP click input 打开 .el-time-panel
// 2) 三列 spinner 各自 scrollIntoView 目标 li → CDP click
// 3) CDP click "OK"，等 panel close，verify input.value

async function runTimePickerDriverCDP(opts: {
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

  async function pageQuery<T>(
    fn: (...args: unknown[]) => T,
    args: unknown[] = [],
  ): Promise<T> {
    const r = await chrome.scripting.executeScript({
      target: buildExecuteTarget(tid, frameId),
      func: fn,
      args,
      world: "MAIN",
    });
    return r[0]?.result as T;
  }

  async function clickBBox(cx: number, cy: number): Promise<void> {
    const { x: ox, y: oy } = await getIframeOffset(tid, frameId);
    const x = cx + ox;
    const y = cy + oy;
    await debuggerMgr.attach(tid);
    await debuggerMgr.sendCommand(tid, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await debuggerMgr.sendCommand(tid, "Input.dispatchMouseEvent", {
      type: "mousePressed", x, y, button: "left", clickCount: 1,
    });
    await debuggerMgr.sendCommand(tid, "Input.dispatchMouseEvent", {
      type: "mouseReleased", x, y, button: "left", clickCount: 1,
    });
  }

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
        hit.scrollIntoView({ block: "center" });
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
    // 等 scroll 动画落定
    await sleep(120);
    await clickBBox(info.cx, info.cy);
    await sleep(80);
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
