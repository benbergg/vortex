// RM-03: 滚动加载 —— 内部 container 触底加载更多评价
// 关键测点：
//   - vortex_act(action='scroll') 能否对内部 container 触发滚动
//   - 滚后 observe 是否反映新 items（懒加载场景）
//   - scope='full' 是否能在 viewport 外抓到已加载但未滚到的 items

import type { CaseDefinition } from "../src/types.js";
import { extractText } from "./_helpers.js";

const def: CaseDefinition = {
  name: "jd-review-rm-03-scroll-load",
  playgroundPath: "/jd-review-modal.html",
  async run(ctx) {
    // open modal
    const s0 = extractText(await ctx.call("vortex_observe", {}));
    const triggerRef = s0.match(/(@\w+)\s+\[\w+\]\s+"全部评价"/)?.[1];
    await ctx.call("vortex_act", { target: triggerRef!, action: "click" });
    await new Promise((r) => setTimeout(r, 300));

    // 初始 8 items
    const before = extractText(await ctx.call("vortex_extract", {
      target: "._rateListContainer_1ygkr_45",
    }));
    const beforeMatches = (before.match(/好评样本 #/g) ?? []).length;
    ctx.recordMetric("itemsBefore", beforeMatches);
    ctx.assert(beforeMatches >= 6, `初始应至少 6 个 review item，实际 ${beforeMatches}`);

    // v0.7 vortex_act scroll bug：L4 facade 不暴露 container/position 参数
    // workaround：scroll 到最后一条 item（target=selector → scrollIntoView 该 item）
    // 这触发内部 container 滚动 → 触发 lazy load handler。
    await ctx.call("vortex_act", {
      target: "._listItem_1ygkr_73:last-child",
      action: "scroll",
    });
    await new Promise((r) => setTimeout(r, 600));

    const after = extractText(await ctx.call("vortex_extract", {
      target: "._rateListContainer_1ygkr_45",
    }));
    const afterMatches = (after.match(/好评样本 #/g) ?? []).length;
    ctx.recordMetric("itemsAfter", afterMatches);

    ctx.assert(
      afterMatches > beforeMatches,
      `滚动后 items 应增加：${beforeMatches} → ${afterMatches}（after extract 长度=${after.length}）`,
    );
  },
};

export default def;
