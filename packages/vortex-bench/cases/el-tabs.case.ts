// el-tabs：切 Tab 后操作 Tab 内部 widget（input）。
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
  name: "el-tabs",
  playgroundPath: "/#/el-tabs",
  tier: "medium",
  async run(ctx) {
    // 找 "Tab 2" tab ref（role=tab 已在 observe INTERACTIVE_SELECTORS）
    const snap = extractText(await ctx.call("vortex_observe", {}));
    const tabRef = findRef(snap, "Tab 2");
    ctx.assert(tabRef !== null, `observe 应给出"Tab 2" ref: ${snap.slice(0, 300)}`);
    await ctx.call("vortex_act", {
      action: "click",
      target: tabRef
    });
    await ctx.call("vortex_wait_for", {
      mode: "idle",
      value: "dom",
      timeout: 1000
    });

    // 在 Tab 2 的 input 输入
    await ctx.call("vortex_act", {
      action: "type",
      target: "[data-testid=\"tab2-input\"] input",
      text: "hello"
    });

    await assertResultContains(ctx, "active=tab2");
    await assertResultContains(ctx, "tab2Input=hello");
  },
};

export default def;
