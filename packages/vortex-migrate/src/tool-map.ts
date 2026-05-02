// 36 v0.5 atom → 11 v0.6 tools mapping table.
// Source of truth: packages/mcp/src/tools/schemas-public.ts (v0.6 schemas)
// + Knowledge-Library/12-Projects/vortex重构/vortex重构-计划文档.md §5.4.
//
// Rewrites are expressed declaratively so the codemod can apply them on
// jscodeshift AST without runtime evaluation. Order matters: rewrites are
// applied top-to-bottom, so a `remap` may produce a key that a later `set`
// overrides.
//
// When v0.5 → v0.6 cannot be expressed declaratively (cookie-delete branch,
// freeform url-based waits) we still emit the rename + a `partialNote` so
// callers know to review the call site by hand.

export type ArgRewrite =
  | {
      /** Unconditionally `args[key] = value` (string/number/bool/null only). */
      op: "set";
      key: string;
      value: string | number | boolean | null;
    }
  | {
      /** Like `set`, but only when `args[key]` is absent. */
      op: "default";
      key: string;
      value: string | number | boolean | null;
    }
  | {
      /**
       * Rename `args[from]` → `args[to]`. If `valueMap` is provided and the
       * source key holds a string literal in it, the value is rewritten too.
       * If the source key is missing, this is a no-op.
       */
      op: "remap";
      from: string;
      to: string;
      valueMap?: Record<string, string>;
    }
  | {
      /** Delete `args[key]` (used to strip v0.5-only knobs). */
      op: "drop";
      key: string;
    };

export interface ToolMapEntry {
  /**
   * - string: rename + apply rewrites
   * - "__DELETE__": drop the entire call (vortex_ping)
   * - null: no auto-migration; codemod emits a warning instead of touching code
   */
  v06: string | null | "__DELETE__";
  rewrites?: ArgRewrite[];
  /** Surfaced for null / __DELETE__ entries (and as a partial note when set). */
  warnReason?: string;
  /** True when v06 is set but caller may need to revisit (semantic drift). */
  partial?: boolean;
  partialNote?: string;
  /**
   * Emit a warning ONLY when the original args object literal contains this
   * key. Used for tools that change dispatch path based on a specific knob
   * (e.g. v0.5 vortex_fill routed to dom.commit when `kind` was present, but
   * v0.6 vortex_act+action=fill always routes to dom.fill regardless of kind).
   * Plain calls without that key migrate cleanly and stay silent.
   */
  conditionalPartial?: { key: string; note: string };
}

export const TOOL_MAP: Record<string, ToolMapEntry> = {
  // ── kept names (6) ─────────────────────────────────────────────
  vortex_observe: { v06: "vortex_observe" },
  vortex_navigate: { v06: "vortex_navigate" },
  vortex_tab_create: { v06: "vortex_tab_create" },
  vortex_tab_close: { v06: "vortex_tab_close" },
  vortex_screenshot: { v06: "vortex_screenshot" },
  vortex_press: { v06: "vortex_press" },

  // ── act (5) ────────────────────────────────────────────────────
  vortex_click: { v06: "vortex_act", rewrites: [{ op: "set", key: "action", value: "click" }] },
  vortex_type: { v06: "vortex_act", rewrites: [{ op: "set", key: "action", value: "type" }] },
  vortex_fill: {
    v06: "vortex_act",
    rewrites: [{ op: "set", key: "action", value: "fill" }],
    conditionalPartial: {
      key: "kind",
      note:
        "v0.5 vortex_fill with kind=X routed to dom.commit (compound widget driver). v0.6 vortex_act+action=fill always uses dom.fill, dropping kind dispatch — date/range pickers, multi-select compound widgets need manual review (no v0.6 equivalent yet)",
    },
  },
  vortex_select: { v06: "vortex_act", rewrites: [{ op: "set", key: "action", value: "select" }] },
  vortex_hover: { v06: "vortex_act", rewrites: [{ op: "set", key: "action", value: "hover" }] },

  // mouse_click → act+click; v0.5 took x/y coords, v0.6 needs target ref
  vortex_mouse_click: {
    v06: "vortex_act",
    rewrites: [{ op: "set", key: "action", value: "click" }],
    partial: true,
    partialNote:
      "mouse_click coords (x/y) are not valid in v0.6 act schema; supply target ref instead",
  },

  // ── extract (1) ────────────────────────────────────────────────
  vortex_get_text: {
    v06: "vortex_extract",
    // include arrives as ["text"]; codemod treats array literals via custom path
    rewrites: [{ op: "set", key: "include", value: "__INCLUDE_TEXT__" }],
    partial: true,
    partialNote:
      "vortex_extract.include is an array; review the generated `include: ['text']` and merge with any prior values",
  },

  // ── wait_for (3) ───────────────────────────────────────────────
  vortex_wait: {
    v06: "vortex_wait_for",
    rewrites: [
      { op: "remap", from: "target", to: "value" },
      { op: "set", key: "mode", value: "element" },
    ],
    partial: true,
    partialNote:
      "v0.5 vortex_wait accepted url; v0.6 wait_for(mode=element) only takes a selector — review url-based waits manually",
  },
  vortex_wait_idle: {
    v06: "vortex_wait_for",
    rewrites: [
      { op: "remap", from: "kind", to: "value" },
      { op: "remap", from: "idleMs", to: "timeout" },
      { op: "set", key: "mode", value: "idle" },
    ],
  },
  vortex_page_info: {
    v06: "vortex_wait_for",
    rewrites: [{ op: "set", key: "mode", value: "info" }],
  },

  // ── debug_read (2) ─────────────────────────────────────────────
  vortex_console: {
    v06: "vortex_debug_read",
    rewrites: [
      { op: "drop", key: "op" },
      { op: "set", key: "source", value: "console" },
    ],
    partial: true,
    partialNote: "v0.5 console.op='clear' has no v0.6 equivalent — clear branches need manual rewrite",
  },
  vortex_network: {
    v06: "vortex_debug_read",
    rewrites: [
      { op: "drop", key: "op" },
      { op: "set", key: "source", value: "network" },
    ],
    partial: true,
    partialNote: "v0.5 network.op='clear' has no v0.6 equivalent — clear branches need manual rewrite",
  },

  // ── storage (2) ────────────────────────────────────────────────
  vortex_storage_get: {
    v06: "vortex_storage",
    rewrites: [
      {
        op: "remap",
        from: "scope",
        to: "op",
        valueMap: { cookie: "cookies-get", session: "session-get", local: "get" },
      },
      { op: "default", key: "op", value: "get" },
    ],
    partial: true,
    partialNote:
      "When scope was missing, codemod assumes op='get' (localStorage). Verify against the original v0.5 default.",
  },
  vortex_storage_set: {
    v06: "vortex_storage",
    rewrites: [
      {
        op: "remap",
        from: "scope",
        to: "op",
        valueMap: { cookie: "set", session: "session-set", local: "set" },
      },
      { op: "default", key: "op", value: "set" },
    ],
    partial: true,
    partialNote:
      "v0.6 vortex_storage has no cookie-delete op; calls passing op='delete' + scope='cookie' must use chrome.cookies API directly",
  },

  // ── delete (1) ─────────────────────────────────────────────────
  vortex_ping: {
    v06: "__DELETE__",
    warnReason: "vortex_ping is removed in v0.6 — calls deleted",
  },

  // ── warn-only (no v0.6 equivalent) ─────────────────────────────
  vortex_mouse_move: {
    v06: null,
    warnReason: "no v0.6 equivalent for mouse_move (coordinate-based pointer move)",
  },
  vortex_mouse_drag: {
    v06: null,
    warnReason: "v0.6 vortex_act does not support drag (coords); track v0.6.x for drag tooling",
  },
  vortex_get_html: {
    v06: null,
    warnReason: "v0.6 vortex_extract does not return HTML; rewrite to text extraction or a screenshot",
  },
  vortex_evaluate: {
    v06: null,
    warnReason: "raw page evaluate is not exposed in v0.6 — express the intent through act/extract",
  },
  vortex_frames_list: {
    v06: null,
    warnReason: "v0.6 vortex_observe does not list frames separately; pass frameId on each call",
  },
  vortex_tab_list: {
    v06: null,
    warnReason: "v0.6 has no tab listing tool; use vortex_tab_create / vortex_tab_close with explicit tabIds",
  },
  vortex_history: {
    v06: null,
    warnReason: "v0.6 wait_for has no 'history' mode; use vortex_navigate with reload/url",
  },
  vortex_network_response_body: {
    v06: null,
    warnReason: "v0.6 vortex_debug_read does not expose response bodies; intercept via DevTools instead",
  },
  vortex_events: {
    v06: null,
    warnReason: "v0.6 vortex_debug_read drops the events stream; switch to console / network sources",
  },
  vortex_storage_session: {
    v06: null,
    warnReason: "v0.6 vortex_storage has no session import/export; persist via cookies-get + session-set manually",
  },
  vortex_file_upload: {
    v06: null,
    warnReason: "v0.6 has no file_upload tool; use vortex_act(action='fill') against an <input type=file> when possible",
  },
  vortex_file_download: {
    v06: null,
    warnReason: "v0.6 has no file_download tool; trigger via vortex_act + verify with chrome.downloads",
  },
  vortex_file_list_downloads: {
    v06: null,
    warnReason: "v0.6 has no list_downloads tool; query chrome.downloads.search directly",
  },
  vortex_batch: {
    v06: null,
    warnReason: "v0.6 removed vortex_batch; sequence calls in the agent loop",
  },
  vortex_fill_form: {
    v06: null,
    warnReason: "v0.6 has no fill_form helper; expand to per-field vortex_act(action='fill') calls",
  },
};

/**
 * v0.5 names that we know about. Used by the codemod to decide whether a
 * call site is a candidate for migration.
 */
export const V05_TOOL_NAMES = Object.freeze(Object.keys(TOOL_MAP) as readonly string[]);

/** v0.6 public surface, for sanity checks (skip already-migrated calls). */
export const V06_TOOL_NAMES: ReadonlySet<string> = new Set([
  "vortex_act",
  "vortex_extract",
  "vortex_observe",
  "vortex_navigate",
  "vortex_tab_create",
  "vortex_tab_close",
  "vortex_screenshot",
  "vortex_wait_for",
  "vortex_press",
  "vortex_debug_read",
  "vortex_storage",
]);
