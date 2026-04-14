// packages/mcp/src/tools/schemas.ts

export interface ToolDef {
  name: string;
  action: string;
  description: string;
  schema: object;
  returnsImage?: boolean;
}

const optionalTabId = {
  tabId: { type: "number" as const, description: "Target tab ID. Omit to use the active tab." },
};

const optionalFrameId = {
  frameId: { type: "number" as const, description: "Target frame ID (for iframes). Use vortex_frames_list/find to discover frame IDs." },
};

function tabTools(): ToolDef[] {
  return [
    { name: "vortex_tab_list", action: "tab.list", description: "List all open browser tabs with their IDs, URLs, and titles. Use this first to find tab IDs for other commands.", schema: { type: "object", properties: {}, required: [] } },
    { name: "vortex_tab_create", action: "tab.create", description: "Create a new browser tab, optionally navigating to a URL.", schema: { type: "object", properties: { url: { type: "string", description: "URL to open in the new tab" }, active: { type: "boolean", description: "Whether to make the tab active", default: true } }, required: [] } },
    { name: "vortex_tab_close", action: "tab.close", description: "Close a browser tab by its ID.", schema: { type: "object", properties: { tabId: { type: "number", description: "Tab ID to close" } }, required: ["tabId"] } },
    { name: "vortex_tab_activate", action: "tab.activate", description: "Bring a tab to the foreground and focus its window.", schema: { type: "object", properties: { tabId: { type: "number", description: "Tab ID to activate" } }, required: ["tabId"] } },
    { name: "vortex_tab_get_info", action: "tab.getInfo", description: "Get detailed information about a tab (URL, title, status, favicon).", schema: { type: "object", properties: { ...optionalTabId }, required: [] } },
  ];
}

function pageTools(): ToolDef[] {
  return [
    { name: "vortex_page_navigate", action: "page.navigate", description: "Navigate to a URL and wait for the page to finish loading.", schema: { type: "object", properties: { url: { type: "string", description: "URL to navigate to" }, waitForLoad: { type: "boolean", description: "Wait for page load to complete", default: true }, timeout: { type: "number", description: "Navigation timeout in ms", default: 30000 }, ...optionalTabId }, required: ["url"] } },
    { name: "vortex_page_reload", action: "page.reload", description: "Reload the current page.", schema: { type: "object", properties: { ...optionalTabId }, required: [] } },
    { name: "vortex_page_back", action: "page.back", description: "Go back in browser history.", schema: { type: "object", properties: { ...optionalTabId }, required: [] } },
    { name: "vortex_page_forward", action: "page.forward", description: "Go forward in browser history.", schema: { type: "object", properties: { ...optionalTabId }, required: [] } },
    { name: "vortex_page_wait", action: "page.wait", description: "Wait for a CSS selector to appear on the page, or wait for a fixed timeout.", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector to wait for" }, timeout: { type: "number", description: "Timeout in ms", default: 10000 }, ...optionalTabId, ...optionalFrameId }, required: [] } },
    { name: "vortex_page_info", action: "page.info", description: "Get the current page URL, title, and load status.", schema: { type: "object", properties: { ...optionalTabId }, required: [] } },
    { name: "vortex_page_wait_for_network_idle", action: "page.waitForNetworkIdle", description: "Wait until all network requests are complete. Useful after navigating to AJAX-heavy pages or triggering actions that load data.", schema: { type: "object", properties: { timeout: { type: "number", description: "Max wait time in ms", default: 30000 }, idleTime: { type: "number", description: "Duration with no requests to confirm idle (ms)", default: 500 }, ...optionalTabId }, required: [] } },
  ];
}

function domTools(): ToolDef[] {
  return [
    { name: "vortex_dom_query", action: "dom.query", description: "Find a single element by CSS selector. Returns its tag, text, classes, and attributes.", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector" }, ...optionalTabId, ...optionalFrameId }, required: ["selector"] } },
    { name: "vortex_dom_query_all", action: "dom.queryAll", description: "Find all elements matching a CSS selector.", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector" }, ...optionalTabId, ...optionalFrameId }, required: ["selector"] } },
    { name: "vortex_dom_click", action: "dom.click", description: "Click an element by CSS selector. Scrolls into view if needed.", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector of element to click" }, ...optionalTabId, ...optionalFrameId }, required: ["selector"] } },
    { name: "vortex_dom_type", action: "dom.type", description: "Type text into an input element character by character. Use dom.fill for faster value setting.", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector of input element" }, text: { type: "string", description: "Text to type" }, delay: { type: "number", description: "Delay between keystrokes in ms" }, ...optionalTabId, ...optionalFrameId }, required: ["selector", "text"] } },
    { name: "vortex_dom_fill", action: "dom.fill", description: "Set the value of a form field directly (faster than type, but doesn't trigger key events).", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector of form field" }, value: { type: "string", description: "Value to set" }, ...optionalTabId, ...optionalFrameId }, required: ["selector", "value"] } },
    { name: "vortex_dom_select", action: "dom.select", description: "Select an option in a dropdown/select element by value.", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector of select element" }, value: { type: "string", description: "Option value to select" }, ...optionalTabId, ...optionalFrameId }, required: ["selector", "value"] } },
    { name: "vortex_dom_scroll", action: "dom.scroll", description: "Scroll the page or a specific container element.", schema: { type: "object", properties: { selector: { type: "string", description: "Element to scroll to" }, container: { type: "string", description: "Scroll container selector" }, position: { type: "string", enum: ["top", "bottom", "left", "right"], description: "Scroll to position" }, x: { type: "number", description: "Scroll to x coordinate" }, y: { type: "number", description: "Scroll to y coordinate" }, ...optionalTabId, ...optionalFrameId }, required: [] } },
    { name: "vortex_dom_hover", action: "dom.hover", description: "Move the mouse over an element to trigger hover effects.", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector" }, ...optionalTabId, ...optionalFrameId }, required: ["selector"] } },
    { name: "vortex_dom_get_attribute", action: "dom.getAttribute", description: "Get the value of a specific HTML attribute of an element.", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector" }, attribute: { type: "string", description: "Attribute name (e.g. href, src, class)" }, ...optionalTabId, ...optionalFrameId }, required: ["selector", "attribute"] } },
    { name: "vortex_dom_get_scroll_info", action: "dom.getScrollInfo", description: "Get scroll position, viewport size, and total scrollable dimensions.", schema: { type: "object", properties: { selector: { type: "string", description: "Element selector (omit for page)" }, ...optionalTabId, ...optionalFrameId }, required: [] } },
    { name: "vortex_dom_wait_for_mutation", action: "dom.waitForMutation", description: "Wait for DOM changes on an element. Useful for detecting lazy-loaded or dynamically inserted content.", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector to observe" }, timeout: { type: "number", description: "Timeout in ms", default: 10000 }, ...optionalTabId, ...optionalFrameId }, required: ["selector"] } },
  ];
}

function contentTools(): ToolDef[] {
  return [
    { name: "vortex_content_get_text", action: "content.getText", description: "Get all visible text from the page or a specific element. Useful for reading page content.", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector (omit for entire page)" }, ...optionalTabId, ...optionalFrameId }, required: [] } },
    { name: "vortex_content_get_html", action: "content.getHTML", description: "Get the outer HTML of the page or a specific element.", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector (omit for entire page)" }, ...optionalTabId, ...optionalFrameId }, required: [] } },
    { name: "vortex_content_get_accessibility_tree", action: "content.getAccessibilityTree", description: "Get the accessibility tree of the page. Useful for understanding page structure and interactive elements.", schema: { type: "object", properties: { ...optionalTabId, ...optionalFrameId }, required: [] } },
    { name: "vortex_content_get_element_text", action: "content.getElementText", description: "Get the text content of a specific element.", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector" }, ...optionalTabId, ...optionalFrameId }, required: ["selector"] } },
    { name: "vortex_content_get_computed_style", action: "content.getComputedStyle", description: "Get the computed CSS properties of an element.", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector" }, properties: { type: "array", items: { type: "string" }, description: "CSS property names to read" }, ...optionalTabId, ...optionalFrameId }, required: ["selector"] } },
  ];
}

function jsTools(): ToolDef[] {
  return [
    { name: "vortex_js_evaluate", action: "js.evaluate", description: "Execute JavaScript in the page context and return the result.", schema: { type: "object", properties: { code: { type: "string", description: "JavaScript code to execute" }, ...optionalTabId, ...optionalFrameId }, required: ["code"] } },
    { name: "vortex_js_evaluate_async", action: "js.evaluateAsync", description: "Execute async JavaScript (can use 'await') and return the result.", schema: { type: "object", properties: { code: { type: "string", description: "Async JavaScript code" }, ...optionalTabId, ...optionalFrameId }, required: ["code"] } },
    { name: "vortex_js_call_function", action: "js.callFunction", description: "Call a named function defined on the page with arguments.", schema: { type: "object", properties: { name: { type: "string", description: "Function name" }, args: { type: "array", items: {}, description: "Arguments to pass" }, ...optionalTabId, ...optionalFrameId }, required: ["name"] } },
  ];
}

function keyboardTools(): ToolDef[] {
  return [
    { name: "vortex_keyboard_press", action: "keyboard.press", description: "Press and release a keyboard key. Supports Enter, Tab, Escape, ArrowDown, ArrowUp, Backspace, Delete, F1-F12, and letter/number keys.", schema: { type: "object", properties: { key: { type: "string", description: "Key name (e.g. Enter, Tab, Escape, ArrowDown, a, 1)" }, ...optionalTabId }, required: ["key"] } },
    { name: "vortex_keyboard_shortcut", action: "keyboard.shortcut", description: "Press a keyboard shortcut (modifier + key). Example: ['Ctrl', 'a'] for select all.", schema: { type: "object", properties: { keys: { type: "array", items: { type: "string" }, description: "Array of key names, e.g. ['Ctrl', 'a']" }, ...optionalTabId }, required: ["keys"] } },
  ];
}

function captureTools(): ToolDef[] {
  return [
    { name: "vortex_capture_screenshot", action: "capture.screenshot", description: "Take a screenshot of the visible page area. Returns the image for visual inspection. Use this to verify page state, check layouts, or debug visual issues.", schema: { type: "object", properties: { format: { type: "string", enum: ["png", "jpeg"], default: "png" }, ...optionalTabId }, required: [] }, returnsImage: true },
    { name: "vortex_capture_element", action: "capture.element", description: "Take a screenshot of a specific element. The tab must be active.", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector" }, ...optionalTabId, ...optionalFrameId }, required: ["selector"] }, returnsImage: true },
    { name: "vortex_capture_gif_start", action: "capture.gifStart", description: "Start collecting GIF frames.", schema: { type: "object", properties: { fps: { type: "number", description: "Frames per second", default: 2 }, ...optionalTabId }, required: [] } },
    { name: "vortex_capture_gif_frame", action: "capture.gifFrame", description: "Manually capture a GIF frame.", schema: { type: "object", properties: { ...optionalTabId }, required: [] } },
    { name: "vortex_capture_gif_stop", action: "capture.gifStop", description: "Stop GIF recording and return collected frames.", schema: { type: "object", properties: {}, required: [] } },
  ];
}

function consoleTools(): ToolDef[] {
  return [
    { name: "vortex_console_get_logs", action: "console.getLogs", description: "Get console log messages. Filter by level: log, warn, error.", schema: { type: "object", properties: { level: { type: "string", enum: ["log", "warn", "error"], description: "Filter by log level" }, ...optionalTabId }, required: [] } },
    { name: "vortex_console_get_errors", action: "console.getErrors", description: "Get only console error messages.", schema: { type: "object", properties: { ...optionalTabId }, required: [] } },
    { name: "vortex_console_clear", action: "console.clear", description: "Clear the cached console logs.", schema: { type: "object", properties: { ...optionalTabId }, required: [] } },
  ];
}

function networkTools(): ToolDef[] {
  return [
    { name: "vortex_network_get_logs", action: "network.getLogs", description: "Get network request logs (URL, method, status, timing, request body).", schema: { type: "object", properties: { ...optionalTabId }, required: [] } },
    { name: "vortex_network_get_errors", action: "network.getErrors", description: "Get failed network requests (HTTP status >= 400 or connection errors).", schema: { type: "object", properties: { ...optionalTabId }, required: [] } },
    { name: "vortex_network_filter", action: "network.filter", description: "Filter network logs by URL pattern, HTTP method, or status code range.", schema: { type: "object", properties: { url: { type: "string", description: "URL substring to match" }, method: { type: "string", description: "HTTP method (GET, POST, etc.)" }, statusMin: { type: "number", description: "Minimum status code" }, statusMax: { type: "number", description: "Maximum status code" }, ...optionalTabId }, required: [] } },
    { name: "vortex_network_get_response_body", action: "network.getResponseBody", description: "Get the full response body of a specific network request. Use requestId from network.getLogs or network.filter results.", schema: { type: "object", properties: { requestId: { type: "string", description: "Request ID from network logs" }, ...optionalTabId }, required: ["requestId"] } },
    { name: "vortex_network_clear", action: "network.clear", description: "Clear the cached network logs.", schema: { type: "object", properties: { ...optionalTabId }, required: [] } },
  ];
}

function storageTools(): ToolDef[] {
  return [
    { name: "vortex_storage_get_cookies", action: "storage.getCookies", description: "Get browser cookies, optionally filtered by URL or domain.", schema: { type: "object", properties: { url: { type: "string", description: "URL to get cookies for" }, domain: { type: "string", description: "Domain filter" }, ...optionalTabId }, required: [] } },
    { name: "vortex_storage_set_cookie", action: "storage.setCookie", description: "Set a browser cookie.", schema: { type: "object", properties: { url: { type: "string", description: "Cookie URL" }, name: { type: "string", description: "Cookie name" }, value: { type: "string", description: "Cookie value" }, domain: { type: "string" }, path: { type: "string" }, secure: { type: "boolean" }, httpOnly: { type: "boolean" }, expirationDate: { type: "number" }, sameSite: { type: "string" } }, required: ["url", "name"] } },
    { name: "vortex_storage_delete_cookie", action: "storage.deleteCookie", description: "Delete a browser cookie by URL and name.", schema: { type: "object", properties: { url: { type: "string", description: "Cookie URL" }, name: { type: "string", description: "Cookie name" } }, required: ["url", "name"] } },
    { name: "vortex_storage_get_local_storage", action: "storage.getLocalStorage", description: "Read localStorage values. Pass key for a specific value, or omit to get all.", schema: { type: "object", properties: { key: { type: "string", description: "Storage key (omit for all)" }, ...optionalTabId }, required: [] } },
    { name: "vortex_storage_set_local_storage", action: "storage.setLocalStorage", description: "Set a localStorage key-value pair.", schema: { type: "object", properties: { key: { type: "string" }, value: { type: "string" }, ...optionalTabId }, required: ["key", "value"] } },
    { name: "vortex_storage_get_session_storage", action: "storage.getSessionStorage", description: "Read sessionStorage values.", schema: { type: "object", properties: { key: { type: "string" }, ...optionalTabId }, required: [] } },
    { name: "vortex_storage_set_session_storage", action: "storage.setSessionStorage", description: "Set a sessionStorage key-value pair.", schema: { type: "object", properties: { key: { type: "string" }, value: { type: "string" }, ...optionalTabId }, required: ["key", "value"] } },
  ];
}

function fileTools(): ToolDef[] {
  return [
    { name: "vortex_file_upload", action: "file.upload", description: "Upload a file to a file input element. The file content must be base64 encoded.", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector of file input" }, fileName: { type: "string", description: "File name" }, fileContent: { type: "string", description: "Base64 encoded file content" }, mimeType: { type: "string", description: "MIME type" }, ...optionalTabId }, required: ["selector", "fileName", "fileContent"] } },
    { name: "vortex_file_download", action: "file.download", description: "Trigger a file download by URL.", schema: { type: "object", properties: { url: { type: "string", description: "URL to download" }, filename: { type: "string", description: "Save as filename" } }, required: ["url"] } },
    { name: "vortex_file_get_downloads", action: "file.getDownloads", description: "List recent downloads.", schema: { type: "object", properties: { limit: { type: "number", description: "Max results", default: 20 } }, required: [] } },
  ];
}

function framesTools(): ToolDef[] {
  return [
    {
      name: "vortex_frames_list",
      action: "frames.list",
      description: "List all frames in the tab, including cross-origin iframes. Returns { frameId, url, parentFrameId } for each. Use this to discover frame IDs before operating on iframe content.",
      schema: { type: "object", properties: { ...optionalTabId }, required: [] },
    },
    {
      name: "vortex_frames_find",
      action: "frames.find",
      description: "Find a frame by URL substring. Shortcut for frames.list + manual search. Returns frameId or null.",
      schema: {
        type: "object",
        properties: {
          urlPattern: { type: "string", description: "URL substring to match" },
          ...optionalTabId,
        },
        required: ["urlPattern"],
      },
    },
  ];
}

export function getAllToolDefs(): ToolDef[] {
  return [
    ...tabTools(),
    ...pageTools(),
    ...domTools(),
    ...contentTools(),
    ...jsTools(),
    ...keyboardTools(),
    ...captureTools(),
    ...consoleTools(),
    ...networkTools(),
    ...storageTools(),
    ...fileTools(),
    ...framesTools(),
  ];
}
