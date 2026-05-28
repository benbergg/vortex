import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Regression lock for the inline-onclick selector added in v0.8.x
 * (VORTEX_FEEDBACK voc-front 档 2). Without this entry in
 * INTERACTIVE_SELECTORS, observe misses business actions wired as
 *
 *   <div onclick="...">    (Zentao legacy panels)
 *   <a onclick="..." href="#">  (phpMyAdmin admin rows)
 *   <span onclick="...">   (random .net WebForms grids)
 *
 * on jQuery-era PHP / WebForms backoffice pages. These elements
 * usually lack semantic role AND cursor:pointer CSS, so neither the
 * static whitelist nor the cursor:pointer fallback would catch them.
 *
 * Why source-level: the alternative is mocking a full jsdom tree and
 * stubbing chrome.scripting.executeScript, which adds noise without
 * proving the selector list is authoritative. We just want a hard
 * lock on the selectors string.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const OBSERVE_SRC = readFileSync(
  join(__dirname, "..", "src", "handlers", "observe.ts"),
  "utf8",
);

describe("observe inline [onclick] selector (@since 0.8.x voc-front feedback)", () => {
  it("INTERACTIVE_SELECTORS includes the bare [onclick] attribute selector", () => {
    expect(OBSERVE_SRC).toMatch(/INTERACTIVE_SELECTORS\s*=\s*\[[\s\S]*?"\[onclick\]"/);
  });

  it("[onclick] sits in the same array as the semantic selectors (not in an unrelated string)", () => {
    // Catch a regression where someone deletes the entry but leaves a
    // stray "[onclick]" elsewhere in the file (comment / log message).
    const arrayMatch = OBSERVE_SRC.match(
      /const INTERACTIVE_SELECTORS\s*=\s*\[([\s\S]*?)\]\.join\(",",?\s*\);?/,
    );
    expect(arrayMatch).not.toBeNull();
    expect(arrayMatch![1]).toContain('"[onclick]"');
  });
});
