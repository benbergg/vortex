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
} as const;

export type ActionString =
  | (typeof TabActions)[keyof typeof TabActions]
  | (typeof PageActions)[keyof typeof PageActions]
  | (typeof JsActions)[keyof typeof JsActions]
  | (typeof DomActions)[keyof typeof DomActions]
  | (typeof ContentActions)[keyof typeof ContentActions]
  | (typeof ConsoleActions)[keyof typeof ConsoleActions]
  | (typeof NetworkActions)[keyof typeof NetworkActions];
