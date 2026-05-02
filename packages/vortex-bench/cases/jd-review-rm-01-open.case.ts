// RM-01: 打开 JD 评价弹窗（cursor:pointer div + portal 渲染）
// 关键测点：
//   - .all-btn 是 div + cursor:pointer，无 role —— vortex cursor:pointer fallback 应识别
//   - 弹窗渲染在 #rateList portal，跨 DOM 树仍可被 observe 抓到
//   - 双层 tag 都用 ._tag_rgt47_12 同 class，应该都是可点

import type { CaseDefinition } from "../src/types.js";
import { extractText } from "./_helpers.js";

const def: CaseDefinition = {
  name: "jd-review-rm-01-open",
  playgroundPath: "/jd-review-modal.html",
  async run(ctx) {
    // 初始 observe — 应抓到 .all-btn（cursor:pointer 自定义可点）
    const snap1 = extractText(await ctx.call("vortex_observe", {}));
    ctx.recordMetric("snap1Bytes", snap1.length);

    // .all-btn 应在 snap1 里有 ref（cursor:pointer fallback 收到）
    ctx.assert(
      /全部评价/.test(snap1),
      `主页 observe 应含 "全部评价" trigger：${snap1.slice(0, 600)}`,
    );

    // 取 ref 并 click
    const matchTrigger = snap1.match(/(@\w+)\s+\[\w+\]\s+"全部评价"/);
    ctx.assert(matchTrigger !== null, `应找到 "全部评价" 的 ref：${snap1.slice(0, 400)}`);
    const triggerRef = matchTrigger![1];

    await ctx.call("vortex_act", { target: triggerRef, action: "click" });
    await new Promise((r) => setTimeout(r, 300));

    // 弹窗打开后再 observe — 应含 "商品评价" 标题（但 v0.7 bug 可能拆 text）
    const snap2 = extractText(await ctx.call("vortex_observe", {}));
    ctx.recordMetric("snap2Bytes", snap2.length);

    // 弹窗 modal title 用 extract 验证（绕开 observe 拆 leaf 的 bug）
    const title = extractText(await ctx.call("vortex_extract", { target: ".modal-title" }));
    ctx.assert(/商品评价/.test(title), `modal title 应含 "商品评价"，实际 ${title}`);

    // close icon 应被 vortex 收（cursor:pointer + 单字符 ×）
    ctx.assert(/×/.test(snap2), `observe 应含 close icon "×"：${snap2.slice(0, 600)}`);

    // 验证至少能识别 sort buttons（最新 / 当前商品 — 这些是 div 文本无 inner span）
    ctx.assert(/最新/.test(snap2), `observe 应含 "最新" 排序`);
    ctx.assert(/当前商品/.test(snap2), `observe 应含 "当前商品" 排序`);

    // 记录 tag bug 指标（预期会 fail 因为只有 inner span 被收）
    const tagFullMatches = (snap2.match(/全部 96%好评|图\/视频 5000\+|好评 2万\+|差评 200\+/g) ?? []);
    ctx.recordMetric("fullTagNamesObserved", tagFullMatches.length);
    const tagInnerMatches = (snap2.match(/96%好评|5000\+|2万\+|200\+/g) ?? []);
    ctx.recordMetric("innerSpanCountsObserved", tagInnerMatches.length);
  },
};

export default def;
