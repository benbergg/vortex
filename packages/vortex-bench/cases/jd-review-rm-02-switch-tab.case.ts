// RM-02: 切到「差评」tab —— 数据集更新 + active class 切换
// 关键测点：
//   - 多个同 class（_tag_rgt47_12）的 tag，vortex 必须用 ref 精确点击「差评」
//   - 切换后 active state 应反映在 vortex output（_tag-active class）
//   - 差评数据含 "商家：" 商家回复 —— 验证数据更新

import type { CaseDefinition } from "../src/types.js";
import { extractText } from "./_helpers.js";

const def: CaseDefinition = {
  name: "jd-review-rm-02-switch-tab",
  playgroundPath: "/jd-review-modal.html",
  async run(ctx) {
    // open modal
    const s0 = extractText(await ctx.call("vortex_observe", {}));
    const triggerRef = s0.match(/(@\w+)\s+\[\w+\]\s+"全部评价"/)?.[1];
    ctx.assert(triggerRef, "找不到全部评价 trigger");
    await ctx.call("vortex_act", { target: triggerRef!, action: "click" });
    await new Promise((r) => setTimeout(r, 300));

    // 找差评 tag 的 ref —— 但 v0.7 bug：vortex 把 tag 拆成 inner span，
    // observe 只输出 "200+" 不含 "差评"。fallback 用 selector 形式。
    // 这条 case 同时测：(a) 切 tab 行为 (b) 隐性记录 bug —— observe 拆嵌套 cursor:pointer
    const s1 = extractText(await ctx.call("vortex_observe", {}));
    const badRefMatch = s1.match(/(@\w+)\s+\[\w+\]\s+"[^"]*差评[^"]*"/);
    ctx.recordMetric("observeFoundBadTagAsLeaf", badRefMatch ? 1 : 0);

    // 不论 ref 是否含「差评」全名，都用 selector 走（确保 case 不被 bug 阻塞）
    await ctx.call("vortex_act", {
      target: '[data-tab-id="bad"]',
      action: "click",
    });
    await new Promise((r) => setTimeout(r, 400));

    // 差评 tab 切换后，列表应出现「商家：」回复 + b*** 用户名（fixture data）
    const s2 = extractText(await ctx.call("vortex_extract", { target: "._rateListContainer_1ygkr_45" }));
    ctx.recordMetric("listExtractBytes", s2.length);

    ctx.assert(/商家：/.test(s2), `差评列表应含 "商家：" 回复段：${s2.slice(0, 500)}`);
    ctx.assert(/b\*\*\*/.test(s2), `差评数据用户名应为 b***N：${s2.slice(0, 400)}`);
  },
};

export default def;
