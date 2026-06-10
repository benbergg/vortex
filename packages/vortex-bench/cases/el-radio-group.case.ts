// el-radio-group：选某个 radio。Element Plus el-radio 是 label 包 input。
import type { CaseDefinition } from "../src/types.js";
import { assertResultContains, extractText } from "./_helpers.js";

function findRef(snapshot: string, name: string): string | null {
  // a11y-tree 格式：`- role "name" [ref=@..]`，ref 在 [ref=] 内（旧扁平是行首 @ref [role] "name"）。
  const re = new RegExp(`-\\s+\\S+\\s+"([^"]*?)"\\s+\\[ref=(@[\\w:]+)\\]`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(snapshot)) !== null) {
    if (m[1].trim() === name) return m[2];
  }
  return null;
}

const def: CaseDefinition = {
  name: "el-radio-group",
  playgroundPath: "/#/el-radio-group",
  tier: "medium",
  async run(ctx) {
    const snap = extractText(await ctx.call("vortex_observe", {}));
    // observe 应给出 radio 的 ref（Element Plus el-radio 渲染含 [role=radio] 输入）
    const ref = findRef(snap, "选项 B");
    if (ref) {
      await ctx.call("vortex_act", {
        action: "click",
        target: ref
      });
    } else {
      ctx.recordObserveMiss(1);
      await ctx.fallbackEvaluate({
        code: `(() => {
          for (const lab of document.querySelectorAll('[data-testid="target-radio-group"] .el-radio')) {
            if ((lab.textContent || '').includes('选项 B')) {
              lab.click(); return 'ok';
            }
          }
          return 'not-found';
        })()`,
      });
    }
    await assertResultContains(ctx, "选中：B");
  },
};

export default def;
