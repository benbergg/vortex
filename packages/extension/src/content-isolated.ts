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

  // 3. MutationObserver（按需激活，dispatcher info 级会合并）
  let mutationObserver: MutationObserver | null = null;

  function startMutationWatch(): void {
    if (mutationObserver) return;
    mutationObserver = new MutationObserver((mutations) => {
      // 仅发轻量摘要，避免 page 体大 mutation 被 serialize 全传
      const addedCount = mutations.reduce(
        (s, m) => s + (m.addedNodes?.length ?? 0),
        0,
      );
      const removedCount = mutations.reduce(
        (s, m) => s + (m.removedNodes?.length ?? 0),
        0,
      );
      const attributeCount = mutations.filter(
        (m) => m.type === "attributes",
      ).length;
      send("dom.mutated", {
        batchSize: mutations.length,
        added: addedCount,
        removed: removedCount,
        attrChanged: attributeCount,
        url: location.href,
      });
    });
    mutationObserver.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: false, // text-only 改动噪音太大，默认关
    });
  }

  function stopMutationWatch(): void {
    if (!mutationObserver) return;
    mutationObserver.disconnect();
    mutationObserver = null;
  }

  // 接 background 的激活 / 去激活指令
  chrome.runtime.onMessage.addListener((rawMsg) => {
    const msg = rawMsg as { source?: string; action?: string } | null;
    if (!msg || msg.source !== "vortex-bg") return;
    if (msg.action === "start-mutation-watch") startMutationWatch();
    else if (msg.action === "stop-mutation-watch") stopMutationWatch();
  });
})();
