import { VtxErrorCode, vtxError } from "@bytenew/vortex-shared";

export async function getActiveTabId(tabId?: number): Promise<number> {
  if (tabId) return tabId;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw vtxError(VtxErrorCode.TAB_NOT_FOUND, "No active tab found");
  return tab.id;
}

/**
 * 构造 chrome.scripting.executeScript 的 target 参数。
 * frameId 提供时定位到指定 frame（含跨域 iframe）。
 */
export function buildExecuteTarget(
  tabId: number,
  frameId?: number,
): chrome.scripting.InjectionTarget {
  if (frameId != null) {
    return { tabId, frameIds: [frameId] };
  }
  return { tabId };
}

/**
 * 校验 frameId 仍 attached 到指定 tab（v0.7.4，dogfood 卡点 #4）。
 *
 * Why：caller 持有过期 frameId（`navigate` 后 main frame 重新加载销毁所有 iframe）
 * 调 extract/observe 时，chrome.scripting.executeScript 在 detached frame 上行为
 * 不确定 —— 可能 throw、可能 fallback 到 main、可能返回空。无显式校验时这些
 * 情况都被吞，caller 拿到不可解释结果（dogfood 实战：旧 frameId=208 调 extract
 * 看似返回了某个内容，实则不知是哪个 frame 的）。
 *
 * 此函数在 explicit frameId 路径入口主动校验：webNavigation.getAllFrames 不含
 * 该 frameId → throw IFRAME_NOT_READY，hint 提示重新 observe 拿新 ref。
 *
 * 隐式 frame 解析（"all-permitted" / "all-same-origin"）天然通过 getAllFrames
 * 枚举，不需校验；仅 explicit frameId 路径需要。
 */
export async function ensureFrameAttached(
  tabId: number,
  frameId: number,
): Promise<void> {
  const all = (await chrome.webNavigation.getAllFrames({ tabId })) ?? [];
  if (!all.some((f) => f.frameId === frameId)) {
    throw vtxError(
      VtxErrorCode.IFRAME_NOT_READY,
      `Frame ${frameId} is not attached to tab ${tabId} (likely detached after navigation or reload)`,
      { tabId, frameId },
      {
        hint: "Call vortex_observe to refresh frame list; frameId becomes stale after navigate/reload",
        recoverable: true,
      },
    );
  }
}
