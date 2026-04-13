import { KeyboardActions } from "@bytenew/vortex-shared";
import type { ActionRouter } from "../lib/router.js";
import type { DebuggerManager } from "../lib/debugger-manager.js";

// DOM key → windowsVirtualKeyCode 映射
const KEY_CODES: Record<string, number> = {
  Enter: 13, Tab: 9, Escape: 27, Backspace: 8, Delete: 46, Space: 32,
  ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39,
  Home: 36, End: 35, PageUp: 33, PageDown: 34,
  Control: 17, Shift: 16, Alt: 18, Meta: 91,
  // 字母 A-Z
  ...Object.fromEntries(
    Array.from({ length: 26 }, (_, i) => [String.fromCharCode(65 + i), 65 + i]),
  ),
  // 小写字母 a-z 映射到相同 keyCode
  ...Object.fromEntries(
    Array.from({ length: 26 }, (_, i) => [String.fromCharCode(97 + i), 65 + i]),
  ),
  // 数字 0-9
  ...Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [String(i), 48 + i]),
  ),
  // 功能键 F1-F12
  ...Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [`F${i + 1}`, 112 + i]),
  ),
};

// 修饰键名 → CDP modifiers 标志位
const MODIFIERS: Record<string, number> = {
  Alt: 1, Control: 2, Ctrl: 2, Meta: 4, Shift: 8,
};

async function getActiveTabId(tabId?: number): Promise<number> {
  if (tabId) return tabId;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found");
  return tab.id;
}

async function dispatchKey(
  debuggerMgr: DebuggerManager,
  tabId: number,
  key: string,
  modifiers: number,
): Promise<void> {
  const code = KEY_CODES[key] ?? key.charCodeAt(0);

  await debuggerMgr.sendCommand(tabId, "Input.dispatchKeyEvent", {
    type: "keyDown",
    key,
    code: key,
    windowsVirtualKeyCode: code,
    nativeVirtualKeyCode: code,
    modifiers,
  });

  await debuggerMgr.sendCommand(tabId, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code: key,
    windowsVirtualKeyCode: code,
    nativeVirtualKeyCode: code,
    modifiers,
  });
}

export function registerKeyboardHandlers(
  router: ActionRouter,
  debuggerMgr: DebuggerManager,
): void {
  router.registerAll({
    [KeyboardActions.PRESS]: async (args, tabId) => {
      const tid = await getActiveTabId((args.tabId as number | undefined) ?? tabId);
      const key = args.key as string;
      if (!key) throw new Error("key is required");

      await debuggerMgr.enableDomain(tid, "Input");
      await dispatchKey(debuggerMgr, tid, key, 0);
      return { success: true, key };
    },

    [KeyboardActions.SHORTCUT]: async (args, tabId) => {
      const tid = await getActiveTabId((args.tabId as number | undefined) ?? tabId);
      const keys = args.keys as string[];
      if (!keys || keys.length < 2) throw new Error("keys must be an array of at least 2 keys");

      await debuggerMgr.enableDomain(tid, "Input");

      // 计算修饰键标志位
      let modifiers = 0;
      const modifierKeys: string[] = [];
      const nonModifierKeys: string[] = [];
      for (const k of keys) {
        if (k in MODIFIERS) {
          modifiers |= MODIFIERS[k];
          modifierKeys.push(k);
        } else {
          nonModifierKeys.push(k);
        }
      }

      // 按下修饰键
      for (const k of modifierKeys) {
        const code = KEY_CODES[k] ?? 0;
        await debuggerMgr.sendCommand(tid, "Input.dispatchKeyEvent", {
          type: "keyDown", key: k, code: k,
          windowsVirtualKeyCode: code, modifiers,
        });
      }

      // 按下并释放主键
      for (const k of nonModifierKeys) {
        await dispatchKey(debuggerMgr, tid, k, modifiers);
      }

      // 释放修饰键（逆序）
      for (const k of [...modifierKeys].reverse()) {
        const code = KEY_CODES[k] ?? 0;
        await debuggerMgr.sendCommand(tid, "Input.dispatchKeyEvent", {
          type: "keyUp", key: k, code: k,
          windowsVirtualKeyCode: code, modifiers: 0,
        });
      }

      return { success: true, keys };
    },
  });
}
