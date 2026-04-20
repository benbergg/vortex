import { describe, it, expect } from "vitest";
import { getAllToolDefs } from "../src/tools/schemas.js";
import { createHash } from "node:crypto";

/**
 * 镜像 server.ts 里 computeSchemaHash 的算法；一旦算法漂移，
 * 这个测试会立刻发现（避免 schema 指纹前后不一致导致的无感发布）。
 */
function computeSchemaHash(): string {
  const defs = getAllToolDefs();
  const payload = defs
    .map((d) => `${d.name}:${d.action}:${d.description.length}`)
    .sort()
    .join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 12);
}

describe("MCP ping version fingerprint (@since 0.4.0)", () => {
  it("schemaHash is a 12-char lowercase hex string", () => {
    const h = computeSchemaHash();
    expect(h).toMatch(/^[0-9a-f]{12}$/);
  });

  it("schemaHash changes when tool descriptions drift (length sensitive)", () => {
    const baseline = getAllToolDefs();
    const h1 = computeSchemaHash();
    // 长度变了就要变 hash（模拟 description 更新后的指纹漂移）
    const mutated = baseline.map((d, i) =>
      i === 0 ? { ...d, description: d.description + " X" } : d,
    );
    const payload = mutated
      .map((d) => `${d.name}:${d.action}:${d.description.length}`)
      .sort()
      .join("|");
    const h2 = createHash("sha256").update(payload).digest("hex").slice(0, 12);
    expect(h2).not.toBe(h1);
  });

  it("includes diagnostics tool and core v0.4 tools in toolset", () => {
    const names = getAllToolDefs().map((d) => d.name);
    expect(names).toContain("vortex_ping");
    expect(names).toContain("vortex_dom_commit");
    expect(names).toContain("vortex_dom_wait_settled");
    expect(names).toContain("vortex_page_wait_for_xhr_idle");
    expect(names).toContain("vortex_dom_batch");
  });

  it("vortex_ping description advertises version fingerprint", () => {
    const ping = getAllToolDefs().find((d) => d.name === "vortex_ping");
    expect(ping?.description).toMatch(/mcpVersion/);
    expect(ping?.description).toMatch(/extensionVersion/);
    expect(ping?.description).toMatch(/schemaHash/);
    expect(ping?.description).toMatch(/toolCount/);
  });

  it("vortex_mouse_click description mentions frameId for iframe support", () => {
    const mc = getAllToolDefs().find((d) => d.name === "vortex_mouse_click");
    expect(mc?.description).toMatch(/frameId/);
    expect(mc?.description).toMatch(/iframe/);
  });

  it("vortex_observe description mentions iframe support", () => {
    const ob = getAllToolDefs().find((d) => d.name === "vortex_observe");
    expect(ob?.description).toMatch(/iframe/);
    expect(ob?.description).toMatch(/frames/);
  });
});
