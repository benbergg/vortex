// el-form 组合：input + select + switch + checkbox-group + submit。
// 验证复合表单能否按顺序填完并提交成功。

import type { CaseDefinition } from "../src/types.js";
import { assertResultContains, extractText } from "./_helpers.js";

const def: CaseDefinition = {
  name: "el-form-composite",
  playgroundPath: "/#/el-form-composite",
  async run(ctx) {
    // 1. name 输入
    //   注意：vortex_fill plain 对 Vue el-input 不 dispatch 'input' 事件 → v-model 不响应。
    //   用 vortex_type 逐字符键入来触发真实 input event（速度慢但有效）。
    await ctx.call("vortex_type", {
      target: "[data-testid=\"form-name\"] input",
      text: "test-name",
    });

    // 2. level 选 "高"（走 el-select）
    let levelOk = false;
    try {
      const res = await ctx.call("vortex_fill", {
        target: "[data-testid=\"form-level\"]",
        kind: "select",
        value: "high",
      });
      const text = extractText(res);
      levelOk = !text.toLowerCase().includes("error") && !text.includes("INVALID_PARAMS");
    } catch {
      levelOk = false;
    }
    if (!levelOk) {
      await ctx.fallbackEvaluate({
        code: `(() => {
          const w = document.querySelector('[data-testid="form-level"]');
          const t = w?.querySelector('.el-select__wrapper') || w?.querySelector('input');
          (t)?.click();
          return 'ok';
        })()`,
      });
      await ctx.call("vortex_wait_idle", { kind: "dom", timeout: 2000 });
      await ctx.fallbackEvaluate({
        code: `(() => {
          for (const el of document.querySelectorAll('.el-select-dropdown__item')) {
            if (el.textContent?.trim() === '高' && el.getBoundingClientRect().width > 0) {
              el.click(); return 'ok';
            }
          }
          return 'not-found';
        })()`,
      });
    }

    // 3. switch 开启：点 .el-switch__core（真正的交互点）
    await ctx.call("vortex_click", {
      target: "[data-testid=\"form-enabled\"] .el-switch__core",
    });

    // 4. checkbox-group 选 alpha + beta
    let cbOk = false;
    try {
      const res = await ctx.call("vortex_fill", {
        target: "[data-testid=\"form-tags\"]",
        kind: "checkbox-group",
        value: ["alpha", "beta"],
      });
      const text = extractText(res);
      cbOk = !text.toLowerCase().includes("error") && !text.includes("INVALID_PARAMS");
    } catch {
      cbOk = false;
    }
    if (!cbOk) {
      for (const v of ["alpha", "beta"]) {
        await ctx.fallbackEvaluate({
          code: `(() => {
            const wrap = document.querySelector('[data-testid="form-tags"]');
            if (!wrap) return 'no-wrap';
            for (const label of wrap.querySelectorAll('.el-checkbox')) {
              if (label.textContent?.includes(${JSON.stringify(v)})) {
                (label).click(); return 'ok';
              }
            }
            return 'not-found';
          })()`,
        });
      }
    }

    // 5. submit
    await ctx.call("vortex_click", {
      target: "[data-testid=\"form-submit\"] button",
    });

    // 断言提交后 result 包含所有字段
    await assertResultContains(ctx, "test-name");
    await assertResultContains(ctx, "high");
    await assertResultContains(ctx, "alpha");
    await assertResultContains(ctx, "beta");
    await assertResultContains(ctx, "\"enabled\":true");
  },
};

export default def;
