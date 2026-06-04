// 缺口 J — 嵌套卡片列表提取。镜像 Stagehand extract_staff_members/memorial_healthcare:
// 嵌套结构列表。标准=容器文本含全部条目 name+title(完整性,结构化交调用方)。
import type { CaseDefinition } from "../src/types.js";
import { assertExtractContainsAll } from "./_helpers.js";

const def: CaseDefinition = {
  name: "extract-nested-card-list",
  playgroundPath: "/synth/extract-nested-card-list.html",
  tier: "medium",
  async run(ctx) {
    await assertExtractContainsAll(ctx, '[data-testid="staff-list"]', [
      "Alice Chen",
      "Chief Engineer",
      "Bob Diaz",
      "Staff Designer",
      "Carol Wu",
      "Product Lead",
    ]);
  },
};
export default def;
