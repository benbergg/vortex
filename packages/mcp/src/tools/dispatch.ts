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

    // ──────────────────────────────────────────────────────────────────
    // v0.6 L4 public tools (PR #4)
    // act/extract/observe 第一阶段：复用 v0.5 handler；descriptor target +
    // 真 a11y subtree 集成留 v0.6.x follow-up（spec L4 §0.1 deferred）。
    // ──────────────────────────────────────────────────────────────────
    case "vortex_act": {
      const { action: actionName, value, options, target, ...rest } = params;
      const v05Action = ACT_TO_V05[actionName as string];
      if (!v05Action) {
        // unknown action → caller 会拿到 INVALID_PARAMS 通过 tool dispatch
        return { action: "__invalid_action__", params };
      }
      const next: Record<string, unknown> = { target, ...rest };
      // value 仅 fill/type/select/drag 需要
      if (value !== undefined) next.value = value;
      // options.timeout / options.force 透传
      if (options && typeof options === "object") {
        const o = options as Record<string, unknown>;
        if (o.timeout !== undefined) next.timeout = o.timeout;
        if (o.force !== undefined) next.force = o.force;
      }
      return { action: v05Action, params: next };
    }
    case "vortex_observe": {
      const { scope, filter, ...rest } = params;
      // scope 'viewport'|'full' → existing observe.snapshot 的 viewport 参数；
      // filter 'interactive'|'all' → 透传（observe handler 已支持）
      const next: Record<string, unknown> = { ...rest };
      if (scope === "full") next.viewport = "full";
      else if (scope === "viewport") next.viewport = "visible";
      if (filter !== undefined) next.filter = filter;
      return { action: "observe.snapshot", params: next };
    }
    case "vortex_extract": {
      const { target, depth, include, ...rest } = params;
      // 第一阶段：映射到 content.getText（最常用 case）；后续 follow-up 改 a11y subtree
      const next: Record<string, unknown> = { ...rest };
      if (target !== undefined && target !== null) next.target = target;
      if (depth !== undefined) next.maxDepth = depth;
      if (Array.isArray(include)) next.include = include;
      return { action: "content.getText", params: next };
    }
    case "vortex_wait_for": {
      const { mode, value, timeout, ...rest } = params;
      const next: Record<string, unknown> = { ...rest };
      if (timeout !== undefined) next.timeout = timeout;
      switch (mode) {
        case "url":
          if (value !== undefined) next.url = value;
          return { action: "page.wait", params: next };
        case "element":
          if (value !== undefined) next.selector = value;
          return { action: "page.wait", params: next };
        case "idle": {
          // value: 'network' | 'xhr' | 'dom'
          const action = value === "network"
            ? "page.waitForNetworkIdle"
            : value === "dom"
            ? "dom.waitSettled"
            : "page.waitForXhrIdle";
          return { action, params: next };
        }
        case "info":
          return { action: "page.info", params: next };
        default:
          return { action: "page.info", params: next };
      }
    }
    case "vortex_debug_read": {
      const { source, filter, tail, ...rest } = params;
      const next: Record<string, unknown> = { ...rest };
      if (filter && typeof filter === "object") Object.assign(next, filter);
      if (tail !== undefined) next.limit = tail;
      const action = source === "network" ? "network.getLogs" : "console.getLogs";
      return { action, params: next };
    }
    case "vortex_storage": {
      const { op, key, value, ...rest } = params;
      const next: Record<string, unknown> = { ...rest };
      if (key !== undefined) next.key = key;
      if (value !== undefined) next.value = value;
      switch (op) {
        case "get":
          return { action: "storage.getLocalStorage", params: next };
        case "set":
          return { action: "storage.setLocalStorage", params: next };
        case "list":
          return { action: "storage.getCookies", params: next };
        case "session-get":
          return { action: "storage.getSessionStorage", params: next };
        case "session-set":
          return { action: "storage.setSessionStorage", params: next };
        default:
          return { action: "__invalid_op__", params };
      }
    }

    default:
      return null;
  }
}

// vortex_act 的 action enum → v0.5 extension handler action
const ACT_TO_V05: Record<string, string> = {
  click: "dom.click",
  fill: "dom.fill",
  type: "dom.type",
  select: "dom.select",
  scroll: "dom.scroll",
  hover: "dom.hover",
  drag: "mouse.drag",
};
