// el-tree-select：click trigger 打开 tree panel → 逐级 click 展开 → 选 "浦东"。
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
  name: "el-tree-select",
  playgroundPath: "/#/el-tree-select",
  async run(ctx) {
    // 1. click trigger 打开 panel（tree-select 基于 el-select，trigger 走 .click() 应 OK）
    await ctx.call("vortex_click", {
      target: "[data-testid=\"target-tree-select\"] .el-select__wrapper",
    });
    await ctx.call("vortex_wait_idle", { kind: "dom", timeout: 1500 });

    // 2. 逐级展开 + click 叶子
    for (const label of ["华东", "上海", "浦东"]) {
      const snap = extractText(await ctx.call("vortex_observe", {}));
      const ref = findRef(snap, label);
      if (ref) {
        await ctx.call("vortex_click", { target: ref });
      } else {
        ctx.recordObserveMiss(1);
        await ctx.fallbackEvaluate({
          code: `(() => {
            for (const el of document.querySelectorAll('.el-tree-node__label')) {
              if (el.textContent?.trim() === ${JSON.stringify(label)} && el.getBoundingClientRect().width > 0) {
                el.click(); return 'ok';
              }
            }
            return 'not-found';
          })()`,
        });
      }
      await ctx.call("vortex_wait_idle", { kind: "dom", timeout: 1000 });
    }

    await assertResultContains(ctx, "value=浦东");
  },
};

export default def;
