import WebSocket from "ws";
import type { VtxRequest, VtxResponse, VtxEvent } from "@bytenew/vortex-shared";

export interface ClientOptions {
  port: number;
  tabId?: number;   // 顶层路由 tabId（来自 --tab 全局选项）
  follow?: boolean;
  onEvent?: (event: VtxEvent) => void;
}

let requestCounter = 0;

/**
 * 发送单个请求并等待响应。
 * 连接 → 发送 → 收到匹配 id 的响应 → 返回 → 关闭连接。
 */
export function sendRequest(
  action: string,
  params: Record<string, unknown>,
  opts: ClientOptions,
): Promise<VtxResponse> {
  return new Promise((resolve, reject) => {
    const id = `cli-${++requestCounter}-${Date.now()}`;
    const ws = new WebSocket(`ws://localhost:${opts.port}/ws`);
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        ws.close();
        reject(new Error(`Timeout: no response for ${action}`));
      }
    }, 30_000);

    ws.on("open", () => {
      // params 原样传递，tabId 只来自 ClientOptions（--tab 全局选项）
      const req: VtxRequest = { action, params, id, ...(opts.tabId != null ? { tabId: opts.tabId } : {}) };
      ws.send(JSON.stringify(req));
    });

    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());

      // 事件推送（subscribe 模式）
      if (msg.event && opts.onEvent) {
        opts.onEvent(msg as VtxEvent);
        return;
      }

      // 响应
      if (msg.id === id) {
        clearTimeout(timeout);
        settled = true;
        if (!opts.follow) {
          ws.close();
        }
        resolve(msg as VtxResponse);
      }
    });

    ws.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`Connection failed: ${err.message}. Is vortex-server running?`));
      }
    });

    ws.on("close", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error("Connection closed before response"));
      }
    });
  });
}

/**
 * 订阅模式：发送 subscribe 请求后保持连接，持续接收事件。
 * Ctrl+C 退出。
 */
export function subscribe(
  action: string,
  params: Record<string, unknown>,
  opts: ClientOptions & { onEvent: (event: VtxEvent) => void },
): Promise<VtxResponse> {
  return sendRequest(action, params, { ...opts, follow: true });
}
