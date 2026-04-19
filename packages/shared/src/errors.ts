export const VtxErrorCode = {
  // -- 元素定位（6 类）--
  ELEMENT_NOT_FOUND: "ELEMENT_NOT_FOUND",
  ELEMENT_OCCLUDED: "ELEMENT_OCCLUDED",
  ELEMENT_OFFSCREEN: "ELEMENT_OFFSCREEN",
  ELEMENT_DISABLED: "ELEMENT_DISABLED",
  ELEMENT_DETACHED: "ELEMENT_DETACHED",
  SELECTOR_AMBIGUOUS: "SELECTOR_AMBIGUOUS",

  // -- 页面状态（4 类）--
  NAVIGATION_IN_PROGRESS: "NAVIGATION_IN_PROGRESS",
  PAGE_NOT_READY: "PAGE_NOT_READY",
  DIALOG_BLOCKING: "DIALOG_BLOCKING",
  IFRAME_NOT_READY: "IFRAME_NOT_READY",

  // -- Snapshot（2 类，配合 vortex_observe）--
  STALE_SNAPSHOT: "STALE_SNAPSHOT",
  INVALID_INDEX: "INVALID_INDEX",

  // -- 网络与标签（3 类）--
  NAVIGATION_FAILED: "NAVIGATION_FAILED",
  TAB_NOT_FOUND: "TAB_NOT_FOUND",
  TAB_CLOSED: "TAB_CLOSED",

  // -- 执行与权限（5 类）--
  TIMEOUT: "TIMEOUT",
  JS_EXECUTION_ERROR: "JS_EXECUTION_ERROR",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  CSP_BLOCKED: "CSP_BLOCKED",
  INTERNAL_ERROR: "INTERNAL_ERROR",

  // -- 传输层（4 类）--
  NATIVE_MESSAGING_ERROR: "NATIVE_MESSAGING_ERROR",
  EXTENSION_NOT_CONNECTED: "EXTENSION_NOT_CONNECTED",
  INVALID_PARAMS: "INVALID_PARAMS",
  UNKNOWN_ACTION: "UNKNOWN_ACTION",

  // -- 组件 / 框架（1 类，@since 0.4.0）--
  /** 目标元素属于框架托管的受控组件（如 Element Plus datetime-range picker），
   *  不能用普通 DOM 原语（fill/type）安全提交值；需换用 vortex_dom_commit。 */
  UNSUPPORTED_TARGET: "UNSUPPORTED_TARGET",
} as const;

export type VtxErrorCode = (typeof VtxErrorCode)[keyof typeof VtxErrorCode];

export interface VtxErrorContext {
  selector?: string;
  index?: number;
  snapshotId?: string;
  tabId?: number;
  frameId?: number;
  /** 兜底字段：存放 handler 场景特有的结构化信息（如遮挡元素 tag、目标 URL、action 名等） */
  extras?: Record<string, unknown>;
}

export interface VtxErrorPayload {
  code: VtxErrorCode;
  message: string;
  hint?: string;
  recoverable?: boolean;
  context?: VtxErrorContext;
}

export type VtxErrorExtra = Omit<VtxErrorPayload, "code" | "message">;

export class VtxError extends Error {
  constructor(
    public readonly code: VtxErrorCode,
    message: string,
    public readonly extra?: VtxErrorExtra,
  ) {
    super(message);
    this.name = "VtxError";
  }

  toJSON(): VtxErrorPayload {
    const payload: VtxErrorPayload = {
      code: this.code,
      message: this.message,
    };
    if (this.extra?.hint !== undefined) payload.hint = this.extra.hint;
    if (this.extra?.recoverable !== undefined) payload.recoverable = this.extra.recoverable;
    if (this.extra?.context !== undefined) payload.context = this.extra.context;
    return payload;
  }

  toString(): string {
    return `VtxError[${this.code}]: ${this.message}`;
  }
}
