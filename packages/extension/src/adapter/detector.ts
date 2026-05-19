// L1 Capability Detector：探测当前环境能力，决定走 native / cdp 路径。
// Wired into production via action/fallback.ts (drag / typed-input adapters).

import type { CapabilityDetector } from "./types.js";

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
  // timed-out flag：超时 resolve(false) 后 attach callback 仍可能成功 → 必须 detach 清理，
  // 否则 debugger 残留 attached 状态影响后续其他 CDP 调用（自身 driver / 用户其他 chrome.debugger 用户）。
  let timedOut = false;
  return await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      timedOut = true;
      resolve(false);
    }, 1000);
    try {
      chrome.debugger.attach({ tabId }, "1.3", () => {
        clearTimeout(timer);
        const lastError = chrome.runtime?.lastError;
        if (timedOut) {
          // 已 timeout，attach 仍成功 → 清理；attach 失败则无需 detach。
          if (!lastError) {
            try {
              chrome.debugger.detach({ tabId }, () => {
                // 吃掉 lastError（detach 可能报 "Debugger is not attached"），不再有 resolve。
                void chrome.runtime?.lastError;
              });
            } catch {
              // ignore
            }
          }
          return;
        }
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
  // Other actions default to untrusted events; L2 actionability decides per case.
  void elementHint;
  return false;
}

export const capabilityDetector: CapabilityDetector = {
  canUseCDP,
  needsTrustedEvent,
};
