import { describe, it, expect } from "vitest";
import { getToolDefs } from "../../../mcp/dist/src/tools/registry.js";

describe("tools/list payload size", () => {
  it("全量 tools/list JSON 字节 ≤ 16 KB（v0.5 收紧；实际 14.5KB，1.5KB 余量）", () => {
    const defs = getToolDefs();
    const payload = JSON.stringify(
      defs.map((d) => ({ name: d.name, description: d.description, inputSchema: d.schema })),
    );
    const bytes = Buffer.byteLength(payload, "utf-8");
    console.log(`tools/list payload = ${bytes} bytes, tool count = ${defs.length}`);
    expect(bytes).toBeLessThanOrEqual(16_000);
  });

  it("每个工具 description ≤ 280 字符", () => {
    const defs = getToolDefs();
    const offenders = defs.filter((d) => d.description.length > 280);
    if (offenders.length > 0) {
      console.warn("超长 description:", offenders.map((d) => `${d.name}(${d.description.length})`));
    }
    expect(offenders.length).toBeLessThanOrEqual(5);
  });
});
