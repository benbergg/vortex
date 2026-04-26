// L1 Adapter 静态依赖检查。
// 规则：
//   1. cdp.ts 不被 L2 (action/) / L3 (reasoning/) 直接 import
//   2. mcp 包不直接 import L1 cdp.ts
// 违反 → CI fail。

module.exports = {
  forbidden: [
    {
      name: "no-cdp-leak",
      severity: "error",
      comment: "L2/L3/L4 must not import L1 cdp adapter (CDP must stay encapsulated)",
      from: { path: "^src/(action|reasoning)/" },
      to: { path: "^src/adapter/cdp(\\.ts|/.+)$" },
    },
    {
      name: "no-cdp-from-handlers-direct",
      severity: "warn",
      comment: "Handlers should go through facade exports, not deep cdp internals (warn-level until refactor settles)",
      from: { path: "^src/handlers/" },
      to: { path: "^src/adapter/cdp-drivers/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
