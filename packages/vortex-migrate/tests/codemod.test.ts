import { describe, expect, it } from "vitest";

import { transformSource } from "../src/codemod.js";

// ────────────────────────────────────────────────────────────────────────────
// Targeted shape tests — exercise specific reshape logic in detail.
// ────────────────────────────────────────────────────────────────────────────
describe("transformSource — targeted reshapes", () => {
  it("renames vortex_click to vortex_act with action='click'", () => {
    const input = `await client.callTool({ name: "vortex_click", arguments: { target: "@e3" } });`;
    const r = transformSource(input);
    expect(r.changed).toBe(true);
    expect(r.rewrites).toBe(1);
    expect(r.source).toContain('"vortex_act"');
    expect(r.source).toContain('action: "click"');
    expect(r.source).toContain('target: "@e3"');
    expect(r.source).not.toContain("vortex_click");
  });

  it("renames vortex_storage_get with scope='cookie' to op='cookies-get'", () => {
    const input = `client.callTool({ name: "vortex_storage_get", arguments: { scope: "cookie", key: "auth" } });`;
    const r = transformSource(input);
    expect(r.source).toContain('"vortex_storage"');
    expect(r.source).toContain('op: "cookies-get"');
    expect(r.source).toContain('key: "auth"');
    expect(r.source).not.toContain("scope:");
  });

  it("falls back to op='get' when storage_get scope is absent", () => {
    const input = `client.callTool({ name: "vortex_storage_get", arguments: { key: "tok" } });`;
    const r = transformSource(input);
    expect(r.source).toContain('"vortex_storage"');
    expect(r.source).toContain('op: "get"');
    expect(r.source).toContain('key: "tok"');
  });

  it("rewrites vortex_storage_set with scope='session' to op='session-set'", () => {
    const input = `client.callTool({ name: "vortex_storage_set", arguments: { scope: "session", key: "k", value: "v" } });`;
    const r = transformSource(input);
    expect(r.source).toContain('"vortex_storage"');
    expect(r.source).toContain('op: "session-set"');
    expect(r.source).toContain('key: "k"');
    expect(r.source).toContain('value: "v"');
    expect(r.source).not.toContain("scope:");
  });

  it("rewrites vortex_wait_idle kind/idleMs to value/timeout under wait_for", () => {
    const input = `client.callTool({ name: "vortex_wait_idle", arguments: { kind: "network", idleMs: 500 } });`;
    const r = transformSource(input);
    expect(r.source).toContain('"vortex_wait_for"');
    expect(r.source).toContain('mode: "idle"');
    expect(r.source).toContain('value: "network"');
    expect(r.source).toContain("timeout: 500");
    expect(r.source).not.toMatch(/\bkind\b\s*:/);
    expect(r.source).not.toMatch(/\bidleMs\b/);
  });

  it("renames vortex_page_info to vortex_wait_for(mode='info')", () => {
    const input = `client.callTool({ name: "vortex_page_info", arguments: {} });`;
    const r = transformSource(input);
    expect(r.source).toContain('"vortex_wait_for"');
    expect(r.source).toContain('mode: "info"');
  });

  it("renames vortex_console to vortex_debug_read(source='console') and drops op", () => {
    const input = `client.callTool({ name: "vortex_console", arguments: { op: "list", tail: 50 } });`;
    const r = transformSource(input);
    expect(r.source).toContain('"vortex_debug_read"');
    expect(r.source).toContain('source: "console"');
    expect(r.source).toContain("tail: 50");
    expect(r.source).not.toMatch(/\bop\b\s*:/);
  });

  it("renames vortex_network to vortex_debug_read(source='network')", () => {
    const input = `client.callTool({ name: "vortex_network", arguments: { tail: 100 } });`;
    const r = transformSource(input);
    expect(r.source).toContain('"vortex_debug_read"');
    expect(r.source).toContain('source: "network"');
    expect(r.source).toContain("tail: 100");
  });

  it("deletes vortex_ping calls in expression-statement context", () => {
    const input = [
      `await client.callTool({ name: "vortex_ping", arguments: {} });`,
      `await client.callTool({ name: "vortex_navigate", arguments: { url: "https://example.com" } });`,
    ].join("\n");
    const r = transformSource(input);
    expect(r.source).not.toContain("vortex_ping");
    expect(r.source).toContain("vortex_navigate");
    expect(r.deletions).toBe(1);
  });

  it("emits a warning for vortex_evaluate (no v0.6 equivalent)", () => {
    const input = `client.callTool({ name: "vortex_evaluate", arguments: { code: "1+1" } });`;
    const r = transformSource(input);
    expect(r.changed).toBe(false);
    expect(r.rewrites).toBe(0);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].tool).toBe("vortex_evaluate");
    expect(r.warnings[0].reason).toMatch(/not exposed/);
  });

  it("skips calls already targeting v0.6 tools", () => {
    const input = `client.callTool({ name: "vortex_act", arguments: { action: "click", target: "@e1" } });`;
    const r = transformSource(input);
    expect(r.changed).toBe(false);
    expect(r.rewrites).toBe(0);
    expect(r.warnings).toHaveLength(0);
  });

  it("emits a partial warning for vortex_wait alongside the rename", () => {
    const input = `client.callTool({ name: "vortex_wait", arguments: { target: ".btn", timeout: 1000 } });`;
    const r = transformSource(input);
    expect(r.source).toContain('"vortex_wait_for"');
    expect(r.source).toContain('value: ".btn"');
    expect(r.source).toContain('mode: "element"');
    expect(r.warnings.some((w) => /url-based waits/.test(w.reason))).toBe(true);
  });

  it("renames vortex_get_text to vortex_extract with include=['text']", () => {
    const input = `client.callTool({ name: "vortex_get_text", arguments: { target: "@e2" } });`;
    const r = transformSource(input);
    expect(r.source).toContain('"vortex_extract"');
    expect(r.source).toMatch(/include:\s*\[\s*"text"\s*\]/);
  });

  it("renames vortex_mouse_click to vortex_act+click and surfaces partialNote", () => {
    const input = `client.callTool({ name: "vortex_mouse_click", arguments: { x: 10, y: 20 } });`;
    const r = transformSource(input);
    expect(r.source).toContain('"vortex_act"');
    expect(r.source).toContain('action: "click"');
    expect(r.warnings.some((w) => /coords \(x\/y\)/.test(w.reason))).toBe(true);
  });

  it("does not touch unrelated callTool calls", () => {
    const input = `client.callTool({ name: "some_other_tool", arguments: { foo: 1 } });`;
    const r = transformSource(input);
    expect(r.changed).toBe(false);
    expect(r.source).toBe(input);
  });

  // ── positional ctx.call("X", {...}) form (v0.7.2) ───────────────────────
  it("rewrites ctx.call(\"vortex_click\", ...) positional form", () => {
    const input = `await ctx.call("vortex_click", { target: "@e2" });`;
    const r = transformSource(input);
    expect(r.changed).toBe(true);
    expect(r.source).toContain('"vortex_act"');
    expect(r.source).toContain('action: "click"');
  });

  it("rewrites tools.call(\"vortex_wait_idle\", ...) positional form", () => {
    const input = `await tools.call("vortex_wait_idle", { kind: "dom", idleMs: 500 });`;
    const r = transformSource(input);
    expect(r.changed).toBe(true);
    expect(r.source).toContain('"vortex_wait_for"');
    expect(r.source).toContain('mode: "idle"');
    expect(r.source).toContain('value: "dom"');
  });

  it("warns on positional ctx.call(\"vortex_evaluate\", ...) — no v0.6 equivalent", () => {
    const input = `await ctx.call("vortex_evaluate", { code: "1+1" });`;
    const r = transformSource(input);
    expect(r.changed).toBe(false);
    expect(r.warnings.some((w) => w.tool === "vortex_evaluate")).toBe(true);
  });

  it("does not touch ctx.call with unknown tool name", () => {
    const input = `await ctx.call("some_other_tool", { x: 1 });`;
    const r = transformSource(input);
    expect(r.changed).toBe(false);
  });

  it("does not touch ctx.call with non-string first arg", () => {
    const input = `await ctx.call(toolName, { x: 1 });`;
    const r = transformSource(input);
    expect(r.changed).toBe(false);
  });

  it("rewrites ctx.call with 3+ args (only first/second args touched)", () => {
    const input = `await ctx.call("vortex_click", { target: "@e2" }, { extra: true });`;
    const r = transformSource(input);
    expect(r.changed).toBe(true);
    expect(r.source).toContain('"vortex_act"');
    expect(r.source).toContain('action: "click"');
    // 3rd arg untouched
    expect(r.source).toContain("{ extra: true }");
  });

  // ── conditionalPartial: vortex_fill kind dispatch loss (v0.7.3) ─────────
  it("warns on vortex_fill with kind= about dom.commit dispatch loss", () => {
    const input = `await ctx.call("vortex_fill", { target: ".x", kind: "daterange", value: { start: "2024-01-01", end: "2024-12-31" } });`;
    const r = transformSource(input);
    expect(r.changed).toBe(true);
    expect(r.source).toContain('"vortex_act"');
    expect(r.warnings.some((w) => w.tool === "vortex_fill" && /kind=\.\.\./.test(w.reason))).toBe(true);
  });

  it("does NOT warn on plain vortex_fill without kind", () => {
    const input = `await ctx.call("vortex_fill", { target: ".x", value: "hello" });`;
    const r = transformSource(input);
    expect(r.changed).toBe(true);
    expect(r.source).toContain('"vortex_act"');
    expect(r.warnings.length).toBe(0);
  });

  it("warns on vortex_fill kind in ObjectExpression form (client.callTool)", () => {
    const input = `client.callTool({ name: "vortex_fill", arguments: { kind: "select-multiple", value: ["A"] } });`;
    const r = transformSource(input);
    expect(r.changed).toBe(true);
    expect(r.warnings.some((w) => w.tool === "vortex_fill")).toBe(true);
  });

  it("warns on indirect tool name (variable) but does not rewrite", () => {
    const input = [
      `const tool = "vortex_click";`,
      `client.callTool({ name: tool, arguments: { target: "@e1" } });`,
    ].join("\n");
    const r = transformSource(input);
    expect(r.changed).toBe(false);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].tool).toBe("<indirect>");
    expect(r.warnings[0].reason).toMatch(/not a string literal.*tool/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Coverage matrix — every v0.5 atom must be classified correctly.
//
// We assert the *outcome class* (kept / renamed / warned / deleted) rather
// than the full reshaped source, since shape details are exercised above.
// ────────────────────────────────────────────────────────────────────────────

const callOf = (name: string, args = "{}"): string =>
  `client.callTool({ name: "${name}", arguments: ${args} });`;

describe("coverage matrix — kept names (6)", () => {
  const KEPT = [
    "vortex_observe",
    "vortex_navigate",
    "vortex_tab_create",
    "vortex_tab_close",
    "vortex_screenshot",
    "vortex_press",
  ];
  for (const name of KEPT) {
    it(`leaves ${name} unchanged`, () => {
      const input = callOf(name, '{ url: "https://x" }');
      const r = transformSource(input);
      expect(r.changed).toBe(false);
      expect(r.rewrites).toBe(0);
      expect(r.warnings).toHaveLength(0);
      expect(r.source).toContain(`"${name}"`);
    });
  }
});

describe("coverage matrix — vortex_act renames (5)", () => {
  const ACT_VERBS: Array<[string, string]> = [
    ["vortex_click", "click"],
    ["vortex_type", "type"],
    ["vortex_fill", "fill"],
    ["vortex_select", "select"],
    ["vortex_hover", "hover"],
  ];
  for (const [v05, verb] of ACT_VERBS) {
    it(`${v05} → vortex_act + action='${verb}'`, () => {
      const input = callOf(v05, '{ target: "@e1" }');
      const r = transformSource(input);
      expect(r.source).toContain('"vortex_act"');
      expect(r.source).toContain(`action: "${verb}"`);
      expect(r.source).not.toContain(v05);
      expect(r.rewrites).toBe(1);
    });
  }
});

describe("coverage matrix — warn-only entries (13)", () => {
  // Each entry has no v0.6 equivalent; the codemod must leave the call alone
  // and surface exactly one warning whose reason matches a topic-specific cue.
  const WARN_CASES: Array<[string, RegExp]> = [
    ["vortex_mouse_move", /mouse_move/],
    ["vortex_mouse_drag", /drag/],
    ["vortex_get_html", /HTML/],
    ["vortex_evaluate", /evaluate/],
    ["vortex_frames_list", /frames/],
    ["vortex_tab_list", /tab listing/],
    ["vortex_history", /history/],
    ["vortex_network_response_body", /response bodies/],
    ["vortex_events", /events stream/],
    ["vortex_storage_session", /session import/],
    ["vortex_file_upload", /file_upload/],
    ["vortex_file_download", /file_download/],
    ["vortex_file_list_downloads", /list_downloads/],
    ["vortex_batch", /vortex_batch/],
    ["vortex_fill_form", /fill_form/],
  ];
  for (const [name, cue] of WARN_CASES) {
    it(`${name} emits warning + leaves source unchanged`, () => {
      const input = callOf(name, "{ foo: 1 }");
      const r = transformSource(input);
      expect(r.changed).toBe(false);
      expect(r.rewrites).toBe(0);
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0].tool).toBe(name);
      expect(r.warnings[0].reason).toMatch(cue);
    });
  }
});

describe("coverage matrix — sanity counts", () => {
  it("aggregate run rewrites every renameable atom and warns on every non-migratable one", () => {
    const RENAMED_INPUTS = [
      // act family (6 incl. mouse_click)
      ["vortex_click", '{ target: "@e1" }'],
      ["vortex_type", '{ target: "@e1", value: "x" }'],
      ["vortex_fill", '{ target: "@e1", value: "x" }'],
      ["vortex_select", '{ target: "@e1", value: "opt" }'],
      ["vortex_hover", '{ target: "@e1" }'],
      ["vortex_mouse_click", "{ x: 1, y: 2 }"],
      // extract
      ["vortex_get_text", '{ target: "@e2" }'],
      // wait_for family
      ["vortex_wait", '{ target: ".x" }'],
      ["vortex_wait_idle", '{ kind: "dom" }'],
      ["vortex_page_info", "{}"],
      // debug_read family
      ["vortex_console", "{ tail: 1 }"],
      ["vortex_network", "{ tail: 1 }"],
      // storage family
      ["vortex_storage_get", '{ scope: "cookie", key: "k" }'],
      ["vortex_storage_set", '{ scope: "session", key: "k", value: "v" }'],
    ];
    const WARN_NAMES = [
      "vortex_mouse_move",
      "vortex_mouse_drag",
      "vortex_get_html",
      "vortex_evaluate",
      "vortex_frames_list",
      "vortex_tab_list",
      "vortex_history",
      "vortex_network_response_body",
      "vortex_events",
      "vortex_storage_session",
      "vortex_file_upload",
      "vortex_file_download",
      "vortex_file_list_downloads",
      "vortex_batch",
      "vortex_fill_form",
    ];

    const lines: string[] = [
      ...RENAMED_INPUTS.map(([n, a]) => callOf(n, a)),
      ...WARN_NAMES.map((n) => callOf(n, "{}")),
      callOf("vortex_ping", "{}"), // deletion
    ];
    const r = transformSource(lines.join("\n"));

    expect(r.rewrites).toBe(RENAMED_INPUTS.length + 1); // +1 for ping deletion
    expect(r.deletions).toBe(1);
    // Each WARN_NAMES emits exactly one warning. Some renames also surface a
    // partialNote (mouse_click / wait / storage_get / storage_set / console /
    // network / get_text), so we assert lower bound.
    expect(r.warnings.length).toBeGreaterThanOrEqual(WARN_NAMES.length);
    for (const n of WARN_NAMES) {
      expect(r.warnings.some((w) => w.tool === n)).toBe(true);
    }
  });
});
