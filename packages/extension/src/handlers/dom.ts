import { DomActions, VtxErrorCode, vtxError } from "@bytenew/vortex-shared";
import type { ActionRouter } from "../lib/router.js";
import type { DebuggerManager } from "../lib/debugger-manager.js";
import { getActiveTabId, buildExecuteTarget } from "../lib/tab-utils.js";
import { getIframeOffset } from "../lib/iframe-offset.js";
import { resolveTarget, resolveTargetOptional } from "../lib/resolve-target.js";

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
        // 取元素中心坐标
        const rectResults = await chrome.scripting.executeScript({
          target: buildExecuteTarget(tid, frameId),
          func: (sel: string) => {
            const el = document.querySelector(sel) as HTMLElement | null;
            if (!el) return { error: `Element not found: ${sel}` };
            el.scrollIntoView({ block: "center", inline: "center" });
            const r = el.getBoundingClientRect();
            return {
              result: {
                x: r.left + r.width / 2,
                y: r.top + r.height / 2,
                tag: el.tagName.toLowerCase(),
                text: el.innerText?.slice(0, 200),
              },
            };
          },
          args: [selector],
          world: "MAIN",
        });
        const rectRes = rectResults[0]?.result as { result?: any; error?: string };
        if (rectRes?.error) throw vtxError(rectRes.error.startsWith("Element not found:") ? VtxErrorCode.ELEMENT_NOT_FOUND : VtxErrorCode.JS_EXECUTION_ERROR, rectRes.error, { selector });
        const { x: cx, y: cy, tag, text } = rectRes.result;

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
            const el = document.querySelector(sel) as HTMLElement | null;
            if (!el) return { error: `Element not found: ${sel}` };
            el.focus();
            for (const char of txt) {
              const eventInit = { key: char, bubbles: true, cancelable: true };
              el.dispatchEvent(new KeyboardEvent("keydown", eventInit));
              el.dispatchEvent(new KeyboardEvent("keypress", eventInit));
              if ((el as HTMLInputElement).value !== undefined) {
                (el as HTMLInputElement).value += char;
              }
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
      const res = results[0]?.result as { result?: unknown; error?: string };
      if (res?.error) throw vtxError((res.error.startsWith("Element not found:") || res.error.startsWith("Container not found:")) ? VtxErrorCode.ELEMENT_NOT_FOUND : VtxErrorCode.JS_EXECUTION_ERROR, res.error, selector ? { selector } : undefined);
      return res?.result;
    },

    [DomActions.FILL]: async (args, tabId) => {
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
            const el = document.querySelector(sel) as HTMLInputElement | null;
            if (!el) return { error: `Element not found: ${sel}` };
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
        args: [selector, value],
        world: "MAIN",
      });
      const res = results[0]?.result as { result?: unknown; error?: string };
      if (res?.error) throw vtxError((res.error.startsWith("Element not found:") || res.error.startsWith("Container not found:")) ? VtxErrorCode.ELEMENT_NOT_FOUND : VtxErrorCode.JS_EXECUTION_ERROR, res.error, selector ? { selector } : undefined);
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
            const el = document.querySelector(sel) as HTMLSelectElement | null;
            if (!el) return { error: `Element not found: ${sel}` };
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
      const res = results[0]?.result as { result?: unknown; error?: string };
      if (res?.error) throw vtxError((res.error.startsWith("Element not found:") || res.error.startsWith("Container not found:")) ? VtxErrorCode.ELEMENT_NOT_FOUND : VtxErrorCode.JS_EXECUTION_ERROR, res.error, selector ? { selector } : undefined);
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
            const el = document.querySelector(sel) as HTMLElement | null;
            if (!el) return { error: `Element not found: ${sel}` };
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
      const res = results[0]?.result as { result?: unknown; error?: string };
      if (res?.error) throw vtxError((res.error.startsWith("Element not found:") || res.error.startsWith("Container not found:")) ? VtxErrorCode.ELEMENT_NOT_FOUND : VtxErrorCode.JS_EXECUTION_ERROR, res.error, selector ? { selector } : undefined);
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
  });
}
