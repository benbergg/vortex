import WebSocket from "ws";
import type { VtxRequest, VtxResponse } from "@bytenew/vortex-shared";

let requestCounter = 0;

/**
 * 发送请求到 vortex-server 并等待响应。
 * 每次请求建立新连接（简单可靠，MCP tool 调用频率不高）。
 */
export function sendRequest(
  action: string,
  params: Record<string, unknown>,
  port: number,
  tabId?: number,
): Promise<VtxResponse> {
  return new Promise((resolve, reject) => {
    const id = `mcp-${++requestCounter}-${Date.now()}`;
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        ws.close();
        reject(new Error(`Timeout: no response for ${action} after 30s`));
      }
    }, 30_000);

    ws.on("open", () => {
      const req: VtxRequest = {
        action,
        params,
        id,
        ...(tabId != null ? { tabId } : {}),
      };
      ws.send(JSON.stringify(req));
    });

    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id === id) {
        clearTimeout(timeout);
        settled = true;
        ws.close();
        resolve(msg as VtxResponse);
      }
    });

    ws.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`WebSocket error: ${err.message}. Is vortex-server running on port ${port}?`));
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
