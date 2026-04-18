# @bytenew/vortex-bench

vortex 工具链评测集 v1。私有包，不发 npm。

## 定位

用 LLM agent 跑一组标准化场景，输出 VB_Index（0~100）+ 四维指标 + A/B/C 三件 ROI 独立分，作为：

- 回归防护（协议/handler 改动是否带来指标回退）
- 设计 ROI 数字物证（`vortex_observe` / 错误 hint / 事件总线到底有没有让 agent 更好用）
- 工具使用画像（哪些 MCP 工具高频 / 从没被调用过）

## 场景分层

| 层 | 类型 | 数量 | 频率 | 单次成本 |
|----|------|------|------|----------|
| L0 | repo 内 fixture 静态站 | 5 | 每 PR | ~$0.2 |
| L1 | fixture 故意撞错验证 hint 自愈 | 5 | 每 PR | ~$0.3 |
| L2 | 公开真实站点 | 5 | 夜间 | ~$3 |
| L3 | 登录后 / 多 tab | 5 | 手动/月度 | ~$8 |

L0/L1 全部程序化 judge（零 LLM 判定费）。L2 程序为主 + LLM 兜底。L3 LLM judge 为主。

## 运行

前置：将 `MINIMAX_API_KEY` 放到 shell env（如 `~/.zshrc`）。

```bash
pnpm -F @bytenew/vortex-bench build

# 跑单场景
pnpm -F @bytenew/vortex-bench bench run scenarios/v1/L0-smoke/001-basic-click

# 跑某层全部
pnpm -F @bytenew/vortex-bench bench run --layer L0

# CI 通用（PR 跑）
pnpm -F @bytenew/vortex-bench bench run --layer L0 --layer L1

# 打分 + diff
pnpm -F @bytenew/vortex-bench bench score reports/latest.json
pnpm -F @bytenew/vortex-bench bench diff reports/baseline.json reports/latest.json
```

## 配置

见 `.env.example`。最常调：

- `BENCH_MODEL`：默认 `MiniMax-M2.7`，可切 `MiniMax-M2.7-highspeed` / Claude Sonnet（需同时改 `BENCH_BASE_URL`）
- `BENCH_MAX_STEPS` / `BENCH_MAX_COST_USD`：单场景硬停阈值

## 目录

```
packages/vortex-bench/
├── scenarios/v1/             # 数据集锁定 v1
│   ├── L0-smoke/
│   ├── L1-antipattern/
│   ├── L2-realworld/
│   └── L3-session/
├── fixtures/                 # L0/L1 的 express 静态站点
├── src/
│   ├── index.ts              # CLI 入口
│   └── runner/
│       ├── agent.ts          # ReAct loop
│       ├── mcp-client.ts     # @modelcontextprotocol/sdk stdio
│       ├── metrics.ts        # 四维指标 + ROI 收集
│       ├── scoring.ts        # VB_Index 公式（纯函数）
│       ├── judge.ts          # 程序化断言 API
│       ├── judge-llm.ts      # LLM judge 兜底
│       ├── reporter.ts       # JSON + MD 报告
│       └── diff.ts           # 回退阈值判定
└── reports/                  # baseline.json 入 git，其他 gitignored
```

## 打分

四维指标（0~1）按权重合成 Layer_Score：

```
Layer_Score = 60·Correctness + 15·Efficiency + 15·Robustness + 10·Utilization
```

总指数：

```
VB_Index = 0.25·L0 + 0.25·L1 + 0.30·L2 + 0.20·L3
```

详见设计文档 §5.5。

## LLM judge 兜底

L0/L1 用纯声明式程序断言，零 LLM 费用。L2/L3 的文本类任务（如"提取商品名"）可以在 `expected.json` 加 `llmRubric` 字段：

```json
{
  "layer": "L2",
  "assertions": [{ "type": "agent_success" }],
  "llmRubric": "The agent's final text must contain the product name and price, and explicitly state that the item is in stock."
}
```

运行时会额外调 provider LLM 判定，`llm_judge` 作为一个 check 加到报告里，最终 pass 为 **程序 judge AND LLM judge**。

## CI 与回归防护

vortex-bench 依赖 **真实 Chrome + vortex 扩展 + vortex-server ws**，GitHub Actions 标准 runner 目前跑不起来（需要 Xvfb/持久化浏览器 profile/service worker 唤起策略）。v1 策略：

- **本地 pre-push**：跑 `packages/vortex-bench/scripts/bench-ci.sh`
  - 自动 build → 跑 L0+L1 → 对比 `reports/baseline.json` → 按阈值退出（0 OK / 2 critical）
- **GitHub Actions**：`.github/workflows/bench.yml` 为 `workflow_dispatch` 占位，提醒手动走本地脚本。未来补 headless runner 后改为 PR 自动触发。

### 回退阈值

| 条件 | 级别 |
|------|------|
| `VB_Index ↓ > 3` | warning |
| 任一层 score ↓ > 5 | **critical**（阻合并）|
| 任一 ROI ↓ > 10 | **critical** |
| tokens ↑ > 30% | warning |
