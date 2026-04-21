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

  it("includes all required vortex_* prefixed tools", () => {
    const names = getToolDefs().map((d) => d.name);
    expect(names).toContain("vortex_ping");
    expect(names).toContain("vortex_tab_list");
    expect(names).toContain("vortex_page_navigate");
    expect(names).toContain("vortex_dom_click");
    expect(names).toContain("vortex_dom_query");
    expect(names).toContain("vortex_dom_query_all");
    expect(names).toContain("vortex_dom_fill");
    expect(names).toContain("vortex_dom_type");
    expect(names).toContain("vortex_dom_select");
    expect(names).toContain("vortex_dom_scroll");
    expect(names).toContain("vortex_dom_hover");
    expect(names).toContain("vortex_dom_get_attribute");
    expect(names).toContain("vortex_dom_get_scroll_info");
    expect(names).toContain("vortex_dom_wait_for_mutation");
    expect(names).toContain("vortex_dom_wait_settled");
    expect(names).toContain("vortex_dom_commit");
    expect(names).toContain("vortex_dom_batch");
    expect(names).toContain("vortex_dom_watch_mutations");
    expect(names).toContain("vortex_dom_unwatch_mutations");
    expect(names).toContain("vortex_content_get_text");
    expect(names).toContain("vortex_content_get_html");
    expect(names).toContain("vortex_content_get_accessibility_tree");
    expect(names).toContain("vortex_content_get_element_text");
    expect(names).toContain("vortex_content_get_computed_style");
    expect(names).toContain("vortex_js_evaluate");
    expect(names).toContain("vortex_js_evaluate_async");
    expect(names).toContain("vortex_js_call_function");
    expect(names).toContain("vortex_keyboard_press");
    expect(names).toContain("vortex_keyboard_shortcut");
    expect(names).toContain("vortex_mouse_click");
    expect(names).toContain("vortex_mouse_double_click");
    expect(names).toContain("vortex_mouse_move");
    expect(names).toContain("vortex_capture_screenshot");
    expect(names).toContain("vortex_capture_element");
    expect(names).toContain("vortex_capture_gif_start");
    expect(names).toContain("vortex_capture_gif_frame");
    expect(names).toContain("vortex_capture_gif_stop");
    expect(names).toContain("vortex_console_get_logs");
    expect(names).toContain("vortex_console_get_errors");
    expect(names).toContain("vortex_console_clear");
    expect(names).toContain("vortex_network_get_logs");
    expect(names).toContain("vortex_network_get_errors");
    expect(names).toContain("vortex_network_filter");
    expect(names).toContain("vortex_network_get_response_body");
    expect(names).toContain("vortex_network_clear");
    expect(names).toContain("vortex_storage_get_cookies");
    expect(names).toContain("vortex_storage_set_cookie");
    expect(names).toContain("vortex_storage_delete_cookie");
    expect(names).toContain("vortex_storage_get_local_storage");
    expect(names).toContain("vortex_storage_set_local_storage");
    expect(names).toContain("vortex_storage_get_session_storage");
    expect(names).toContain("vortex_storage_set_session_storage");
    expect(names).toContain("vortex_storage_export_session");
    expect(names).toContain("vortex_storage_import_session");
    expect(names).toContain("vortex_file_upload");
    expect(names).toContain("vortex_file_download");
    expect(names).toContain("vortex_file_get_downloads");
    expect(names).toContain("vortex_frames_list");
    expect(names).toContain("vortex_frames_find");
    expect(names).toContain("vortex_observe");
    expect(names).toContain("vortex_events_subscribe");
    expect(names).toContain("vortex_events_unsubscribe");
    expect(names).toContain("vortex_events_drain");
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
    const screenshot = getToolDef("vortex_capture_screenshot");
    expect(screenshot?.returnsImage).toBe(true);
    const element = getToolDef("vortex_capture_element");
    expect(element?.returnsImage).toBe(true);
  });

  it("non-image tools do not have returnsImage flag", () => {
    const tabList = getToolDef("vortex_tab_list");
    expect(tabList?.returnsImage).toBeUndefined();
  });

  it("has at least 60 tools", () => {
    expect(getToolDefs().length).toBeGreaterThanOrEqual(60);
  });

  it("dom.batch is included for batch operations", () => {
    const names = getToolDefs().map((d) => d.name);
    expect(names).toContain("vortex_dom_batch");
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

  it("returns internal MCP action tools correctly", () => {
    expect(getToolDef("vortex_events_subscribe")?.action).toBe("__mcp_events_subscribe__");
    expect(getToolDef("vortex_events_unsubscribe")?.action).toBe("__mcp_events_unsubscribe__");
    expect(getToolDef("vortex_events_drain")?.action).toBe("__mcp_events_drain__");
    expect(getToolDef("vortex_ping")?.action).toBe("__mcp_ping__");
  });

  it("schema inputSchema is valid JSON Schema object", () => {
    const def = getToolDef("vortex_page_navigate");
    expect(def?.schema).toHaveProperty("type", "object");
    expect(def?.schema).toHaveProperty("properties");
    expect(def?.schema).toHaveProperty("required");
  });
});