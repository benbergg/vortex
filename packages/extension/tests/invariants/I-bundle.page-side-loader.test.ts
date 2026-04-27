// I-bundle: page-side bundle can be loaded via chrome.scripting.executeScript({ files }),
// and the IIFE self-executes and attaches global variables to window.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  loadPageSideModule,
  _resetPageSideLoader,
} from "../../src/adapter/page-side-loader.js";

declare global {
  // eslint-disable-next-line no-var
  var chrome: any;
}

describe("I-bundle: page-side-loader idempotent loading of page-side bundles", () => {
  beforeEach(() => {
    _resetPageSideLoader();
    globalThis.chrome = {
      scripting: {
        executeScript: vi.fn(async () => [{ result: undefined }]),
      },
      tabs: {
        onRemoved: { addListener: vi.fn() },
      },
    };
  });

  it("first load of module calls executeScript once", async () => {
    await loadPageSideModule(1, undefined, "actionability");
    expect(globalThis.chrome.scripting.executeScript).toHaveBeenCalledTimes(1);
    const call = globalThis.chrome.scripting.executeScript.mock.calls[0][0];
    expect(call.files).toEqual(["page-side/actionability.js"]);
    expect(call.world).toBe("MAIN");
    expect(call.target).toMatchObject({ tabId: 1 });
  });

  it("repeated loads of same tab+frame+module hit cache", async () => {
    await loadPageSideModule(1, undefined, "actionability");
    await loadPageSideModule(1, undefined, "actionability");
    await loadPageSideModule(1, undefined, "actionability");
    expect(globalThis.chrome.scripting.executeScript).toHaveBeenCalledTimes(1);
  });

  it("different tabs load independently", async () => {
    await loadPageSideModule(1, undefined, "actionability");
    await loadPageSideModule(2, undefined, "actionability");
    expect(globalThis.chrome.scripting.executeScript).toHaveBeenCalledTimes(2);
  });

  it("different frames load independently", async () => {
    await loadPageSideModule(1, undefined, "actionability");
    await loadPageSideModule(1, 100, "actionability");
    expect(globalThis.chrome.scripting.executeScript).toHaveBeenCalledTimes(2);
  });

  it("different modules load independently", async () => {
    await loadPageSideModule(1, undefined, "actionability");
    await loadPageSideModule(1, undefined, "fill-reject");
    expect(globalThis.chrome.scripting.executeScript).toHaveBeenCalledTimes(2);
  });
});
