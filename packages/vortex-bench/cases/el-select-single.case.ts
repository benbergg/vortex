// el-select 单选：验证 vortex_fill kind=select 能直接落值。
// 已知 vortex bug：fill kind=select 报 "No commit driver for kind=select. Known: ..., select"（自相矛盾）。
// 修好后 fallbackToEvaluate 应为 0。

import type { CaseDefinition } from "../src/types.js";
import { assertResultContains, extractText } from "./_helpers.js";

const def: CaseDefinition = {
  name: "el-select-single",
  playgroundPath: "/#/el-select-single",
  async run(ctx) {
    // 尝试首选路径：vortex_fill kind=select
    let fillOk = false;
    let fillText = "";
    try {
      const res = await ctx.call("vortex_fill", {
        target: "[data-testid=\"target-select\"]",
        kind: "select",
        value: "Option B",
      });
      fillText = extractText(res);
      fillOk = !fillText.toLowerCase().includes("error") && !fillText.includes("INVALID_PARAMS");
    } catch (err) {
      fillText = err instanceof Error ? err.message : String(err);
      fillOk = false;
    }

    if (!fillOk) {
      // 兜底：点 trigger 打开 + 等 popper + 点选项
      const clickRes = await ctx.fallbackEvaluate({
        code: `(() => {
          const wrapper = document.querySelector('[data-testid="target-select"]');
          if (!wrapper) return 'no-wrapper';
          const trigger = wrapper.querySelector('.el-select__wrapper') || wrapper.querySelector('input');
          if (!trigger) return 'no-trigger:' + wrapper.innerHTML.slice(0,120);
          trigger.click();
          return 'clicked';
        })()`,
      });
      const clickText = extractText(clickRes);
      await ctx.call("vortex_wait_idle", { kind: "dom", timeout: 2000 });
      const pickRes = await ctx.fallbackEvaluate({
        code: `(() => {
          const items = [];
          for (const el of document.querySelectorAll('.el-select-dropdown__item')) {
            const t = el.textContent?.trim() ?? '';
            const visible = el.getBoundingClientRect().width > 0;
            items.push({ text: t, visible });
            if (t === 'Option B' && visible) { el.click(); return { clicked: 'Option B' }; }
          }
          return { clicked: null, items };
        })()`,
      });
      const picked = extractText(pickRes);
      // 如果最终没点成，把诊断信息附上
      ctx.assert(
        !picked.includes(`"clicked":null`),
        `fill 失败且兜底点击未命中 Option B。fill: ${fillText.slice(0, 120)} | openTrigger: ${clickText} | pick: ${picked.slice(0, 300)}`,
      );
    }

    // 验证：v-model 是 value 'B'，result 区显示 "选中值：B"
    await assertResultContains(ctx, "选中值：B");
  },
};

export default def;
