# Vortex v0.6 Dogfood 任务定义（PR #5 输入）

> 本文档由 PR #0 Task 0.7 产出，作为 PR #5 dogfood 验收（§12.6）的实施输入。
> 凭据/账号信息以 `__` 占位，正式实施前由项目负责人填空（不写入 git，团队内部记录）。

## 通用约定

- 每个任务在 v0.5 / v0.6 各跑 5 次，取中位数
- LLM 模型：`claude-sonnet-4-6`（与 v0.5 ship dogfood 一致；如有变更需在 PR #5 PR description 标注）
- 计时口径：从 LLM 第一次 `vortex_*` 调用 到任务"成功状态"判定为止
- 每次跑记录：LLM 调用次数 / 总 token / 耗时 / 成功 or 失败 / 失败原因

## 验收阈值（v0.6 SLO）

- LLM 调用次数：v0.6 平均 ≤ v0.5 × 0.7（**-30%**）
- 总 token：v0.6 平均 ≤ v0.5 × 0.7（**-30%**）
- 成功率：v0.6 ≥ v0.5（不退步）
- OpenClaw 工作流回归（任务 5）：v0.5 → v0.6 行为一致，迁移脚本 100% 覆盖

---

## 任务 1：GitHub 搜索 + star 第一仓库

**类别**：简单流程（多页面跳转）

**目标**：在 `github.com` 搜索 "playwright"，给搜索结果第一个仓库点 star

**起点**：浏览器打开 `https://github.com/`（已登录首页，cookie 持久化）

**成功定义**：
- 第一个搜索结果仓库的 star 按钮显示 "Starred"
- 该仓库的 stargazers 计数 +1
- agent 主动确认任务完成

**凭据**：
- GitHub 账号：`__github_account__`（用户名）
- session cookie 来源：`__cookie_origin__`（浏览器手动登录后导入 / OAuth token / 测试账号）
- 测试前清理：取消 star 状态（`gh api -X DELETE /user/starred/<owner>/<repo>` 或 UI 操作）

**v0.5 跑通最小配置**：
- 标准 vortex-mcp + Claude Code 默认配置
- chrome 加载 vortex extension
- vortex-server 已起 ws 6800

---

## 任务 2：班牛 VOC 工作台只读查询

**类别**：表单密集（多筛选 + 列表读数）

**目标**：登录测试环境班牛 VOC 工作台，依次完成 5 个只读查询并报答案。仅查不改，避免污染测试数据。

**起点**：`https://testc.bytenew.com/`（已登录，cookie 持久化）

**子任务（按顺序）**：
1. 打开 VOC 小程序，报告一级菜单数量（ground truth: 4）
2. "智能辅助回评"，筛选 `平台评价情感 = 好评`，报告总条数（ground truth: 1480）
3. 同页筛选 `平台评价情感 = 中评 + 差评`，报告总条数（ground truth: 317）
4. 同页筛选 `店铺 = 【天猫】欧莱雅男士官方旗舰店`，报告总条数（ground truth: 711）
5. 同页筛选 `订单号 = <ORDER_ID>`，读出该行的 **商品 ID**（ground truth: 527758354524）

**成功定义**：
- 5 个子任务的答案与 ground truth 全部匹配
- 任务过程中无写操作（不点犇犇打标 / 不修改任何字段）
- agent 主动汇总 + 确认任务完成

**凭据**：
- 班牛测试账号：`13735849365`（密码本地保存，不入 git）
- 测试环境 URL：`https://testc.bytenew.com/app.html#/login`

**v0.5 跑通最小配置**：
- vortex-mcp + Claude Code
- chrome 已登录 testc.bytenew.com（cookie 持久化）
- 子任务 5 的具体订单号 ID 在 prompt 中替换 `<ORDER_ID_PLACEHOLDER>` 占位符

---

## 任务 3：知乎搜索文章 + 截图

**类别**：多模态混合

**目标**：在 `zhihu.com` 搜索 "vortex 浏览器自动化"，截图首条搜索结果

**起点**：`https://www.zhihu.com/`（已登录首页）

**成功定义**：
- 截图文件存在（PNG），含搜索结果首条
- 截图区域包含：标题 + 摘要 + 作者
- agent 主动确认任务完成 + 截图路径

**凭据**：
- 知乎账号：`__zhihu_phone__`（手机号）/ `__zhihu_password__`
- 登录方式：扫码登录 / 短信验证（每次跑前确认 cookie 有效）

**v0.5 跑通最小配置**：
- 标准 vortex-mcp + Claude Code
- chrome 已登录 zhihu（cookie 持久）
- vortex-server 已起 ws 6800

---

## 任务 4：Notion / Linear 文档编辑（复杂 SPA）

**类别**：复杂 SPA（动态 DOM，stale ref 高发）

**目标**：Linear 创建一个 issue，标题 `"v0.6 dogfood test {timestamp}"`，描述任意 50 字以上文本

**起点**：`https://linear.app/<workspace>/inbox`（已登录 workspace）

**成功定义**：
- Linear issue 列表中新 issue 可见（按创建时间倒序首条）
- 标题完整匹配（含 timestamp）
- 描述非空且 ≥ 50 字
- agent 主动确认 + 新 issue URL

**凭据**：
- Linear workspace：`__linear_workspace_slug__`
- 登录方式：OAuth（Google / GitHub）+ session cookie
- 测试 team / project：`__linear_team__`（避免污染主流程，建议用 "Sandbox" team）

**v0.5 跑通最小配置**：
- vortex-mcp + Claude Code
- chrome 已登录 Linear（cookie 持久）
- vortex-server 已起 ws 6800

**为什么这个任务关键**：
Linear 是高度动态 SPA（heavy client-side state，频繁 re-render），observe 拿到的 ref 在 act 之间容易 stale。验证 v0.6 L3 stable ref 是否真的能跨 snapshot 复用、stale 自动重定位是否 ≥ 95% 成功率。

---

## 任务 5：OpenClaw 现有生产工作流回归

**类别**：breaking change 验证

**目标**：跑一个 OpenClaw 现有的真实业务工作流，对比 v0.5 / v0.6 行为一致性

**起点**：OpenClaw 部署环境，vortex-mcp 集成可用

**成功定义**：
- OpenClaw 工作流在 v0.6 vortex 下跑通（无 unmapped tool error）
- 输出与 v0.5 跑同任务的 baseline 一致（业务结果对比，非字面对比）
- 自动迁移脚本（PR #5 T5.5 产出）覆盖此工作流的所有 v0.5 工具调用 → v0.6 11 工具的映射

**凭据**：
- OpenClaw 测试环境：`__openclaw_endpoint__`
- OpenClaw 团队对接人：`__openclaw_contact__`（提供具体业务工作流 + 验收标准）
- 工作流标识：`__workflow_id__`

**v0.5 跑通最小配置**：
- OpenClaw vortex 集成已部署
- vortex-mcp v0.5 + 迁移脚本 dry-run 通过

**为什么这个任务关键**：
v0.6 的 36→11 工具变化是 breaking change，OpenClaw 是已知最大的下游 client。本任务验证：(1) 迁移脚本 100% 覆盖（无遗漏工具）（2) 业务行为不退步。是 v0.6.0 release 的硬 gate。

---

## 数据采集模板（每次跑填一份）

```yaml
任务: 1 / 2 / 3 / 4 / 5
版本: v0.5.0 / v0.6.0
跑次: 1 / 2 / 3 / 4 / 5
开始时间: <ISO>
结束时间: <ISO>
LLM 调用次数: <N>
总 token: <N>（输入 + 输出）
成功: yes / no
失败原因: <如失败>
stale ref 重定位次数: <仅 v0.6，仅任务 4 / 5>
迁移脚本命中: <仅任务 5，工具调用映射数 / 总调用数>
备注: <任何异常观察>
```

---

## 关联

- 设计文档：`vortex重构-设计文档.md` §12.6（5 任务验收）
- 计划文档：`vortex重构-计划文档.md` §6.3 PR #5 T5.6-T5.10（任务实施序列）+ T5.5（迁移脚本，必须在 T5.10 前完成）
- v0.5 LTS：v0.5.x 维护分支至少维护 2 个月（设计文档 §13 / 计划文档 §7 Release）
