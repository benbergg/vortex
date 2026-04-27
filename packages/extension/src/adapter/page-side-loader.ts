// L1 Page-side Bundle Loader: inject page-side bundle into target tab+frame MAIN world
// via chrome.scripting.executeScript({ files }).
//
// Design:
// - Idempotent: maintain (tabId, frameId, module) loaded set, repeated calls are no-op
// - MAIN world: same as PR #1 pageQuery to avoid framework isolation
// - module names centralized to avoid typos and aid grep

import { buildExecuteTarget } from "../lib/tab-utils.js";

export type PageSideModule =
  | "actionability"
  | "fill-reject"
  | "commit-checkbox-group"
  | "commit-select";

const loadedModules = new Map<string, true>();

function key(tabId: number, frameId: number | undefined, module: PageSideModule): string {
  return `${tabId}::${frameId ?? "top"}::${module}`;
}

export async function loadPageSideModule(
  tabId: number,
  frameId: number | undefined,
  module: PageSideModule,
): Promise<void> {
  const k = key(tabId, frameId, module);
  if (loadedModules.has(k)) return;

  const target = buildExecuteTarget(tabId, frameId);
  await chrome.scripting.executeScript({
    target,
    files: [`page-side/${module}.js`],
    world: "MAIN",
  });
  loadedModules.set(k, true);
}

export function _resetPageSideLoader(): void {
  loadedModules.clear();
}

if (typeof chrome !== "undefined" && chrome.tabs?.onRemoved) {
  chrome.tabs.onRemoved.addListener((tabId) => {
    for (const k of Array.from(loadedModules.keys())) {
      if (k.startsWith(`${tabId}::`)) loadedModules.delete(k);
    }
  });
}
