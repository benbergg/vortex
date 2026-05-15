/**
 * dom_commit 支持的 driver 注册表。
 *
 * Driver 负责"打开受控组件 → 导航 → 选值 → 确认 → 断言"完整流程。
 * 真正的交互逻辑在页面 context 运行（见 dom.ts 的 COMMIT handler 内注入的 func），
 * 这里只声明可序列化的元数据：id / kind / closestSelector / 接受的 value 形状。
 *
 * 新增一个 driver = 在 @bytenew/vortex-shared/commit-kinds.ts 的 COMMIT_KINDS
 * 加值 + 这里加一条 spec + 在 page-side func 的 switch 里加一个分支。
 * CommitKind 类型由 shared 包单源导出，mcp schemas-public/schemas 与本文件
 * 通过 COMMIT_KINDS 数组保持严格一致（I15 invariant 测试 lock）。
 */

export type { CommitKind } from "@bytenew/vortex-shared";
import type { CommitKind } from "@bytenew/vortex-shared";

export interface CommitDriverSpec {
  id: string;
  kind: CommitKind;
  /** 接受一个 element，自身或祖先匹配该选择器即判定为该 driver 可处理 */
  closestSelector: string;
  /** 简短描述给代理看 */
  summary: string;
}

export const COMMIT_DRIVERS: CommitDriverSpec[] = [
  {
    id: "element-plus-datetimerange",
    kind: "datetimerange",
    closestSelector: ".el-date-editor.el-range-editor",
    summary:
      "Element Plus <el-date-picker type='datetimerange'> full commit flow: open picker → navigate months → click start/end day → click confirm.",
  },
  {
    id: "element-plus-daterange",
    kind: "daterange",
    closestSelector: ".el-date-editor.el-range-editor",
    summary:
      "Element Plus <el-date-picker type='daterange'>: same as datetimerange but no time inputs / no 确定 button.",
  },
  {
    id: "element-plus-checkbox-group",
    kind: "checkbox-group",
    closestSelector: ".el-checkbox-group",
    summary:
      "Element Plus <el-checkbox-group>: idempotent toggle. Pass {values: string[]} — driver diffs current checked labels with target, clicks each sequentially with a microtask gap so Vue reactivity catches every toggle (avoids the 'forEach click batched → only one toggled' trap).",
  },
  {
    id: "element-plus-select",
    kind: "select",
    closestSelector: ".el-select",
    summary:
      "Element Plus <el-select>: opens popper via wrapper click, matches option(s) by visible label text, clicks each. value: string (single) | string[] (multiple). Closes popper after multi-select.",
  },
  {
    id: "element-plus-cascader",
    kind: "cascader",
    closestSelector: ".el-cascader",
    summary:
      "Element Plus <el-cascader>: CDP real-mouse click the trigger to open panel (el-cascader root ignores untrusted click), then walks the label path level-by-level. value: string[] (label path, e.g. ['华东','上海','浦东']).",
  },
  {
    id: "element-plus-time",
    kind: "time",
    closestSelector: "input.el-input__inner",
    summary:
      "Element Plus <el-time-picker> (spinner panel): CDP click input to open .el-time-panel, scroll + click matching HH/MM/SS in 3 spinner columns, click OK. value: 'HH:MM:SS' string.",
  },
];

export function findDriver(
  kind: CommitKind,
): CommitDriverSpec | undefined {
  return COMMIT_DRIVERS.find((d) => d.kind === kind);
}
