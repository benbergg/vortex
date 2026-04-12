const injectedTabs = new Set<number>();

chrome.tabs.onRemoved.addListener((tabId) => {
  injectedTabs.delete(tabId);
});

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) {
    injectedTabs.delete(details.tabId);
  }
});

export async function ensureContentScript(tabId: number): Promise<void> {
  if (injectedTabs.has(tabId)) return;
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["src/content.ts"],
  });
  injectedTabs.add(tabId);
}

export async function sendToContentScript<T>(tabId: number, message: unknown): Promise<T> {
  await ensureContentScript(tabId);
  return chrome.tabs.sendMessage(tabId, message) as Promise<T>;
}
