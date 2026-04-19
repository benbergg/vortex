import { DiagnosticsActions } from "@bytenew/vortex-shared";
import type { ActionRouter } from "../lib/router.js";

// 扩展版本：build 时由 vite define 注入；未注入则回退到 "unknown"
declare const __EXTENSION_VERSION__: string | undefined;
const EXT_VERSION =
  typeof __EXTENSION_VERSION__ !== "undefined" ? __EXTENSION_VERSION__ : "unknown";

/**
 * 诊断 handler：返回扩展版本 + 已注册的 action 列表。
 *
 * 用途：MCP server 的 vortex_ping 会调用此 action，把扩展端版本
 * 和支持的 action 集合回报给 Claude，用于"我合并了 v0.4 代码但
 * Claude 还是拿不到新工具"这类版本漂移场景的快速诊断。@since 0.4.0
 */
export function registerDiagnosticsHandlers(router: ActionRouter): void {
  router.registerAll({
    [DiagnosticsActions.VERSION]: async () => {
      const actions = router.getRegisteredActions();
      return {
        extensionVersion: EXT_VERSION,
        actionCount: actions.length,
        actions: actions.sort(),
      };
    },
  });
}
