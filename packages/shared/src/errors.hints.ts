import { VtxError, VtxErrorCode } from "./errors.js";
import type { VtxErrorContext, VtxErrorExtra } from "./errors.js";

/**
 * 错误元信息：给上游 LLM Agent 的恢复提示。
 *
 * `recoverable` 语义：
 * - `true`：同一动作带参数调整后重试可能成功（如 ELEMENT_OCCLUDED 清理遮挡后重试）
 * - `false`：同一动作重试无意义，但 hint 可能指引换一个动作达成目标
 *   （如 TAB_CLOSED 需要换 tab，不是动作本身的重试）
 */
export interface VtxErrorMeta {
  hint: string;
  recoverable: boolean;
}

export const DEFAULT_ERROR_META: Record<VtxErrorCode, VtxErrorMeta> = {
  // -- 元素定位 --
  ELEMENT_NOT_FOUND: {
    hint: "Element not found. Verify the selector, or call vortex_observe to list interactive elements. If the element may live inside an iframe, call vortex_observe({frames:'all-same-origin'}) to descend into iframes — then use the returned element.frameId with dom.* / mouse_click for auto-offset routing.",
    recoverable: true,
  },
  ELEMENT_OCCLUDED: {
    hint: "Element is covered by another (modal/overlay/cookie banner). Dismiss the overlay first, then retry.",
    recoverable: true,
  },
  ELEMENT_OFFSCREEN: {
    hint: "Element is outside the viewport. Call vortex_dom_scroll to bring it into view, then retry.",
    recoverable: true,
  },
  ELEMENT_DISABLED: {
    hint: "Element has disabled attribute. Fill required prior fields or satisfy prerequisites to enable it.",
    recoverable: true,
  },
  ELEMENT_DETACHED: {
    hint: "Element was removed from the DOM. Call vortex_observe again to get the current state.",
    recoverable: true,
  },
  SELECTOR_AMBIGUOUS: {
    hint: "Selector matched multiple elements. Use a more specific selector, or call vortex_observe to get indexes.",
    recoverable: true,
  },

  // -- 页面状态 --
  NAVIGATION_IN_PROGRESS: {
    hint: "A page navigation is in progress. Call vortex_page_wait_for_network_idle before retrying.",
    recoverable: true,
  },
  PAGE_NOT_READY: {
    hint: "Page DOM not ready. Wait for load, or call vortex_page_wait before retrying.",
    recoverable: true,
  },
  DIALOG_BLOCKING: {
    hint: "A native browser dialog (alert/confirm/prompt) is blocking. Handle or dismiss it first.",
    recoverable: true,
  },
  IFRAME_NOT_READY: {
    hint: "Target iframe is not ready or not yet loaded. Call vortex_frames_list after a short wait, or retry vortex_observe with frames:'all-same-origin' — the returned elements will carry frameId so follow-up mouse_click / dom.* can route correctly.",
    recoverable: true,
  },

  // -- Snapshot --
  STALE_SNAPSHOT: {
    hint: "Page has changed since the snapshot. Call vortex_observe to get a fresh snapshot, then retry.",
    recoverable: true,
  },
  INVALID_INDEX: {
    hint: "Index does not exist in this snapshot. Call vortex_observe to list valid indexes.",
    recoverable: true,
  },

  // -- 网络与标签 --
  NAVIGATION_FAILED: {
    hint: "Navigation failed (network error, blocked URL, or invalid URL). Verify the URL and retry.",
    recoverable: true,
  },
  TAB_NOT_FOUND: {
    hint: "Tab id does not exist. Call vortex_tab_list to find valid tab ids.",
    recoverable: false,
  },
  TAB_CLOSED: {
    hint: "The target tab was closed during execution. Select another tab or create a new one.",
    recoverable: false,
  },

  // -- 执行与权限 --
  TIMEOUT: {
    hint: "Action timed out. Increase the timeout parameter, or check if the page is stuck.",
    recoverable: true,
  },
  JS_EXECUTION_ERROR: {
    hint: "Injected JavaScript threw an error. Inspect the error message and adjust the code.",
    recoverable: false,
  },
  PERMISSION_DENIED: {
    hint: "Operation blocked by browser permission (cross-origin, file access, or extension permission).",
    recoverable: false,
  },
  CSP_BLOCKED: {
    hint: "Action blocked by Content-Security-Policy. Try a CDP-based alternative (e.g. vortex_dom_click with useRealMouse=true).",
    recoverable: true,
  },
  INTERNAL_ERROR: {
    hint: "Unexpected error in the vortex runtime (server/relay/mcp). Check logs; retry may work if transient.",
    recoverable: true,
  },

  // -- 传输层 --
  NATIVE_MESSAGING_ERROR: {
    hint: "Native messaging channel error. Verify the vortex host is installed and the extension is reloaded.",
    recoverable: false,
  },
  EXTENSION_NOT_CONNECTED: {
    hint: "Vortex extension is not connected. Ensure Chrome is open and the extension is enabled.",
    recoverable: false,
  },
  INVALID_PARAMS: {
    hint: "Invalid parameters. Check the tool schema and retry with correct arguments.",
    recoverable: false,
  },
  UNKNOWN_ACTION: {
    hint: "Unknown action. Check spelling or verify the action is supported in this vortex version.",
    recoverable: false,
  },

  // -- 组件 / 框架 --
  UNSUPPORTED_TARGET: {
    hint: "Target is a framework-controlled component (e.g. Element Plus datetime-range picker). Use vortex_dom_commit with a matching kind instead of vortex_dom_fill/type.",
    recoverable: false,
  },
  COMMIT_FAILED: {
    hint: "vortex_dom_commit driver failed mid-flow. Inspect context.extras.stage (open-picker / navigate-month / click-day / confirm / verify) to see which step broke. Page state may have changed between calls, or the framework version is not matched by any driver.",
    recoverable: true,
  },

  // -- L2 Action layer --
  NOT_ATTACHED: {
    hint: "Element detached from DOM. Call vortex_observe to re-locate the element, then retry with the new ref.",
    recoverable: true,
  },
  NOT_VISIBLE: {
    hint: "Element not visible (display:none / visibility:hidden / 0x0 box). Call vortex_wait with mode:'element' state:'visible', or check if the parent container is hidden.",
    recoverable: true,
  },
  NOT_STABLE: {
    hint: "Element position is unstable (animating). Call vortex_wait with mode:'idle' to let the animation settle, then retry.",
    recoverable: true,
  },
  OBSCURED: {
    hint: "Element hit-test failed; covered by another element (e.g. modal/loading overlay). Inspect via vortex_screenshot, dismiss the overlay (context.extras.blocker may identify it), then retry.",
    recoverable: true,
  },
  DISABLED: {
    hint: "Element is disabled (disabled attr / aria-disabled / fieldset[disabled]). Complete prerequisite interactions to unlock it before retrying.",
    recoverable: true,
  },
  NOT_EDITABLE: {
    hint: "Target is not editable (readonly or non-input element). Use vortex_extract or vortex_get_text to read instead, or pick a different selector.",
    recoverable: false,
  },
  ACTION_FAILED_ALL_PATHS: {
    hint: "All fallback paths exhausted (dispatchEvent → CDP → ...). context.extras.attemptedPaths lists what was tried. Inspect via vortex_screenshot; consider coordinate-based click via vortex_evaluate, or check if the element is inside a closed shadow root.",
    recoverable: false,
  },
  DRAG_REQUIRES_CDP: {
    hint: "Drag operation requires CDP, but CDP is unavailable (DevTools may be open, or chrome.debugger attach was denied). Close DevTools and retry, or rewrite the flow using vortex_evaluate primitives.",
    recoverable: false,
  },

  // -- L3 Reasoning（@since 0.6.0 PR #3）--
  A11Y_UNAVAILABLE: {
    hint: "Accessibility tree unavailable on this page (CSP-restricted or sandboxed). Switch to a regular page or fall back to CSS selectors via vortex_dom_*.",
    recoverable: false,
  },
  CDP_NOT_ATTACHED: {
    hint: "chrome.debugger could not attach to the tab. Verify manifest has the 'debugger' permission and the tab is not chrome:// or chrome-extension://.",
    recoverable: false,
  },
  STALE_REF: {
    hint: "Element ref is stale and could not be re-resolved by descriptor. Call vortex_observe again to get fresh refs.",
    recoverable: true,
  },
  AMBIGUOUS_DESCRIPTOR: {
    hint: "Descriptor matched multiple elements in strict mode. Add a 'near' relation to disambiguate, narrow the name, or set strict:false to take the first match.",
    recoverable: true,
  },
  REF_NOT_FOUND: {
    hint: "ref does not exist in the current RefStore. Call vortex_observe to mint fresh refs and retry.",
    recoverable: true,
  },
  SNAPSHOT_EXPIRED: {
    hint: "Snapshot expired (> 5 min). Call vortex_observe to capture a new snapshot and retry.",
    recoverable: true,
  },
  CROSS_ORIGIN_IFRAME: {
    hint: "Accessibility.getFullAXTree was rejected for a cross-origin frame; the AX tree cannot be queried across origin boundaries. Switch to a same-origin entry point or operate within the iframe via its own tab context.",
    recoverable: false,
  },
  CLOSED_SHADOW_DOM: {
    hint: "Element lives inside a closed shadow root and cannot be pierced. Ask the component author to use { mode: 'open' } shadow, or expose an ARIA-rich light-DOM proxy.",
    recoverable: false,
  },
};

/**
 * 便捷构造 VtxError：自动注入 DEFAULT_ERROR_META 的 hint 与 recoverable。
 * 调用方只需传 code / message / context。
 * 如需覆盖默认 hint 或 recoverable，传 `override` 参数。
 */
export function vtxError(
  code: VtxErrorCode,
  message: string,
  context?: VtxErrorContext,
  override?: Partial<VtxErrorMeta>,
): VtxError {
  const meta = DEFAULT_ERROR_META[code];
  const extra: VtxErrorExtra = {
    hint: override?.hint ?? meta.hint,
    recoverable: override?.recoverable ?? meta.recoverable,
  };
  if (context !== undefined) extra.context = context;
  return new VtxError(code, message, extra);
}
