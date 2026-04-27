// Actionability 6-probe checks (IIFE, attaches to window.__vortexActionability).
// T2.3a will replace; T2.0a is placeholder so vite build passes.

(function () {
  (window as unknown as { __vortexActionability: Record<string, unknown> }).__vortexActionability = {
    placeholder: true,
  };
})();

export {};
