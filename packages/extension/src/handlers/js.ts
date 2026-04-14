import { JsActions } from "@bytenew/vortex-shared";
import type { ActionRouter } from "../lib/router.js";
import { getActiveTabId, buildExecuteTarget } from "../lib/tab-utils.js";

export function registerJsHandlers(router: ActionRouter): void {
  router.registerAll({
    [JsActions.EVALUATE]: async (args, tabId) => {
      const code = args.code as string;
      if (!code) throw new Error("Missing required param: code");
      const tid = await getActiveTabId((args.tabId as number | undefined) ?? tabId);
      const frameId = args.frameId as number | undefined;
      const results = await chrome.scripting.executeScript({
        target: buildExecuteTarget(tid, frameId),
        func: (c: string) => {
          try { return { result: eval(c) }; }
          catch (err) { return { error: err instanceof Error ? err.message : String(err) }; }
        },
        args: [code],
        world: "MAIN",
      });
      const res = results[0]?.result as { result?: unknown; error?: string };
      if (res?.error) throw new Error(res.error);
      return res?.result;
    },

    [JsActions.EVALUATE_ASYNC]: async (args, tabId) => {
      const code = args.code as string;
      if (!code) throw new Error("Missing required param: code");
      const tid = await getActiveTabId((args.tabId as number | undefined) ?? tabId);
      const frameId = args.frameId as number | undefined;
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
      if (res?.error) throw new Error(res.error);
      return res?.result;
    },

    [JsActions.CALL_FUNCTION]: async (args, tabId) => {
      const name = args.name as string;
      const fnArgs = (args.args as unknown[]) ?? [];
      if (!name) throw new Error("Missing required param: name");
      const tid = await getActiveTabId((args.tabId as number | undefined) ?? tabId);
      const frameId = args.frameId as number | undefined;
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
      if (res?.error) throw new Error(res.error);
      return res?.result;
    },
  });
}
