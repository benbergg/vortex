// Page-side module：把穿 open shadow 的查询暴露给 dom.ts / content.ts 的 inline func。
// inline func 经 nativePageQuery 在 MAIN world 执行，闭包不能序列化，故经 window 全局共享。
// 由 loadPageSideModule(tid, frameId, "dom-resolve") 预注入（同 MAIN world，可见）。
// 命名空间 + version 守卫，与 fill-reject / actionability 等 page-side module 约定一致。
import { queryDeep, queryAllDeep } from "./shadow-walk.js";

(function () {
  if ((window as any).__vortexDomResolve?.version === 1) return;
  (window as any).__vortexDomResolve = {
    version: 1,
    queryDeep: (selector: string): Element | null => {
      try {
        return queryDeep(selector, document);
      } catch {
        // 无效 CSS（SyntaxError）→ 当作未命中，与 actionability probe 的 swallow 一致。
        return null;
      }
    },
    queryAllDeep: (selector: string): Element[] => {
      try {
        return queryAllDeep(selector, document);
      } catch {
        return [];
      }
    },
  };
})();
export {};
