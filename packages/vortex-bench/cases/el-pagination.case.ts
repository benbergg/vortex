// el-pagination：click 页码切换 current page。
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
  name: "el-pagination",
  playgroundPath: "/#/el-pagination",
  async run(ctx) {
    // Element Plus pagination li 有 aria-label="page N"，优先用它命中
    const snap = extractText(await ctx.call("vortex_observe", {}));
    const pg3 = findRef(snap, "page 3") ?? findRef(snap, "3");
    if (pg3) {
      await ctx.call("vortex_click", { target: pg3 });
    } else {
      ctx.recordObserveMiss(1);
      await ctx.fallbackEvaluate({
        code: `(() => {
          for (const li of document.querySelectorAll('[data-testid="target-pagination"] .el-pager li')) {
            if ((li.textContent || '').trim() === '3' && li.getBoundingClientRect().width > 0) {
              li.click(); return 'ok';
            }
          }
          return 'not-found';
        })()`,
      });
    }

    await assertResultContains(ctx, "page=3");
  },
};

export default def;
