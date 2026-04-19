import type { VtxErrorPayload } from "./errors.js";
import type { VtxEventLevel } from "./events.js";

// ========== 客户端 <-> 中间件 ==========

export interface VtxRequest {
  action: string;
  params?: Record<string, unknown>;
  id: string;
  tabId?: number;
}

export interface VtxResponse {
  action: string;
  id: string;
  result?: unknown;
  error?: VtxErrorPayload;
}

export interface VtxEvent {
  event: string;
  data: unknown;
  tabId?: number;
  frameId?: number;
  level?: VtxEventLevel;
  timestamp: number;
}

// ========== 中间件 <-> 扩展 (Native Messaging) ==========

export interface NmRequest {
  type: "tool_request";
  tool: string;
  args: Record<string, unknown>;
  requestId: string;
  tabId?: number;
}

export interface NmResponse {
  type: "tool_response";
  requestId: string;
  result?: unknown;
  error?: VtxErrorPayload;
}

export interface NmEvent {
  type: "event";
  event: string;
  data: unknown;
  tabId?: number;
  frameId?: number;
  level?: VtxEventLevel;
}

export interface NmResponseChunk {
  type: "tool_response_chunk";
  requestId: string;
  chunkIndex: number;
  totalChunks: number;
  data: string;
}

export interface NmPing {
  type: "ping";
}

export interface NmPong {
  type: "pong";
}

/**
 * Server→Extension 控制消息。@since 0.4.0
 *
 * 目前仅支持 `reload-extension`：server 端 watcher 检测到扩展 dist 变化后
 * 向扩展推送此消息，扩展侧调 `chrome.runtime.reload()` 自重载并读取新 dist，
 * 避免每次 `pnpm -C packages/extension build` 后人工去 `chrome://extensions`
 * 点刷新。与 MCP 的 O-3 `fs.watch` 自 exit 对称。
 */
export interface NmControl {
  type: "control";
  action: "reload-extension";
  /** 可选：方便扩展侧日志打点/调试，不影响行为 */
  reason?: string;
}

export type NmMessageFromServer = NmRequest | NmPing | NmControl;
export type NmMessageFromExtension = NmResponse | NmEvent | NmResponseChunk | NmPong;
export type NmMessage = NmMessageFromServer | NmMessageFromExtension;
