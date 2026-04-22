// el-slider：借助 show-input 的 input-number 直接 type 目标值。
import type { CaseDefinition } from "../src/types.js";
import { assertResultContains } from "./_helpers.js";

const def: CaseDefinition = {
  name: "el-slider",
  playgroundPath: "/#/el-slider",
  async run(ctx) {
    // 用 nativeInputValueSetter 设值 + dispatch 让 Vue v-model 同步
    await ctx.fallbackEvaluate({
      code: `(() => {
        const el = document.querySelector('[data-testid="target-slider"] .el-input-number input');
        if (!el) return 'no-input';
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(el, '50');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.blur();
        return 'ok';
      })()`,
    });
    await ctx.call("vortex_wait_idle", { kind: "dom", timeout: 500 });
    await ctx.call("vortex_wait_idle", { kind: "dom", timeout: 1000 });

    await assertResultContains(ctx, "val=50");
  },
};

export default def;
