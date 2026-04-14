export async function getActiveTabId(tabId?: number): Promise<number> {
  if (tabId) return tabId;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found");
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
