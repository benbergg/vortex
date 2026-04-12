import type { WebSocket } from "ws";

export class SessionManager {
  private client: { ws: WebSocket; clientId: string } | null = null;

  register(ws: WebSocket): string {
    const clientId = `client-${Date.now()}`;
    if (this.client) {
      this.client.ws.close(1000, "replaced by new connection");
    }
    this.client = { ws, clientId };
    return clientId;
  }

  unregister(ws: WebSocket): void {
    if (this.client?.ws === ws) {
      this.client = null;
    }
  }

  getClient(): WebSocket | null {
    return this.client?.ws ?? null;
  }

  hasClient(): boolean {
    return this.client !== null;
  }
}
