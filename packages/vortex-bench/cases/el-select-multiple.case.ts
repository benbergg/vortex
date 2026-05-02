// el-select 多选 + tag：验证 vortex_fill kind=select value=[...] 能否一次写多个。
// 预期和 el-select-single 同因失败，走兜底（连续点击 2 个选项）。

import type { CaseDefinition } from "../src/types.js";
import { assertResultContains, extractText } from "./_helpers.js";

const def: CaseDefinition = {
  name: "el-select-multiple",
  playgroundPath: "/#/el-select-multiple",
  async run(ctx) {
    let fillOk = false;
    let fillText = "";
    try {
      const res = await ctx.call("vortex_act", {
        action: "fill",
        target: "[data-testid=\"target-select-multiple\"]",
        kind: "select",
        value: ["Option A", "Option C"]
      });
      fillText = extractText(res);
      fillOk = !fillText.toLowerCase().includes("error") && !fillText.includes("INVALID_PARAMS");
    } catch (err) {
      fillText = err instanceof Error ? err.message : String(err);
      fillOk = false;
    }

    if (!fillOk) {
      // 兜底：点 trigger + 点两个选项
      await ctx.fallbackEvaluate({
        code: `(() => {
          const w = document.querySelector('[data-testid="target-select-multiple"]');
          const t = w?.querySelector('.el-select__wrapper') || w?.querySelector('input');
          if (t) { (t).click(); return 'ok'; }
          return 'no-trigger';
        })()`,
      });
      await ctx.call("vortex_wait_for", {
        mode: "idle",
        value: "dom",
        timeout: 2000
      });
      for (const label of ["Option A", "Option C"]) {
        await ctx.fallbackEvaluate({
          code: `(() => {
            for (const el of document.querySelectorAll('.el-select-dropdown__item')) {
              if (el.textContent?.trim() === ${JSON.stringify(label)} && el.getBoundingClientRect().width > 0) {
                el.click(); return 'ok';
              }
            }
            return 'not-found';
          })()`,
        });
      }
    }

    await assertResultContains(ctx, "A");
    await assertResultContains(ctx, "C");
  },
};

export default def;
