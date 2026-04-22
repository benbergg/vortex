// el-select-v2 虚拟滚动跨屏：从 1000 条选项里挑 Option 500（远超初始 viewport）。
// 策略：用 filterable 在 input 里 type "500" 过滤，让 virtual list 只剩匹配项。
import type { CaseDefinition } from "../src/types.js";
import { assertResultContains, extractText } from "./_helpers.js";

function findRef(snapshot: string, name: string): string | null {
  const re = new RegExp(`(@[ef]?\\d+(?:e\\d+)?)\\s+\\[[^\\]]+\\]\\s+"([^"]*?)"`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(snapshot)) !== null) {
    if (m[2].trim() === name) return m[1];
  }
  return null;
}

const def: CaseDefinition = {
  name: "el-select-v2-virtual",
  playgroundPath: "/#/el-select-v2",
  async run(ctx) {
    // 1. click trigger 打开 dropdown + focus 输入框
    await ctx.call("vortex_click", {
      target: "[data-testid=\"target-select-v2\"] .el-select__wrapper",
    });
    await ctx.call("vortex_wait_idle", { kind: "dom", timeout: 800 });

    // 2. type 过滤，让虚拟列表只显示匹配项
    await ctx.call("vortex_type", {
      target: "[data-testid=\"target-select-v2\"] input",
      text: "500",
    });
    await ctx.call("vortex_wait_idle", { kind: "dom", timeout: 800 });

    // 3. observe 抓 "Option 500" ref
    const snap = extractText(await ctx.call("vortex_observe", {}));
    const ref = findRef(snap, "Option 500");
    if (ref) {
      await ctx.call("vortex_click", { target: ref });
    } else {
      ctx.recordObserveMiss(1);
      await ctx.fallbackEvaluate({
        code: `(() => {
          for (const el of document.querySelectorAll('[role="option"], .el-select-dropdown__item')) {
            if (el.textContent?.trim() === 'Option 500' && el.getBoundingClientRect().width > 0) {
              el.click(); return 'ok';
            }
          }
          return 'not-found';
        })()`,
      });
    }

    await assertResultContains(ctx, "value=opt-500");
  },
};

export default def;
