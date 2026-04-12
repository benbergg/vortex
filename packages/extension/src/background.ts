import type { NmRequest } from "@bytenew/vortex-shared";
import { NativeMessagingClient } from "./lib/native-messaging.js";
import { ActionRouter } from "./lib/router.js";
import { registerTabHandlers } from "./handlers/tab.js";
import { registerPageHandlers } from "./handlers/page.js";
import { registerJsHandlers } from "./handlers/js.js";
import { registerDomHandlers } from "./handlers/dom.js";
import { registerContentHandlers } from "./handlers/content.js";

const router = new ActionRouter();
registerTabHandlers(router);
registerPageHandlers(router);
registerJsHandlers(router);
registerDomHandlers(router);
registerContentHandlers(router);

console.log("[vortex] registered actions:", router.getRegisteredActions());

const nm = new NativeMessagingClient(
  async (msg) => {
    if (msg.type === "tool_request") {
      const response = await router.dispatch(msg as NmRequest);
      nm.send(response);
    }
  },
  () => {
    console.warn("[vortex] NM disconnected, will reconnect on next alarm");
  },
);

nm.connect();
