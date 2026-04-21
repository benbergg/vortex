// el-time-picker：纯 time（无 date）。Element Plus 用 spinner 选 HH/MM/SS；
// 试简单路径——直接 type 进 input + Enter 提交，看 Element Plus 是否 parse。
import type { CaseDefinition } from "../src/types.js";
import { assertResultContains } from "./_helpers.js";

const TIME = "14:30:45";

const def: CaseDefinition = {
  name: "el-time-picker",
  playgroundPath: "/#/el-time-picker",
  async run(ctx) {
    // 先 click input 打开 picker
    await ctx.call("vortex_click", {
      target: "[data-testid=\"target-time-picker\"] input",
    });
    await ctx.call("vortex_wait_idle", { kind: "dom", timeout: 1000 });
    // 直接键入时间字符串到 input（type 走真实键盘事件，触发 v-model）
    await ctx.call("vortex_type", {
      target: "[data-testid=\"target-time-picker\"] input",
      text: TIME,
    });
    // 按 Enter 提交（Element Plus time picker 监听 Enter）
    await ctx.call("vortex_press", { key: "Enter" });
    await ctx.call("vortex_wait_idle", { kind: "dom", timeout: 1000 });

    await assertResultContains(ctx, `time=${TIME}`);
  },
};

export default def;
