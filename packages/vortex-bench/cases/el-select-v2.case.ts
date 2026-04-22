// el-select-v2（虚拟滚动）：测前几条选项是否可达。
// 后续虚拟滚动跨屏定位是独立 case。
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
  name: "el-select-v2",
  playgroundPath: "/#/el-select-v2",
  async run(ctx) {
    // 先试 fill kind=select（Select V2 API 对齐 el-select）
    let fillOk = false;
    let fillText = "";
    try {
      const res = await ctx.call("vortex_fill", {
        target: "[data-testid=\"target-select-v2\"]",
        kind: "select",
        value: "Option 5",
      });
      fillText = extractText(res);
      fillOk = !fillText.toLowerCase().includes("error") && !fillText.includes("INVALID_PARAMS");
    } catch (err) {
      fillText = err instanceof Error ? err.message : String(err);
      fillOk = false;
    }

    if (!fillOk) {
      // 兜底：点 trigger + observe option ref + click
      await ctx.fallbackEvaluate({
        code: `(() => {
          const t = document.querySelector('[data-testid="target-select-v2"] .el-select__wrapper');
          (t)?.click();
          return 'ok';
        })()`,
      });
      await ctx.call("vortex_wait_idle", { kind: "dom", timeout: 1000 });

      const snap = extractText(await ctx.call("vortex_observe", {}));
      const ref = findRef(snap, "Option 5");
      if (ref) {
        await ctx.call("vortex_click", { target: ref });
      } else {
        ctx.recordObserveMiss(1);
        await ctx.fallbackEvaluate({
          code: `(() => {
            for (const el of document.querySelectorAll('.el-select-dropdown__item, .el-select-v2__option, [role="option"]')) {
              if (el.textContent?.trim() === 'Option 5' && el.getBoundingClientRect().width > 0) {
                el.click(); return 'ok';
              }
            }
            return 'not-found';
          })()`,
        });
      }
    }

    await assertResultContains(ctx, "value=opt-5");
  },
};

export default def;
