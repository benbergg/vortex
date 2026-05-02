// el-dialog + 嵌套 el-select：测 teleport 套 teleport，observe 能否区分层级。

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
  name: "el-dialog-nested",
  playgroundPath: "/#/el-dialog-nested",
  async run(ctx) {
    // 1. observe 定位触发按钮 → 打开 dialog
    const snap1 = extractText(await ctx.call("vortex_observe", {}));
    const openBtn = findRef(snap1, "打开对话框");
    ctx.assert(openBtn !== null, `observe 看不到"打开对话框"按钮: ${snap1.slice(0, 300)}`);
    await ctx.call("vortex_act", {
      action: "click",
      target: openBtn
    });
    await ctx.call("vortex_wait_for", {
      mode: "idle",
      value: "dom",
      timeout: 1500
    });

    // 2. dialog 打开后 observe 应能看到 inside-select 区的 combobox
    //    用 fill kind=select 尝试（会触发 bug），不行就 fallback
    let ok = false;
    try {
      const res = await ctx.call("vortex_act", {
        action: "fill",
        target: "[data-testid=\"inside-select\"]",
        kind: "select",
        value: "Y"
      });
      const t = extractText(res);
      ok = !t.toLowerCase().includes("error") && !t.includes("INVALID_PARAMS");
    } catch {
      ok = false;
    }
    if (!ok) {
      await ctx.fallbackEvaluate({
        code: `(() => {
          const w = document.querySelector('[data-testid="inside-select"]');
          const t = w?.querySelector('.el-select__wrapper') || w?.querySelector('input');
          (t)?.click();
          return 'ok';
        })()`,
      });
      await ctx.call("vortex_wait_for", {
        mode: "idle",
        value: "dom",
        timeout: 1500
      });
      await ctx.fallbackEvaluate({
        code: `(() => {
          for (const el of document.querySelectorAll('.el-select-dropdown__item')) {
            if (el.textContent?.trim() === 'Y' && el.getBoundingClientRect().width > 0) {
              el.click(); return 'ok';
            }
          }
          return 'not-found';
        })()`,
      });
    }

    await assertResultContains(ctx, "dialogOpen=true");
    await assertResultContains(ctx, "inside=Y");
  },
};

export default def;
