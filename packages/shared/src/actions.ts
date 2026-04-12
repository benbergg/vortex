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

export type ActionString =
  | (typeof TabActions)[keyof typeof TabActions]
  | (typeof PageActions)[keyof typeof PageActions]
  | (typeof JsActions)[keyof typeof JsActions];
