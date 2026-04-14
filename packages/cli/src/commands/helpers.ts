import type { Command } from "commander";
import { sendRequest, subscribe } from "../client.js";
import { printResponse, printEvent, exitWithError } from "../output.js";
import type { VtxEvent } from "@bytenew/vortex-shared";

export function getGlobalOpts(cmd: Command) {
  let root = cmd;
  while (root.parent) root = root.parent;
  return {
    port: root.opts().port as number,
    tab: root.opts().tab as number | undefined,
    frameId: root.opts().frameId as number | undefined,
    pretty: root.opts().pretty as boolean | undefined,
    quiet: root.opts().quiet as boolean | undefined,
  };
}

export function makeAction(action: string, buildParams: (args: any, opts: any) => Record<string, unknown>) {
  return async (...handlerArgs: any[]) => {
    const cmd = handlerArgs[handlerArgs.length - 1] as Command;
    const opts = handlerArgs[handlerArgs.length - 2];
    const args = handlerArgs.slice(0, -2);
    const { port, tab, frameId, pretty, quiet } = getGlobalOpts(cmd);

    const params = buildParams(args, opts);
    if (frameId != null && params.frameId == null) params.frameId = frameId;

    try {
      const resp = await sendRequest(action, params, { port, tabId: tab });
      printResponse(resp, { pretty, quiet });
    } catch (err: any) {
      exitWithError(err.message);
    }
  };
}

export function makeSubscribeAction(action: string, buildParams: (args: any, opts: any) => Record<string, unknown>) {
  return async (...handlerArgs: any[]) => {
    const cmd = handlerArgs[handlerArgs.length - 1] as Command;
    const opts = handlerArgs[handlerArgs.length - 2];
    const args = handlerArgs.slice(0, -2);
    const { port, tab, frameId, pretty, quiet } = getGlobalOpts(cmd);

    const params = buildParams(args, opts);
    if (frameId != null && params.frameId == null) params.frameId = frameId;

    try {
      const resp = await subscribe(action, params, {
        port,
        tabId: tab,
        follow: true,
        onEvent: (event: VtxEvent) => printEvent(event, { pretty, quiet }),
      });
      printResponse(resp, { pretty, quiet });
      await new Promise(() => {});
    } catch (err: any) {
      exitWithError(err.message);
    }
  };
}
