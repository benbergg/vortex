// Event 管道的 action handler：目前只有 events.drain（主动 flush dispatcher）。
// 订阅态在 MCP 侧维护（__mcp_events_subscribe__），extension 只负责 emit + flush。

import { EventsActions } from "@bytenew/vortex-shared";
import type { ActionRouter } from "../lib/router.js";
import type { EventDispatcher } from "../events/dispatcher.js";

export function registerEventHandlers(
  router: ActionRouter,
  dispatcher: EventDispatcher,
): void {
  router.registerAll({
    [EventsActions.DRAIN]: async () => {
      const flushed = dispatcher.flushAll();
      return { flushed };
    },
  });
}
