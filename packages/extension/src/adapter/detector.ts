// L1 Capability Detector：探测当前环境能力，决定走 native / cdp 路径。

import type { CapabilityDetector } from "./types";

const DRAG_REQUIRES_CDP = true; // drag 操作 untrusted event 不可用，强制 CDP

/** 探测 chrome.debugger 是否可用且能成功 attach。 */
async function canUseCDP(tabId: number): Promise<boolean> {
  // 1) chrome.debugger 不存在 → false（service worker 环境异常 / 权限缺失）
  if (
    typeof chrome === "undefined" ||
    !chrome.debugger ||
    typeof chrome.debugger.attach !== "function"
  ) {
    return false;
  }

  // 2) 尝试 attach + detach（探测性，1 秒 budget）
  return await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), 1000);
    try {
      chrome.debugger.attach({ tabId }, "1.3", () => {
        clearTimeout(timer);
        const lastError = chrome.runtime?.lastError;
        if (lastError) {
          resolve(false);
          return;
        }
        // 立即 detach，避免泄漏
        chrome.debugger.detach({ tabId }, () => resolve(true));
      });
    } catch {
      clearTimeout(timer);
      resolve(false);
    }
  });
}

/** 判断操作是否要求 trusted event（启发式）。 */
function needsTrustedEvent(
  action: "click" | "fill" | "type" | "drag",
  elementHint?: { tagName?: string },
): boolean {
  if (action === "drag") return DRAG_REQUIRES_CDP;
  // 其他动作默认 untrusted event 即可（element-plus 等框架按 case 决定，由 L2 actionability 主导，PR #2 完善）。
  // PR #1 仅给 conservative 默认：click/fill/type 都不强制 trusted。
  void elementHint;
  return false;
}

export const capabilityDetector: CapabilityDetector = {
  canUseCDP,
  needsTrustedEvent,
};
