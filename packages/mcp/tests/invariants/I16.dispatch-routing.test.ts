// I16: dispatch routing — 11 public tools 各自映射到正确的 v0.5 handler action.
// spec: vortex重构-L4-spec.md §2 + §3

import { describe, it, expect } from "vitest";
import { dispatchNewTool } from "../../src/tools/dispatch.js";

describe("I16: dispatch routing for 11 public tools", () => {
  describe("vortex_act → 7 actions", () => {
    const cases: Array<[string, string]> = [
      ["click", "dom.click"],
      ["fill", "dom.fill"],
      ["type", "dom.type"],
      ["select", "dom.select"],
      ["scroll", "dom.scroll"],
      ["hover", "dom.hover"],
      ["drag", "mouse.drag"],
    ];
    for (const [actionEnum, expectedAction] of cases) {
      it(`action=${actionEnum} → ${expectedAction}`, () => {
        const r = dispatchNewTool("vortex_act", { target: "@e0", action: actionEnum, value: "foo" });
        expect(r?.action).toBe(expectedAction);
        expect(r?.params.target).toBe("@e0");
      });
    }

    it("unknown action → __invalid_action__ sentinel", () => {
      const r = dispatchNewTool("vortex_act", { target: "@e0", action: "destroy" });
      expect(r?.action).toBe("__invalid_action__");
    });

    it("options.timeout / options.force 透传到 params", () => {
      const r = dispatchNewTool("vortex_act", {
        target: "@e0",
        action: "click",
        options: { timeout: 8000, force: true },
      });
      expect(r?.params.timeout).toBe(8000);
      expect(r?.params.force).toBe(true);
    });
  });

  describe("vortex_observe → observe.snapshot + scope/filter mapping", () => {
    it("scope=viewport → viewport='visible'", () => {
      const r = dispatchNewTool("vortex_observe", { scope: "viewport", filter: "interactive" });
      expect(r?.action).toBe("observe.snapshot");
      expect(r?.params.viewport).toBe("visible");
      expect(r?.params.filter).toBe("interactive");
    });

    it("scope=full → viewport='full'", () => {
      const r = dispatchNewTool("vortex_observe", { scope: "full" });
      expect(r?.action).toBe("observe.snapshot");
      expect(r?.params.viewport).toBe("full");
    });

    it("filter=all → 透传", () => {
      const r = dispatchNewTool("vortex_observe", { scope: "viewport", filter: "all" });
      expect(r?.params.filter).toBe("all");
    });
  });

  describe("vortex_extract → content.getText (第一阶段)", () => {
    it("target + depth → maxDepth + target", () => {
      const r = dispatchNewTool("vortex_extract", {
        target: "@e0",
        depth: 5,
        include: ["text", "value"],
      });
      expect(r?.action).toBe("content.getText");
      expect(r?.params.target).toBe("@e0");
      expect(r?.params.maxDepth).toBe(5);
      expect(r?.params.include).toEqual(["text", "value"]);
    });

    it("target=null 透传不 set target 字段", () => {
      const r = dispatchNewTool("vortex_extract", { target: null });
      expect(r?.action).toBe("content.getText");
      expect(r?.params.target).toBeUndefined();
    });
  });

  describe("vortex_wait_for → mode 分发", () => {
    it("mode=url → page.wait + url 字段", () => {
      const r = dispatchNewTool("vortex_wait_for", { mode: "url", value: "https://example.com" });
      expect(r?.action).toBe("page.wait");
      expect(r?.params.url).toBe("https://example.com");
    });

    it("mode=element → page.wait + selector 字段", () => {
      const r = dispatchNewTool("vortex_wait_for", { mode: "element", value: "#submit" });
      expect(r?.action).toBe("page.wait");
      expect(r?.params.selector).toBe("#submit");
    });

    it("mode=idle value=network → page.waitForNetworkIdle", () => {
      const r = dispatchNewTool("vortex_wait_for", { mode: "idle", value: "network" });
      expect(r?.action).toBe("page.waitForNetworkIdle");
    });

    it("mode=idle value=dom → dom.waitSettled", () => {
      const r = dispatchNewTool("vortex_wait_for", { mode: "idle", value: "dom" });
      expect(r?.action).toBe("dom.waitSettled");
    });

    it("mode=idle value=xhr (默认) → page.waitForXhrIdle", () => {
      const r = dispatchNewTool("vortex_wait_for", { mode: "idle", value: "xhr" });
      expect(r?.action).toBe("page.waitForXhrIdle");
    });

    it("mode=info → page.info", () => {
      const r = dispatchNewTool("vortex_wait_for", { mode: "info" });
      expect(r?.action).toBe("page.info");
    });

    it("timeout 透传", () => {
      const r = dispatchNewTool("vortex_wait_for", { mode: "url", value: "x", timeout: 12000 });
      expect(r?.params.timeout).toBe(12000);
    });
  });

  describe("vortex_debug_read → source 分发", () => {
    it("source=console → console.getLogs", () => {
      const r = dispatchNewTool("vortex_debug_read", { source: "console", filter: { level: "error" }, tail: 50 });
      expect(r?.action).toBe("console.getLogs");
      expect(r?.params.level).toBe("error");
      expect(r?.params.limit).toBe(50);
    });

    it("source=network → network.getLogs", () => {
      const r = dispatchNewTool("vortex_debug_read", { source: "network" });
      expect(r?.action).toBe("network.getLogs");
    });
  });

  describe("vortex_storage → op 分发", () => {
    const cases: Array<[string, string]> = [
      ["get", "storage.getLocalStorage"],
      ["set", "storage.setLocalStorage"],
      ["list", "storage.getCookies"],
      ["session-get", "storage.getSessionStorage"],
      ["session-set", "storage.setSessionStorage"],
    ];
    for (const [op, expectedAction] of cases) {
      it(`op=${op} → ${expectedAction}`, () => {
        const r = dispatchNewTool("vortex_storage", { op, key: "k", value: "v" });
        expect(r?.action).toBe(expectedAction);
        expect(r?.params.key).toBe("k");
      });
    }

    it("unknown op → __invalid_op__ sentinel", () => {
      const r = dispatchNewTool("vortex_storage", { op: "unknown" });
      expect(r?.action).toBe("__invalid_op__");
    });
  });

  describe("8 atom（直接路由 / 通过 toolDef.action）", () => {
    it("vortex_navigate（已有遗留 dispatch reload→page.reload）", () => {
      const r = dispatchNewTool("vortex_navigate", { url: "https://x", reload: true });
      expect(r?.action).toBe("page.reload");
    });
    it("vortex_press 不在 dispatch（直接用 toolDef.action=keyboard.press）", () => {
      const r = dispatchNewTool("vortex_press", { keys: "Ctrl+S" });
      expect(r).toBeNull();
    });
    it("vortex_tab_create 不在 dispatch（直接用 toolDef.action=tab.create）", () => {
      const r = dispatchNewTool("vortex_tab_create", { url: "https://x" });
      expect(r).toBeNull();
    });
    it("vortex_tab_close 不在 dispatch", () => {
      const r = dispatchNewTool("vortex_tab_close", { tabId: 1 });
      expect(r).toBeNull();
    });
  });
});
