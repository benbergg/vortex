// FILL_REJECT_PATTERNS probe (IIFE, attaches to window.__vortexFillReject).
// T2.7a will migrate from dom.ts FILL handler page-side func.

(function () {
  (window as unknown as { __vortexFillReject: Record<string, unknown> }).__vortexFillReject = {
    placeholder: true,
  };
})();

export {};
