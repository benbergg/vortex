import WebSocket from "ws";
import type { VtxRequest, VtxResponse } from "@bytenew/vortex-shared";

export type RelayState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "ready"
  | "error";

export interface RelayConfig {
  /** 远端 WS URL，例如 wss://www.nicofroggo.cloud/vortex */
  url: string;
  /** 认证 token */
  token: string;
  /** 本 session 名称（多设备场景用） */
  sessionName: string;
  /** 版本号，带在 hello 帧里 */
  version?: string;
  /** 收到 VtxRequest 时调用（应转发给 extension 并返回响应） */
  onRequest: (req: VtxRequest) => Promise<VtxResponse>;
  /** 状态变更回调 */
  onStateChange?: (state: RelayState) => void;
}

const HEARTBEAT_INTERVAL_MS = 30_000;
const RECONNECT_INITIAL_MS = 1000;
const RECONNECT_MAX_MS = 60_000;
const CONNECT_TIMEOUT_MS = 10_000;

export class RelayClient {
  private ws: WebSocket | null = null;
  private state: RelayState = "disconnected";
  private reconnectDelay = RECONNECT_INITIAL_MS;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimeout: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(private cfg: RelayConfig) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    if (this.ws) {
      try { this.ws.close(1000, "client stop"); } catch {}
      this.ws = null;
    }
    this.setState("disconnected");
  }

  getState(): RelayState {
    return this.state;
  }

  private setState(s: RelayState): void {
    if (this.state === s) return;
    this.state = s;
    try { this.cfg.onStateChange?.(s); } catch (err) {
      console.error("[relay] onStateChange error:", err);
    }
  }

  private clearTimers(): void {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.connectTimeout) { clearTimeout(this.connectTimeout); this.connectTimeout = null; }
  }

  private connect(): void {
    if (this.stopped) return;
    this.setState("connecting");

    // 同时通过 URL query 和 Authorization header 传 token（nginx 反代场景 header 可能被过滤）
    const sep = this.cfg.url.includes("?") ? "&" : "?";
    const url = `${this.cfg.url}${sep}token=${encodeURIComponent(this.cfg.token)}`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(url, {
        headers: { Authorization: `Bearer ${this.cfg.token}` },
      });
    } catch (err: any) {
      console.error(`[relay] WS construct error: ${err?.message ?? err}`);
      this.setState("error");
      this.scheduleReconnect();
      return;
    }

    this.connectTimeout = setTimeout(() => {
      console.error(`[relay] connect timeout after ${CONNECT_TIMEOUT_MS}ms`);
      try { ws.close(); } catch {}
      this.setState("error");
      this.scheduleReconnect();
    }, CONNECT_TIMEOUT_MS);

    ws.on("open", () => {
      if (this.connectTimeout) { clearTimeout(this.connectTimeout); this.connectTimeout = null; }
      this.ws = ws;
      this.reconnectDelay = RECONNECT_INITIAL_MS;
      this.setState("connected");

      // 发送 hello 帧
      ws.send(JSON.stringify({
        type: "hello",
        version: this.cfg.version ?? "0.1.0",
        sessionName: this.cfg.sessionName,
        capabilities: [],
      }));

      // 启动心跳
      this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), HEARTBEAT_INTERVAL_MS);
    });

    ws.on("message", async (data) => {
      let msg: any;
      try {
        msg = JSON.parse(data.toString());
      } catch (err) {
        console.error("[relay] invalid JSON from server:", err);
        return;
      }

      // 服务端 welcome 帧：session 已注册
      if (msg.type === "welcome") {
        this.setState("ready");
        console.error(`[relay] session ready (id=${msg.sessionId ?? "?"})`);
        return;
      }

      // 业务请求：VtxRequest
      if (msg.action && msg.id) {
        try {
          const resp = await this.cfg.onRequest(msg as VtxRequest);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(resp));
          }
        } catch (err: any) {
          // 兜底：万一 onRequest 自己抛错，回一个错误响应
          const errResp: VtxResponse = {
            action: msg.action,
            id: msg.id,
            error: {
              code: "RELAY_HANDLER_ERROR",
              message: err?.message ?? String(err),
            },
          };
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(errResp));
          }
        }
      }
    });

    ws.on("close", (code, reason) => {
      if (this.connectTimeout) { clearTimeout(this.connectTimeout); this.connectTimeout = null; }
      if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
      this.ws = null;
      const reasonText = reason?.toString() || "";
      console.error(`[relay] closed (code=${code}${reasonText ? ` reason="${reasonText}"` : ""})`);

      if (this.stopped) {
        this.setState("disconnected");
        return;
      }

      // 4401 = 认证失败，不要重连
      if (code === 4401) {
        console.error("[relay] authentication failed (4401), stopping");
        this.setState("error");
        return;
      }

      this.setState("disconnected");
      this.scheduleReconnect();
    });

    ws.on("error", (err: Error) => {
      console.error(`[relay] WS error: ${err.message}`);
      // error 事件通常会紧跟 close 事件；不在这里重连，让 close 处理
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    console.error(`[relay] reconnecting in ${this.reconnectDelay}ms...`);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
    }, this.reconnectDelay);
  }

  private sendHeartbeat(): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify({
        type: "heartbeat",
        timestamp: Date.now(),
      }));
    } catch (err) {
      console.error("[relay] heartbeat send error:", err);
    }
  }
}
