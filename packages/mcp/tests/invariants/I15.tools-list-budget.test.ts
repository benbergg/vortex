// I15: tools/list 字节硬断言 + 数量 + 内部化 grep。
// spec: vortex重构-L4-spec.md §0.2.1 (4500B budget) + §3.3

import { describe, it, expect } from "vitest";
import { getToolDefs } from "../../src/tools/registry.js";

describe("I15: tools/list budget + count + internalized grep", () => {
  const defs = getToolDefs();
  const toolsListPayload = JSON.stringify(
    defs.map(d => ({ name: d.name, description: d.description, inputSchema: d.schema })),
  );

  it("tools/list 字节 ≤ 4500 B", () => {
    expect(toolsListPayload.length).toBeLessThanOrEqual(4500);
  });

  it("公开工具数量 = 11", () => {
    expect(defs.length).toBe(11);
  });

  it("11 个公开工具名匹配 spec L4 §1.1+§1.2", () => {
    const names = defs.map(d => d.name).sort();
    expect(names).toEqual([
      "vortex_act",
      "vortex_debug_read",
      "vortex_extract",
      "vortex_navigate",
      "vortex_observe",
      "vortex_press",
      "vortex_screenshot",
      "vortex_storage",
      "vortex_tab_close",
      "vortex_tab_create",
      "vortex_wait_for",
    ]);
  });

  it("v0.5 已删/内部化的工具不在 tools/list", () => {
    const names = new Set(defs.map(d => d.name));
    const internalized = [
      // 写操作 → act
      "vortex_click", "vortex_fill", "vortex_type", "vortex_select",
      "vortex_scroll", "vortex_hover", "vortex_drag",
      // 读 → extract / observe
      "vortex_get_text", "vortex_get_html", "vortex_evaluate",
      "vortex_frames_list", "vortex_tab_list",
      // 等待 → wait_for
      "vortex_wait", "vortex_wait_idle", "vortex_page_info", "vortex_history",
      // 调试 → debug_read
      "vortex_console", "vortex_network", "vortex_network_response_body", "vortex_events",
      // 存储 → storage
      "vortex_storage_get", "vortex_storage_set", "vortex_storage_session",
      // 内部化（act/observe 触发）
      "vortex_mouse_click", "vortex_mouse_drag", "vortex_mouse_move",
      "vortex_file_upload", "vortex_file_download", "vortex_file_list_downloads",
      "vortex_fill_form", "vortex_batch",
      // 删除（无业务价值 / 内部化）
      "vortex_ping",
    ];
    for (const n of internalized) {
      expect(names.has(n)).toBe(false);
    }
  });

  it("description 长度 ≤ 60 char", () => {
    for (const d of defs) {
      expect(d.description.length).toBeLessThanOrEqual(60);
    }
  });

  it("inputSchema 中 properties 字段不带 description（节字节）", () => {
    function checkNoPropertyDescription(schema: any, path = ""): void {
      if (!schema || typeof schema !== "object") return;
      if (schema.properties && typeof schema.properties === "object") {
        for (const [k, v] of Object.entries(schema.properties)) {
          if (v && typeof v === "object" && "description" in (v as object)) {
            throw new Error(`${path}.properties.${k} has description (forbidden by §0.2.1)`);
          }
          checkNoPropertyDescription(v, `${path}.properties.${k}`);
        }
      }
      if (schema.items) checkNoPropertyDescription(schema.items, `${path}.items`);
      if (schema.oneOf) for (const o of schema.oneOf) checkNoPropertyDescription(o, `${path}.oneOf`);
    }
    for (const d of defs) {
      expect(() => checkNoPropertyDescription(d.schema, d.name)).not.toThrow();
    }
  });
});

// Bug F (v0.6.0 dogfood): PR #4 门面化把 vortex_observe schema 砍到 scope/filter，
// 漏掉 frames 参数。底层路由（server.ts spread rest, observe.ts:486 args.frames）
// 全部就位，但 LLM 看到的公开 schema 不暴露 → cross-origin iframe / SPA 嵌入场景
// 无从触发 all-permitted。本测试锁住 frames 暴露，防止门面收窄再次静默丢参数。
describe("Bug F regression: vortex_observe surface must expose frames", () => {
  const observe = getToolDefs().find(d => d.name === "vortex_observe")!;
  const props = (observe.schema as { properties: Record<string, any> }).properties;

  it("vortex_observe.schema.properties.frames exists", () => {
    expect(props.frames).toBeDefined();
  });

  // Strict equality (not arrayContaining) — guards against silent enum
  // drift in either direction: subset (capability removed) or superset
  // (untested value sneaked in). Order matches schemas.ts:111 internal enum.
  it("frames enum equals exactly main / all-same-origin / all-permitted / all", () => {
    expect(props.frames.enum).toEqual([
      "main",
      "all-same-origin",
      "all-permitted",
      "all",
    ]);
  });

  // The whole point of the description change is to nudge LLMs to switch
  // away from the implicit 'main' default when iframes are involved.
  // If a future edit drops the hint (e.g. reverts to "List interactive
  // elements in scope."), the schema-shape tests above still pass but
  // discoverability silently regresses — Bug F all over again.
  it("description hints frames usage for iframe contexts", () => {
    expect(observe.description).toMatch(/frames/);
  });
});
