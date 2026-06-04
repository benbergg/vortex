// 缺口 E — open shadow 点击全链路。镜像 Stagehand shadow_dom:
// observe(querySelectorAllDeep 穿 open shadow)→ act-via-ref → extract 标记串。
// 实测 grounding(2026-06-04):默认 frames 即可穿 main 内 open shadow。
import type { CaseDefinition } from "../src/types.js";
import { findRef, extractText, assertExtractEquals } from "./_helpers.js";

const def: CaseDefinition = {
  name: "shadow-open-click",
  playgroundPath: "/synth/shadow-open-click.html",
  tier: "hard",
  async run(ctx) {
    const snap = extractText(await ctx.call("vortex_observe", {}));
    const ref = findRef(snap, "open shadow 按钮");
    ctx.assert(ref !== null, `observe 应穿 open shadow 暴露按钮。snapshot:\n${snap.slice(0, 400)}`);
    await ctx.call("vortex_act", { action: "click", target: ref as string });
    await assertExtractEquals(ctx, '[data-testid="result"]', "open-clicked");
  },
};
export default def;
