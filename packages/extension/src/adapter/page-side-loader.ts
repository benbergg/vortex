// L1 Page-side Bundle Loader: inject page-side bundle into target tab+frame MAIN world
// via chrome.scripting.executeScript({ files }).
//
// Design:
// - Idempotent: maintain (tabId, frameId, module) loaded set, repeated calls are no-op
// - Concurrent-safe: in-flight promise is stored so parallel callers await the same execution
// - MAIN world: same as PR #1 pageQuery to avoid framework isolation
// - module names centralized to avoid typos and aid grep

import { buildExecuteTarget } from "../lib/tab-utils.js";

export type PageSideModule =
  | "actionability"
  | "fill-reject"
  | "commit-checkbox-group"
  | "commit-select";

const loadedModules = new Map<string, true | Promise<void>>();

function key(tabId: number, frameId: number | undefined, module: PageSideModule): string {
  return `${tabId}::${frameId ?? "top"}::${module}`;
}

export async function loadPageSideModule(
  tabId: number,
  frameId: number | undefined,
  module: PageSideModule,
): Promise<void> {
  const k = key(tabId, frameId, module);
  const cached = loadedModules.get(k);
  if (cached === true) return;
  if (cached !== undefined) {
    // in-flight — await the same promise
    await cached;
    return;
  }

  const target = buildExecuteTarget(tabId, frameId);
  const promise = chrome.scripting
    .executeScript({
      target,
      files: [`page-side/${module}.js`],
      world: "MAIN",
    })
    .then(() => {
      loadedModules.set(k, true);
    })
    .catch((err: unknown) => {
      // On failure, evict the in-flight entry so retries are possible.
      loadedModules.delete(k);
      throw err;
    });

  loadedModules.set(k, promise);
  await promise;
}

export function _resetPageSideLoader(): void {
  loadedModules.clear();
}

// Tab cleanup: clear cache entries when a tab closes during this SW lifetime.
// SW restarts already empty `loadedModules`, so this listener only handles
// in-session tab closures (preventing unbounded growth on long-lived SWs).
if (typeof chrome !== "undefined" && chrome.tabs?.onRemoved) {
  chrome.tabs.onRemoved.addListener((tabId) => {
    for (const k of Array.from(loadedModules.keys())) {
      if (k.startsWith(`${tabId}::`)) loadedModules.delete(k);
    }
  });
}
