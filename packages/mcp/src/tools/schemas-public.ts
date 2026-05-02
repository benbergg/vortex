// L4 public tool registry (11 tools).
// spec: vortex重构-L4-spec.md §0.2.1 (compact schema rules)
//
// Compression rules (enforced by I15 ≤ 4500 B):
// - description: imperative, ≤ 60 chars
// - properties: NO description field
// - shared inline $defs not possible across tools (MCP serializes each)
//   so Target / TabRef structures are duplicated per tool
// - no `default` fields (handler defaults instead)
//
// v0.6 scope: target accepts ref string only (`@e3` / `@f1e2`) or null
// (whole page where applicable). Descriptor object form arrives in v0.6.x
// alongside L3 reasoning resolver — keeping schema honest with runtime.

import type { ToolDef } from "./schemas.js";

const tabFields = {
  tabId: { type: "number" as const },
  frameId: { type: "number" as const },
};

// target: ref string only in v0.6. null variant lets extract/screenshot
// target the whole page; act/wait_for require a concrete element.
const TargetRequired = { type: "string" as const };
const TargetOptional = { oneOf: [{ type: "string" as const }, { type: "null" as const }] };

export const PUBLIC_TOOLS: ToolDef[] = [
  {
    name: "vortex_act",
    action: "L4.act",
    description: "Perform a write action on a UI element.",
    schema: {
      type: "object",
      properties: {
        target: TargetRequired,
        action: { enum: ["click", "fill", "type", "select", "scroll", "hover"] },
        value: {},
        options: {
          type: "object",
          properties: {
            timeout: { type: "number" },
            force: { type: "boolean" },
          },
        },
        ...tabFields,
      },
      required: ["target", "action"],
    },
  },
  {
    name: "vortex_observe",
    action: "L4.observe",
    description: "List interactive elements; iframes: frames=all-permitted.",
    schema: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["viewport", "full"] },
        filter: { enum: ["interactive", "all"] },
        frames: { enum: ["main", "all-same-origin", "all-permitted", "all"] },
        ...tabFields,
      },
    },
  },
  {
    name: "vortex_extract",
    action: "L4.extract",
    description: "Extract visible text from page or element.",
    schema: {
      type: "object",
      properties: {
        target: TargetOptional,
        depth: { type: "number" },
        include: { type: "array", items: { enum: ["text", "value", "attrs"] } },
        ...tabFields,
      },
    },
  },
  {
    name: "vortex_navigate",
    action: "page.navigate",
    description: "Navigate the active tab to a URL.",
    schema: {
      type: "object",
      properties: {
        url: { type: "string" },
        waitUntil: { enum: ["load", "domcontentloaded", "networkidle"] },
        reload: { type: "boolean" },
        ...tabFields,
      },
      required: ["url"],
    },
  },
  {
    name: "vortex_tab_create",
    action: "tab.create",
    description: "Open a new browser tab.",
    schema: {
      type: "object",
      properties: {
        url: { type: "string" },
        active: { type: "boolean" },
      },
    },
  },
  {
    name: "vortex_tab_close",
    action: "tab.close",
    description: "Close a browser tab.",
    schema: {
      type: "object",
      properties: { tabId: { type: "number" } },
    },
  },
  {
    name: "vortex_screenshot",
    action: "capture.screenshot",
    description: "Capture a screenshot of page or element.",
    schema: {
      type: "object",
      properties: {
        target: TargetOptional,
        fullPage: { type: "boolean" },
        ...tabFields,
      },
    },
    returnsImage: true,
  },
  {
    name: "vortex_wait_for",
    action: "L4.wait_for",
    description: "Wait for element / idle / page info.",
    schema: {
      type: "object",
      properties: {
        mode: { enum: ["element", "idle", "info"] },
        value: {},
        timeout: { type: "number" },
        ...tabFields,
      },
      required: ["mode"],
    },
  },
  {
    name: "vortex_press",
    action: "keyboard.press",
    description: "Press a key or shortcut globally.",
    schema: {
      type: "object",
      properties: {
        key: { type: "string" },
        ...tabFields,
      },
      required: ["key"],
    },
  },
  {
    name: "vortex_debug_read",
    action: "L4.debug_read",
    description: "Read console or network logs.",
    schema: {
      type: "object",
      properties: {
        source: { enum: ["console", "network"] },
        filter: { type: "object" },
        tail: { type: "number" },
        ...tabFields,
      },
      required: ["source"],
    },
  },
  {
    name: "vortex_storage",
    action: "L4.storage",
    description: "localStorage / sessionStorage / cookies CRUD.",
    schema: {
      type: "object",
      properties: {
        op: { enum: ["get", "set", "session-get", "session-set", "cookies-get"] },
        key: { type: "string" },
        value: {},
        ...tabFields,
      },
      required: ["op"],
    },
  },
];

export function getPublicToolDefs(): ToolDef[] {
  return PUBLIC_TOOLS;
}
