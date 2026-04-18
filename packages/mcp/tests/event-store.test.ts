import { describe, it, expect, beforeEach } from "vitest";
import type { VtxEvent } from "@bytenew/vortex-shared";
import { EventStore } from "../src/lib/event-store.js";

function mkEvent(
  overrides: Partial<VtxEvent> & Pick<VtxEvent, "event">,
): VtxEvent {
  return {
    event: overrides.event,
    data: overrides.data ?? {},
    tabId: overrides.tabId,
    frameId: overrides.frameId,
    level: overrides.level,
    timestamp: overrides.timestamp ?? Date.now(),
  };
}

describe("EventStore subscribe / unsubscribe", () => {
  let store: EventStore;
  beforeEach(() => {
    store = new EventStore();
  });

  it("subscribe returns a unique id", () => {
    const id1 = store.subscribe({});
    const id2 = store.subscribe({});
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^sub_/);
  });

  it("unsubscribe returns true for existing id, false for unknown", () => {
    const id = store.subscribe({});
    expect(store.unsubscribe(id)).toBe(true);
    expect(store.unsubscribe(id)).toBe(false);
    expect(store.unsubscribe("sub_nonexistent")).toBe(false);
  });

  it("listSubscriptions reflects current state", () => {
    store.subscribe({ types: ["user.switched_tab"], minLevel: "urgent" });
    store.subscribe({ minLevel: "info", tabId: 5 });
    expect(store.listSubscriptions()).toHaveLength(2);
  });
});

describe("EventStore ingest / drain without subscribers", () => {
  let store: EventStore;
  beforeEach(() => {
    store = new EventStore();
  });

  it("drain returns empty when no subscriptions", () => {
    store.ingest(mkEvent({ event: "user.switched_tab", level: "urgent" }));
    expect(store.drain()).toEqual([]);
  });

  it("buffer still accumulates (allows late subscribers to receive)", () => {
    store.ingest(mkEvent({ event: "user.switched_tab", level: "urgent" }));
    store.ingest(mkEvent({ event: "dialog.opened", level: "urgent" }));

    store.subscribe({ minLevel: "urgent" });
    const events = store.drain();
    expect(events).toHaveLength(2);
  });
});

describe("EventStore drain is consumptive (events removed after drain)", () => {
  let store: EventStore;
  beforeEach(() => {
    store = new EventStore();
    store.subscribe({ minLevel: "urgent" });
  });

  it("drain removes matched events from buffer", () => {
    store.ingest(mkEvent({ event: "user.switched_tab", level: "urgent" }));
    expect(store.drain()).toHaveLength(1);
    expect(store.drain()).toHaveLength(0);
  });

  it("unmatched events are kept in buffer (for other subscribers)", () => {
    // info event, but subscription is 'urgent'
    store.ingest(mkEvent({ event: "dom.mutated", level: "info" }));
    expect(store.drain()).toHaveLength(0);

    // add info-level subscription, event is still in buffer
    store.subscribe({ minLevel: "info" });
    expect(store.drain()).toHaveLength(1);
  });
});

describe("EventStore type filter", () => {
  let store: EventStore;
  beforeEach(() => {
    store = new EventStore();
  });

  it("subscription with types[] only accepts matching event names", () => {
    store.subscribe({ types: ["dialog.opened"], minLevel: "urgent" });
    store.ingest(mkEvent({ event: "dialog.opened", level: "urgent" }));
    store.ingest(mkEvent({ event: "user.switched_tab", level: "urgent" }));
    const events = store.drain();
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("dialog.opened");
  });

  it("empty or omitted types[] means 'accept all event names'", () => {
    store.subscribe({ minLevel: "urgent" });
    store.ingest(mkEvent({ event: "dialog.opened", level: "urgent" }));
    store.ingest(mkEvent({ event: "user.switched_tab", level: "urgent" }));
    expect(store.drain()).toHaveLength(2);
  });
});

describe("EventStore level filter", () => {
  let store: EventStore;
  beforeEach(() => {
    store = new EventStore();
  });

  it("minLevel='urgent' rejects notice/info events", () => {
    store.subscribe({ minLevel: "urgent" });
    store.ingest(mkEvent({ event: "user.switched_tab", level: "urgent" }));
    store.ingest(mkEvent({ event: "page.navigated", level: "notice" }));
    store.ingest(mkEvent({ event: "dom.mutated", level: "info" }));
    const events = store.drain();
    expect(events).toHaveLength(1);
    expect(events[0].level).toBe("urgent");
  });

  it("minLevel='notice' accepts notice and urgent, rejects info", () => {
    store.subscribe({ minLevel: "notice" });
    store.ingest(mkEvent({ event: "user.switched_tab", level: "urgent" }));
    store.ingest(mkEvent({ event: "page.navigated", level: "notice" }));
    store.ingest(mkEvent({ event: "dom.mutated", level: "info" }));
    expect(store.drain()).toHaveLength(2);
  });

  it("minLevel='info' accepts all events", () => {
    store.subscribe({ minLevel: "info" });
    store.ingest(mkEvent({ event: "a", level: "urgent" }));
    store.ingest(mkEvent({ event: "b", level: "notice" }));
    store.ingest(mkEvent({ event: "c", level: "info" }));
    store.ingest(mkEvent({ event: "d" })); // no level → treated as info
    expect(store.drain()).toHaveLength(4);
  });

  it("events with undefined level are treated as 'info'", () => {
    store.subscribe({ minLevel: "notice" });
    store.ingest(mkEvent({ event: "legacy.event" })); // no level
    expect(store.drain()).toHaveLength(0);
  });
});

describe("EventStore tabId filter", () => {
  let store: EventStore;
  beforeEach(() => {
    store = new EventStore();
  });

  it("subscription with tabId accepts only events for that tab", () => {
    store.subscribe({ tabId: 5, minLevel: "urgent" });
    store.ingest(mkEvent({ event: "x", level: "urgent", tabId: 5 }));
    store.ingest(mkEvent({ event: "y", level: "urgent", tabId: 7 }));
    store.ingest(mkEvent({ event: "z", level: "urgent" })); // no tabId
    const events = store.drain();
    expect(events).toHaveLength(1);
    expect(events[0].tabId).toBe(5);
  });

  it("subscription without tabId accepts all tabs", () => {
    store.subscribe({ minLevel: "urgent" });
    store.ingest(mkEvent({ event: "x", level: "urgent", tabId: 5 }));
    store.ingest(mkEvent({ event: "y", level: "urgent", tabId: 7 }));
    expect(store.drain()).toHaveLength(2);
  });
});

describe("EventStore multi-subscription OR", () => {
  let store: EventStore;
  beforeEach(() => {
    store = new EventStore();
  });

  it("event matching any subscription is drained", () => {
    store.subscribe({ types: ["a"], minLevel: "urgent" });
    store.subscribe({ types: ["b"], minLevel: "urgent" });
    store.ingest(mkEvent({ event: "a", level: "urgent" }));
    store.ingest(mkEvent({ event: "b", level: "urgent" }));
    store.ingest(mkEvent({ event: "c", level: "urgent" }));
    const events = store.drain();
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.event).sort()).toEqual(["a", "b"]);
  });
});

describe("EventStore buffer overflow", () => {
  let store: EventStore;
  beforeEach(() => {
    store = new EventStore();
  });

  it("buffer capped at 50 events (FIFO eviction)", () => {
    store.subscribe({ minLevel: "urgent" });
    for (let i = 0; i < 60; i++) {
      store.ingest(mkEvent({ event: "x", data: { i }, level: "urgent" }));
    }
    const events = store.drain();
    expect(events).toHaveLength(50);
    // 最先 10 个被淘汰（10..59 保留）
    expect((events[0].data as { i: number }).i).toBe(10);
    expect((events[49].data as { i: number }).i).toBe(59);
  });
});

describe("EventStore TTL GC", () => {
  let store: EventStore;
  beforeEach(() => {
    store = new EventStore();
  });

  it("events older than TTL (60s) are dropped on next ingest/drain", () => {
    store.subscribe({ minLevel: "urgent" });
    const oldTimestamp = Date.now() - 61_000; // > 60s ago
    store.ingest(
      mkEvent({ event: "stale", level: "urgent", timestamp: oldTimestamp }),
    );
    store.ingest(mkEvent({ event: "fresh", level: "urgent" }));
    const events = store.drain();
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("fresh");
  });
});
