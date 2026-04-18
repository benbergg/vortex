// Vortex content script - MAIN world
//
// 运行在页面 JS 同一个全局，拦截 alert/confirm/prompt。必须在页面脚本之前
// 执行（manifest 声明 run_at=document_start + world=MAIN），否则页面脚本
// 可能已缓存原始 window.alert 引用。
//
// 自身无法调 chrome.runtime.sendMessage（MAIN world 没有 chrome API），
// 通过 window.postMessage 把事件发给同页 ISOLATED world 的 content script
// 再由后者转发给 background。

(() => {
  type DialogKind = "alert" | "confirm" | "prompt";

  function notify(kind: DialogKind, text: string): void {
    try {
      window.postMessage(
        { __vortex__: true, type: "dialog.opened", kind, text },
        "*",
      );
    } catch {
      // postMessage 在极端情况下可能失败，忽略
    }
  }

  const origAlert = window.alert;
  window.alert = function (msg?: unknown): void {
    notify("alert", String(msg ?? ""));
    return origAlert.call(window, msg as string);
  };

  const origConfirm = window.confirm;
  window.confirm = function (msg?: unknown): boolean {
    notify("confirm", String(msg ?? ""));
    return origConfirm.call(window, msg as string);
  };

  const origPrompt = window.prompt;
  window.prompt = function (msg?: unknown, def?: unknown): string | null {
    notify("prompt", String(msg ?? ""));
    return origPrompt.call(window, msg as string, def as string);
  };
})();
