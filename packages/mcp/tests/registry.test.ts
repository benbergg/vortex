import { describe, it, expect } from "vitest";
import { getToolDefs, getToolDef } from "../src/tools/registry.js";
import { getAllToolDefs } from "../src/tools/schemas.js";

describe("getToolDefs", () => {
  it("returns a non-empty array", () => {
    const defs = getToolDefs();
    expect(defs.length).toBeGreaterThan(0);
  });

  it("returns a fresh copy each time (not same array reference)", () => {
    const a = getToolDefs();
    const b = getToolDefs();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it("includes all required vortex_* prefixed tools (v0.5 set of 36)", () => {
    const names = getToolDefs().map((d) => d.name);
    // v0.5.0 合并 + vortex_mouse_drag 后的完整 36 工具名单（按 schemas.ts 定义顺序）
    const expected = [
      "vortex_ping",
      "vortex_events",
      "vortex_observe",
      "vortex_tab_list",
      "vortex_tab_create",
      "vortex_tab_close",
      "vortex_navigate",
      "vortex_page_info",
      "vortex_history",
      "vortex_wait",
      "vortex_wait_idle",
      "vortex_click",
      "vortex_type",
      "vortex_fill",
      "vortex_select",
      "vortex_hover",
      "vortex_batch",
      "vortex_fill_form",
      "vortex_press",
      "vortex_get_text",
      "vortex_get_html",
      "vortex_evaluate",
      "vortex_mouse_click",
      "vortex_mouse_move",
      "vortex_mouse_drag",
      "vortex_screenshot",
      "vortex_console",
      "vortex_network",
      "vortex_network_response_body",
      "vortex_storage_get",
      "vortex_storage_set",
      "vortex_storage_session",
      "vortex_file_upload",
      "vortex_file_download",
      "vortex_file_list_downloads",
      "vortex_frames_list",
    ];
    for (const name of expected) {
      expect(names).toContain(name);
    }
  });

  it("each tool has name, action, description, and schema", () => {
    for (const def of getToolDefs()) {
      expect(def.name).toMatch(/^vortex_/);
      expect(def.action).toBeTruthy();
      expect(typeof def.action).toBe("string");
      expect(def.description.length).toBeGreaterThan(10);
      expect(def.schema).toBeTruthy();
    }
  });

  it("tool names are unique (no duplicates)", () => {
    const names = getToolDefs().map((d) => d.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("all tool actions map back to a valid tool name", () => {
    for (const def of getToolDefs()) {
      expect(getToolDef(def.name)).toBeDefined();
      expect(getToolDef(def.name)?.action).toBe(def.action);
    }
  });

  it("image-returning tools are marked with returnsImage=true", () => {
    const screenshot = getToolDef("vortex_screenshot");
    expect(screenshot?.returnsImage).toBe(true);
  });

  it("non-image tools do not have returnsImage flag", () => {
    const tabList = getToolDef("vortex_tab_list");
    expect(tabList?.returnsImage).toBeUndefined();
  });

  it("has exactly 36 tools (v0.5 consolidated set + vortex_mouse_drag)", () => {
    expect(getToolDefs().length).toBe(36);
  });

  it("batch tool is included for batch DOM operations", () => {
    const names = getToolDefs().map((d) => d.name);
    expect(names).toContain("vortex_batch");
  });
});

describe("getToolDef", () => {
  it("returns tool def by exact name", () => {
    const def = getToolDef("vortex_ping");
    expect(def).toBeDefined();
    expect(def!.name).toBe("vortex_ping");
    expect(def!.action).toBe("__mcp_ping__");
  });

  it("returns undefined for unknown tool name", () => {
    expect(getToolDef("vortex_nonexistent")).toBeUndefined();
    expect(getToolDef("")).toBeUndefined();
    expect(getToolDef("vortex_")).toBeUndefined();
  });

  it("returns internal MCP action tools correctly (v0.5 unified events)", () => {
    // v0.5: 三个 events_* 工具合并为 vortex_events({op})，action 统一为 __mcp_events__
    expect(getToolDef("vortex_events")?.action).toBe("__mcp_events__");
    expect(getToolDef("vortex_ping")?.action).toBe("__mcp_ping__");
  });

  it("schema inputSchema is valid JSON Schema object", () => {
    const def = getToolDef("vortex_navigate");
    expect(def?.schema).toHaveProperty("type", "object");
    expect(def?.schema).toHaveProperty("properties");
    expect(def?.schema).toHaveProperty("required");
  });
});