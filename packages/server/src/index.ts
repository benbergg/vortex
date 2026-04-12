import { createServer } from "http";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "fs";
import { execSync } from "child_process";
import express from "express";
import { NativeMessagingReader, writeNmMessage } from "./native-messaging.js";
import { SessionManager } from "./session.js";
import { StateCache } from "./state-cache.js";
import { MessageRouter } from "./message-router.js";
import { createWsServer } from "./ws-server.js";
import { createHttpRoutes } from "./http-routes.js";

const PIDFILE = "/tmp/vortex-server.pid";

// 杀掉旧的 vortex-server 进程
function killOldProcess(): void {
  try {
    if (existsSync(PIDFILE)) {
      const oldPid = readFileSync(PIDFILE, "utf-8").trim();
      if (oldPid) {
        try {
          execSync(`kill ${oldPid} 2>/dev/null`);
          // 等待旧进程释放端口
          execSync("sleep 0.5");
        } catch {
          // 旧进程已经不存在
        }
      }
    }
  } catch {
    // ignore
  }
  writeFileSync(PIDFILE, String(process.pid));
}

export function startServer(port: number = 6800): void {
  killOldProcess();

  const sessions = new SessionManager();
  const _stateCache = new StateCache();
  const router = new MessageRouter(process.stdout, sessions);

  // 防止 stdout EPIPE 崩溃
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

  // 退出时清理 pidfile
  process.on("exit", () => {
    try { unlinkSync(PIDFILE); } catch { /* ignore */ }
  });

  const heartbeatTimer = setInterval(() => {
    if (process.stdout.writable) {
      writeNmMessage(process.stdout, { type: "ping" });
    }
  }, 10_000);

  const app = express();
  app.use(createHttpRoutes(router));

  const httpServer = createServer(app);
  createWsServer(httpServer, sessions, router);

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[vortex-server] port ${port} still in use, force killing`);
      try {
        execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null`);
        setTimeout(() => httpServer.listen(port), 500);
      } catch {
        console.error(`[vortex-server] failed to free port ${port}`);
      }
    } else {
      console.error("[vortex-server] server error:", err);
    }
  });

  httpServer.listen(port, () => {
    console.error(`[vortex-server] listening on port ${port}`);
  });
}
