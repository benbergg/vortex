# Vortex Bench Baselines

每个 release 在此锁定 baseline，作为后续版本对比基准。

| 文件 | 锁定版本 | 锁定时间 | 锁定 commit |
|---|---|---|---|
| v0.5.json | v0.5.0 | （Task 0.3 锁定后填入） | （Task 0.3 锁定后填入） |

## 新增 baseline 流程

1. 在目标版本 release tag 上跑 `pnpm --filter @bytenew/vortex-bench bench run --all`
2. `cp packages/vortex-bench/reports/latest.json packages/vortex-bench/baselines/v<version>.json`
3. 上表追加一行（版本 / 时间 / commit）
4. commit：`chore(bench): lock v<version> baseline @<commit>`

## 与 reports/baseline.json 的区别

| 路径 | 语义 | 维护方式 |
|---|---|---|
| `baselines/v<version>.json` | 版本归属锁定，永不覆盖 | 手动 cp + commit |
| `reports/baseline.json` | "上次跑的"快照，覆盖更新 | bench CLI `baseline` 子命令 |
| `reports/latest.json` | 最近一次 bench 输出 | 每次 `bench run --all` 自动更新 |

两套机制互补：版本归属用 `baselines/`，CI/dev 对比用 `reports/`。
