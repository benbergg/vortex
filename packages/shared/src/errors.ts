export const VtxErrorCode = {
  ELEMENT_NOT_FOUND: "ELEMENT_NOT_FOUND",
  TIMEOUT: "TIMEOUT",
  TAB_NOT_FOUND: "TAB_NOT_FOUND",
  NAVIGATION_FAILED: "NAVIGATION_FAILED",
  JS_EXECUTION_ERROR: "JS_EXECUTION_ERROR",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  NATIVE_MESSAGING_ERROR: "NATIVE_MESSAGING_ERROR",
  EXTENSION_NOT_CONNECTED: "EXTENSION_NOT_CONNECTED",
  INVALID_PARAMS: "INVALID_PARAMS",
  UNKNOWN_ACTION: "UNKNOWN_ACTION",
} as const;

export type VtxErrorCode = (typeof VtxErrorCode)[keyof typeof VtxErrorCode];

export class VtxError extends Error {
  constructor(
    public readonly code: VtxErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "VtxError";
  }

  toJSON() {
    return { code: this.code, message: this.message };
  }
}
