import { describe, it, expect } from "vitest";
import { COMMIT_DRIVERS, findDriver } from "../src/patterns/commit-drivers.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * O-10 checkbox-group driver contract tests.
 *
 * Running Element Plus DOM requires full jsdom + Vue which is too expensive;
 * instead we lock two key invariants:
 *  1. The registry has element-plus-checkbox-group driver
 *  2. The page-side bundle contains core protections: sequential click + Vue tick gap + final verify
 *     (migrated from dom.ts to page-side bundle in T2.7a)
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const DOM_SRC = readFileSync(
  join(__dirname, "..", "src", "page-side", "commit-drivers", "checkbox-group.ts"),
  "utf8",
);

describe("checkbox-group driver registry (@since 0.4.0 O-10)", () => {
  it("exposes checkbox-group kind and finds element-plus-checkbox-group driver", () => {
    const d = findDriver("checkbox-group");
    expect(d?.id).toBe("element-plus-checkbox-group");
    expect(d?.closestSelector).toBe(".el-checkbox-group");
  });

  it("driver summary explains the Vue batching trap", () => {
    const d = findDriver("checkbox-group");
    expect(d?.summary).toMatch(/batch|Vue|sequentially/i);
  });

  it("all drivers still discoverable by kind", () => {
    expect(findDriver("datetimerange")?.id).toBe("element-plus-datetimerange");
    expect(findDriver("daterange")?.id).toBe("element-plus-daterange");
  });
});

describe("checkbox-group page-side implementation (dom.ts source contract)", () => {
  it("dispatches input click one-by-one with await tick() to let Vue reactivity catch every toggle", () => {
    // 关键：必须有 for…of + await tick，不能是 forEach / Promise.all
    expect(DOM_SRC).toMatch(/for\s*\(\s*const\s+b\s+of\s+btns/);
    expect(DOM_SRC).toMatch(/await\s+tick\(\)/);
    // tick 的实现：setTimeout > 20ms（给 Vue 一个 render cycle）
    expect(DOM_SRC).toMatch(
      /tick\s*=\s*\(\s*\)\s*=>\s*new\s+Promise\(\s*\(r\)\s*=>\s*setTimeout\(\s*r\s*,\s*(?:30|40|50)\s*\)/,
    );
  });

  it("reads current .is-checked (not v-model) to diff against target", () => {
    // 只读 class 判定是否已勾选
    expect(DOM_SRC).toMatch(/classList\.contains\(["']is-checked["']\)/);
  });

  it("is idempotent: only toggles when isChecked !== shouldCheck", () => {
    expect(DOM_SRC).toMatch(/if\s*\(\s*isChecked\s*===\s*shouldCheck\s*\)\s*continue/);
  });

  it("verifies final state and returns COMMIT_FAILED with checkedNow on divergence", () => {
    expect(DOM_SRC).toMatch(
      /Checkbox state did not converge[\s\S]{0,200}?errorCode:\s*["']COMMIT_FAILED["']/,
    );
    expect(DOM_SRC).toMatch(/stage:\s*["']verify["']/);
  });

  it("rejects unknown label names with INVALID_PARAMS + available list", () => {
    expect(DOM_SRC).toMatch(/unknownTargets/);
    expect(DOM_SRC).toMatch(/Available:\s*\$\{available/);
  });
});
