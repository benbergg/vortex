// 检测元素上由前端框架(React / Vue3)绑定的「点击」事件处理器。
//
// observe 的 interactive 识别靠原生标签 / ARIA role / [onclick] / cursor:pointer。
// 但现代 SPA 常用 React `onClick` / Vue `@click` 把点击绑在**裸 <div>**(cursor:auto、
// role 缺失、无 [onclick] 属性)上——这类「视觉是按钮、DOM 无标准信号」的元素整族
// 漏报(2026-06-04 淘宝评价区「查看全部评价」`ShowButton--fMu7HZNs` /「切换大图模式」
// `switchBtnWrap--qzxyLlCR`,两者 React fiber `__reactProps$.onClick` 确凿绑定但
// cursor:auto + role=null)。框架挂在 DOM 节点上的私有属性是 page JS 可读的**强信号**
// (比继承来的 cursor:pointer 更确凿:它就是这个元素自己绑了 click),用作
// cursor:pointer fallback 的并列入池信号。
//
// 与 observe.ts 注入体(executeScript func 自包含、不能 import)内联的同名逻辑保持
// 同语义,此处为可单测真源——改一处须同步另一处。

const CLICK_PROP_KEYS = ["onClick", "onClickCapture"] as const;

/** React 17+ 把组件 props(含 onClick)挂到 DOM 节点的 `__reactProps$<随机后缀>`。 */
function reactHasClick(node: Record<string, unknown>): boolean {
  for (const k of Object.keys(node)) {
    // 后缀每页随机但固定;首字符 '_'(charCode 95)短路,省去多数普通节点的 startsWith。
    if (k.charCodeAt(0) === 95 && k.startsWith("__reactProps$")) {
      const props = node[k] as Record<string, unknown> | null;
      if (props && typeof props === "object") {
        for (const ck of CLICK_PROP_KEYS) {
          if (typeof props[ck] === "function") return true;
        }
      }
    }
  }
  return false;
}

/**
 * Vue3 把模板 @click 编译成的 event invoker 存 `el._vei.onClick`(patchEvent)。
 * invoker 可能直接是函数,或 `{ value: fn }` 形态(@vue/runtime-dom createInvoker)。
 */
function vue3HasClick(node: Record<string, any>): boolean {
  const vei = node._vei;
  if (!vei || typeof vei !== "object") return false;
  for (const ck of CLICK_PROP_KEYS) {
    const inv = vei[ck];
    if (typeof inv === "function") return true;
    if (inv && typeof inv.value === "function") return true;
  }
  return false;
}

/**
 * 元素是否绑了框架(React/Vue3)的点击处理器。纯函数,无副作用、不读 computed style。
 * observe fallback 用它作为 cursor:pointer 之外的并列入池信号。
 */
export function hasFrameworkClickHandler(el: Element): boolean {
  const node = el as unknown as Record<string, any>;
  return reactHasClick(node) || vue3HasClick(node);
}
