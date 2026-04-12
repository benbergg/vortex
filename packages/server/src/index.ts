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

  // 防止 stdout EPIPE 崩溃（NM 断开后 heartbeat 写入会触发）
  process.stdout.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") {
      console.error("[nm] stdout pipe broken, stopping heartbeat");
      clearInterval(heartbeatTimer);
    } else {
      console.error("[nm] stdout error:", err);
    }
  });

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
    clearInterval(heartbeatTimer);
  });

  // 心跳：每 10 秒发送 ping
  const heartbeatTimer = setInterval(() => {
    if (process.stdout.writable) {
      writeNmMessage(process.stdout, { type: "ping" });
    }
  }, 10_000);

  const app = express();
  app.use(createHttpRoutes(router));

  const httpServer = createServer(app);
  createWsServer(httpServer, sessions, router);

  // 端口冲突时自动尝试下一个端口（最多试 5 次）
  let attempts = 0;
  const maxAttempts = 5;

  function tryListen(p: number): void {
    httpServer.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" && attempts < maxAttempts) {
        attempts++;
        console.error(`[vortex-server] port ${p} in use, trying ${p + 1}`);
        tryListen(p + 1);
      } else {
        console.error("[vortex-server] server error:", err);
      }
    });

    httpServer.listen(p, () => {
      console.error(`[vortex-server] listening on port ${p}`);
    });
  }

  tryListen(port);
}
