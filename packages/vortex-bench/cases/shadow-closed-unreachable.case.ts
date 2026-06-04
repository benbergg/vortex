// 缺口 E — closed shadow 不可达的优雅失败契约。镜像 Stagehand csr 变体,但按 vortex
// 真实能力重定义标准:closed shadow 内元素对 ref/selector/evaluate 全不可达(Web 平台
// 设计,el.shadowRoot=null)→ vortex_act 应**明确报错**,而非 success:true 却无效果。
// 实测 grounding(2026-06-04):observe 零交互,act(#cbtn) → Error[TIMEOUT]/NOT_ATTACHED。
// 本 case 锁的是"不静默假成功"契约——不可达不可怕,假成功才可怕。
import type { CaseDefinition } from "../src/types.js";
import { extractText } from "./_helpers.js";

const def: CaseDefinition = {
  name: "shadow-closed-unreachable",
  playgroundPath: "/synth/shadow-closed-unreachable.html",
  tier: "hard",
  async run(ctx) {
    let errored = false;
    let detail = "";
    try {
      // 短 timeout 避免等满默认 5s(closed shadow 内元素永不可达)。
      const res = await ctx.call("vortex_act", {
        action: "click",
        target: "#cbtn",
        options: { timeout: 1500 },
      });
      detail = extractText(res);
      errored = Boolean((res as { isError?: boolean }).isError) || /Error \[[A-Z_]+\]/.test(detail);
    } catch (e) {
      errored = true;
      detail = e instanceof Error ? e.message : String(e);
    }
    ctx.assert(errored, `closed shadow 内元素 act 应明确报错(不可达),实际无错误: ${detail.slice(0, 200)}`);

    // 关键契约:确认非静默假成功——result 不应被改成 closed-clicked。
    const resultText = extractText(
      await ctx.call("vortex_extract", { target: '[data-testid="result"]', include: ["text"] }),
    );
    ctx.assert(
      !resultText.includes("closed-clicked"),
      `closed shadow 不应被点中(静默假成功),result=${resultText}`,
    );
  },
};
export default def;
