export const TabActions = {
  LIST: "tab.list",
  CREATE: "tab.create",
  CLOSE: "tab.close",
  ACTIVATE: "tab.activate",
  GET_INFO: "tab.getInfo",
} as const;

export const PageActions = {
  NAVIGATE: "page.navigate",
  RELOAD: "page.reload",
  BACK: "page.back",
  FORWARD: "page.forward",
  WAIT: "page.wait",
  INFO: "page.info",
  WAIT_FOR_NETWORK_IDLE: "page.waitForNetworkIdle",
} as const;

export const JsActions = {
  EVALUATE: "js.evaluate",
  EVALUATE_ASYNC: "js.evaluateAsync",
  CALL_FUNCTION: "js.callFunction",
} as const;

export const DomActions = {
  QUERY: "dom.query",
  QUERY_ALL: "dom.queryAll",
  CLICK: "dom.click",
  TYPE: "dom.type",
  FILL: "dom.fill",
  SELECT: "dom.select",
  SCROLL: "dom.scroll",
  HOVER: "dom.hover",
  GET_ATTRIBUTE: "dom.getAttribute",
  GET_SCROLL_INFO: "dom.getScrollInfo",
  WAIT_FOR_MUTATION: "dom.waitForMutation",
  /** 等待 DOM 子树在 quietMs ms 内无任何 mutation 后返回。与 WAIT_FOR_MUTATION 语义互补。@since 0.4.0 */
  WAIT_SETTLED: "dom.waitSettled",
  WATCH_MUTATIONS: "dom.watchMutations",
  UNWATCH_MUTATIONS: "dom.unwatchMutations",
} as const;

export const ContentActions = {
  GET_TEXT: "content.getText",
  GET_HTML: "content.getHTML",
  GET_ACCESSIBILITY_TREE: "content.getAccessibilityTree",
  GET_ELEMENT_TEXT: "content.getElementText",
  GET_COMPUTED_STYLE: "content.getComputedStyle",
} as const;

export const ConsoleActions = {
  GET_LOGS: "console.getLogs",
  GET_ERRORS: "console.getErrors",
  SUBSCRIBE: "console.subscribe",
  CLEAR: "console.clear",
} as const;

export const NetworkActions = {
  GET_LOGS: "network.getLogs",
  GET_ERRORS: "network.getErrors",
  SUBSCRIBE: "network.subscribe",
  FILTER: "network.filter",
  CLEAR: "network.clear",
  GET_RESPONSE_BODY: "network.getResponseBody",
} as const;

export const CaptureActions = {
  SCREENSHOT: "capture.screenshot",
  ELEMENT: "capture.element",
  GIF_START: "capture.gifStart",
  GIF_STOP: "capture.gifStop",
  GIF_FRAME: "capture.gifFrame",
} as const;

export const StorageActions = {
  GET_COOKIES: "storage.getCookies",
  SET_COOKIE: "storage.setCookie",
  DELETE_COOKIE: "storage.deleteCookie",
  GET_LOCAL_STORAGE: "storage.getLocalStorage",
  SET_LOCAL_STORAGE: "storage.setLocalStorage",
  GET_SESSION_STORAGE: "storage.getSessionStorage",
  SET_SESSION_STORAGE: "storage.setSessionStorage",
  EXPORT_SESSION: "storage.exportSession",
  IMPORT_SESSION: "storage.importSession",
} as const;

export const KeyboardActions = {
  PRESS: "keyboard.press",
  SHORTCUT: "keyboard.shortcut",
} as const;

export const MouseActions = {
  CLICK: "mouse.click",
  DOUBLE_CLICK: "mouse.doubleClick",
  MOVE: "mouse.move",
} as const;

export const FramesActions = {
  LIST: "frames.list",
  FIND: "frames.find",
} as const;

export const FileActions = {
  UPLOAD: "file.upload",
  DOWNLOAD: "file.download",
  GET_DOWNLOADS: "file.getDownloads",
  ON_DOWNLOAD_COMPLETE: "file.onDownloadComplete",
} as const;

export const ObserveActions = {
  SNAPSHOT: "observe.snapshot",
} as const;

export const EventsActions = {
  /** 强制立即 flush dispatcher 的 notice+info buffer，绕过节流窗口 */
  DRAIN: "events.drain",
} as const;

export type ActionString =
  | (typeof TabActions)[keyof typeof TabActions]
  | (typeof PageActions)[keyof typeof PageActions]
  | (typeof JsActions)[keyof typeof JsActions]
  | (typeof DomActions)[keyof typeof DomActions]
  | (typeof ContentActions)[keyof typeof ContentActions]
  | (typeof ConsoleActions)[keyof typeof ConsoleActions]
  | (typeof NetworkActions)[keyof typeof NetworkActions]
  | (typeof CaptureActions)[keyof typeof CaptureActions]
  | (typeof StorageActions)[keyof typeof StorageActions]
  | (typeof KeyboardActions)[keyof typeof KeyboardActions]
  | (typeof MouseActions)[keyof typeof MouseActions]
  | (typeof FramesActions)[keyof typeof FramesActions]
  | (typeof FileActions)[keyof typeof FileActions]
  | (typeof ObserveActions)[keyof typeof ObserveActions]
  | (typeof EventsActions)[keyof typeof EventsActions];
