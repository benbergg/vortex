import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import baseline from "../../baselines/v0.4.json" with { type: "json" };
import { scan } from "../../dist/scanner.js";
import { renderObserveCompact } from "../../../mcp/dist/src/lib/observe-render.js";

describe("baseline sanity", () => {
  it("baseline 文件有 toolsList + fixtures 字段", () => {
    expect(baseline).toHaveProperty("toolsList");
    expect(baseline).toHaveProperty("fixtures");
    const fixtures = (baseline as { fixtures: Record<string, unknown> }).fixtures;
    expect(Object.keys(fixtures).length).toBeGreaterThanOrEqual(6);
  });
  it("toolsList bytes 已记录", () => {
    const tl = (baseline as { toolsList: { bytes: number; tokens: number; toolCount: number } }).toolsList;
    expect(tl.bytes).toBeGreaterThan(0);
    expect(tl.tokens).toBeGreaterThan(0);
    console.log(`v0.4 baseline tools/list: ${tl.bytes} bytes / ${tl.tokens} tokens / ${tl.toolCount} tools`);
  });
});

function loadFixture(relPath: string) {
  const html = readFileSync(
    new URL(`../../fixtures/real-worldish/${relPath}`, import.meta.url),
    "utf-8",
  );
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  Object.defineProperty(dom.window.Element.prototype, "getBoundingClientRect", {
    value() { return { x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 24, width: 100, height: 24 }; },
    configurable: true,
  });
  return { doc: dom.window.document, win: dom.window as unknown as Window };
}

describe("compact observe bytes vs v0.4 baseline", () => {
  // 阈值说明：
  //   中文 UI：名称含多字节字符，3072 B/100 元素（3 KB）
  //   ASCII 长列表（raw-html-long）：实测 2632 B/100，取 2700 留 2.6% 余量
  //   shadcn-saas：仅 10 个元素，固定头部开销摊销后 perHundred=3390；
  //     实际总字节仅 339 B（极小），设 3500 避免少量元素时固定开销放大导致误判
  const cases = [
    { path: "ep-erp-goods/index.static.html", maxBytesPer100: 3072, note: "中文 UI" },
    { path: "antd-dashboard/index.html", maxBytesPer100: 3072, note: "中文 UI" },
    { path: "shadcn-saas/index.html", maxBytesPer100: 3500, note: "ASCII 中混（元素少，固定开销摊销后偏高）" },
    { path: "raw-html-long/index.html", maxBytesPer100: 2700, note: "ASCII 长列表" },
  ];
  for (const c of cases) {
    it(`${c.path} (${c.note}): compact ≤ ${c.maxBytesPer100} B / 100 元素`, () => {
      const deps = loadFixture(c.path);
      const { elements } = scan(deps, { viewport: "full", maxElements: 100, detail: "compact" });
      const text = renderObserveCompact({
        snapshotId: "s_test",
        url: "file:///" + c.path,
        elements: elements.map((e) => ({
          index: e.index,
          tag: e.tag,
          role: e.role,
          name: e.name,
          state: e.state,
          frameId: 0,
        })),
      });
      const bytes = Buffer.byteLength(text, "utf-8");
      const perHundred = elements.length > 0 ? (bytes / elements.length) * 100 : 0;
      console.log(`${c.path}: ${elements.length} elems, ${bytes} B total, ${perHundred.toFixed(0)} B / 100`);
      expect(perHundred).toBeLessThanOrEqual(c.maxBytesPer100);
    });
  }

  it("raw-html-long: 对照 v0.4 基线，compact 比 full 小至少 90%", () => {
    const deps = loadFixture("raw-html-long/index.html");
    const { elements } = scan(deps, { viewport: "full", maxElements: 200, detail: "compact" });
    const text = renderObserveCompact({
      snapshotId: "s_test",
      url: "file:///raw-html-long",
      elements: elements.map((e) => ({
        index: e.index,
        tag: e.tag,
        role: e.role,
        name: e.name,
        state: e.state,
        frameId: 0,
      })),
    });
    const compactBytes = Buffer.byteLength(text, "utf-8");
    const v04Bytes = (baseline as any).fixtures["raw-html-long/index.html"].bytes as number;
    const reduction = 1 - compactBytes / v04Bytes;
    console.log(`raw-html-long: v0.4=${v04Bytes} B, compact=${compactBytes} B, reduction=${(reduction * 100).toFixed(1)}%`);
    expect(reduction).toBeGreaterThanOrEqual(0.9);
  });
});
