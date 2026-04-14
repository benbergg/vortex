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
import { RelayClient, type RelayConfig } from "./relay-client.js";

export type { RelayConfig, RelayState } from "./relay-client.js";

const PIDFILE = "/tmp/vortex-server.pid";

export interface StartServerOptions {
  /** 本地 WS/HTTP 服务端口，默认 6800 */
  port?: number;
  /** 禁用本地服务（纯 relay 模式） */
  disableLocal?: boolean;
  /** 启用 relay 客户端（向远端 OpenClaw 连出） */
  relay?: {
    url: string;
    token: string;
    sessionName: string;
  };
}

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

export function startServer(opts: StartServerOptions | number = {}): void {
  // 向后兼容：老调用方式 startServer(6800)
  const options: StartServerOptions = typeof opts === "number" ? { port: opts } : opts;
  const port = options.port ?? 6800;
  const disableLocal = options.disableLocal ?? false;

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

  // 本地 HTTP/WS 服务（可通过 disableLocal 关闭，纯 relay 模式）
  if (!disableLocal) {
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
  } else {
    console.error("[vortex-server] local HTTP/WS disabled (relay-only mode)");
  }

  // Relay 客户端（可选）
  if (options.relay) {
    const relayCfg: RelayConfig = {
      url: options.relay.url,
      token: options.relay.token,
      sessionName: options.relay.sessionName,
      version: "0.1.0",
      onRequest: (vtxReq) => router.routeToExtensionSync(vtxReq),
      onStateChange: (state) => {
        console.error(`[relay] state: ${state}`);
      },
    };
    const relay = new RelayClient(relayCfg);
    relay.start();

    // 优雅关闭
    const shutdown = () => {
      console.error("[vortex-server] shutting down relay");
      relay.stop();
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);

    console.error(
      `[relay] connecting to ${options.relay.url} as "${options.relay.sessionName}"`,
    );
  }
}
