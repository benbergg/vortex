import { describe, expect, it } from "vitest";

import { transformSource } from "../src/codemod.js";

describe("transformSource", () => {
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
    expect(r.source).not.toContain('scope:');
  });

  it("falls back to op='get' when storage_get scope is absent", () => {
    const input = `client.callTool({ name: "vortex_storage_get", arguments: { key: "tok" } });`;
    const r = transformSource(input);
    expect(r.source).toContain('"vortex_storage"');
    expect(r.source).toContain('op: "get"');
    expect(r.source).toContain('key: "tok"');
  });

  it("rewrites vortex_wait_idle kind/idleMs to value/timeout under wait_for", () => {
    const input = `client.callTool({ name: "vortex_wait_idle", arguments: { kind: "network", idleMs: 500 } });`;
    const r = transformSource(input);
    expect(r.source).toContain('"vortex_wait_for"');
    expect(r.source).toContain('mode: "idle"');
    expect(r.source).toContain('value: "network"');
    expect(r.source).toContain('timeout: 500');
    expect(r.source).not.toMatch(/\bkind\b\s*:/);
    expect(r.source).not.toMatch(/\bidleMs\b/);
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
    // partialNote should surface as a warning even though the rewrite happened.
    expect(r.warnings.some((w) => /url-based waits/.test(w.reason))).toBe(true);
  });

  it("renames vortex_get_text to vortex_extract with include=['text']", () => {
    const input = `client.callTool({ name: "vortex_get_text", arguments: { target: "@e2" } });`;
    const r = transformSource(input);
    expect(r.source).toContain('"vortex_extract"');
    expect(r.source).toMatch(/include:\s*\[\s*"text"\s*\]/);
  });

  it("does not touch unrelated callTool calls", () => {
    const input = `client.callTool({ name: "some_other_tool", arguments: { foo: 1 } });`;
    const r = transformSource(input);
    expect(r.changed).toBe(false);
    expect(r.source).toBe(input);
  });
});
