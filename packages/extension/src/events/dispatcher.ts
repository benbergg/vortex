import {
  VtxEventType,
  eventLevelOf,
  type VtxEventLevel,
} from "@bytenew/vortex-shared";
import type { NativeMessagingClient } from "../lib/native-messaging.js";

/**
 * 事件分发器：统一封装 extension 侧事件上报。
 *
 * 当前实现：直接透传到 NM 通道（level 写入事件体）。
 * 未来如需节流 / 聚合 / 去重，集中到本文件即可。
 */
export class EventDispatcher {
  constructor(private nm: NativeMessagingClient) {}

  emit(
    type: string,
    data: unknown,
    opts: {
      tabId?: number;
      frameId?: number;
      level?: VtxEventLevel;
    } = {},
  ): void {
    const level = opts.level ?? eventLevelOf(type);
    this.nm.send({
      type: "event",
      event: type,
      data,
      tabId: opts.tabId,
      frameId: opts.frameId,
      level,
    });
  }
}

/**
 * 注册 chrome.* 事件监听到 dispatcher。
 * 当前覆盖 urgent 级的浏览器级事件（user.switched_tab / user.closed_tab）。
 * 页面级事件（DOM mutation / dialog / form submit 等）在 W5 补全。
 */
export function registerEventSources(dispatcher: EventDispatcher): void {
  chrome.tabs.onActivated.addListener((info) => {
    dispatcher.emit(
      VtxEventType.USER_SWITCHED_TAB,
      { windowId: info.windowId },
      { tabId: info.tabId },
    );
  });

  chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    dispatcher.emit(
      VtxEventType.USER_CLOSED_TAB,
      { windowId: removeInfo.windowId, isWindowClosing: removeInfo.isWindowClosing },
      { tabId },
    );
  });
}
