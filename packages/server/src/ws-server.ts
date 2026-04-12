import { WebSocketServer, type WebSocket } from "ws";
import type { Server } from "http";
import type { VtxRequest } from "@bytenew/vortex-shared";
import { VtxErrorCode } from "@bytenew/vortex-shared";
import type { SessionManager } from "./session.js";
import type { MessageRouter } from "./message-router.js";

export function createWsServer(
  httpServer: Server,
  sessions: SessionManager,
  router: MessageRouter,
): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws: WebSocket) => {
    const clientId = sessions.register(ws);
    console.error(`[ws] client connected: ${clientId}`);

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as VtxRequest;
        if (!msg.action || !msg.id) {
          ws.send(JSON.stringify({
            action: msg.action ?? "unknown",
            id: msg.id ?? "unknown",
            error: { code: VtxErrorCode.INVALID_PARAMS, message: "Missing required fields: action, id" },
          }));
          return;
        }
        router.routeToExtension(msg);
      } catch {
        ws.send(JSON.stringify({
          action: "unknown", id: "unknown",
          error: { code: VtxErrorCode.INVALID_PARAMS, message: "Invalid JSON message" },
        }));
      }
    });

    ws.on("close", () => {
      sessions.unregister(ws);
      console.error(`[ws] client disconnected: ${clientId}`);
    });
  });

  return wss;
}
