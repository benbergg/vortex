import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { JSDOM } from "jsdom";
import { encodingForModel } from "js-tiktoken";
import { scan } from "../dist/scanner.js";
import { getToolDefs } from "../../mcp/dist/src/tools/registry.js";

const enc = encodingForModel("gpt-4o");

function tokens(s: string): number {
  return enc.encode(s).length;
}

function loadFixture(relPath: string) {
  const html = readFileSync(
    new URL(`../fixtures/real-worldish/${relPath}`, import.meta.url),
    "utf-8",
  );
  const dom = new JSDOM(html);
  Object.defineProperty(dom.window.Element.prototype, "getBoundingClientRect", {
    value() { return { x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 24, width: 100, height: 24 }; },
    configurable: true,
  });
  return { doc: dom.window.document, win: dom.window as unknown as Window };
}

const fixtures = [
  "ep-erp-goods/index.static.html",
  "ep-login-cascader/index.static.html",
  "antd-dashboard/index.html",
  "shadcn-saas/index.html",
  "vuetify-settings/index.static.html",
  "raw-html-long/index.html",
];

const out: Record<string, unknown> = {
  recordedAt: new Date().toISOString(),
  version: "v0.4-baseline",
};

const toolsPayload = JSON.stringify(
  getToolDefs().map((d) => ({ name: d.name, description: d.description, inputSchema: d.schema })),
);
out.toolsList = {
  bytes: Buffer.byteLength(toolsPayload, "utf-8"),
  tokens: tokens(toolsPayload),
  toolCount: getToolDefs().length,
};

const fixturesOut: Record<string, unknown> = {};
for (const path of fixtures) {
  const deps = loadFixture(path);
  const { elements } = scan(deps, { viewport: "full", detail: "full", maxElements: 200 });
  const simulated = {
    snapshotId: "snap_baseline",
    version: 2,
    url: "file:///" + path,
    elements: elements.map((e) => ({
      ...e,
      frameId: 0,
      suggestedUsage: {
        domClick: `vortex_dom_click({ index: ${e.index}, snapshotId: "<this-snapshot-id>" })`,
        click: `vortex_mouse_click({ x: 50, y: 12, frameId: 0 })`,
      },
    })),
  };
  const str = JSON.stringify(simulated, null, 2);
  fixturesOut[path] = {
    elementCount: elements.length,
    bytes: Buffer.byteLength(str, "utf-8"),
    tokens: tokens(str),
  };
}
out.fixtures = fixturesOut;

const outPath = new URL("../baselines/v0.4.json", import.meta.url);
mkdirSync(dirname(outPath.pathname), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log("baseline written:", JSON.stringify(out, null, 2));
