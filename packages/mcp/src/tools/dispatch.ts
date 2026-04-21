// packages/mcp/src/tools/dispatch.ts
// 新工具名 → extension action + 参数 reshape。
// 与 server.ts 解耦，便于单元测试。

/**
 * 基于新 MCP tool 名，动态决定发哪个 extension action 以及如何 reshape 参数。
 * 返回 null 表示该工具直接使用 toolDef.action，无需特殊处理。
 */
export function dispatchNewTool(
  name: string,
  params: Record<string, unknown>,
): { action: string; params: Record<string, unknown> } | null {
  switch (name) {
    case "vortex_navigate": {
      const { reload, ...rest } = params;
      return { action: reload ? "page.reload" : "page.navigate", params: rest };
    }
    case "vortex_history": {
      const { direction, ...rest } = params;
      return { action: direction === "forward" ? "page.forward" : "page.back", params: rest };
    }
    case "vortex_wait": {
      // target 若是普通 selector（非 @ref），透传为 selector 字段
      const { target, ...rest } = params;
      if (target && typeof target === "string" && !target.startsWith("@")) {
        return { action: "page.wait", params: { selector: target, ...rest } };
      }
      return { action: "page.wait", params: { ...rest } };
    }
    case "vortex_wait_idle": {
      const { kind, idleMs, ...rest } = params;
      const action = kind === "network"
        ? "page.waitForNetworkIdle"
        : kind === "dom"
        ? "dom.waitSettled"
        : "page.waitForXhrIdle";
      // idleMs → idleTime（network/xhr）或 quietMs（dom）
      const idleKey = kind === "dom" ? "quietMs" : "idleTime";
      return { action, params: idleMs != null ? { [idleKey]: idleMs, ...rest } : rest };
    }
    case "vortex_fill": {
      const { kind, ...rest } = params;
      return { action: kind ? "dom.commit" : "dom.fill", params: kind ? { kind, ...rest } : rest };
    }
    case "vortex_evaluate": {
      const { async: isAsync, ...rest } = params;
      return { action: isAsync ? "js.evaluateAsync" : "js.evaluate", params: rest };
    }
    case "vortex_screenshot": {
      // target 已被上层 target-translation 转成 selector/index；存在则截元素
      const hasTarget = params.selector != null || params.index != null;
      return { action: hasTarget ? "capture.element" : "capture.screenshot", params };
    }
    case "vortex_console": {
      const { op, ...rest } = params;
      return { action: op === "clear" ? "console.clear" : "console.getLogs", params: rest };
    }
    case "vortex_network": {
      const { op, filter, ...rest } = params;
      if (op === "clear") return { action: "network.clear", params: rest };
      if (filter) return { action: "network.filter", params: { ...(filter as object), ...rest } };
      return { action: "network.getLogs", params: rest };
    }
    case "vortex_storage_get": {
      const { scope, ...rest } = params;
      const action = scope === "cookie"
        ? "storage.getCookies"
        : scope === "session"
        ? "storage.getSessionStorage"
        : "storage.getLocalStorage";
      return { action, params: rest };
    }
    case "vortex_storage_set": {
      const { scope, op, ...rest } = params;
      if (op === "delete" && scope === "cookie") return { action: "storage.deleteCookie", params: rest };
      const action = scope === "cookie"
        ? "storage.setCookie"
        : scope === "session"
        ? "storage.setSessionStorage"
        : "storage.setLocalStorage";
      return { action, params: rest };
    }
    case "vortex_storage_session": {
      const { op, ...rest } = params;
      return { action: op === "import" ? "storage.importSession" : "storage.exportSession", params: rest };
    }
    case "vortex_file_list_downloads":
      return { action: "file.getDownloads", params };
    default:
      return null;
  }
}
