// L2 Action: actionability check (host-side wrapper).
// T2.3b will implement; this is a stub so I3-I9 tests can resolve imports while skipped.

import type { PageSideModule } from "../adapter/page-side-loader.js";

export interface ActionabilityResult {
  ok: boolean;
  reason?:
    | "NOT_ATTACHED"
    | "NOT_VISIBLE"
    | "NOT_STABLE"
    | "OBSCURED"
    | "DISABLED"
    | "NOT_EDITABLE";
  extras?: Record<string, unknown>;
}

export interface ActionabilityOptions {
  needsEditable?: boolean;
}

export async function checkActionability(
  _tabId: number,
  _frameId: number | undefined,
  _selector: string,
  _opts?: ActionabilityOptions,
): Promise<ActionabilityResult> {
  throw new Error("Not implemented yet — T2.3b will implement checkActionability");
}

// Module reference to avoid unused-import warning while T2.3b not yet wired up.
export type _PageSideModuleRef = PageSideModule;
