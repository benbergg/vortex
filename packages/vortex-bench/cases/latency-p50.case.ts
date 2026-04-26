// latency-p50：测定 v0.5 单 action 调用延迟 P50/P90 baseline，作为 v0.6 相对值 SLO 锚点。
// 同时记录 token baseline 占位（v0.5 ctx.call 不返 tokenUsed，PR #4 实施时再扩展 ctx wrapper 真实统计）。
// Native 路径：el-dropdown 触发器 vortex_click × 100；CDP 路径：el-slider 拖拽 × 100。

import type { CaseDefinition } from "../src/types.js";
import { extractEvalJson, extractText } from "./_helpers.js";

const SAMPLES = 100;

/** 从 observe snapshot 里按 accessible name 精确匹配提取 @eN ref（与 el-dropdown.case.ts 同 regex） */
function findRef(snapshot: string, name: string): string | null {
  const re = new RegExp(`(@[ef]?\\d+(?:e\\d+)?)\\s+\\[[^\\]]+\\]\\s+"([^"]*?)"`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(snapshot)) !== null) {
    if (m[2].trim() === name) return m[1];
  }
  return null;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

const def: CaseDefinition = {
  name: "latency-p50",
  // 起始页落在 dropdown，slider 段在 case 内 navigate 切过去
  playgroundPath: "/#/el-dropdown",
  async run(ctx) {
    // ===== Native 路径：dropdown 触发器 vortex_click × N =====
    const snap1 = extractText(await ctx.call("vortex_observe", {}));
    const triggerRef = findRef(snap1, "打开菜单");
    ctx.assert(
      triggerRef !== null,
      `observe 应给出"打开菜单"的 @eN ref，snapshot:\n${snap1.slice(0, 400)}`,
    );

    const native: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const t0 = Date.now();
      await ctx.call("vortex_click", { target: triggerRef });
      native.push(Date.now() - t0);
    }

    // ===== CDP 路径：切到 slider 页 vortex_mouse_drag × N =====
    // TODO: ctx 当前不暴露 playgroundUrl，这里硬编码 5173；PR #1 引入 ctx.playgroundUrl 后改 ${ctx.playgroundUrl}/#/el-slider
    // 先 navigate 到 about:blank 卸载 dropdown，再切 slider，避免 hash router 同 origin state 残留
    await ctx.call("vortex_navigate", { url: "about:blank" });
    await ctx.call("vortex_navigate", { url: "http://localhost:5173/#/el-slider" });
    await ctx.call("vortex_wait_idle", { kind: "dom", timeout: 5000 });

    // 取 slider runner bbox（与 el-slider-drag.case.ts 同 selector）
    const geom = extractEvalJson<{
      runner: { cx: number; cy: number };
      target: { cx: number; cy: number };
    } | null>(
      await ctx.call("vortex_evaluate", {
        code: `(() => {
          const rail = document.querySelector('[data-testid="target-slider"] .el-slider__runway');
          const btn = document.querySelector('[data-testid="target-slider"] .el-slider__button-wrapper');
          if (!rail || !btn) return null;
          const rRect = rail.getBoundingClientRect();
          const bRect = btn.getBoundingClientRect();
          const cy = bRect.top + bRect.height / 2;
          // 拖一个小步长 +5%，避开 step 量化噪声
          return {
            runner: { cx: bRect.left + bRect.width / 2, cy },
            target: { cx: rRect.left + rRect.width * 0.55, cy },
          };
        })()`,
      }),
    );
    ctx.assert(geom != null, "未拿到 slider rail/runner bbox（slider 页可能未 mount）");

    const cdp: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const t0 = Date.now();
      await ctx.call("vortex_mouse_drag", {
        fromX: geom!.runner.cx,
        fromY: geom!.runner.cy,
        toX: geom!.target.cx,
        toY: geom!.target.cy,
        steps: 5,
      });
      cdp.push(Date.now() - t0);
    }

    // ===== 写入自定义指标（依赖 Step 1.5 的 ctx.recordMetric） =====
    ctx.recordMetric("nativeP50_ms", percentile(native, 0.5));
    ctx.recordMetric("nativeP90_ms", percentile(native, 0.9));
    ctx.recordMetric("cdpP50_ms", percentile(cdp, 0.5));
    ctx.recordMetric("cdpP90_ms", percentile(cdp, 0.9));
    ctx.recordMetric("sampleCount", SAMPLES);
    // token baseline：v0.5 ctx.call 不返 tokenUsed，先记 0；
    // PR #4 实施时扩展 ctx wrapper 真实统计 MCP IPC token
    ctx.recordMetric("totalTokenBaseline", 0);
  },
};

export default def;
