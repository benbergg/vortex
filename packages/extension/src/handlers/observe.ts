import { ObserveActions, VtxErrorCode, vtxError } from "@bytenew/vortex-shared";
import type { ActionRouter } from "../lib/router.js";
import { getActiveTabId, buildExecuteTarget } from "../lib/tab-utils.js";
import { getIframeOffset } from "../lib/iframe-offset.js";
import {
  gcSnapshots,
  newSnapshotId,
  setSnapshot,
  type SnapshotElement,
} from "../lib/snapshot-store.js";

type FramesParam =
  | "main"
  | "all-same-origin"
  /** @since 0.4.0 (O-6)：按扩展 manifest host_permissions 过滤，不用严格 origin 同源 */
  | "all-permitted"
  | "all"
  | number[];

/**
 * 轻量 MV3 match pattern 匹配器：支持 `<all_urls>` / `scheme://host-pattern/path-pattern`。
 * scheme 里 `*` 代表 http|https，host 里 `*.example.com` 代表任意子域 / example.com 本身。
 * 不支持 port / 完整正则——对扩展 manifest 通常足够。
 */
function matchesHostPermission(pattern: string, url: URL): boolean {
  if (pattern === "<all_urls>") {
    return /^(https?|ws|wss|ftp|file):$/.test(url.protocol);
  }
  const m = pattern.match(/^([^:]+):\/\/([^/]+)\/(.*)$/);
  if (!m) return false;
  const [, scheme, host] = m;
  const urlScheme = url.protocol.replace(/:$/, "");
  if (scheme !== "*" && scheme !== urlScheme) {
    if (!(scheme === "*" && /^(https?)$/.test(urlScheme))) return false;
  }
  if (host === "*") return true;
  if (host.startsWith("*.")) {
    const base = host.slice(2);
    return url.hostname === base || url.hostname.endsWith("." + base);
  }
  return host === url.hostname;
}

function isFrameInPermissions(url: string): boolean {
  try {
    const u = new URL(url);
    // 非 HTTP(S) frame（chrome:// / about:blank / data:）视为不可 scan
    if (!/^https?:|^ws:|^wss:$/.test(u.protocol)) return false;
    const manifest = chrome.runtime.getManifest();
    const patterns = manifest.host_permissions ?? [];
    return patterns.some((p) => matchesHostPermission(p, u));
  } catch {
    return false;
  }
}

interface FrameTarget {
  frameId: number;
  url: string;
  parentFrameId: number;
}

interface ScannedElement {
  index: number;
  tag: string;
  role: string;
  name: string;
  bbox: { x: number; y: number; w: number; h: number };
  visible: boolean;
  inViewport: boolean;
  occludedBy?: string;
  attrs: Record<string, string>;
  /** Framework UI state derived from class / aria. @since 0.4.0 (O-8) */
  state?: { checked?: boolean; selected?: boolean; active?: boolean; disabled?: boolean };
  _sel: string;
}

interface FramePageResult {
  url: string;
  title: string;
  viewport: {
    width: number;
    height: number;
    scrollY: number;
    scrollHeight: number;
  };
  elements: ScannedElement[];
  candidateCount: number;
  truncated: boolean;
}

function safeOrigin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

async function resolveTargetFrames(
  tabId: number,
  explicitFrameId: number | undefined,
  framesParam: FramesParam,
): Promise<FrameTarget[]> {
  const all = (await chrome.webNavigation.getAllFrames({ tabId })) ?? [];
  const asTargets = (ff: chrome.webNavigation.GetAllFrameResultDetails[]): FrameTarget[] =>
    ff.map((f) => ({
      frameId: f.frameId,
      url: f.url,
      parentFrameId: f.parentFrameId ?? 0,
    }));

  // 向后兼容：显式 frameId 参数仅扫该 frame，不下钻
  if (explicitFrameId != null) {
    const f = all.find((x) => x.frameId === explicitFrameId);
    return f ? asTargets([f]) : [];
  }

  if (Array.isArray(framesParam)) {
    return asTargets(all.filter((f) => framesParam.includes(f.frameId)));
  }
  if (framesParam === "all") {
    return asTargets(all);
  }
  if (framesParam === "all-permitted") {
    // 按扩展 manifest host_permissions 过滤。host_permissions=<all_urls> 时
    // 行为等同 "all"；当 manifest 收紧 host_permissions 时，只 scan 有权限的。
    return asTargets(all.filter((f) => isFrameInPermissions(f.url)));
  }
  if (framesParam === "all-same-origin") {
    const main = all.find((f) => f.frameId === 0);
    const mainOrigin = safeOrigin(main?.url);
    if (!mainOrigin) return main ? asTargets([main]) : [];
    return asTargets(all.filter((f) => safeOrigin(f.url) === mainOrigin));
  }
  // 默认 "main"
  const main = all.find((f) => f.frameId === 0);
  return main ? asTargets([main]) : [];
}

async function scanOneFrame(
  tabId: number,
  frameId: number,
  maxElements: number,
  viewport: "visible" | "full",
  includeText: boolean,
  includeAX: boolean,
): Promise<FramePageResult | null> {
  try {
    const results = await chrome.scripting.executeScript({
      target: buildExecuteTarget(tabId, frameId),
      func: (
        max: number,
        mode: string,
        withText: boolean,
        withAX: boolean,
      ) => {
        const INTERACTIVE_SELECTORS = [
          "button",
          "a[href]",
          "input:not([type=hidden])",
          "select",
          "textarea",
          "[role=button]",
          "[role=link]",
          "[role=textbox]",
          "[role=checkbox]",
          "[role=radio]",
          "[role=tab]",
          "[role=menuitem]",
          "[tabindex]:not([tabindex='-1'])",
          "[contenteditable]",
        ].join(",");

        const COLLECTED_ATTRS = [
          "id",
          "data-testid",
          "data-test",
          "href",
          "type",
          "name",
          "placeholder",
          "value",
          "aria-label",
          "title",
        ];

        function getRole(el: Element): string {
          const explicit = el.getAttribute("role");
          if (explicit) return explicit;
          const tag = el.tagName.toLowerCase();
          if (tag === "a" && el.hasAttribute("href")) return "link";
          if (tag === "button") return "button";
          if (tag === "input") {
            const t = (el as HTMLInputElement).type;
            if (t === "checkbox") return "checkbox";
            if (t === "radio") return "radio";
            if (t === "submit" || t === "button") return "button";
            return "textbox";
          }
          if (tag === "select") return "combobox";
          if (tag === "textarea") return "textbox";
          return tag;
        }

        function getAccessibleName(el: HTMLElement): string {
          const aria = el.getAttribute("aria-label");
          if (aria) return aria;
          const labelledBy = el.getAttribute("aria-labelledby");
          if (labelledBy) {
            const label = document.getElementById(labelledBy);
            if (label) return (label.innerText || "").trim().slice(0, 80);
          }
          if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
            const id = el.id;
            if (id) {
              const lbl = document.querySelector(`label[for="${id}"]`);
              if (lbl) return (lbl as HTMLElement).innerText?.trim().slice(0, 80) ?? "";
            }
            return (
              el.getAttribute("placeholder") || el.getAttribute("title") || ""
            );
          }
          if (el.tagName === "IMG") {
            return el.getAttribute("alt") || el.getAttribute("title") || "";
          }
          return (el.innerText || "").trim().slice(0, 80);
        }

        function buildSelector(el: Element): string {
          if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id)) return `#${CSS.escape(el.id)}`;
          const testId =
            el.getAttribute("data-testid") || el.getAttribute("data-test");
          if (testId) {
            const attr = el.getAttribute("data-testid") ? "data-testid" : "data-test";
            return `[${attr}="${testId.replace(/"/g, '\\"')}"]`;
          }
          const parts: string[] = [];
          let cur: Element | null = el;
          let depth = 0;
          while (cur && cur.nodeType === 1 && depth < 8) {
            const parent = cur.parentElement;
            if (!parent) {
              parts.unshift(cur.tagName.toLowerCase());
              break;
            }
            const sameTagSiblings = Array.from(parent.children).filter(
              (c) => c.tagName === cur!.tagName,
            );
            const tag = cur.tagName.toLowerCase();
            if (sameTagSiblings.length > 1) {
              const idx = sameTagSiblings.indexOf(cur) + 1;
              parts.unshift(`${tag}:nth-of-type(${idx})`);
            } else {
              parts.unshift(tag);
            }
            if (parent.tagName === "BODY" || parent.tagName === "HTML") {
              parts.unshift(parent.tagName.toLowerCase());
              break;
            }
            cur = parent;
            depth++;
          }
          return parts.join(" > ");
        }

        function describeElement(el: Element): string {
          const classStr =
            typeof el.className === "string" && el.className
              ? "." + el.className.split(" ").filter(Boolean).join(".")
              : "";
          return (
            el.tagName.toLowerCase() +
            (el.id ? `#${el.id}` : "") +
            classStr
          );
        }

        // O-8: framework UI state from class / aria.
        // 代理拿到 observe 结果时最需要的两个问题：
        //   1. checkbox/radio 当前是不是 checked（Element Plus 把状态放在 label.is-checked，不在 input）
        //   2. tab 当前是不是 active（div.is-active / [aria-selected=true]）
        // 下面的 getUiState 沿 el 自身 + 上溯 2 层 ancestor 扫这几个 class / aria。
        function getUiState(el: HTMLElement): {
          checked?: boolean;
          selected?: boolean;
          active?: boolean;
          disabled?: boolean;
        } | undefined {
          const s: {
            checked?: boolean;
            selected?: boolean;
            active?: boolean;
            disabled?: boolean;
          } = {};
          let cur: Element | null = el;
          for (let i = 0; i < 3 && cur; i++, cur = cur.parentElement) {
            const cls =
              typeof cur.className === "string" ? cur.className : "";
            if (s.checked === undefined) {
              if (cls.includes("is-checked") || cur.getAttribute("aria-checked") === "true") {
                s.checked = true;
              }
            }
            if (s.selected === undefined) {
              if (cls.includes("is-selected") || cur.getAttribute("aria-selected") === "true") {
                s.selected = true;
              }
            }
            if (s.active === undefined) {
              if (cls.includes("is-active") || cur.getAttribute("aria-pressed") === "true") {
                s.active = true;
              }
            }
          }
          if (
            (el as HTMLInputElement).disabled === true ||
            el.hasAttribute("aria-disabled")
          ) {
            s.disabled = true;
          }
          return Object.keys(s).length > 0 ? s : undefined;
        }

        const nodeList = document.querySelectorAll(INTERACTIVE_SELECTORS);
        const elements: Array<{
          index: number;
          tag: string;
          role: string;
          name: string;
          bbox: { x: number; y: number; w: number; h: number };
          visible: boolean;
          inViewport: boolean;
          occludedBy?: string;
          attrs: Record<string, string>;
          state?: { checked?: boolean; selected?: boolean; active?: boolean; disabled?: boolean };
          _sel: string;
        }> = [];

        for (const el of Array.from(nodeList)) {
          if (elements.length >= max) break;
          const htmlEl = el as HTMLElement;
          const rect = htmlEl.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;

          const inViewport =
            rect.top < window.innerHeight &&
            rect.bottom > 0 &&
            rect.left < window.innerWidth &&
            rect.right > 0;
          if (mode === "visible" && !inViewport) continue;

          let visible = true;
          let occludedBy: string | undefined;
          if (inViewport) {
            const cx = Math.max(
              0,
              Math.min(window.innerWidth - 1, rect.left + rect.width / 2),
            );
            const cy = Math.max(
              0,
              Math.min(window.innerHeight - 1, rect.top + rect.height / 2),
            );
            const topEl = document.elementFromPoint(cx, cy);
            if (
              topEl &&
              topEl !== htmlEl &&
              !htmlEl.contains(topEl) &&
              !topEl.contains(htmlEl)
            ) {
              visible = false;
              occludedBy = describeElement(topEl);
            }
          }

          const attrs: Record<string, string> = {};
          for (const attrName of COLLECTED_ATTRS) {
            const v = htmlEl.getAttribute(attrName);
            if (v) attrs[attrName] = v.slice(0, 160);
          }

          const role = withAX ? getRole(htmlEl) : htmlEl.tagName.toLowerCase();
          const name = withText ? getAccessibleName(htmlEl) : "";

          // 这里的 index 是 frame 内局部 id，observer handler 侧重编全局 index
          const state = getUiState(htmlEl);
          elements.push({
            index: elements.length,
            tag: htmlEl.tagName.toLowerCase(),
            role,
            name,
            bbox: {
              x: Math.round(rect.left),
              y: Math.round(rect.top),
              w: Math.round(rect.width),
              h: Math.round(rect.height),
            },
            visible,
            inViewport,
            occludedBy,
            attrs,
            ...(state ? { state } : {}),
            _sel: buildSelector(htmlEl),
          });
        }

        return {
          url: location.href,
          title: document.title,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
            scrollY: window.scrollY,
            scrollHeight: document.documentElement.scrollHeight,
          },
          elements,
          candidateCount: nodeList.length,
          truncated: elements.length >= max,
        };
      },
      args: [maxElements, viewport, includeText, includeAX],
      world: "MAIN",
    });
    return (results[0]?.result as FramePageResult | undefined) ?? null;
  } catch {
    // 跨源 iframe 无权限 / frame 已销毁：不 throw，返回 null 让上层标记为未扫
    return null;
  }
}

export function registerObserveHandlers(router: ActionRouter): void {
  router.registerAll({
    [ObserveActions.SNAPSHOT]: async (args, tabId) => {
      gcSnapshots();
      const tid = await getActiveTabId(
        (args.tabId as number | undefined) ?? tabId,
      );
      const explicitFrameId = args.frameId as number | undefined;
      const framesParam = (args.frames as FramesParam | undefined) ?? "main";
      const maxElements = (args.maxElements as number | undefined) ?? 200;
      const viewport =
        (args.viewport as "visible" | "full" | undefined) ?? "visible";
      const includeText = (args.includeText as boolean | undefined) ?? true;
      const includeAX = (args.includeAX as boolean | undefined) ?? true;

      const frameTargets = await resolveTargetFrames(tid, explicitFrameId, framesParam);
      if (frameTargets.length === 0) {
        throw vtxError(
          VtxErrorCode.IFRAME_NOT_READY,
          "No target frames resolved (tab may be uninitialized)",
          { tabId: tid, frameId: explicitFrameId },
        );
      }

      // 跨 frame：每个 frame 独立扫描；offset 用 getIframeOffset 算一次
      const scans: Array<{
        frameId: number;
        url: string;
        parentFrameId: number;
        offset: { x: number; y: number };
        page: FramePageResult | null;
      }> = [];
      for (const f of frameTargets) {
        const offset = await getIframeOffset(tid, f.frameId);
        const page = await scanOneFrame(
          tid,
          f.frameId,
          maxElements,
          viewport,
          includeText,
          includeAX,
        );
        scans.push({
          frameId: f.frameId,
          url: f.url,
          parentFrameId: f.parentFrameId,
          offset,
          page,
        });
      }

      // 分配跨 frame 全局 index（按 frameTargets 顺序）
      // 每个元素附加 suggestedUsage：给 LLM 直接可用的下一步命令，避免再自行推断应传 frameId。
      const elementsOut: Array<
        Omit<ScannedElement, "_sel"> & {
          frameId: number;
          suggestedUsage: {
            click: string;
            domClick: string;
          };
        }
      > = [];
      const elementMap: SnapshotElement[] = [];
      let cursor = 0;
      let totalCandidates = 0;
      let anyTruncated = false;
      const framesOut: Array<{
        frameId: number;
        parentFrameId: number;
        url: string;
        offset: { x: number; y: number };
        elementCount: number;
        truncated: boolean;
        /** null 表示跨源 / 销毁导致无法扫描 */
        scanned: boolean;
      }> = [];

      for (const s of scans) {
        if (!s.page) {
          framesOut.push({
            frameId: s.frameId,
            parentFrameId: s.parentFrameId,
            url: s.url,
            offset: s.offset,
            elementCount: 0,
            truncated: false,
            scanned: false,
          });
          continue;
        }
        totalCandidates += s.page.candidateCount;
        anyTruncated = anyTruncated || s.page.truncated;
        for (const e of s.page.elements) {
          const globalIdx = cursor++;
          const centerX = e.bbox.x + Math.round(e.bbox.w / 2);
          const centerY = e.bbox.y + Math.round(e.bbox.h / 2);
          elementsOut.push({
            index: globalIdx,
            tag: e.tag,
            role: e.role,
            name: e.name,
            bbox: e.bbox,
            visible: e.visible,
            inViewport: e.inViewport,
            occludedBy: e.occludedBy,
            attrs: e.attrs,
            ...(e.state ? { state: e.state } : {}),
            frameId: s.frameId,
            // LLM-friendly 下一步命令提示。coordSpace="frame" 默认按 frameId 自动换算。
            suggestedUsage: {
              // 首选：按 snapshot index 路由（最稳，不怕选择器变化）
              domClick: `vortex_dom_click({ index: ${globalIdx}, snapshotId: "<this-snapshot-id>" })`,
              // 需要真实鼠标事件时：frame-local 坐标 + frameId，server 自动换算
              click: `vortex_mouse_click({ x: ${centerX}, y: ${centerY}, frameId: ${s.frameId} })`,
            },
          });
          elementMap.push({
            index: globalIdx,
            selector: e._sel,
            frameId: s.frameId,
          });
        }
        framesOut.push({
          frameId: s.frameId,
          parentFrameId: s.parentFrameId,
          url: s.page.url,
          offset: s.offset,
          elementCount: s.page.elements.length,
          truncated: s.page.truncated,
          scanned: true,
        });
      }

      const snapshotId = newSnapshotId();
      // entry.frameId：单 frame 时保留向后兼容 hint；多 frame 时不填（路由走 element.frameId）
      const isSingleFrame = framesOut.length === 1;
      setSnapshot(snapshotId, {
        tabId: tid,
        frameId: isSingleFrame ? framesOut[0].frameId : undefined,
        capturedAt: Date.now(),
        elements: elementMap,
      });

      // 主 frame（或第一个命中帧）作为顶层 url/title/viewport 代表
      const primary = scans.find((s) => s.frameId === 0 && s.page) ?? scans.find((s) => s.page);
      return {
        snapshotId,
        version: 2,
        url: primary?.page?.url ?? "",
        title: primary?.page?.title ?? "",
        viewport: primary?.page?.viewport ?? {
          width: 0,
          height: 0,
          scrollY: 0,
          scrollHeight: 0,
        },
        frames: framesOut,
        elements: elementsOut,
        meta: {
          capturedAt: Date.now(),
          candidateCount: totalCandidates,
          returnedCount: elementsOut.length,
          truncated: anyTruncated,
          frameCount: framesOut.length,
          scannedFrames: framesOut.filter((f) => f.scanned).length,
        },
      };
    },
  });
}
