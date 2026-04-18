import type { NmRequest } from "@bytenew/vortex-shared";
import { NativeMessagingClient } from "./lib/native-messaging.js";
import { ActionRouter } from "./lib/router.js";
import { DebuggerManager } from "./lib/debugger-manager.js";
import { registerTabHandlers } from "./handlers/tab.js";
import { registerFramesHandlers } from "./handlers/frames.js";
import { registerPageHandlers } from "./handlers/page.js";
import { registerJsHandlers } from "./handlers/js.js";
import { registerDomHandlers } from "./handlers/dom.js";
import { registerContentHandlers } from "./handlers/content.js";
import { registerConsoleHandlers } from "./handlers/console.js";
import { registerNetworkHandlers } from "./handlers/network.js";
import { registerStorageHandlers } from "./handlers/storage.js";
import { registerCaptureHandlers } from "./handlers/capture.js";
import { registerKeyboardHandlers } from "./handlers/keyboard.js";
import { registerMouseHandlers } from "./handlers/mouse.js";
import { registerFileHandlers } from "./handlers/file.js";
import { registerObserveHandlers } from "./handlers/observe.js";
import { EventDispatcher, registerEventSources } from "./events/dispatcher.js";

const router = new ActionRouter();
const debuggerMgr = new DebuggerManager();

// 不需要 debugger/nm 的 handler
registerTabHandlers(router);
registerFramesHandlers(router);
registerPageHandlers(router, debuggerMgr);
registerJsHandlers(router);
registerDomHandlers(router, debuggerMgr);
registerContentHandlers(router);
registerStorageHandlers(router);
registerCaptureHandlers(router, debuggerMgr);
registerObserveHandlers(router);

// NM 客户端
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

// 事件分发器：需要 nm，后续 handler 都可借它上报事件
const eventDispatcher = new EventDispatcher(nm);
registerEventSources(eventDispatcher);

// 需要 debugger / nm / dispatcher 的 handler（必须在 nm + dispatcher 之后）
registerConsoleHandlers(router, debuggerMgr, nm, eventDispatcher);
registerNetworkHandlers(router, debuggerMgr, nm, eventDispatcher);
registerKeyboardHandlers(router, debuggerMgr);
registerMouseHandlers(router, debuggerMgr);
registerFileHandlers(router, nm, eventDispatcher);


console.log("[vortex] registered actions:", router.getRegisteredActions());
nm.connect();
