// RM-04: 关闭弹窗 —— div+cursor:pointer 的 close icon
// 关键测点：
//   - 关闭 div（无 role 无 aria-label）能被 vortex 收到
//   - Escape 键关闭兜底（vortex_press）
//   - 关闭后 observe 不应再含弹窗内 tag

import type { CaseDefinition } from "../src/types.js";
import { extractText } from "./_helpers.js";

const def: CaseDefinition = {
  name: "jd-review-rm-04-close",
  playgroundPath: "/jd-review-modal.html",
  async run(ctx) {
    // open modal
    const s0 = extractText(await ctx.call("vortex_observe", {}));
    const triggerRef = s0.match(/(@\w+)\s+\[\w+\]\s+"全部评价"/)?.[1];
    await ctx.call("vortex_act", { target: triggerRef!, action: "click" });
    await new Promise((r) => setTimeout(r, 500));

    // 弹窗已开（observe 应见 close icon ×）
    const sOpen = extractText(await ctx.call("vortex_observe", {}));
    ctx.assert(/×/.test(sOpen), `弹窗未打开（observe 不含 close ×）：${sOpen.slice(0, 300)}`);

    // 主路径：close icon click —— vortex 把 div+cursor:pointer "×" 收为 ref
    // 注意 v0.7 bug：vortex_extract 不过滤 display:none 隐藏文本（修订诚实版的发现），
    // 所以关闭验证用 observe 看是否还能拿到弹窗内 tag/close ref。
    const s2 = extractText(await ctx.call("vortex_observe", {}));
    const closeMatch = s2.match(/(@\w+)\s+\[\w+\]\s+"×"/);
    ctx.assert(closeMatch !== null, `应找到 close icon "×" ref：${s2.slice(0, 500)}`);
    await ctx.call("vortex_act", { target: closeMatch![1], action: "click" });
    await new Promise((r) => setTimeout(r, 400));

    // observe 过滤 hidden 元素：关闭后 modal 内 ref 应都不再出现
    const s3 = extractText(await ctx.call("vortex_observe", {}));
    ctx.recordMetric("afterCloseObsBytes", s3.length);
    ctx.assert(!/×/.test(s3), `observe 仍含 × close icon，弹窗未关闭：${s3.slice(0, 400)}`);
    ctx.assert(!/200\+/.test(s3), `observe 仍含弹窗内 tag，弹窗未关闭`);
    ctx.recordMetric("closeIconClickWorked", 1);

    // 副路径：Escape 兜底测试（指标记录，不 fail）
    await ctx.call("vortex_act", { target: triggerRef!, action: "click" });
    await new Promise((r) => setTimeout(r, 300));
    await ctx.call("vortex_press", { key: "Escape" });
    await new Promise((r) => setTimeout(r, 300));
    const s4 = extractText(await ctx.call("vortex_observe", {}));
    const escapeWorked = !/×/.test(s4);
    ctx.recordMetric("escapeKeyWorked", escapeWorked ? 1 : 0);
  },
};

export default def;
