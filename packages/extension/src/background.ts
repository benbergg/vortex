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

// 需要 debugger + nm 的 handler（必须在 nm 创建后）
registerConsoleHandlers(router, debuggerMgr, nm);
registerNetworkHandlers(router, debuggerMgr, nm);
registerKeyboardHandlers(router, debuggerMgr);
registerMouseHandlers(router, debuggerMgr);
registerFileHandlers(router, nm);

console.log("[vortex] registered actions:", router.getRegisteredActions());
nm.connect();
