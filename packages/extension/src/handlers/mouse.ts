import { MouseActions, VtxErrorCode, vtxError } from "@bytenew/vortex-shared";
import type { ActionRouter } from "../lib/router.js";
import type { DebuggerManager } from "../lib/debugger-manager.js";
import { getActiveTabId } from "../lib/tab-utils.js";
import { getIframeOffset } from "../lib/iframe-offset.js";

type CoordSpace = "frame" | "viewport";

async function dispatchMouse(
  debuggerMgr: DebuggerManager,
  tabId: number,
  type: "mousePressed" | "mouseReleased" | "mouseMoved",
  x: number,
  y: number,
  button: "left" | "right" | "middle" = "left",
  clickCount: number = 1,
): Promise<void> {
  await debuggerMgr.sendCommand(tabId, "Input.dispatchMouseEvent", {
    type,
    x,
    y,
    button,
    clickCount,
  });
}

/**
 * 把 frame 相对坐标换算为视口坐标。
 * 未传 frameId 或 coordSpace=viewport 时直接返回原值。
 */
async function toViewportCoords(
  tabId: number,
  x: number,
  y: number,
  frameId: number | undefined,
  coordSpace: CoordSpace,
): Promise<{ x: number; y: number; offsetApplied: { x: number; y: number } }> {
  if (coordSpace === "viewport" || frameId == null || frameId === 0) {
    return { x, y, offsetApplied: { x: 0, y: 0 } };
  }
  const offset = await getIframeOffset(tabId, frameId);
  return { x: x + offset.x, y: y + offset.y, offsetApplied: offset };
}

function resolveCoordSpace(
  raw: unknown,
  frameId: number | undefined,
): CoordSpace {
  if (raw === "frame" || raw === "viewport") return raw;
  return frameId != null && frameId !== 0 ? "frame" : "viewport";
}

export function registerMouseHandlers(
  router: ActionRouter,
  debuggerMgr: DebuggerManager,
): void {
  router.registerAll({
    [MouseActions.CLICK]: async (args, tabId) => {
      const tid = await getActiveTabId((args.tabId as number | undefined) ?? tabId);
      const frameId = args.frameId as number | undefined;
      const coordSpace = resolveCoordSpace(args.coordSpace, frameId);
      const button = (args.button as "left" | "right" | "middle") ?? "left";
      const xIn = args.x as number;
      const yIn = args.y as number;
      if (xIn == null || yIn == null)
        throw vtxError(VtxErrorCode.INVALID_PARAMS, "x and y are required");

      const { x, y, offsetApplied } = await toViewportCoords(
        tid,
        xIn,
        yIn,
        frameId,
        coordSpace,
      );

      await debuggerMgr.attach(tid);
      await dispatchMouse(debuggerMgr, tid, "mouseMoved", x, y, button);
      await dispatchMouse(debuggerMgr, tid, "mousePressed", x, y, button, 1);
      await dispatchMouse(debuggerMgr, tid, "mouseReleased", x, y, button, 1);

      return {
        success: true,
        x,
        y,
        button,
        coordSpace,
        frameId: frameId ?? null,
        offsetApplied,
      };
    },

    [MouseActions.DOUBLE_CLICK]: async (args, tabId) => {
      const tid = await getActiveTabId((args.tabId as number | undefined) ?? tabId);
      const frameId = args.frameId as number | undefined;
      const coordSpace = resolveCoordSpace(args.coordSpace, frameId);
      const xIn = args.x as number;
      const yIn = args.y as number;
      if (xIn == null || yIn == null)
        throw vtxError(VtxErrorCode.INVALID_PARAMS, "x and y are required");

      const { x, y, offsetApplied } = await toViewportCoords(
        tid,
        xIn,
        yIn,
        frameId,
        coordSpace,
      );

      await debuggerMgr.attach(tid);
      await dispatchMouse(debuggerMgr, tid, "mouseMoved", x, y);
      await dispatchMouse(debuggerMgr, tid, "mousePressed", x, y, "left", 1);
      await dispatchMouse(debuggerMgr, tid, "mouseReleased", x, y, "left", 1);
      await dispatchMouse(debuggerMgr, tid, "mousePressed", x, y, "left", 2);
      await dispatchMouse(debuggerMgr, tid, "mouseReleased", x, y, "left", 2);

      return {
        success: true,
        x,
        y,
        coordSpace,
        frameId: frameId ?? null,
        offsetApplied,
      };
    },

    [MouseActions.DRAG]: async (args, tabId) => {
      const tid = await getActiveTabId((args.tabId as number | undefined) ?? tabId);
      const frameId = args.frameId as number | undefined;
      const coordSpace = resolveCoordSpace(args.coordSpace, frameId);
      const x1In = args.fromX as number;
      const y1In = args.fromY as number;
      const x2In = args.toX as number;
      const y2In = args.toY as number;
      const steps = (args.steps as number | undefined) ?? 10;
      if (x1In == null || y1In == null || x2In == null || y2In == null)
        throw vtxError(VtxErrorCode.INVALID_PARAMS, "fromX/fromY/toX/toY are required");

      const from = await toViewportCoords(tid, x1In, y1In, frameId, coordSpace);
      const to = await toViewportCoords(tid, x2In, y2In, frameId, coordSpace);

      await debuggerMgr.attach(tid);
      // 1. move 到起点 2. press 3. 分 steps 次 move 到终点 4. release
      await dispatchMouse(debuggerMgr, tid, "mouseMoved", from.x, from.y);
      await dispatchMouse(debuggerMgr, tid, "mousePressed", from.x, from.y, "left", 1);
      const stepDelay = 10;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const xi = from.x + (to.x - from.x) * t;
        const yi = from.y + (to.y - from.y) * t;
        await dispatchMouse(debuggerMgr, tid, "mouseMoved", xi, yi);
        if (stepDelay > 0) await new Promise((r) => setTimeout(r, stepDelay));
      }
      await dispatchMouse(debuggerMgr, tid, "mouseReleased", to.x, to.y, "left", 1);

      return {
        success: true,
        from: { x: from.x, y: from.y },
        to: { x: to.x, y: to.y },
        steps,
        coordSpace,
        frameId: frameId ?? null,
      };
    },

    [MouseActions.MOVE]: async (args, tabId) => {
      const tid = await getActiveTabId((args.tabId as number | undefined) ?? tabId);
      const frameId = args.frameId as number | undefined;
      const coordSpace = resolveCoordSpace(args.coordSpace, frameId);
      const xIn = args.x as number;
      const yIn = args.y as number;
      if (xIn == null || yIn == null)
        throw vtxError(VtxErrorCode.INVALID_PARAMS, "x and y are required");

      const { x, y, offsetApplied } = await toViewportCoords(
        tid,
        xIn,
        yIn,
        frameId,
        coordSpace,
      );

      await debuggerMgr.attach(tid);
      await dispatchMouse(debuggerMgr, tid, "mouseMoved", x, y);

      return {
        success: true,
        x,
        y,
        coordSpace,
        frameId: frameId ?? null,
        offsetApplied,
      };
    },
  });
}
