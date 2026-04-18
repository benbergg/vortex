import { VtxErrorCode, vtxError } from "@bytenew/vortex-shared";
import { getSnapshotEntry } from "./snapshot-store.js";

/**
 * handler 接受 `selector` 或 `{ index, snapshotId }` 两种元素定位方式，
 * 本 helper 统一解析并在必要时从 snapshot store 中反查 selector。
 */
export interface ResolvedTarget {
  selector: string;
  /** 使用 snapshot index 时绑定的 tab/frame，优先级高于 args.tabId / args.frameId */
  boundTabId?: number;
  boundFrameId?: number;
}

export function resolveTarget(args: Record<string, unknown>): ResolvedTarget {
  const selector = args.selector as string | undefined;
  const index = args.index as number | undefined;
  const snapshotId = args.snapshotId as string | undefined;

  if (selector != null && index !== undefined) {
    throw vtxError(
      VtxErrorCode.INVALID_PARAMS,
      "Provide either `selector` or `index`, not both",
    );
  }

  if (selector != null && selector !== "") {
    return { selector };
  }

  if (index !== undefined) {
    if (!snapshotId) {
      throw vtxError(
        VtxErrorCode.INVALID_PARAMS,
        "`index` requires `snapshotId` (obtain from vortex_observe)",
      );
    }
    const entry = getSnapshotEntry(snapshotId);
    if (!entry) {
      throw vtxError(
        VtxErrorCode.STALE_SNAPSHOT,
        `Snapshot ${snapshotId} expired or not found`,
        { snapshotId },
      );
    }
    const hit = entry.elements.find((e) => e.index === index);
    if (!hit) {
      throw vtxError(
        VtxErrorCode.INVALID_INDEX,
        `Index ${index} not found in snapshot ${snapshotId}`,
        { snapshotId, index },
      );
    }
    return {
      selector: hit.selector,
      boundTabId: entry.tabId,
      boundFrameId: entry.frameId,
    };
  }

  throw vtxError(
    VtxErrorCode.INVALID_PARAMS,
    "Missing required param: provide `selector` or `index` + `snapshotId`",
  );
}

/**
 * selector/index 都可缺省的变体（如 dom.scroll 允许按 position 滚动）。
 * 两者都未提供时返回 undefined，调用方走原有无目标路径。
 */
export function resolveTargetOptional(
  args: Record<string, unknown>,
): ResolvedTarget | undefined {
  if (args.selector == null && args.index == null) return undefined;
  return resolveTarget(args);
}
