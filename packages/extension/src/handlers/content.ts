import { ContentActions } from "@bytenew/vortex-shared";
import type { ActionRouter } from "../lib/router.js";

async function getActiveTabId(tabId?: number): Promise<number> {
  if (tabId) return tabId;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found");
  return tab.id;
}

export function registerContentHandlers(router: ActionRouter): void {
  router.registerAll({
    [ContentActions.GET_TEXT]: async (args, tabId) => {
      const selector = args.selector as string | undefined;
      const tid = await getActiveTabId(args.tabId as number | undefined ?? tabId);
      const results = await chrome.scripting.executeScript({
        target: { tabId: tid },
        func: (sel: string | undefined) => {
          try {
            if (sel) {
              const el = document.querySelector(sel) as HTMLElement | null;
              if (!el) return { error: `Element not found: ${sel}` };
              return { result: el.innerText };
            }
            return { result: document.body.innerText };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
        args: [selector ?? null],
        world: "MAIN",
      });
      const res = results[0]?.result as { result?: unknown; error?: string };
      if (res?.error) throw new Error(res.error);
      return res?.result;
    },

    [ContentActions.GET_HTML]: async (args, tabId) => {
      const selector = args.selector as string | undefined;
      const tid = await getActiveTabId(args.tabId as number | undefined ?? tabId);
      const results = await chrome.scripting.executeScript({
        target: { tabId: tid },
        func: (sel: string | undefined) => {
          try {
            if (sel) {
              const el = document.querySelector(sel);
              if (!el) return { error: `Element not found: ${sel}` };
              return { result: el.outerHTML };
            }
            return { result: document.documentElement.outerHTML };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
        args: [selector ?? null],
        world: "MAIN",
      });
      const res = results[0]?.result as { result?: unknown; error?: string };
      if (res?.error) throw new Error(res.error);
      return res?.result;
    },

    [ContentActions.GET_ACCESSIBILITY_TREE]: async (args, tabId) => {
      const tid = await getActiveTabId(args.tabId as number | undefined ?? tabId);
      const results = await chrome.scripting.executeScript({
        target: { tabId: tid },
        func: () => {
          try {
            interface A11yNode {
              role: string;
              name?: string;
              children?: A11yNode[];
            }

            let nodeCount = 0;

            function getRole(el: Element): string {
              const ariaRole = el.getAttribute("role");
              if (ariaRole) return ariaRole;
              const tag = el.tagName.toLowerCase();
              const roleMap: Record<string, string> = {
                a: "link",
                button: "button",
                input: "textbox",
                select: "listbox",
                textarea: "textbox",
                img: "img",
                h1: "heading",
                h2: "heading",
                h3: "heading",
                h4: "heading",
                h5: "heading",
                h6: "heading",
                nav: "navigation",
                main: "main",
                header: "banner",
                footer: "contentinfo",
                aside: "complementary",
                form: "form",
                table: "table",
                li: "listitem",
                ul: "list",
                ol: "list",
              };
              return roleMap[tag] ?? tag;
            }

            function getName(el: Element): string | undefined {
              const ariaLabel = el.getAttribute("aria-label");
              if (ariaLabel) return ariaLabel;
              const ariaLabelledBy = el.getAttribute("aria-labelledby");
              if (ariaLabelledBy) {
                const labelEl = document.getElementById(ariaLabelledBy);
                if (labelEl) return (labelEl as HTMLElement).innerText?.trim();
              }
              const text = (el as HTMLElement).innerText?.trim();
              if (text) return text.slice(0, 100);
              return undefined;
            }

            function walkNode(el: Element, depth: number): A11yNode | null {
              if (nodeCount >= 500 || depth > 10) return null;
              nodeCount++;

              const node: A11yNode = { role: getRole(el) };
              const name = getName(el);
              if (name) node.name = name;

              const childNodes: A11yNode[] = [];
              for (const child of Array.from(el.children)) {
                const childNode = walkNode(child, depth + 1);
                if (childNode) childNodes.push(childNode);
                if (nodeCount >= 500) break;
              }
              if (childNodes.length > 0) node.children = childNodes;

              return node;
            }

            const tree = walkNode(document.body, 0);
            return { result: tree };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
        args: [],
        world: "MAIN",
      });
      const res = results[0]?.result as { result?: unknown; error?: string };
      if (res?.error) throw new Error(res.error);
      return res?.result;
    },

    [ContentActions.GET_ELEMENT_TEXT]: async (args, tabId) => {
      const selector = args.selector as string;
      if (!selector) throw new Error("Missing required param: selector");
      const tid = await getActiveTabId(args.tabId as number | undefined ?? tabId);
      const results = await chrome.scripting.executeScript({
        target: { tabId: tid },
        func: (sel: string) => {
          try {
            const el = document.querySelector(sel);
            if (!el) return { error: `Element not found: ${sel}` };
            return { result: el.textContent };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
        args: [selector ?? null],
        world: "MAIN",
      });
      const res = results[0]?.result as { result?: unknown; error?: string };
      if (res?.error) throw new Error(res.error);
      return res?.result;
    },

    [ContentActions.GET_COMPUTED_STYLE]: async (args, tabId) => {
      const selector = args.selector as string;
      const properties = args.properties as string[] | undefined;
      if (!selector) throw new Error("Missing required param: selector");
      const tid = await getActiveTabId(args.tabId as number | undefined ?? tabId);
      const results = await chrome.scripting.executeScript({
        target: { tabId: tid },
        func: (sel: string, props: string[] | undefined) => {
          try {
            const el = document.querySelector(sel);
            if (!el) return { error: `Element not found: ${sel}` };
            const style = window.getComputedStyle(el);
            const defaultProps = [
              "display",
              "position",
              "width",
              "height",
              "color",
              "backgroundColor",
              "fontSize",
              "margin",
              "padding",
              "border",
            ];
            const targetProps = props ?? defaultProps;
            const result: Record<string, string> = {};
            for (const prop of targetProps) {
              result[prop] = style.getPropertyValue(
                prop.replace(/([A-Z])/g, "-$1").toLowerCase(),
              );
            }
            return { result };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
        args: [selector, properties ?? null],
        world: "MAIN",
      });
      const res = results[0]?.result as { result?: unknown; error?: string };
      if (res?.error) throw new Error(res.error);
      return res?.result;
    },
  });
}
