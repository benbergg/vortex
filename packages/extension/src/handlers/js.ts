import { JsActions, VtxErrorCode, vtxError } from "@bytenew/vortex-shared";
import type { ActionRouter } from "../lib/router.js";
import { getActiveTabId, buildExecuteTarget, ensureFrameAttached } from "../lib/tab-utils.js";

/**
 * Map a raw page-side JS exception message to a VtxError with a code-specific hint.
 * When the auto-IIFE retry path itself fails (e.g. the body has a real syntax
 * error inside a `return` statement), surface that explicitly so callers know
 * the wrapper already tried.
 */
function jsExecutionError(message: string): ReturnType<typeof vtxError> {
  if (message.includes("Illegal return")) {
    return vtxError(
      VtxErrorCode.JS_EXECUTION_ERROR,
      message,
      undefined,
      {
        hint: "Top-level `return` failed even after auto-IIFE retry. Wrap manually: `(function(){ return ... })()` or check the body for a real syntax error inside the return expression.",
      },
    );
  }
  return vtxError(VtxErrorCode.JS_EXECUTION_ERROR, message);
}

export function registerJsHandlers(router: ActionRouter): void {
  router.registerAll({
    [JsActions.EVALUATE]: async (args, tabId) => {
      const code = args.code as string;
      if (!code) throw vtxError(VtxErrorCode.INVALID_PARAMS, "Missing required param: code");
      const tid = await getActiveTabId((args.tabId as number | undefined) ?? tabId);
      const frameId = args.frameId as number | undefined;
      if (frameId != null) await ensureFrameAttached(tid, frameId);
      const results = await chrome.scripting.executeScript({
        target: buildExecuteTarget(tid, frameId),
        // Auto-IIFE: top-level `return` is illegal in script context. When eval()
        // throws "Illegal return statement", retry through `new Function(code)`
        // which accepts a function body (return allowed). Transparent to caller;
        // sets autoIIFE: true so the dispatcher can surface it in telemetry.
        func: (c: string) => {
          try { return { result: eval(c) }; }
          catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("Illegal return")) {
              try {
                const fn = new Function(c);
                return { result: fn(), autoIIFE: true };
              } catch (err2) {
                return { error: err2 instanceof Error ? err2.message : String(err2) };
              }
            }
            return { error: msg };
          }
        },
        args: [code],
        world: "MAIN",
      });
      const res = results[0]?.result as { result?: unknown; error?: string; autoIIFE?: boolean };
      if (res?.error) throw jsExecutionError(res.error);
      return res?.result;
    },

    [JsActions.EVALUATE_ASYNC]: async (args, tabId) => {
      const code = args.code as string;
      if (!code) throw vtxError(VtxErrorCode.INVALID_PARAMS, "Missing required param: code");
      const tid = await getActiveTabId((args.tabId as number | undefined) ?? tabId);
      const frameId = args.frameId as number | undefined;
      if (frameId != null) await ensureFrameAttached(tid, frameId);
      const results = await chrome.scripting.executeScript({
        target: buildExecuteTarget(tid, frameId),
        func: async (c: string) => {
          try {
            const fn = new Function(`return (async () => { ${c} })()`);
            return { result: await fn() };
          } catch (err) { return { error: err instanceof Error ? err.message : String(err) }; }
        },
        args: [code],
        world: "MAIN",
      });
      const res = results[0]?.result as { result?: unknown; error?: string };
      if (res?.error) throw jsExecutionError(res.error);
      return res?.result;
    },

    [JsActions.CALL_FUNCTION]: async (args, tabId) => {
      const name = args.name as string;
      const fnArgs = (args.args as unknown[]) ?? [];
      if (!name) throw vtxError(VtxErrorCode.INVALID_PARAMS, "Missing required param: name");
      const tid = await getActiveTabId((args.tabId as number | undefined) ?? tabId);
      const frameId = args.frameId as number | undefined;
      if (frameId != null) await ensureFrameAttached(tid, frameId);
      const results = await chrome.scripting.executeScript({
        target: buildExecuteTarget(tid, frameId),
        func: (fnName: string, fnArgs: unknown[]) => {
          try {
            const fn = (window as any)[fnName];
            if (typeof fn !== "function") return { error: `${fnName} is not a function` };
            return { result: fn(...fnArgs) };
          } catch (err) { return { error: err instanceof Error ? err.message : String(err) }; }
        },
        args: [name, fnArgs],
        world: "MAIN",
      });
      const res = results[0]?.result as { result?: unknown; error?: string };
      if (res?.error) {
        const code = res.error.endsWith("is not a function")
          ? VtxErrorCode.INVALID_PARAMS
          : VtxErrorCode.JS_EXECUTION_ERROR;
        throw vtxError(code, res.error);
      }
      return res?.result;
    },
  });
}
