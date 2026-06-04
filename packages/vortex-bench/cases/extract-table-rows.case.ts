// 缺口 J — N 行表完整性提取。镜像 Stagehand extract_area_codes/regulations_table:
// 整表提取。vortex extract 取整表文本 blob,标准=含全部 25 行 code 关键值(结构化交调用方)。
import type { CaseDefinition } from "../src/types.js";
import { assertExtractContainsAll } from "./_helpers.js";

const def: CaseDefinition = {
  name: "extract-table-rows",
  playgroundPath: "/synth/extract-table-rows.html",
  tier: "medium",
  async run(ctx) {
    const codes = Array.from({ length: 25 }, (_, i) => `code-${201 + i}`);
    await assertExtractContainsAll(ctx, '[data-testid="area-codes"]', codes);
  },
};
export default def;
