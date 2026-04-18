import { ObserveActions, VtxErrorCode, vtxError } from "@bytenew/vortex-shared";
import type { ActionRouter } from "../lib/router.js";
import { getActiveTabId, buildExecuteTarget } from "../lib/tab-utils.js";

/**
 * Snapshot 的每个 index 与定位 selector 的映射，
 * 供 W3 dom.* 工具 `{ snapshotId, index }` 参数用来反查元素。
 */
interface SnapshotElement {
  index: number;
  selector: string;
}

interface SnapshotEntry {
  tabId: number;
  frameId?: number;
  capturedAt: number;
  elements: SnapshotElement[];
}

const snapshots = new Map<string, SnapshotEntry>();
const SNAPSHOT_TTL_MS = 60_000;
let snapshotCounter = 0;

function newSnapshotId(): string {
  return `snap_${Date.now().toString(36)}_${++snapshotCounter}`;
}

function gcSnapshots(): void {
  const now = Date.now();
  for (const [id, entry] of snapshots) {
    if (now - entry.capturedAt > SNAPSHOT_TTL_MS) snapshots.delete(id);
  }
}

export function getSnapshotEntry(snapshotId: string): SnapshotEntry | undefined {
  return snapshots.get(snapshotId);
}

/**
 * W3 dom.* 工具按 index 回查 element 的入口。
 * 返回定位该元素所需的 tab/frame/selector。
 * snapshotId 过期或 index 不存在时返回 undefined，调用方据此抛
 * STALE_SNAPSHOT / INVALID_INDEX。
 */
export function resolveSnapshotIndex(
  snapshotId: string,
  index: number,
): { tabId: number; frameId?: number; selector: string } | undefined {
  const entry = snapshots.get(snapshotId);
  if (!entry) return undefined;
  const hit = entry.elements.find((e) => e.index === index);
  if (!hit) return undefined;
  return { tabId: entry.tabId, frameId: entry.frameId, selector: hit.selector };
}

export function registerObserveHandlers(router: ActionRouter): void {
  router.registerAll({
    [ObserveActions.SNAPSHOT]: async (args, tabId) => {
      gcSnapshots();
      const tid = await getActiveTabId(
        (args.tabId as number | undefined) ?? tabId,
      );
      const frameId = args.frameId as number | undefined;
      const maxElements = (args.maxElements as number | undefined) ?? 200;
      const viewport = (args.viewport as "visible" | "full" | undefined) ?? "visible";
      const includeText = (args.includeText as boolean | undefined) ?? true;
      const includeAX = (args.includeAX as boolean | undefined) ?? true;

      const results = await chrome.scripting.executeScript({
        target: buildExecuteTarget(tid, frameId),
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
                el.getAttribute("placeholder") ||
                el.getAttribute("title") ||
                ""
              );
            }
            if (el.tagName === "IMG") {
              return el.getAttribute("alt") || el.getAttribute("title") || "";
            }
            return (el.innerText || "").trim().slice(0, 80);
          }

          /**
           * 生成稳定的 CSS selector：id > data-testid > path。
           * path 路径最多 8 层，含 nth-of-type 消歧义。
           */
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

          /**
           * 描述用于 occludedBy 字段的简要 selector，
           * 格式 "tag#id.class1.class2"。不用于定位，仅供 LLM 识别遮挡者。
           */
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
            _sel: string;
          }> = [];
          let idx = 0;

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

            // Paint-order 遮挡检测（只在视口内执行 elementFromPoint）
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

            elements.push({
              index: idx++,
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
            meta: {
              candidateCount: nodeList.length,
              returnedCount: elements.length,
              truncated: elements.length >= max,
              capturedAt: Date.now(),
            },
          };
        },
        args: [maxElements, viewport, includeText, includeAX],
        world: "MAIN",
      });

      const pageResult = results[0]?.result as
        | {
            url: string;
            title: string;
            viewport: Record<string, number>;
            elements: Array<{
              index: number;
              tag: string;
              role: string;
              name: string;
              bbox: { x: number; y: number; w: number; h: number };
              visible: boolean;
              inViewport: boolean;
              occludedBy?: string;
              attrs: Record<string, string>;
              _sel: string;
            }>;
            meta: {
              capturedAt: number;
              candidateCount: number;
              returnedCount: number;
              truncated: boolean;
            };
          }
        | undefined;

      if (!pageResult) {
        throw vtxError(
          VtxErrorCode.JS_EXECUTION_ERROR,
          "Observe script returned no result",
          { tabId: tid, frameId },
        );
      }

      // 剥离内部 selector（不回给 LLM），单独存进 snapshot entry
      const elementsOut = pageResult.elements.map(({ _sel, ...rest }) => rest);
      const elementMap: SnapshotElement[] = pageResult.elements.map((e) => ({
        index: e.index,
        selector: e._sel,
      }));

      const snapshotId = newSnapshotId();
      snapshots.set(snapshotId, {
        tabId: tid,
        frameId,
        capturedAt: pageResult.meta.capturedAt,
        elements: elementMap,
      });

      return {
        snapshotId,
        url: pageResult.url,
        title: pageResult.title,
        viewport: pageResult.viewport,
        elements: elementsOut,
        meta: pageResult.meta,
      };
    },
  });
}
