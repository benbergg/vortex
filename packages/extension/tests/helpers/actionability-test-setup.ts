// Shared setup helpers for I3-I9 actionability + auto-wait invariant tests.
//
// Design:
// - loadPageSideModule is mocked via vi.mock in each test file (no-op for files-based calls)
// - setupActionabilityEnv: creates JSDOM, assigns jsdom globals to globalThis so that
//   page-side probe functions (running via executeScript mock) can access HTMLElement, getComputedStyle, etc.
// - The page-side IIFE is loaded via vi.resetModules() + dynamic import in each test's beforeEach,
//   so it re-executes on the fresh globalThis.window for each test.
//
// jsdom limitations handled:
// - checkVisibility: not implemented → page-side fallback uses getComputedStyle + rect check
// - elementFromPoint: not implemented → injected via Object.defineProperty (caller override supported)
// - requestAnimationFrame: not implemented → setTimeout-0 shim (fake timers can control it)
// - getBoundingClientRect: always 0×0 → per-element mocks added by individual tests when needed

import { vi } from "vitest";
import { JSDOM } from "jsdom";

export interface ActionabilityEnvOptions {
  /** HTML string for the jsdom document */
  html: string;
  /**
   * Override for document.elementFromPoint.
   * Default: returns null (any visible element → OBSCURED via receivesEvents check).
   * Pass a function that returns the target element to simulate "target receives events".
   */
  elementFromPoint?: (x: number, y: number) => Element | null;
}

/**
 * Set up a fresh jsdom environment + chrome mock for one actionability test.
 * Must be called before the dynamic import of the page-side IIFE.
 *
 * Usage pattern (inside each it() or beforeEach):
 *   vi.resetModules();
 *   const dom = setupActionabilityEnv({ html: '...' });
 *   await import("../../src/page-side/actionability.js");
 *   const { checkActionability } = await import("../../src/action/actionability.js");
 *
 * Returns the JSDOM instance for per-element mocking (e.g. getBoundingClientRect).
 */
export function setupActionabilityEnv(opts: ActionabilityEnvOptions): JSDOM {
  const dom = new JSDOM(opts.html);
  const win = dom.window as any;

  // Expose jsdom window as globalThis.window + document so probe functions can reference
  // browser globals (HTMLElement, getComputedStyle, document, requestAnimationFrame, etc.).
  globalThis.window = win;
  globalThis.document = dom.window.document as unknown as Document;

  // Expose jsdom browser globals needed by the page-side probe function body
  // (the probe runs via executeScript mock which calls the function directly in process context).
  (globalThis as any).HTMLElement = win.HTMLElement;
  (globalThis as any).getComputedStyle = win.getComputedStyle.bind(win);

  // jsdom does not implement requestAnimationFrame; provide a minimal shim.
  // Callbacks are dispatched via setTimeout(0) so fake timers can advance them.
  win.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    return setTimeout(() => cb(0), 0) as unknown as number;
  };
  win.cancelAnimationFrame = (id: unknown): void => {
    clearTimeout(id as ReturnType<typeof setTimeout>);
  };
  // Also expose on globalThis for direct access inside probe bodies.
  (globalThis as any).requestAnimationFrame = win.requestAnimationFrame;
  (globalThis as any).cancelAnimationFrame = win.cancelAnimationFrame;

  // jsdom does not implement document.elementFromPoint; inject it.
  const efp = opts.elementFromPoint ?? ((_x: number, _y: number) => null);
  Object.defineProperty(dom.window.document, "elementFromPoint", {
    value: efp,
    writable: true,
    configurable: true,
  });

  // Chrome scripting mock: handles func-based calls (pageQuery / probe) and ignores files-based calls.
  // files-based: loadPageSideModule is mocked as a no-op via vi.mock in each test file.
  globalThis.chrome = {
    scripting: {
      executeScript: async (callOpts: any) => {
        if (typeof callOpts.func === "function") {
          // Probe functions may be async (probe / probeStable return Promises).
          const result = await Promise.resolve(callOpts.func(...(callOpts.args ?? [])));
          return [{ result }];
        }
        // files-based: no-op (IIFE already loaded via dynamic import in each test).
        return [{}];
      },
    },
    tabs: {
      onRemoved: { addListener: vi.fn() },
    },
  };

  return dom;
}
