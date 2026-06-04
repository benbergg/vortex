// 从 className 推断控件角色名。observe 的 require-name 门(gate probe)会把「无 role /
// 无 name / cursor:pointer」的自定义控件(vxe-table 复选框 `vxe-cell--checkbox`:CSS
// 字体图标无 svg/img、无 aria/text)当装饰 wrapper 滤掉(2026-06-04 bytenew dogfood)。
// 控件类名(末位 token = checkbox/radio/switch/toggle)是 page JS 可读的语义信号——
// 业界(Playwright aria / CDP / browser-use)共识「无名 ≠ 该过滤」,真正分水岭是 role。
//
// 终末 token 规则(噪声收敛核心):仅当控件关键词是某个 class 按 BEM/连字符切词后的
// **末位 token** 才命中——`vxe-cell--checkbox`→checkbox ✓;`switch-language`→language ✗、
// `checkbox-wrapper`→wrapper ✗,切掉「含关键词但非控件」假阳。
//
// 与 observe.ts 注入体(executeScript func 自包含、不能 import)内联的同名逻辑保持
// 同语义,此处为可单测真源——改一处须同步另一处。

const CONTROL_KEYWORDS = new Set(["checkbox", "radio", "switch", "toggle"]);

/** toggle 规范化为 ARIA role `switch`,其余原样。 */
function canonicalRole(kw: string): string {
  return kw === "toggle" ? "switch" : kw;
}

/**
 * 元素 className 的某个 class 末位 token ∈ {checkbox,radio,switch,toggle} 时返回规范
 * role 名,否则返空。纯函数,无副作用、不读 computed style。
 */
export function controlRoleFromClass(el: Element): string {
  const cls =
    el.className && typeof el.className === "string" ? el.className : "";
  for (const c of cls.split(/\s+/).filter(Boolean)) {
    // 按 BEM(`--`/`__`)与连字符切词,取末位 token。
    const tokens = c.split(/--|__|-/).filter(Boolean);
    const last = tokens[tokens.length - 1]?.toLowerCase();
    if (last && CONTROL_KEYWORDS.has(last)) return canonicalRole(last);
  }
  return "";
}
