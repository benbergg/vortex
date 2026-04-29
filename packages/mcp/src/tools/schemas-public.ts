// L4 public tool registry (11 tools).
// spec: vortex重构-L4-spec.md §0.2.1 (compact schema rules)
//
// Compression rules (enforced by I15 ≤ 4500 B):
// - description: imperative, ≤ 60 chars
// - properties: NO description field
// - shared inline $defs not possible across tools (MCP serializes each)
//   so Descriptor / TabRef structures are duplicated per tool
// - no `default` fields (handler defaults instead)

import type { ToolDef } from "./schemas.js";

// reusable shape constants (inlined into each tool that needs them; deduped at write-time)
const Descriptor = {
  type: "object" as const,
  properties: {
    role: { type: "string" as const },
    name: { type: "string" as const },
    text: { type: "string" as const },
    selector: { type: "string" as const },
    near: {
      type: "object" as const,
      properties: {
        ref: { type: "string" as const },
        relation: { enum: ["parent", "sibling", "child"] as const },
      },
    },
    strict: { type: "boolean" as const },
  },
};

const Target = { oneOf: [{ type: "string" as const }, Descriptor] };

const tabFields = {
  tabId: { type: "number" as const },
  frameId: { type: "number" as const },
};

export const PUBLIC_TOOLS: ToolDef[] = [
  {
    name: "vortex_act",
    action: "L4.act",
    description: "Perform a write action on a UI element.",
    schema: {
      type: "object",
      properties: {
        target: Target,
        action: { enum: ["click", "fill", "type", "select", "scroll", "hover", "drag"] },
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
    description: "List interactive elements in scope.",
    schema: {
      type: "object",
      properties: {
        scope: { type: ["string"], enum: ["viewport", "full"] },
        filter: { enum: ["interactive", "all"] },
        ...tabFields,
      },
    },
  },
  {
    name: "vortex_extract",
    action: "L4.extract",
    description: "Extract a11y subtree under target.",
    schema: {
      type: "object",
      properties: {
        target: { oneOf: [{ type: "string" }, Descriptor, { type: "null" }] },
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
        target: { oneOf: [{ type: "string" }, Descriptor, { type: "null" }] },
        fullPage: { type: "boolean" },
        ...tabFields,
      },
    },
    returnsImage: true,
  },
  {
    name: "vortex_wait_for",
    action: "L4.wait_for",
    description: "Wait for url / element / idle / info.",
    schema: {
      type: "object",
      properties: {
        mode: { enum: ["url", "element", "idle", "info"] },
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
    description: "Press a keyboard shortcut globally.",
    schema: {
      type: "object",
      properties: {
        keys: { type: "string" },
        ...tabFields,
      },
      required: ["keys"],
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
    description: "localStorage / sessionStorage CRUD.",
    schema: {
      type: "object",
      properties: {
        op: { enum: ["get", "set", "list", "session-get", "session-set"] },
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
