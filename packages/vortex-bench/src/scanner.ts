// packages/vortex-bench/src/scanner.ts

export interface ScannedElementLite {
  index: number;
  tag: string;
  role: string;
  name: string;
  state?: { checked?: boolean; selected?: boolean; active?: boolean; disabled?: boolean };
  /** 仅 compact 用不到；full 模式才填 */
  bbox?: { x: number; y: number; w: number; h: number };
  attrs?: Record<string, string>;
  _sel: string;
}

export interface ScannerOptions {
  maxElements?: number;
  viewport?: "visible" | "full";
  includeText?: boolean;
  includeAX?: boolean;
  detail?: "compact" | "full";
}

export interface ScannerDeps {
  doc: Document;
  win: Window;
}

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

const COLLECTED_ATTRS = ["id", "data-testid", "data-test", "href", "type", "name", "placeholder", "value", "aria-label", "title"];

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

// 注意：jsdom 不支持 innerText（只实现 textContent），此函数降级为 textContent；
// 生产 extension 内 observe.ts 用 innerText，两者对隐藏文字（display:none 等）行为有差异。
function getAccessibleName(el: HTMLElement, doc: Document): string {
  const aria = el.getAttribute("aria-label");
  // 与 observe.ts 原版行为差异：此处加 80 字符截断跟其它分支保持一致，避免异常长 aria-label 撑大输出
  if (aria) return aria.slice(0, 80);
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const label = doc.getElementById(labelledBy);
    if (label) return (label.textContent || "").trim().slice(0, 80);
  }
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
    const id = el.id;
    if (id) {
      const lbl = doc.querySelector(`label[for="${id}"]`);
      if (lbl) return (lbl.textContent || "").trim().slice(0, 80);
    }
    return (el.getAttribute("placeholder") || el.getAttribute("title") || "").slice(0, 80);
  }
  if (el.tagName === "IMG") return (el.getAttribute("alt") || el.getAttribute("title") || "").slice(0, 80);
  return (el.textContent || "").trim().slice(0, 80);
}

function buildSelector(el: Element): string {
  if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id)) return `#${CSS.escape(el.id)}`;
  const testId = el.getAttribute("data-testid") || el.getAttribute("data-test");
  if (testId) {
    const attr = el.getAttribute("data-testid") ? "data-testid" : "data-test";
    return `[${attr}="${testId.replace(/"/g, '\\"')}"]`;
  }
  const parts: string[] = [];
  let cur: Element | null = el;
  let depth = 0;
  while (cur && cur.nodeType === 1 && depth < 8) {
    const parent: Element | null = cur.parentElement;
    if (!parent) {
      parts.unshift(cur.tagName.toLowerCase());
      break;
    }
    const sameTagSiblings = Array.from(parent.children).filter((c: Element) => c.tagName === cur!.tagName);
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

function getUiState(el: HTMLElement): ScannedElementLite["state"] {
  const s: NonNullable<ScannedElementLite["state"]> = {};
  let cur: Element | null = el;
  for (let i = 0; i < 3 && cur; i++, cur = cur.parentElement) {
    const cls = typeof cur.className === "string" ? cur.className : "";
    if (s.checked === undefined && (cls.includes("is-checked") || cur.getAttribute("aria-checked") === "true")) s.checked = true;
    if (s.selected === undefined && (cls.includes("is-selected") || cur.getAttribute("aria-selected") === "true")) s.selected = true;
    if (s.active === undefined && (cls.includes("is-active") || cur.getAttribute("aria-pressed") === "true")) s.active = true;
  }
  if ((el as HTMLInputElement).disabled === true || el.hasAttribute("aria-disabled")) s.disabled = true;
  return Object.keys(s).length > 0 ? s : undefined;
}

export function scan(deps: ScannerDeps, opts: ScannerOptions = {}): {
  elements: ScannedElementLite[];
  candidateCount: number;
  truncated: boolean;
} {
  const { doc, win } = deps;
  const max = opts.maxElements ?? 200;
  const viewport = opts.viewport ?? "visible";
  const includeText = opts.includeText ?? true;
  const includeAX = opts.includeAX ?? true;
  const detail = opts.detail ?? "compact";

  const nodeList = doc.querySelectorAll(INTERACTIVE_SELECTORS);
  const elements: ScannedElementLite[] = [];

  for (const el of Array.from(nodeList)) {
    if (elements.length >= max) break;
    const htmlEl = el as HTMLElement;
    const rect = htmlEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    const inViewport =
      rect.top < win.innerHeight && rect.bottom > 0 && rect.left < win.innerWidth && rect.right > 0;
    if (viewport === "visible" && !inViewport) continue;

    const role = includeAX ? getRole(htmlEl) : htmlEl.tagName.toLowerCase();
    const name = includeText ? getAccessibleName(htmlEl, doc) : "";
    const state = getUiState(htmlEl);

    const out: ScannedElementLite = {
      index: elements.length,
      tag: htmlEl.tagName.toLowerCase(),
      role,
      name,
      ...(state ? { state } : {}),
      _sel: buildSelector(htmlEl),
    };

    if (detail === "full") {
      out.bbox = {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      };
      const attrs: Record<string, string> = {};
      for (const attrName of COLLECTED_ATTRS) {
        const v = htmlEl.getAttribute(attrName);
        if (v) attrs[attrName] = v.slice(0, 160);
      }
      out.attrs = attrs;
    }

    elements.push(out);
  }

  return {
    elements,
    candidateCount: nodeList.length,
    truncated: elements.length >= max,
  };
}
