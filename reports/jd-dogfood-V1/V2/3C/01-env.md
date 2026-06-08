# V2 Phase 0 环境落档

**Date:** 2026-06-08
**Git commit:** `686b29ca20c6214ec9322156569691d3dd060ab6` (与 V2 锁定一致 ✓)
**Branch:** main
**Author:** qingwa

## 评测环境

| 项 | 状态 | 备注 |
|----|------|------|
| vortex-server | ✅ 6800 监听 | PID 14009(2026-06-08 重启过,非 V1 记录的 89299) |
| vortex MCP | ✅ Connected | `node packages/mcp/dist/src/server.js` |
| Chrome | ✅ running | 标签页 tabId 984521905 |
| bench playground | ✅ 已关闭 | `lsof -iTCP:5173` 无输出(N0059-V3 R1 动作完成) |
| 京东登录态 | ✅ **已登录** | 用户名 `jd_130679dqq***`(脱敏) + 个人中心 "已省￥2061.51" + 22 优惠券 + 283 京豆(V2 Phase 0.3 复验,2026-06-08 10:38) |
| vortex MCP 健康 | ✅ 响应正常 | `vortex_navigate(jd.com)` + `vortex_wait_for(idle, dom)` + `vortex_observe(viewport, all)` 均 OK |

## 京东登录态诊断详情

### 现象

1. `vortex_navigate("https://www.jd.com")` 完成后,`vortex_observe(scope=viewport, filter=all)` 顶部导航显示:
   - `[link] "你好，请登录"`(本应是用户名)
   - `[link] "免费注册"`
   - `[link] "我的京东"`(可点击但仅作为入口)
2. `vortex_evaluate` 读 `document.body.innerText` 同样确认 `你好，请登录` 文案
3. `vortex_act.click(@aa67:e7 "我的京东")` 后,URL **未跳转**(`location.href === "https://www.jd.com/"`),说明京东判定 session 无效,未跳 `home.jd.com` 或 `vip.jd.com`

### Cookie 残留

```
pin      = jd_79d1dc1d0be74   (expirationDate: 2026-05-08)
unick    = jd_130679dqqk
pinId    = eX-ooVdfXbbozAG49_KhlLV9-x-f3wj7
thor     = 9FFD...0F92D47C...  (登录态关键,已过期)
_pst     = jd_79d1dc1d0be74
```

cookie 字段齐全但 `thor` 等关键字段已过期,京东服务端拒绝识别 session。

### 处置

- **状态(V2 Phase 0.3 复验):** ✅ **已解决** —— 用户在 2026-06-08 10:38 前已完成人工登录,顶部 `jd_130679dqq***` 脱敏名 + 个人中心 `已省￥2061.51` + `22 优惠券` + `283 京豆` 三个用户态特征全在
- **登录方式:** 用户报告已登录(本轮复验未记录具体登录动作)
- **登录后验证:** ✅ 顶部导航出现用户名 `jd_130679dqq***`(e2/e176),个人中心 `已省￥2061.51` + `22 优惠券` + `283 京豆` 三处均显示
- **登录后回写:** 已将 `京东登录态` 改为 ✅,补充脱敏用户名和 3 个登录态特征

## V2 复跑目标

### P1-1 商品卡空名率(新口径)

- **基线 commit:** `686b29c`(含 `8e0dd9f` P1-1 修复)
- **新口径:** 分母只计 `[class*="_card_"]` 容器内商品,排除装饰性 `<a>`(导航/分类入口)
- **覆盖品类:** 3C / 家电 / 服饰
- **期望:** 修复后空名率 ≤ 5%(原口径 ~30% 包含装饰链接,新口径只算商品卡)

### P1-2 修复泛化验证

- **基线 commit:** `686b29c`(含 `57fcbb0` P1-2 修复)
- **路径:** `force=false` 触发 `vortex_act.click` → 期望抛 `errorCode=NOT_STABLE` + `hint` 含 `force=true`
- **覆盖品类:** 3C / 家电 / 服饰
- **期望:** 3/3 PASS(修复已落地,京东场景应与淘宝一致)

### P2 description + IIFE 实战

- **基线 commit:** `686b29c`(含 `f577b04` REQ-009)
- **任务:**
  1. `vortex_evaluate` 工具 description 校验含 IIFE 模板示例
  2. 实战:用 IIFE 提取 3C 列表页商品价格/标题/评论数
- **期望:** description 文本含 `async function` 或 `IIFE` 关键字 + 实战返回结构化数据

## 关键修正(V2 vs V1)

| 维度 | V1(2026-06-07) | V2(2026-06-08 审核后) |
|------|----------------|------------------------|
| 基线 | 误锁 `ef242c7`,实际 `686b29c` | `686b29c` 已确认 |
| P1-1 口径 | "空名率" 含装饰链接 | "**商品卡空名率**" 仅 `[class*="_card_"]` 容器 |
| P1-2 期望 | 修复未合入,触发 fail | 修复已合入 `57fcbb0`,期望 PASS(errorCode=NOT_STABLE) |
| P2 范围 | 仅 description 文档检查 | description + IIFE **实战** |
| vortex-server PID | 89299 | 14009(2026-06-08 重启) |
| 京东登录态 | 已登录(pin cookie 有效) | V2 Phase 0.3 复验: **已登录**(用户已重新登录,顶部 `jd_130679dqq***` + 个人中心 `已省￥2061.51` + `22 优惠券` + `283 京豆`) |

## 备注

- 沿用 N0059-V4 模式:不修改 vortex 代码,只跑 MCP 工具
- 评测期间 `reports/jd-dogfood-V1/` 不 commit,等 Phase 8 一次性 commit
- 任何环境异常(Chrome 崩溃 / vortex-server 重启 / 登录态失效)需在本文件追加时间戳
