/**
 * Author: qingwa
 * Description: Verify cdpClickElement accepts a `force` option that is plumbed
 *   through to the page-side probe so the occlusion check (ELEMENT_OCCLUDED)
 *   is skipped when force=true. All other actionability checks (not found /
 *   ambiguous / disabled / detached) still apply — only occlusion is gated.
 *
 * Why inspect the source string (not the page-side func body directly):
 *   The page-side function inside nativePageQuery is a stringified closure
 *   passed to chrome.scripting.executeScript — vitest/jsdom cannot evaluate
 *   it. We verify the source shape (signature + force guard around
 *   ELEMENT_OCCLUDED) to prove the wiring is in place. Runtime correctness
 *   is covered by the dogfood against JD appliance / apparel cards.
 */
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CDP_TS = resolve(__dirname, "../src/adapter/cdp.ts");

describe("cdpClickElement force option", () => {
  it("page-side probe skips occlusion when force=true", async () => {
    const src = await readFile(CDP_TS, "utf8");
    // Find the page-side func inside nativePageQuery — the `func: (sel: string`
    // arrow literal that is the third arg of the call. Be tolerant of any
    // signature shape so the test still locates the body if the param list
    // changes (e.g. additions for future options).
    const start = src.indexOf("(sel: string");
    // Find the args-array closer that follows. The args array currently is
    // [selector, options.force ?? false] — match the `],\n  );` boundary
    // that closes the call.
    const end = src.indexOf("],\n  );", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const body = src.slice(start, end);
    // Page-side func should declare `force: boolean` as a second param.
    expect(body).toMatch(/sel: string,\s*force: boolean/);
    // The ELEMENT_OCCLUDED branch must be gated by `if (!force) { ... }`.
    expect(body).toMatch(/if\s*\(\s*!force\s*\)\s*\{[\s\S]*?ELEMENT_OCCLUDED/);
  });

  it("forwards force flag in the args array", async () => {
    const src = await readFile(CDP_TS, "utf8");
    expect(src).toMatch(/\[selector,\s*options\.force\s*\?\?\s*false\]/);
  });

  it("public signature accepts options.force", async () => {
    const src = await readFile(CDP_TS, "utf8");
    expect(src).toMatch(
      /export async function cdpClickElement\([\s\S]*?options: \{ force\?: boolean \} = \{\}/,
    );
  });
});
