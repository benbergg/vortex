// 缺口 J — 多字段单条提取。镜像 Stagehand extract_baptist_health:逐字段取文本比对。
// fixture 地址含双空格,expected 单空格 → normalizeString 折叠空白后 exact 命中(确定性 extract 无需 fuzzy)。
import type { CaseDefinition } from "../src/types.js";
import { assertExtractEquals } from "./_helpers.js";

const def: CaseDefinition = {
  name: "extract-multi-field-card",
  playgroundPath: "/synth/extract-multi-field-card.html",
  tier: "easy",
  async run(ctx) {
    await assertExtractEquals(ctx, '[data-testid="addr"]', "123 Main Street, Suite 400");
    await assertExtractEquals(ctx, '[data-testid="phone"]', "(555) 123-4567");
    await assertExtractEquals(ctx, '[data-testid="fax"]', "(555) 123-4568");
  },
};
export default def;
