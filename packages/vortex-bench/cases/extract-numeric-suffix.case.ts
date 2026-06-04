// 缺口 J — 数值提取 + 容差带。镜像 Stagehand extract_github_stars:真站数值会漂移,
// 故 parse 后落 expected±band 即通过。fixture 固定 "12.3k" → 12300 ±1000。
import type { CaseDefinition } from "../src/types.js";
import { assertExtractNumericBand } from "./_helpers.js";

const def: CaseDefinition = {
  name: "extract-numeric-suffix",
  playgroundPath: "/synth/extract-numeric-suffix.html",
  tier: "medium",
  async run(ctx) {
    await assertExtractNumericBand(ctx, '[data-testid="stars"]', 12300, 1000);
  },
};
export default def;
