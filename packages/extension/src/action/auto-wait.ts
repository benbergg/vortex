// L2 Action: auto-wait with RAF polling and reason-aware retry.
// T2.4 will implement; this is a stub so I9 / I5 tests can resolve imports while skipped.

import type { ActionabilityResult } from "./actionability.js";

export interface WaitActionableOptions {
  timeout?: number;
  needsEditable?: boolean;
}

export interface WaitActionableResult extends ActionabilityResult {
  attempts?: number;
}

export async function waitActionable(
  _tabId: number,
  _frameId: number | undefined,
  _selector: string,
  _opts?: WaitActionableOptions,
): Promise<WaitActionableResult> {
  throw new Error("Not implemented yet — T2.4 will implement waitActionable");
}
