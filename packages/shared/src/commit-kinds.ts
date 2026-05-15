// Single source of truth for vortex_fill commit driver kinds.
//
// Consumed by:
// - packages/extension/src/patterns/commit-drivers.ts (CommitKind type + runtime registry)
// - packages/mcp/src/tools/schemas-public.ts (vortex_fill.kind enum)
// - packages/mcp/src/tools/schemas.ts (internal vortex_fill / vortex_fill_form enums)
//
// Adding or removing a kind requires implementing / removing the corresponding
// driver in commit-drivers.ts AND updating dom.ts commit handler switch.
// I15 invariant test locks public schema enum === COMMIT_KINDS to prevent drift.

export const COMMIT_KINDS = [
  "daterange",
  "datetimerange",
  "cascader",
  "select",
  "time",
  "checkbox-group",
] as const;

export type CommitKind = (typeof COMMIT_KINDS)[number];
