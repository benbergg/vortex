// el-slider 真拖拽：CDP mouseDown → N 步 move → mouseUp 从 20 拖到 ~80
// 验证新 vortex_mouse_drag 工具 + slider 对真鼠标 drag 响应。
import type { CaseDefinition } from "../src/types.js";
import { assertResultContains, extractEvalJson } from "./_helpers.js";

const def: CaseDefinition = {
  name: "el-slider-drag",
  playgroundPath: "/#/el-slider",
  async run(ctx) {
    // 1. 取 runner + rail bbox
    const geom = extractEvalJson<{
      runner: { cx: number; cy: number };
      target: { cx: number; cy: number };
    }>(
      await ctx.call("vortex_evaluate", {
        code: `(() => {
          const rail = document.querySelector('[data-testid="target-slider"] .el-slider__runway');
          const btn = document.querySelector('[data-testid="target-slider"] .el-slider__button-wrapper');
          if (!rail || !btn) return null;
          const rRect = rail.getBoundingClientRect();
          const bRect = btn.getBoundingClientRect();
          // 目标：rail.left + rail.width * 0.8（val=0..100，80%）
          const targetX = rRect.left + rRect.width * 0.8;
          const cy = bRect.top + bRect.height / 2;
          return {
            runner: { cx: bRect.left + bRect.width / 2, cy },
            target: { cx: targetX, cy },
          };
        })()`,
      }),
    );
    ctx.assert(geom != null, "未拿到 slider rail/runner bbox");

    // 2. CDP drag
    await ctx.call("vortex_mouse_drag", {
      fromX: geom.runner.cx,
      fromY: geom.runner.cy,
      toX: geom.target.cx,
      toY: geom.target.cy,
      steps: 15,
    });
    await ctx.call("vortex_wait_for", {
      mode: "idle",
      value: "dom",
      timeout: 500
    });

    // 3. 断言 val 靠近 80（slider step=1，drag 可能 ±2，接受 78-82）
    const result = extractEvalJson<string>(
      await ctx.call("vortex_evaluate", {
        code: `document.querySelector('[data-testid="result"]')?.textContent?.trim() || ''`,
      }),
    );
    const m = result.match(/val=(\d+)/);
    ctx.assert(m !== null, `result 格式未知: ${result}`);
    const val = Number(m[1]);
    ctx.assert(
      val >= 78 && val <= 82,
      `val 应在 78-82 (drag 80%)，实际 ${val}`,
    );
  },
};

export default def;
