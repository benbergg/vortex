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

const targetSpec = {
  index: { type: "number" as const, description: "Interactive element index from vortex_observe (alternative to selector). Requires snapshotId." },
  snapshotId: { type: "string" as const, description: "Snapshot id from vortex_observe (pair with index). When provided, the snapshot's tab/frame overrides tabId/frameId." },
};

const screenshotReturnMode = {
  returnMode: {
    type: "string" as const,
    enum: ["inline", "file"],
    description: "inline: return image for AI to see (large images >500KB auto-fallback to file). file: save to /tmp/vortex-screenshots/ and return path (use Read tool to view).",
    default: "inline",
  },
};

function tabTools(): ToolDef[] {
  return [
    { name: "vortex_tab_list", action: "tab.list", description: "List all open browser tabs with their IDs, URLs, and titles. Use this first to find tab IDs for other commands.", schema: { type: "object", properties: {}, required: [] } },
    { name: "vortex_tab_create", action: "tab.create", description: "Create a new browser tab, optionally navigating to a URL.", schema: { type: "object", properties: { url: { type: "string", description: "URL to open in the new tab" }, active: { type: "boolean", description: "Whether to make the tab active", default: true } }, required: [] } },
    { name: "vortex_tab_close", action: "tab.close", description: "Close a browser tab by its ID. Failures: TAB_NOT_FOUND, TAB_CLOSED (tab already closed — list with vortex_tab_list).", schema: { type: "object", properties: { tabId: { type: "number", description: "Tab ID to close" } }, required: ["tabId"] } },
    { name: "vortex_tab_activate", action: "tab.activate", description: "Bring a tab to the foreground and focus its window. Failures: TAB_NOT_FOUND.", schema: { type: "object", properties: { tabId: { type: "number", description: "Tab ID to activate" } }, required: ["tabId"] } },
    { name: "vortex_tab_get_info", action: "tab.getInfo", description: "Get detailed information about a tab (URL, title, status, favicon). Failures: TAB_NOT_FOUND.", schema: { type: "object", properties: { ...optionalTabId }, required: [] } },
  ];
}

function pageTools(): ToolDef[] {
  return [
    { name: "vortex_page_navigate", action: "page.navigate", description: "Navigate to a URL and wait for the page to finish loading. Failures: TIMEOUT (raise timeout or verify URL reachable), NAVIGATION_FAILED.", schema: { type: "object", properties: { url: { type: "string", description: "URL to navigate to" }, waitForLoad: { type: "boolean", description: "Wait for page load to complete", default: true }, timeout: { type: "number", description: "Navigation timeout in ms", default: 30000 }, ...optionalTabId }, required: ["url"] } },
    { name: "vortex_page_reload", action: "page.reload", description: "Reload the current page.", schema: { type: "object", properties: { ...optionalTabId }, required: [] } },
    { name: "vortex_page_back", action: "page.back", description: "Go back in browser history.", schema: { type: "object", properties: { ...optionalTabId }, required: [] } },
    { name: "vortex_page_forward", action: "page.forward", description: "Go forward in browser history.", schema: { type: "object", properties: { ...optionalTabId }, required: [] } },
    { name: "vortex_page_wait", action: "page.wait", description: "Wait for a CSS selector to appear on the page, or wait for a fixed timeout. Failures: TIMEOUT (selector did not appear — verify selector or raise timeout).", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector to wait for" }, timeout: { type: "number", description: "Timeout in ms", default: 10000 }, ...optionalTabId, ...optionalFrameId }, required: [] } },
    { name: "vortex_page_info", action: "page.info", description: "Get the current page URL, title, and load status.", schema: { type: "object", properties: { ...optionalTabId }, required: [] } },
    { name: "vortex_page_wait_for_network_idle", action: "page.waitForNetworkIdle", description: "Wait until all network requests are complete. Useful after navigating to AJAX-heavy pages or triggering actions that load data. Failures: TIMEOUT (requests never settled — inspect with vortex_network_get_logs).", schema: { type: "object", properties: { timeout: { type: "number", description: "Max wait time in ms", default: 30000 }, idleTime: { type: "number", description: "Duration with no requests to confirm idle (ms)", default: 500 }, ...optionalTabId }, required: [] } },
  ];
}

function domTools(): ToolDef[] {
  return [
    { name: "vortex_dom_query", action: "dom.query", description: "Find a single element by CSS selector, or by vortex_observe index. Returns its tag, text, classes, and attributes. Failures: ELEMENT_NOT_FOUND, STALE_SNAPSHOT, INVALID_INDEX.", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector (alternative: index + snapshotId)" }, ...targetSpec, ...optionalTabId, ...optionalFrameId }, required: [] } },
    { name: "vortex_dom_query_all", action: "dom.queryAll", description: "Find all elements matching a CSS selector, or by vortex_observe index. Failures: ELEMENT_NOT_FOUND, STALE_SNAPSHOT, INVALID_INDEX.", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector (alternative: index + snapshotId)" }, ...targetSpec, ...optionalTabId, ...optionalFrameId }, required: [] } },
    { name: "vortex_dom_click", action: "dom.click", description: "Click an element by CSS selector OR by index from vortex_observe (prefer index — more stable, no selector guessing). Scrolls into view if needed. Failures: ELEMENT_OCCLUDED (dismiss overlays/modals first), ELEMENT_OFFSCREEN (scroll into view), ELEMENT_DISABLED (fill prior fields), SELECTOR_AMBIGUOUS (narrow selector), ELEMENT_NOT_FOUND, STALE_SNAPSHOT (re-call vortex_observe), INVALID_INDEX.", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector of element to click (alternative: index + snapshotId)" }, useRealMouse: { type: "boolean", description: "Use CDP real mouse events (mousedown+mouseup) instead of element.click(). Try this when normal click doesn't trigger React onClick handlers or when blocked by anti-bot detection." }, ...targetSpec, ...optionalTabId, ...optionalFrameId }, required: [] } },
    { name: "vortex_dom_type", action: "dom.type", description: "Type text into an input element character by character. Use dom.fill for faster value setting. Target by selector or by vortex_observe index. Failures: ELEMENT_NOT_FOUND, SELECTOR_AMBIGUOUS, ELEMENT_DISABLED, ELEMENT_DETACHED, ELEMENT_OFFSCREEN (scroll first), STALE_SNAPSHOT, INVALID_INDEX, JS_EXECUTION_ERROR.", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector (alternative: index + snapshotId)" }, text: { type: "string", description: "Text to type" }, delay: { type: "number", description: "Delay between keystrokes in ms" }, ...targetSpec, ...optionalTabId, ...optionalFrameId }, required: ["text"] } },
    { name: "vortex_dom_fill", action: "dom.fill", description: "Set the value of a form field directly (faster than type, but doesn't trigger key events). Target by selector or by vortex_observe index. Failures: ELEMENT_NOT_FOUND, SELECTOR_AMBIGUOUS, ELEMENT_DISABLED, ELEMENT_DETACHED, ELEMENT_OFFSCREEN, STALE_SNAPSHOT, INVALID_INDEX, JS_EXECUTION_ERROR (element must be an input/textarea).", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector (alternative: index + snapshotId)" }, value: { type: "string", description: "Value to set" }, ...targetSpec, ...optionalTabId, ...optionalFrameId }, required: ["value"] } },
    { name: "vortex_dom_select", action: "dom.select", description: "Select an option in a dropdown/select element by value. Target by selector or by vortex_observe index. Failures: ELEMENT_NOT_FOUND, SELECTOR_AMBIGUOUS, ELEMENT_DISABLED, ELEMENT_DETACHED, ELEMENT_OFFSCREEN, STALE_SNAPSHOT, INVALID_INDEX, JS_EXECUTION_ERROR (value not in options — use dom.queryAll on 'option' to list values first).", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector (alternative: index + snapshotId)" }, value: { type: "string", description: "Option value to select" }, ...targetSpec, ...optionalTabId, ...optionalFrameId }, required: ["value"] } },
    { name: "vortex_dom_scroll", action: "dom.scroll", description: "Scroll the page or a specific container element. Target element by selector or by vortex_observe index. Failures: ELEMENT_NOT_FOUND (verify selector/container), STALE_SNAPSHOT, INVALID_INDEX, JS_EXECUTION_ERROR (must specify selector/index, position, or x/y).", schema: { type: "object", properties: { selector: { type: "string", description: "Element to scroll to (alternative: index + snapshotId)" }, container: { type: "string", description: "Scroll container selector" }, position: { type: "string", enum: ["top", "bottom", "left", "right"], description: "Scroll to position" }, x: { type: "number", description: "Scroll to x coordinate" }, y: { type: "number", description: "Scroll to y coordinate" }, ...targetSpec, ...optionalTabId, ...optionalFrameId }, required: [] } },
    { name: "vortex_dom_hover", action: "dom.hover", description: "Move the mouse over an element to trigger hover effects. Target by selector or by vortex_observe index. Failures: ELEMENT_NOT_FOUND, SELECTOR_AMBIGUOUS, ELEMENT_DETACHED, STALE_SNAPSHOT, INVALID_INDEX.", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector (alternative: index + snapshotId)" }, ...targetSpec, ...optionalTabId, ...optionalFrameId }, required: [] } },
    { name: "vortex_dom_get_attribute", action: "dom.getAttribute", description: "Get the value of a specific HTML attribute of an element. Target by selector or by vortex_observe index. Failures: ELEMENT_NOT_FOUND, STALE_SNAPSHOT, INVALID_INDEX.", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector (alternative: index + snapshotId)" }, attribute: { type: "string", description: "Attribute name (e.g. href, src, class)" }, ...targetSpec, ...optionalTabId, ...optionalFrameId }, required: ["attribute"] } },
    { name: "vortex_dom_get_scroll_info", action: "dom.getScrollInfo", description: "Get scroll position, viewport size, and total scrollable dimensions. Target element by selector or vortex_observe index (omit both for page).", schema: { type: "object", properties: { selector: { type: "string", description: "Element selector (alternative: index + snapshotId; omit both for page)" }, ...targetSpec, ...optionalTabId, ...optionalFrameId }, required: [] } },
    { name: "vortex_dom_wait_for_mutation", action: "dom.waitForMutation", description: "Wait for DOM changes on an element. Useful for detecting lazy-loaded or dynamically inserted content. Target by selector or by vortex_observe index. Failures: ELEMENT_NOT_FOUND, STALE_SNAPSHOT, INVALID_INDEX.", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector to observe (alternative: index + snapshotId)" }, timeout: { type: "number", description: "Timeout in ms", default: 10000 }, ...targetSpec, ...optionalTabId, ...optionalFrameId }, required: [] } },
    {
      name: "vortex_dom_watch_mutations",
      action: "dom.watchMutations",
      description:
        "Start reporting DOM mutations on a tab as 'dom.mutated' events (info level, dispatcher-merged every 1s). Use with vortex_events_subscribe({types:['dom.mutated'], minLevel:'info'}) to receive them. Heavy on mutation-busy pages — unwatch when done. Failures: JS_EXECUTION_ERROR (content script not injected — reload the page).",
      schema: {
        type: "object",
        properties: { ...optionalTabId },
        required: [],
      },
    },
    {
      name: "vortex_dom_unwatch_mutations",
      action: "dom.unwatchMutations",
      description: "Stop DOM mutation reporting on a tab.",
      schema: {
        type: "object",
        properties: { ...optionalTabId },
        required: [],
      },
    },
  ];
}

function contentTools(): ToolDef[] {
  return [
    { name: "vortex_content_get_text", action: "content.getText", description: "Get all visible text from the page or a specific element. Useful for reading page content. Failures: ELEMENT_NOT_FOUND (when selector is provided).", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector (omit for entire page)" }, maxBytes: { type: "integer", description: "Optional truncation limit in characters (UTF-16 code units). Range [4096, 5242880]. Default 131072 (~128KB). When exceeded, response is truncated and a [VORTEX_TRUNCATED ...] trailer is appended.", minimum: 4096, maximum: 5242880 }, ...optionalTabId, ...optionalFrameId }, required: [] } },
    { name: "vortex_content_get_html", action: "content.getHTML", description: "Get the outer HTML of the page or a specific element. Failures: ELEMENT_NOT_FOUND (when selector is provided).", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector (omit for entire page)" }, maxBytes: { type: "integer", description: "Optional truncation limit in characters (UTF-16 code units). Range [4096, 5242880]. Default 131072 (~128KB). When exceeded, response is truncated and a [VORTEX_TRUNCATED ...] trailer is appended.", minimum: 4096, maximum: 5242880 }, ...optionalTabId, ...optionalFrameId }, required: [] } },
    { name: "vortex_content_get_accessibility_tree", action: "content.getAccessibilityTree", description: "Get the accessibility tree of the page. Useful for understanding page structure and interactive elements.", schema: { type: "object", properties: { ...optionalTabId, ...optionalFrameId }, required: [] } },
    { name: "vortex_content_get_element_text", action: "content.getElementText", description: "Get the text content of a specific element. Failures: ELEMENT_NOT_FOUND.", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector" }, ...optionalTabId, ...optionalFrameId }, required: ["selector"] } },
    { name: "vortex_content_get_computed_style", action: "content.getComputedStyle", description: "Get the computed CSS properties of an element. Failures: ELEMENT_NOT_FOUND.", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector" }, properties: { type: "array", items: { type: "string" }, description: "CSS property names to read" }, ...optionalTabId, ...optionalFrameId }, required: ["selector"] } },
  ];
}

function jsTools(): ToolDef[] {
  return [
    { name: "vortex_js_evaluate", action: "js.evaluate", description: "Execute JavaScript in the page context and return the result. Failures: JS_EXECUTION_ERROR (page-side exception — inspect message).", schema: { type: "object", properties: { code: { type: "string", description: "JavaScript code to execute" }, ...optionalTabId, ...optionalFrameId }, required: ["code"] } },
    { name: "vortex_js_evaluate_async", action: "js.evaluateAsync", description: "Execute async JavaScript (can use 'await') and return the result. Failures: JS_EXECUTION_ERROR (page-side exception — inspect message).", schema: { type: "object", properties: { code: { type: "string", description: "Async JavaScript code" }, ...optionalTabId, ...optionalFrameId }, required: ["code"] } },
    { name: "vortex_js_call_function", action: "js.callFunction", description: "Call a named function defined on the page with arguments. Failures: INVALID_PARAMS (function not found on window — verify name).", schema: { type: "object", properties: { name: { type: "string", description: "Function name" }, args: { type: "array", items: {}, description: "Arguments to pass" }, ...optionalTabId, ...optionalFrameId }, required: ["name"] } },
  ];
}

function keyboardTools(): ToolDef[] {
  return [
    { name: "vortex_keyboard_press", action: "keyboard.press", description: "Press and release a keyboard key. Supports Enter, Tab, Escape, ArrowDown, ArrowUp, Backspace, Delete, F1-F12, and letter/number keys.", schema: { type: "object", properties: { key: { type: "string", description: "Key name (e.g. Enter, Tab, Escape, ArrowDown, a, 1)" }, ...optionalTabId }, required: ["key"] } },
    { name: "vortex_keyboard_shortcut", action: "keyboard.shortcut", description: "Press a keyboard shortcut (modifier + key). Example: ['Ctrl', 'a'] for select all.", schema: { type: "object", properties: { keys: { type: "array", items: { type: "string" }, description: "Array of key names, e.g. ['Ctrl', 'a']" }, ...optionalTabId }, required: ["keys"] } },
  ];
}

function mouseTools(): ToolDef[] {
  return [
    {
      name: "vortex_mouse_click",
      action: "mouse.click",
      description: "Click at specific x,y coordinates using CDP real mouse events (mousedown + mouseup sequence). Use this when dom.click doesn't trigger expected behavior (React synthetic events, anti-bot detection). For element-based clicking, prefer vortex_dom_click with useRealMouse=true.",
      schema: {
        type: "object",
        properties: {
          x: { type: "number", description: "X coordinate in viewport" },
          y: { type: "number", description: "Y coordinate in viewport" },
          button: { type: "string", enum: ["left", "right", "middle"], description: "Mouse button", default: "left" },
          ...optionalTabId,
        },
        required: ["x", "y"],
      },
    },
    {
      name: "vortex_mouse_double_click",
      action: "mouse.doubleClick",
      description: "Double-click at specific coordinates using CDP real mouse events.",
      schema: {
        type: "object",
        properties: {
          x: { type: "number", description: "X coordinate" },
          y: { type: "number", description: "Y coordinate" },
          ...optionalTabId,
        },
        required: ["x", "y"],
      },
    },
    {
      name: "vortex_mouse_move",
      action: "mouse.move",
      description: "Move the mouse to specific coordinates. Useful for triggering hover effects that require real mouse events.",
      schema: {
        type: "object",
        properties: {
          x: { type: "number", description: "X coordinate" },
          y: { type: "number", description: "Y coordinate" },
          ...optionalTabId,
        },
        required: ["x", "y"],
      },
    },
  ];
}

function captureTools(): ToolDef[] {
  return [
    { name: "vortex_capture_screenshot", action: "capture.screenshot", description: "Take a screenshot of the visible page area. Use to verify page state, check layouts, or debug visual issues. Large images (>500KB) auto-save to file to conserve tokens.", schema: { type: "object", properties: { format: { type: "string", enum: ["png", "jpeg"], default: "png" }, fullPage: { type: "boolean", description: "Capture the full scrollable page (max 8000px height). Useful for long pages." }, clip: { type: "object", description: "Custom clip region (overrides fullPage)", properties: { x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" } } }, ...screenshotReturnMode, ...optionalTabId }, required: [] }, returnsImage: true },
    { name: "vortex_capture_element", action: "capture.element", description: "Take a screenshot of a specific element. Supports iframe content via frameId. Failures: ELEMENT_NOT_FOUND.", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector" }, ...screenshotReturnMode, ...optionalTabId, ...optionalFrameId }, required: ["selector"] }, returnsImage: true },
    { name: "vortex_capture_gif_start", action: "capture.gifStart", description: "Start collecting GIF frames. Failures: INVALID_PARAMS (recording already in progress — call gif_stop first).", schema: { type: "object", properties: { fps: { type: "number", description: "Frames per second", default: 2 }, ...optionalTabId }, required: [] } },
    { name: "vortex_capture_gif_frame", action: "capture.gifFrame", description: "Manually capture a GIF frame. Failures: INVALID_PARAMS (no recording — call gif_start first).", schema: { type: "object", properties: { ...optionalTabId }, required: [] } },
    { name: "vortex_capture_gif_stop", action: "capture.gifStop", description: "Stop GIF recording and return collected frames. Failures: INVALID_PARAMS (no recording — call gif_start first).", schema: { type: "object", properties: {}, required: [] } },
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
    { name: "vortex_network_get_logs", action: "network.getLogs", description: "Get network request logs (URL, method, status, timing, request body). Auto-subscribes the tab to CDP Network events on first call (API requests only; call vortex_network_subscribe to also capture static resources). @since 0.4.0 auto-subscribe.", schema: { type: "object", properties: { includeResources: { type: "boolean", description: "Include static resources (scripts, stylesheets, images). Default: only API requests (XHR/Fetch). Resources are captured only after an explicit vortex_network_subscribe that enables them." }, ...optionalTabId }, required: [] } },
    { name: "vortex_network_get_errors", action: "network.getErrors", description: "Get failed network requests (HTTP status >= 400 or connection errors). Auto-subscribes on first call. @since 0.4.0 auto-subscribe.", schema: { type: "object", properties: { includeResources: { type: "boolean", description: "Include static resources (scripts, stylesheets, images). Default: only API requests (XHR/Fetch)." }, ...optionalTabId }, required: [] } },
    { name: "vortex_network_filter", action: "network.filter", description: "Filter network logs by URL pattern, HTTP method, or status code range. Auto-subscribes on first call. @since 0.4.0 auto-subscribe.", schema: { type: "object", properties: { url: { type: "string", description: "URL substring to match" }, method: { type: "string", description: "HTTP method (GET, POST, etc.)" }, statusMin: { type: "number", description: "Minimum status code" }, statusMax: { type: "number", description: "Maximum status code" }, includeResources: { type: "boolean", description: "Include static resources (scripts, stylesheets, images). Default: only API requests (XHR/Fetch)." }, ...optionalTabId }, required: [] } },
    { name: "vortex_network_get_response_body", action: "network.getResponseBody", description: "Get the full response body of a specific network request. Use requestId from network.getLogs or network.filter results. Auto-subscribes on first call. Failures: INTERNAL_ERROR (body 204/redirect/evicted — trigger the request again after subscription is active).", schema: { type: "object", properties: { requestId: { type: "string", description: "Request ID from network logs" }, ...optionalTabId }, required: ["requestId"] } },
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
    {
      name: "vortex_storage_export_session",
      action: "storage.exportSession",
      description: "Export all cookies, localStorage, and sessionStorage for a domain as JSON. Use to save login state. Note: localStorage/sessionStorage are only captured if the active tab is on the target domain.",
      schema: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Domain (e.g. 'example.com' or '.example.com' for subdomains)" },
          ...optionalTabId,
        },
        required: ["domain"],
      },
    },
    {
      name: "vortex_storage_import_session",
      action: "storage.importSession",
      description: "Restore cookies, localStorage, and sessionStorage from a previously exported session JSON. Before calling, navigate the tab to the target domain if you want localStorage/sessionStorage restored.",
      schema: {
        type: "object",
        properties: {
          data: { type: "object", description: "Session data object from export_session (must contain cookies, domain, etc.)" },
          ...optionalTabId,
        },
        required: ["data"],
      },
    },
  ];
}

function fileTools(): ToolDef[] {
  return [
    { name: "vortex_file_upload", action: "file.upload", description: "Upload a file to a file input element. The file content must be base64 encoded. Failures: ELEMENT_NOT_FOUND, INVALID_PARAMS (selector must target <input type=file>).", schema: { type: "object", properties: { selector: { type: "string", description: "CSS selector of file input" }, fileName: { type: "string", description: "File name" }, fileContent: { type: "string", description: "Base64 encoded file content" }, mimeType: { type: "string", description: "MIME type" }, ...optionalTabId }, required: ["selector", "fileName", "fileContent"] } },
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

function eventsTools(): ToolDef[] {
  return [
    {
      name: "vortex_events_subscribe",
      action: "__mcp_events_subscribe__",
      description:
        "Subscribe to browser events (user tab switch/close, dialogs, downloads, page navigation, console errors, ...). Events are delivered piggybacked to subsequent tool responses as a [vortex-events] text item. Returns a subscription id. Default subscribes to all `urgent` level events.",
      schema: {
        type: "object",
        properties: {
          types: {
            type: "array",
            items: { type: "string" },
            description:
              "Event types to subscribe to. Omit to subscribe to all events at/above minLevel. Known: user.switched_tab, user.closed_tab, dialog.opened, download.completed, page.navigated, console.error, network.error_detected, form.submitted, dom.mutated, network.request.",
          },
          minLevel: {
            type: "string",
            enum: ["info", "notice", "urgent"],
            description:
              "Minimum level to deliver. Default: 'urgent' (only user-interruptible events).",
            default: "urgent",
          },
          tabId: {
            type: "number",
            description: "Filter events to this tab only.",
          },
        },
        required: [],
      },
    },
    {
      name: "vortex_events_unsubscribe",
      action: "__mcp_events_unsubscribe__",
      description: "Cancel an event subscription by id.",
      schema: {
        type: "object",
        properties: {
          subscriptionId: {
            type: "string",
            description: "Subscription id from vortex_events_subscribe.",
          },
        },
        required: ["subscriptionId"],
      },
    },
    {
      name: "vortex_events_drain",
      action: "__mcp_events_drain__",
      description:
        "Force-flush the event dispatcher (all buffered notice/info events, bypassing the 200ms/1000ms aggregation windows) and return matching events inline. Use this AFTER triggering actions that should produce events (e.g. DOM-mutating clicks) when you need the events before the normal aggregation window completes — essential for sub-second ReAct loops where the agent would otherwise finish before info-level events flush. Normally events piggyback onto subsequent tool responses; drain bypasses that with inline return. Returns { events: [...], flushed: { notice, info } }. Requires an active subscription. Failures: none typically.",
      schema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  ];
}

function observeTools(): ToolDef[] {
  return [
    {
      name: "vortex_observe",
      action: "observe.snapshot",
      description:
        "⭐ On any non-trivial page, call this first. Using vortex_content_get_text / _html / vortex_dom_query on large pages (>128KB) risks truncation; this tool returns a small structured index of interactive elements indexed by position. Get an LLM-friendly snapshot of the page in ONE call: indexed interactive elements (button/link/input/select/etc.) with role, accessible name, bbox, occlusion status (visible/occludedBy), and key attributes. Prefer this over multiple dom.query calls when exploring what the page can do. Returns a snapshotId; pair with `index` in dom.* tools to operate on elements without guessing CSS selectors. Snapshot TTL: 60s. Failures: TAB_NOT_FOUND, JS_EXECUTION_ERROR.",
      schema: {
        type: "object",
        properties: {
          viewport: {
            type: "string",
            enum: ["visible", "full"],
            description:
              "visible: only elements within the current viewport (default). full: all interactive elements in the page.",
            default: "visible",
          },
          maxElements: {
            type: "number",
            description: "Max elements to return (default 200).",
            default: 200,
          },
          includeAX: {
            type: "boolean",
            description:
              "Infer ARIA role (default true). Set false for raw tag names only.",
            default: true,
          },
          includeText: {
            type: "boolean",
            description:
              "Compute accessible name from aria-label/labels/innerText (default true).",
            default: true,
          },
          ...optionalTabId,
          ...optionalFrameId,
        },
        required: [],
      },
    },
  ];
}

function diagnosticsTools(): ToolDef[] {
  return [
    {
      name: "vortex_ping",
      action: "__mcp_ping__",
      description: "Check if vortex-server is reachable and report connection status. Use this FIRST if other vortex tools fail — returns 'ok' with tab count, or a clear error with instructions if the server is not running.",
      schema: { type: "object", properties: {}, required: [] },
    },
  ];
}

export function getAllToolDefs(): ToolDef[] {
  return [
    ...diagnosticsTools(),
    ...eventsTools(),
    ...observeTools(),
    ...tabTools(),
    ...pageTools(),
    ...domTools(),
    ...contentTools(),
    ...jsTools(),
    ...keyboardTools(),
    ...mouseTools(),
    ...captureTools(),
    ...consoleTools(),
    ...networkTools(),
    ...storageTools(),
    ...fileTools(),
    ...framesTools(),
  ];
}
