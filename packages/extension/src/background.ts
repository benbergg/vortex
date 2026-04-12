import type { NmRequest } from "@bytenew/vortex-shared";
import { NativeMessagingClient } from "./lib/native-messaging.js";
import { ActionRouter } from "./lib/router.js";
import { DebuggerManager } from "./lib/debugger-manager.js";
import { registerTabHandlers } from "./handlers/tab.js";
import { registerPageHandlers } from "./handlers/page.js";
import { registerJsHandlers } from "./handlers/js.js";
import { registerDomHandlers } from "./handlers/dom.js";
import { registerContentHandlers } from "./handlers/content.js";
import { registerConsoleHandlers } from "./handlers/console.js";
import { registerNetworkHandlers } from "./handlers/network.js";

// 初始化核心组件
const router = new ActionRouter();
const debuggerMgr = new DebuggerManager();

// 注册不需要 debugger 的 handler
registerTabHandlers(router);
registerPageHandlers(router);
registerJsHandlers(router);
registerDomHandlers(router);
registerContentHandlers(router);

// 初始化 NM 连接
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

// 注册需要 debugger + nm 的 handler（必须在 nm 创建后）
registerConsoleHandlers(router, debuggerMgr, nm);
registerNetworkHandlers(router, debuggerMgr, nm);

console.log("[vortex] registered actions:", router.getRegisteredActions());

nm.connect();
