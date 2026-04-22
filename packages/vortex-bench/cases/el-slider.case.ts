// el-slider：借助 show-input 的 input-number 直接 type 目标值。
import type { CaseDefinition } from "../src/types.js";
import { assertResultContains } from "./_helpers.js";

const def: CaseDefinition = {
  name: "el-slider",
  playgroundPath: "/#/el-slider",
  async run(ctx) {
    // focus → 清空 → 键入新值 → 回车
    await ctx.call("vortex_click", {
      target: "[data-testid=\"target-slider\"] .el-input-number input",
    });
    await ctx.call("vortex_press", { key: "Backspace" });
    await ctx.call("vortex_press", { key: "Backspace" });
    await ctx.call("vortex_type", {
      target: "[data-testid=\"target-slider\"] .el-input-number input",
      text: "50",
    });
    await ctx.call("vortex_press", { key: "Enter" });
    await ctx.call("vortex_wait_idle", { kind: "dom", timeout: 500 });
    await ctx.call("vortex_wait_idle", { kind: "dom", timeout: 1000 });

    await assertResultContains(ctx, "val=50");
  },
};

export default def;
