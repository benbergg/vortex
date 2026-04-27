// element-plus select COMMIT page-side driver (IIFE).
// T2.7a will migrate from dom.ts COMMIT handler L1198-1283.

(function () {
  (window as unknown as { __vortexCommitSelect: Record<string, unknown> }).__vortexCommitSelect = {
    placeholder: true,
  };
})();

export {};
