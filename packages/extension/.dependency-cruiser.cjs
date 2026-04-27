// L1 Adapter 静态依赖检查。
// 规则：
//   1. cdp.ts 仅 adapter/ + handlers/ (legacy dom.ts) + lib/ 可 import，其余目录禁（反向白名单）
//   2. handlers 不直接 import cdp-drivers 内部（warn）
// 违反 → CI fail。
// 注：mcp 包跨 package 物理隔离（无 workspace dep on extension），不需 depcruise 规则 enforce。

module.exports = {
  forbidden: [
    {
      name: "no-cdp-leak",
      severity: "error",
      comment:
        "CDP adapter is L1 internal. Allowed importers: adapter/ + handlers/ (legacy dom.ts) + lib/. Future L2/L3/L4 (action/reasoning/events/patterns/content/background) must go through facade.",
      from: { path: "^src/", pathNot: "^src/(adapter|handlers|lib)/" },
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
