// Phase 1 placeholder. Phase 4 will implement GIF recording.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "offscreen-ping") {
    sendResponse({ type: "offscreen-pong" });
  }
});
