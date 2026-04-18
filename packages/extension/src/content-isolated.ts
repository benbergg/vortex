// Vortex content script - ISOLATED world
//
// 职责：
//   1. 接收 MAIN world content-main.ts 通过 postMessage 转发的 dialog 事件
//   2. 监听 submit 事件（冒泡阶段）
//   3. 通过 chrome.runtime.sendMessage 把事件递交给 background 的事件分发器
//
// 注意：此脚本不触发 dom.mutated（info 级，开销大，按需由 background
// 指令激活；当前版本不启用）。

(() => {
  interface VortexContentMsg {
    source: "vortex-content";
    event: string;
    data: unknown;
  }

  function send(event: string, data: unknown): void {
    const msg: VortexContentMsg = { source: "vortex-content", event, data };
    chrome.runtime.sendMessage(msg).catch(() => {
      // background 可能处于 service worker 空闲，忽略 send 失败
    });
  }

  // 1. 接 MAIN world 的 dialog 通知
  window.addEventListener("message", (ev) => {
    const data = ev.data as { __vortex__?: boolean; type?: string; kind?: string; text?: string } | null;
    if (!data || data.__vortex__ !== true) return;
    if (data.type === "dialog.opened") {
      send("dialog.opened", {
        kind: data.kind,
        text: String(data.text ?? "").slice(0, 500),
        url: location.href,
      });
    }
  });

  // 2. submit 监听（capture 阶段收集全部 form）
  document.addEventListener(
    "submit",
    (ev) => {
      const form = ev.target as HTMLFormElement | null;
      if (!form || form.tagName !== "FORM") return;
      send("form.submitted", {
        action: form.action || null,
        method: (form.method || "get").toUpperCase(),
        fieldCount: form.elements?.length ?? 0,
        name: form.getAttribute("name") || form.id || null,
        url: location.href,
      });
    },
    true,
  );
})();
