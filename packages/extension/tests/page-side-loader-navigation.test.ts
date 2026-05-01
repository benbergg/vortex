import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// Regression for the v0.6 dogfood Bug E: page-side-loader cached
// "loaded=true" forever, so a chrome navigation discarded
// window.__vortexActionability but the next loadPageSideModule call still
// short-circuited and the actionability probe wrapper returned NOT_ATTACHED
// for the entire 5 s retry loop. Fix: subscribe to
// chrome.webNavigation.onCommitted and evict matching cache entries.

interface NavListener {
  (details: { tabId: number; frameId: number }): void;
}
interface TabListener {
  (tabId: number): void;
}

let executeScriptMock: Mock;
let onCommittedFire: NavListener;
let onRemovedFire: TabListener;

async function importLoaderWithFreshChrome() {
  vi.resetModules();
  executeScriptMock = vi.fn().mockResolvedValue([{ result: undefined }]);

  let committedCb: NavListener | undefined;
  let removedCb: TabListener | undefined;

  (globalThis as any).chrome = {
    scripting: { executeScript: executeScriptMock },
    tabs: {
      onRemoved: {
        addListener: vi.fn((cb: TabListener) => {
          removedCb = cb;
        }),
      },
    },
    webNavigation: {
      onCommitted: {
        addListener: vi.fn((cb: NavListener) => {
          committedCb = cb;
        }),
      },
    },
  };

  const mod = await import("../src/adapter/page-side-loader.js");
  if (!committedCb) throw new Error("loader did not register webNavigation listener");
  if (!removedCb) throw new Error("loader did not register tabs.onRemoved listener");
  onCommittedFire = committedCb;
  onRemovedFire = removedCb;
  return mod;
}

describe("page-side-loader navigation cache invalidation (Bug E)", () => {
  beforeEach(() => {
    delete (globalThis as any).chrome;
  });

  it("repeat load on cached entry skips chrome.scripting.executeScript", async () => {
    const { loadPageSideModule } = await importLoaderWithFreshChrome();
    await loadPageSideModule(100, undefined, "actionability");
    expect(executeScriptMock).toHaveBeenCalledTimes(1);
    executeScriptMock.mockClear();
    await loadPageSideModule(100, undefined, "actionability");
    expect(executeScriptMock).not.toHaveBeenCalled();
  });

  it("main-frame navigation evicts every cache entry for that tab", async () => {
    const { loadPageSideModule } = await importLoaderWithFreshChrome();
    await loadPageSideModule(100, undefined, "actionability");
    await loadPageSideModule(100, undefined, "fill-reject");
    await loadPageSideModule(200, undefined, "actionability");
    executeScriptMock.mockClear();

    onCommittedFire({ tabId: 100, frameId: 0 });

    // Both entries on tab 100 must re-inject; tab 200 stays cached.
    await loadPageSideModule(100, undefined, "actionability");
    expect(executeScriptMock).toHaveBeenCalledTimes(1);
    await loadPageSideModule(100, undefined, "fill-reject");
    expect(executeScriptMock).toHaveBeenCalledTimes(2);
    await loadPageSideModule(200, undefined, "actionability");
    expect(executeScriptMock).toHaveBeenCalledTimes(2);
  });

  it("subframe navigation evicts only that frameId, leaves siblings cached", async () => {
    const { loadPageSideModule } = await importLoaderWithFreshChrome();
    await loadPageSideModule(100, 0, "actionability");
    await loadPageSideModule(100, 5, "actionability");
    executeScriptMock.mockClear();

    onCommittedFire({ tabId: 100, frameId: 5 });

    await loadPageSideModule(100, 5, "actionability");
    expect(executeScriptMock).toHaveBeenCalledTimes(1);
    await loadPageSideModule(100, 0, "actionability");
    expect(executeScriptMock).toHaveBeenCalledTimes(1);
  });

  it("tabs.onRemoved still evicts entire tab (existing behaviour preserved)", async () => {
    const { loadPageSideModule } = await importLoaderWithFreshChrome();
    await loadPageSideModule(100, undefined, "actionability");
    await loadPageSideModule(100, 5, "actionability");
    await loadPageSideModule(200, undefined, "actionability");
    executeScriptMock.mockClear();

    onRemovedFire(100);

    await loadPageSideModule(100, undefined, "actionability");
    expect(executeScriptMock).toHaveBeenCalledTimes(1);
    await loadPageSideModule(100, 5, "actionability");
    expect(executeScriptMock).toHaveBeenCalledTimes(2);
    await loadPageSideModule(200, undefined, "actionability");
    expect(executeScriptMock).toHaveBeenCalledTimes(2);
  });
});
