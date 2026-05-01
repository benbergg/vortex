# Dogfood prompt 模板

为了让 v0.5 / v0.6 实测可比，每次跑都用本目录下的固定 prompt 喂 Claude Code。
不要改写 prompt 文本（包括标点），任何变动都要在 PR description 中标注。

## 跑法（每个任务每次跑）

1. 准备好任务的起点页面（cookie 已就位、VPN 已连）+ vortex extension + vortex-server。
2. 在工作目录起一个**新** Claude Code 会话（重启或 `/clear`），确保 transcript 干净。
3. 把对应 `.prompt.md` 的内容复制粘贴到 Claude Code 第一条消息。
4. Claude Code 任务完成后立刻退出（避免后续操作污染 transcript）。
5. 找到这次会话的 jsonl：

   ```bash
   ls -t ~/.claude/projects/<cwd-encoded>/*.jsonl | head -1
   ```

6. 抽指标：

   ```bash
   node scripts/dogfood-extract.mjs <session.jsonl> \
        --task github-star --version v0.6 --run 1 \
        > reports/dogfood/github-star-v0.6-run1.json
   ```

## 任务清单

| # | 任务 | release gate |
|---|---|---|
| 1 | [github-star](01-github-star.prompt.md) | ✅ 硬卡 |
| 2 | [bytenew-voc-query](02-bytenew-voc-query.prompt.md) | ✅ 硬卡 |
| 3 | [zhihu-search-screenshot](03-zhihu-search-screenshot.prompt.md) | ✅ 硬卡 |

任务 4（Linear）和任务 5（OpenClaw）按 v0.6.0 release gate 降级方案推到 v0.6.1。

## 数据采集模板

每次跑产出一份 JSON（`reports/dogfood/<task>-<version>-run<N>.json`），来自
`scripts/dogfood-extract.mjs`。聚合表由 PR #5 T5.10 自动汇总到
`reports/dogfood/dogfood-report.md`。
