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
  error?: {
    code: string;
    message: string;
  };
}

export interface VtxEvent {
  event: string;
  data: unknown;
  tabId?: number;
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
  error?: {
    code: string;
    message: string;
  };
}

export interface NmEvent {
  type: "event";
  event: string;
  data: unknown;
  tabId?: number;
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

export type NmMessageFromServer = NmRequest | NmPing;
export type NmMessageFromExtension = NmResponse | NmEvent | NmResponseChunk | NmPong;
export type NmMessage = NmMessageFromServer | NmMessageFromExtension;
