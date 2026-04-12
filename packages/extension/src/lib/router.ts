import type { NmRequest, NmResponse } from "@bytenew/vortex-shared";
import { VtxErrorCode } from "@bytenew/vortex-shared";

type Handler = (args: Record<string, unknown>, tabId?: number) => Promise<unknown>;

export class ActionRouter {
  private handlers = new Map<string, Handler>();

  register(action: string, handler: Handler): void {
    this.handlers.set(action, handler);
  }

  registerAll(actions: Record<string, Handler>): void {
    for (const [action, handler] of Object.entries(actions)) {
      this.register(action, handler);
    }
  }

  async dispatch(request: NmRequest): Promise<NmResponse> {
    const handler = this.handlers.get(request.tool);
    if (!handler) {
      return {
        type: "tool_response",
        requestId: request.requestId,
        error: { code: VtxErrorCode.UNKNOWN_ACTION, message: `Unknown action: ${request.tool}` },
      };
    }

    try {
      const result = await handler(request.args, request.tabId);
      return { type: "tool_response", requestId: request.requestId, result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code =
        message.includes("No tab") ? VtxErrorCode.TAB_NOT_FOUND :
        message.includes("Cannot access") ? VtxErrorCode.PERMISSION_DENIED :
        VtxErrorCode.JS_EXECUTION_ERROR;
      return { type: "tool_response", requestId: request.requestId, error: { code, message } };
    }
  }

  getRegisteredActions(): string[] {
    return Array.from(this.handlers.keys());
  }
}
