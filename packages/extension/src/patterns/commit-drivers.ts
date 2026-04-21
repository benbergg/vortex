/**
 * dom_commit 支持的 driver 注册表。
 *
 * Driver 负责"打开受控组件 → 导航 → 选值 → 确认 → 断言"完整流程。
 * 真正的交互逻辑在页面 context 运行（见 dom.ts 的 COMMIT handler 内注入的 func），
 * 这里只声明可序列化的元数据：id / kind / closestSelector / 接受的 value 形状。
 *
 * 新增一个 driver = 往这里加一条 spec + 在 page-side func 的 switch 里加一个分支。
 */

export type CommitKind =
  | "daterange"
  | "datetimerange"
  | "cascader"
  | "select"
  /** @since 0.4.0 (O-10) */
  | "checkbox-group";

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
];

export function findDriver(
  kind: CommitKind,
): CommitDriverSpec | undefined {
  return COMMIT_DRIVERS.find((d) => d.kind === kind);
}
