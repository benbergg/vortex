import { createServer } from "http";
import express from "express";
import { NativeMessagingReader, writeNmMessage } from "./native-messaging.js";
import { SessionManager } from "./session.js";
import { StateCache } from "./state-cache.js";
import { MessageRouter } from "./message-router.js";
import { createWsServer } from "./ws-server.js";
import { createHttpRoutes } from "./http-routes.js";

export function startServer(port: number = 6800): void {
  const sessions = new SessionManager();
  const _stateCache = new StateCache();
  const router = new MessageRouter(process.stdout, sessions);

  const nmReader = new NativeMessagingReader((msg) => {
    router.handleNmMessage(msg);
  });

  process.stdin.on("data", (chunk: Buffer) => {
    router.setNmConnected(true);
    nmReader.feed(chunk);
  });

  process.stdin.on("end", () => {
    console.error("[nm] stdin closed, extension disconnected");
    router.setNmConnected(false);
  });

  // Heartbeat: ping every 10 seconds
  setInterval(() => {
    writeNmMessage(process.stdout, { type: "ping" });
  }, 10_000);

  const app = express();
  app.use(createHttpRoutes(router));

  const httpServer = createServer(app);
  createWsServer(httpServer, sessions, router);

  httpServer.listen(port, () => {
    console.error(`[vortex-server] listening on port ${port}`);
  });
}
