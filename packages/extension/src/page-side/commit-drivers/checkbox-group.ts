// element-plus checkbox-group COMMIT page-side driver (IIFE, attaches to window.__vortexCommitCheckboxGroup).
// Migrated from dom.ts COMMIT handler driverId === "element-plus-checkbox-group" branch (L1107-1195).
//
// Host-side call:
//   await loadPageSideModule(tabId, frameId, 'commit-checkbox-group')
//   const result = await nativePageQuery(tabId, frameId,
//     (sel, closestSelector, val, timeoutMs) =>
//       (window as any).__vortexCommitCheckboxGroup.run(sel, closestSelector, val, timeoutMs),
//     [selector, driver.closestSelector, value, timeout])

(function () {
  if ((window as any).__vortexCommitCheckboxGroup?.version === 1) return;

  // Page-side inline helpers (matching original dom.ts page-side func; cannot import across files)
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /**
   * Run checkbox-group commit.
   * - sel: element selector (the target element passed by agent)
   * - closestSelector: driver's closestSelector (".el-checkbox-group")
   * - val: string[] or { values: string[] } (selected labels)
   * - timeoutMs: overall operation timeout
   *
   * Returns: { result?, error?, errorCode?, stage?, extras? } — same contract as dom.ts COMMIT path.
   */
  async function run(
    sel: string,
    closestSelector: string,
    val: unknown,
    timeoutMs: number,
  ): Promise<{
    result?: unknown;
    error?: string;
    errorCode?: string;
    stage?: string;
    extras?: Record<string, unknown>;
  }> {
    // Resolve root element (mirrors dom.ts L939-958 element resolution block)
    const els = document.querySelectorAll(sel);
    if (els.length === 0) return { error: `Element not found: ${sel}`, errorCode: "ELEMENT_NOT_FOUND" };
    if (els.length > 1)
      return {
        error: `Selector "${sel}" matched ${els.length} elements`,
        errorCode: "SELECTOR_AMBIGUOUS",
        extras: { matchCount: els.length },
      };
    const target = els[0] as HTMLElement;
    const root = (target.closest(closestSelector) ??
      target.querySelector(closestSelector)) as HTMLElement | null;
    if (!root)
      return {
        error: `Target does not match driver closestSelector "${closestSelector}" (neither ancestor nor descendant)`,
        errorCode: "UNSUPPORTED_TARGET",
        extras: { driverId: "element-plus-checkbox-group" },
      };

    // -------- Element Plus checkbox-group driver (O-10, @since 0.4.0) --------
    // Accept two shapes: value: string[] (recommended, concise) or { values: string[] } (compat)
    const v = val as { values?: string[] } | string[];
    const labels: string[] | null = Array.isArray(v)
      ? (v as string[])
      : Array.isArray(v?.values)
        ? (v.values as string[])
        : null;
    if (!labels) {
      return {
        error: `value must be string[] or { values: string[] }, got ${JSON.stringify(v)}`,
        errorCode: "INVALID_PARAMS",
      };
    }
    const target2 = new Set(labels.map((s) => String(s).trim()));

    // Support button style (.el-checkbox-button) and label style (.el-checkbox)
    const btns = Array.from(
      root.querySelectorAll(".el-checkbox-button, .el-checkbox"),
    ) as HTMLElement[];
    if (btns.length === 0) {
      return {
        error: "No .el-checkbox-button or .el-checkbox children under .el-checkbox-group",
        errorCode: "COMMIT_FAILED",
        stage: "resolve-buttons",
      };
    }
    const unknownTargets = [...target2].filter(
      (name) => !btns.some((b) => (b.innerText || "").trim() === name),
    );
    if (unknownTargets.length > 0) {
      const available = btns.map((b) => (b.innerText || "").trim());
      return {
        error: `Unknown label(s): ${unknownTargets.join(",")}. Available: ${available.join(",")}`,
        errorCode: "INVALID_PARAMS",
        extras: { unknownTargets, available },
      };
    }

    // Click each checkbox sequentially, letting Vue run a microtask/animation frame between.
    // Direct sync forEach would be merged by Element Plus click-group into "only last click wins".
    const dispatchReal = (el: HTMLElement) => {
      const input = el.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      // Clicking label is more stable: label has @click.prevent + Vue side updates v-model
      if (input) input.click();
      else el.click();
    };
    const tick = () => new Promise((r) => setTimeout(r, 40));

    const toggled: string[] = [];
    for (const b of btns) {
      const name = (b.innerText || "").trim();
      const isChecked = b.classList.contains("is-checked");
      const shouldCheck = target2.has(name);
      if (isChecked === shouldCheck) continue;
      dispatchReal(b);
      toggled.push(name);
      await tick();
    }

    // Verify: re-read actual checked state and require it matches target
    const checkedNow = btns
      .filter((b) => b.classList.contains("is-checked"))
      .map((b) => (b.innerText || "").trim())
      .sort();
    const wanted = [...target2].sort();
    const ok =
      checkedNow.length === wanted.length &&
      checkedNow.every((n, i) => n === wanted[i]);
    if (!ok) {
      return {
        error: `Checkbox state did not converge: got [${checkedNow.join(",")}], expected [${wanted.join(",")}]`,
        errorCode: "COMMIT_FAILED",
        stage: "verify",
        extras: { checkedNow, wanted, toggled },
      };
    }

    return {
      result: {
        success: true,
        driver: "element-plus-checkbox-group",
        checked: checkedNow,
        toggled,
      },
    };
  }

  (window as any).__vortexCommitCheckboxGroup = {
    version: 1,
    run,
  };
})();

export {};
