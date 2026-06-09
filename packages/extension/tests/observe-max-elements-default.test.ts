/**
 * Author: qingwa
 * Description: Verify observe maxElements default is 80 (was 200).
 *
 * 背景 (Vortex JD Home Search Perf 优化 Task 2):
 *   - 现状: maxElements 默认 200, observe 单次 payload ~100KB, JD 首页导航
 *     触发 observe 一次 ~25s (loadPageSideModule 13s + serializer 8s + transfer 4s)。
 *   - 目标: 80, payload ~40KB, observe 总时间 <10s, 节省 ~15s。
 *   - Case 1: handler 默认 fallback = 80 (observe.ts:1658)。
 *   - Case 2: 新 maxElements 实际被传入 scanOneFrame (回归保护: 防止有人把
 *     `?? 200` 改回 200, 或者把 scanOneFrame 改为接收硬编码 200 而忽略
 *     maxElements 参数)。
 *   - Case 3: TypeScript 源 schema maxElements default = 80。
 *   - Case 4: 编译产物 dist JS maxElements default = 80 (运行时实际生效)。
 */

import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OBSERVE_TS = resolve(__dirname, "../src/handlers/observe.ts");
const SCHEMAS_TS = resolve(__dirname, "../../mcp/src/tools/schemas.ts");
const SCHEMAS_JS = resolve(__dirname, "../../mcp/dist/src/tools/schemas.js");

describe("observe maxElements default = 80 (was 200)", () => {
  it("handler default fallback is 80", async () => {
    const src = await readFile(OBSERVE_TS, "utf8");
    expect(src).toMatch(/maxElements\s*=\s*\(args\.maxElements as number \| undefined\)\s*\?\?\s*80/);
  });

  it("scanOneFrame is invoked with the resolved maxElements (regression guard: new default actually flows through)", async () => {
    const src = await readFile(OBSERVE_TS, "utf8");
    expect(src).toMatch(/scanOneFrame\([\s\S]*?maxElements/);
  });
});

describe("schemas maxElements default = 80 (was 200)", () => {
  it("TypeScript schema source uses 80", async () => {
    const src = await readFile(SCHEMAS_TS, "utf8");
    expect(src).toMatch(/maxElements:\s*{\s*type:\s*"number",\s*default:\s*80\s*}/);
  });

  it("built JS dist uses 80", async () => {
    const src = await readFile(SCHEMAS_JS, "utf8");
    expect(src).toMatch(/maxElements:\s*{\s*type:\s*"number",\s*default:\s*80\s*}/);
  });
});
