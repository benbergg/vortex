# 京东评测 V1+V2 环境

**Author:** qingwa
**Date:** 2026-06-07 (V1) / 2026-06-08 (V2 复跑)

---

## V2 复跑段(2026-06-08)

### Git

- **V1 评测基线(2026-06-07 误锁):** `ef242c7c7484ee4cb31de95f26afc369f8599c78`
- **V1 实际 HEAD(2026-06-08 校正):** `686b29ca20c6214ec9322156569691d3dd060ab6` (= V2 基线)
  - V4 修复已合入: `8e0dd9f` P1-1 + `57fcbb0` P1-2 + `bba1190` BUG-008 + `f577b04` REQ-009
- **V2 实测 commit:** `686b29ca20c6214ec9322156569691d3dd060ab6` (与 V2 锁定一致 ✓)
- **V2 Status:** dirty(沿用 V1 状态: `?? docs/superpowers/` + `?? reports/taobao-dogfood-V4/`)
- **Branch:** main

### vortex-server / MCP(2026-06-08 复测)

- **vortex-server PID:** 14009 (今日重启过,非 V1 记录的 89299)
- **Listening:** TCP `*:6800` (IPv6) - LISTEN 状态 ✓
- **MCP:** `claude mcp list` 输出 `vortex: node packages/mcp/dist/src/server.js - ✓ Connected` ✓
- **健康检查:** `vortex_navigate("https://www.jd.com")` + `vortex_wait_for(idle, dom)` + `vortex_observe(viewport, all)` 均正常响应,无 timeout ✓

### bench playground(2026-06-08)

- `pkill -f vortex-bench/playground` + `pkill -f vite` 后,`lsof -iTCP:5173 -sTCP:LISTEN` 无输出 ✓ (5173 端口空闲)
- N0059-V3 R1 必做动作已完成

### 京东登录态(2026-06-08) — ✅ **已登录**(用户人工介入后)

- **UI 表现:** 顶部导航显示 `jd_130679dqq***` (e2/e176) + `已省￥2061.51` + `22 优惠券` + `283 京豆` — 完整登录态特征
- **Cookie 状态:** 重新登录后 thor 已刷新
- **V2 复跑期间登录态:** ✅ 稳定,全程无 session 失效
- **历史:** V1 评测 cookie 残留但 thor 过期 → V2 Phase 0.3 subagent 报告 BLOCKED → 用户在 Chrome 人工登录 → V2 后续评测继续

### V2 复跑目标 + 实测结果

| 阶段 | 任务 | 期望结果 | 实测结果 | 关闭 P0 |
|------|------|----------|----------|---------|
| **P0.1** P1-1 | 商品卡空名率(3 品类,新口径:`[class*="_card_"]` 容器) | 修复 `8e0dd9f` 后空名率 ≤ 5% | **3 品类 0/30 = 0%**(8e0dd9f 修复 100% 适用) | ✅ |
| **P0.2** P1-2 | force=false 触发 click(3 品类) | 修复 `57fcbb0` 后 errorCode=NOT_STABLE + hint 含 `force=true` | **3C 验证 errorCode=NOT_STABLE + message "Element not stable..." + hint 含 force=true 兜底** | ✅ |
| **P0.3** P2 | description 含 IIFE + IIFE 实战 | REQ-009 `f577b04` 文档已落地,实战 PASS | **description 含两个 IIFE 模板 + 同步/异步 IIFE 实战 PASS** | ✅ |

**P0 全部关闭**。V2 复跑 7 个 .md 落档到 `reports/jd-dogfood-V1/V2/`, 见 `V2/_meta/V2-复跑总结.md`。

---

## V1 原环境段(2026-06-07,保留作历史)

## Git

- **Commit:** `686b29ca20c6214ec9322156569691d3dd060ab6` (Merge V4 淘宝选品评测 4 项 BUG 修复)
  - **审核意见修正**: 原始 env.md 误记为 `ef242c7`(V4 报告基线),实际仓库 HEAD = `686b29c`
  - 关键差异: `ef242c7` 之后合入 4 个修复 commit:
    - `8e0dd9f` fix(observe): P1-1 修复方向重做 — textContent 含商品特征不再判空名
    - `57fcbb0` fix(extension): P1-2 修复路径重做 — NOT_STABLE 抛错改用 NOT_STABLE 错误码
    - `bba1190` fix(observe): BUG-008 修复 — observe 不再漏抓淘宝详情页 sticky bar div CTA
    - `f577b04` docs(mcp): REQ-009 — vortex_evaluate description 加 IIFE 模板示例
  - 因此 V1 评测实际是在"修复已合并"基线上跑,Phase 1/2 复跑结论需重写(详见 V1 设计 §7.3 校正)
- **Status:** dirty(2 个未追踪目录,均与本 V1 任务无关,属前序遗留)
  - `?? docs/superpowers/`
  - `?? reports/taobao-dogfood-V4/` (N0059 V4 评测产物)
- **Branch:** main (隐含)

## Chrome

- **版本:** Google Chrome 148.0.7778.216 (stable)
- **启动方式:** `--silent-debugger-extension-api`(允许 extension debugger API 静默调用)
- **PID:** 11737 (主进程)
- **Extension:** vortex extension 已加载并与 server 6800 建立连接(由下文 vortex-server LISTEN 状态印证)

## vortex-server

- **PID:** 89299
- **Listening:** TCP `*:6800` (IPv6) - LISTEN 状态
- **可执行:** `node /Users/lg/workspace/vortex/packages/server/dist/bin/vortex-server.js`
- **启动时间:** 8:50 PM (今日)

## vortex MCP

- **状态:** ✓ Connected
- **Endpoint (project scope, 当前生效):** `node packages/mcp/dist/src/server.js`
- **PID:** 98746 (mcp server 进程)
- **启动时间:** 9:34 PM (今日)
- **claude mcp list 输出 (节选):**
  ```
  vortex: node packages/mcp/dist/src/server.js - ✓ Connected
  ```
- **已知警告:** vortex 在 `user` + `project` 两个 scope 都注册
  - `user` scope: `npx -y @vortex-browser/mcp`
  - `project` scope: `node packages/mcp/dist/src/server.js` ← 当前评测使用
  - OAuth token 按 endpoint 存储,跨 scope 不共享
  - 评测中以 project scope 为准(本地构建产物,与 HEAD 锁定的代码版本一致)

## 用户登录态

- **平台:** 京东 (jd.com)
- **状态:** 已登录(pin cookie 存在)
- **unick (脱敏):** `jd_130***dqqk` (原始长度 13 位)
- **pin (脱敏):** `jd_79d***...` (前 6 + 后缀截断)
- **相关 cookie 字段:** `pinId`, `pin`, `unick`, `_tp`
- **打开页面:** `https://www.jd.com/`(tabId 984521651, status complete)

## 网络

- `https://www.jd.com` → HTTP 200, 0.067s
- `https://m.jd.com` → HTTP 200, 0.406s
- 连通性正常,延迟健康(PC 端 < 100ms, 移动端 < 500ms)

## 评测目录结构

```
reports/jd-dogfood-V1/
├── 3C/         # 3C 品类评测报告
├── 家电/       # 家电品类评测报告
├── 服饰/       # 服饰品类评测报告
├── 京东独有/   # 京东独有场景(秒杀/京东自营/PLUS 等)
└── _meta/      # 评测元数据(本文件 + 跨平台对比 + 行动项等)
```

## 备注

- 沿用 N0059-V4 vortex 淘宝评测模式:不修改 vortex 代码,只跑 MCP 工具
- 评测期间 reports/ 不 commit,等 Phase 8 一次性 commit
- 任何环境异常(Chrome 崩溃 / vortex-server 重启 / 登录态失效)需在对应品类报告中标注时间戳
