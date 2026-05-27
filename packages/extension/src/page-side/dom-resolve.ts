// Page-side module：把穿 open shadow 的查询暴露给 dom.ts / content.ts 的 inline func。
// inline func 经 nativePageQuery 在 MAIN world 执行，闭包不能序列化，故经 window 全局共享。
// 由 loadPageSideModule(tid, frameId, "dom-resolve") 预注入（同 MAIN world，可见）。
import { queryDeep, queryAllDeep } from "./shadow-walk.js";

(function () {
  if ((window as any).__vortexQueryDeep) return;
  (window as any).__vortexQueryDeep = (selector: string): Element | null => {
    try {
      return queryDeep(selector, document);
    } catch {
      // 无效 CSS（SyntaxError）→ 当作未命中，与 actionability probe 的 swallow 一致。
      return null;
    }
  };
  (window as any).__vortexQueryAllDeep = (selector: string): Element[] => {
    try {
      return queryAllDeep(selector, document);
    } catch {
      return [];
    }
  };
})();
export {};
