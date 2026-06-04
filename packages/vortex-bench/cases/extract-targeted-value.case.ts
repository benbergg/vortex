// 缺口 J — 定向单值提取。镜像 Stagehand extract_aigrant_targeted/_2:
// targeted extract 只取 target 文本,不把兄弟干扰节点带出来(正向 equals + 负向 notContains)。
import type { CaseDefinition } from "../src/types.js";
import { assertExtractEquals, assertExtractNotContains } from "./_helpers.js";

const def: CaseDefinition = {
  name: "extract-targeted-value",
  playgroundPath: "/synth/extract-targeted-value.html",
  tier: "easy",
  async run(ctx) {
    await assertExtractEquals(ctx, '[data-testid="target-company"]', "Coframe");
    await assertExtractNotContains(ctx, '[data-testid="target-company"]', "OpusClip");
  },
};
export default def;
