# V2.2 京东家电 + 服饰 评测 - 环境与配置

## Author
- qingwa

## 测试环境

### 软件版本
- vortex: HEAD = `1d77e25` (V2.1 reports commit), 6 commits ahead of origin/main
  - `1d77e25` — V2.1 reports (上一轮 P0 端到端验证)
  - `0b7a38c` — P0 修 3 (observe 内联)
  - `e239efc` — P0 修 2 (字段名 `pattern`)
  - `b52547d` — P0 修 1 (filter 文档化)
  - `f86030a` — V2 重测版 reports
  - `312ce1b` — V2 早期 9 份 reports
- Chrome: 149.0.0.0, macOS 10_15_7
- vortex-server: auto-restart daemon, watching dist/ (debounce 2s)
- vortex-extension: dist loaded at 09:47:13 (P0 修复 build 后时间一致)

### 测试站点
- 京东 家电 搜索页: `search.jd.com/Search?keyword=海尔空调` (29 个商品)
- 京东 服饰 搜索页: `search.jd.com/Search?keyword=NAERSI 连衣裙裙` (30 个商品)
- V1 沿用真品: 海尔空调 100146042265 (搜索页首屏第 1) / NAERSI 10163956330188 (搜索页首屏第 1)
- **注意**: 京东 家电 详情页跳转失败 (vortex_act force=true + mouse_drag 1+1 像素 仍不跳), V2.2 评测**限于搜索页**

## V2.2 vs V2.1 - 类目扩展

| 项 | V2.1 (3C 详情) | **V2.2 (家电 + 服饰 搜索页)** |
|---|---|---|
| 测点数 | 1 (iPhone 16 100142621650 详情) | 2 搜索页 (海尔空调 / NAERSI) |
| 页面类型 | 详情页 | 搜索页 |
| observe 元素 | 73 | 147 (家电) / 151 (服饰) |
| aria 覆盖率 | 13.43% | 6.94% (家电) / 6.62% (服饰) |
| acc 覆盖率 | 95.52% | 61.11% (家电) / 58.28% (服饰) |
| 真品跳转成功 | ✅ 1 (iPhone 16) | ❌ 0 (家电 详情页跳转失败) |
| 评测策略 | 详情页为主 | 搜索页为主 (替代) |

## V2.2 测试路径详细

### Step 1: 京东 家电 搜索页
- URL: `https://search.jd.com/Search?keyword=海尔空调&enc=utf-8&wq=海尔空调&pvid=8e1d3d27c5b54f0ea1d2f3c4d8c1e0a0`
- observe: snap_mq62notp_5, 147 元素 (e0-e146)
- 6 个海尔空调商品卡 (¥1349.8/¥1656.65/¥1698.3/¥1548/¥1741.65/¥1699.15)
- 真品 1 100146042265 (¥1741.65) 在 viewport (top:360, bottom:759)
- D9 a11y: aria 6.94% / acc 61.11% / 144 interactive / 4 roles
- D11 sticky 6 + animated 413 (滚动懒加载触发)
- D16 console level=error 末尾新增 marker + network pattern filter 接受

### Step 2: 京东 家电 详情页 (尝试跳转)
- vortex_act target=`[data-sku="100146042265"]` action=click options={force: true} mode=realMouse
- 成功 success: true, x=172, y=377, mode=realMouse
- **未跳转** (URL 仍 search.jd.com)
- mouse_drag (1 像素位移) 也未跳转
- 详情页跳转失败 (京东 SPA root delegation + 浮层遮挡)
- **降级策略**: 评测限于搜索页, V2.2 报告聚焦搜索页数据

### Step 3: 京东 服饰 搜索页
- URL: `https://search.jd.com/Search?keyword=NAERSI 连衣裙裙&enc=utf-8&wq=NAERSI 连衣裙裙`
- observe: snap_mq62qzl4_6, 151 元素 (e0-e150)
- 6 个 NAERSI 连衣裙商品卡 (¥1115/¥1135/¥716/¥1125/¥2291/¥1022)
- 真品 1 10163956330188 (¥1115 本白色 L) 在 viewport
- D9 a11y: aria 6.62% / acc 58.28% / 151 interactive / 5 roles (含 switch)
- D11 sticky 6 + animated 303
- D16 console level=error 末尾新增 marker + network pattern filter 接受

## V2.2 风险与限制

### 已知风险
1. **京东 SPA 详情页跳转差异**: 3C iPhone 16 vortex_act force=true 跳转成功, 海尔空调 同样模式不跳
   - 可能原因: 京东 SPA 3C/家电 详情页路由入口不同, 家电 需 hover-then-click 序列
   - 实际行为: vortex_mouse_drag 1 像素位移也不跳
2. **V2.2 评测限于搜索页**: 京东 家电/服饰 详情页**未评测**, 评测数据**仅搜索页**
3. **V2.2 时间窗**: 京东 3 类目评测在 30 分钟内完成, 京东风控宽容度较高 (单点非高频)

### 限制
- V2.2 评测 2 个类目 (家电/服饰) 搜索页, 详情页未覆盖
- V2.2 跨类目观察 6 个商品卡 (家电 6 + 服饰 6), 总样本 12 个真品
- V2.2 D16 5k 条硬上限未触发 (京东流量大但测试窗口短)

## V2.2 评测结论

### 核心胜利
1. **P0 修 3 跨类目生效** — observe 在 2 个新类目 (家电/服饰) 同样返真实 DOM, 修复前均 "frame 0 not scanned"
2. **P0 修 1+2 跨类目生效** — filter 子字段在 2 个新类目 同样接受, 错误信息跨类目共享文档
3. **a11y 类目分层** — 3C 详情 95.52% > 家电 搜索 61.11% > 服饰 搜索 58.28%

### V2.2 待解决
1. 京东 家电/服饰 详情页跳转需新策略 (可能 hover-then-click / JS 触发 React onClick 链)
2. 京东 SPA 浮层遮挡 (login-bottom-bar) 需持续 force=true 跳过
3. V2.2 评测限于搜索页, 详情页 评测 V2.3 待补
