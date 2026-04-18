import type { VtxEvent, VtxEventLevel } from "@bytenew/vortex-shared";

interface Subscription {
  id: string;
  types?: Set<string>;
  minLevel: VtxEventLevel;
  tabId?: number;
  createdAt: number;
}

const LEVEL_RANK: Record<VtxEventLevel, number> = {
  info: 0,
  notice: 1,
  urgent: 2,
};

/**
 * MCP 侧事件存储：
 * - 接收 vortex-server 透传的 VtxEvent 到 buffer
 * - 维护客户端订阅（subscribe/unsubscribe）
 * - 每次 tool response 时 drain 出匹配的事件作为 piggyback
 *
 * 订阅状态存在 MCP 进程内，进程重启后失效（client 需重新订阅）。
 * eventBuffer 容量 50、TTL 60s，上限兜底防内存泄漏。
 */
export class EventStore {
  private subs = new Map<string, Subscription>();
  private buffer: VtxEvent[] = [];
  private readonly BUFFER_LIMIT = 50;
  private readonly BUFFER_TTL_MS = 60_000;
  private counter = 0;

  subscribe(params: {
    types?: string[];
    minLevel?: VtxEventLevel;
    tabId?: number;
  }): string {
    const id = `sub_${++this.counter}_${Date.now().toString(36)}`;
    this.subs.set(id, {
      id,
      types: params.types && params.types.length > 0 ? new Set(params.types) : undefined,
      minLevel: params.minLevel ?? "urgent",
      tabId: params.tabId,
      createdAt: Date.now(),
    });
    return id;
  }

  unsubscribe(id: string): boolean {
    return this.subs.delete(id);
  }

  listSubscriptions(): Array<Omit<Subscription, "types"> & { types?: string[] }> {
    return Array.from(this.subs.values()).map((s) => ({
      id: s.id,
      types: s.types ? Array.from(s.types) : undefined,
      minLevel: s.minLevel,
      tabId: s.tabId,
      createdAt: s.createdAt,
    }));
  }

  /** 收到一个从 ws 推来的事件：buffer + 衰减老事件 */
  ingest(event: VtxEvent): void {
    this.gc();
    this.buffer.push(event);
    if (this.buffer.length > this.BUFFER_LIMIT) this.buffer.shift();
  }

  /**
   * 取出所有匹配订阅的事件并从 buffer 中移除（一次性消费）。
   * 无订阅时直接返回空数组，不消耗 buffer。
   */
  drain(): VtxEvent[] {
    if (this.subs.size === 0) return [];
    this.gc();
    const matched: VtxEvent[] = [];
    const remaining: VtxEvent[] = [];
    for (const event of this.buffer) {
      if (this.anySubMatches(event)) matched.push(event);
      else remaining.push(event);
    }
    this.buffer = remaining;
    return matched;
  }

  private anySubMatches(event: VtxEvent): boolean {
    for (const sub of this.subs.values()) {
      if (this.matches(event, sub)) return true;
    }
    return false;
  }

  private matches(event: VtxEvent, sub: Subscription): boolean {
    if (sub.tabId !== undefined && event.tabId !== sub.tabId) return false;
    if (sub.types && !sub.types.has(event.event)) return false;
    const eventLevel = event.level ?? "info";
    if (LEVEL_RANK[eventLevel] < LEVEL_RANK[sub.minLevel]) return false;
    return true;
  }

  private gc(): void {
    const cutoff = Date.now() - this.BUFFER_TTL_MS;
    this.buffer = this.buffer.filter((e) => e.timestamp >= cutoff);
  }
}

export const eventStore = new EventStore();
