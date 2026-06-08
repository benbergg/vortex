# vortex 工具能力 gap 汇总 (V2 评测产出)

**Author**: qingwa
**Date**: 2026-06-09
**基线**: vortex HEAD = 83a892048a32e60ccf629aab3d6df149fcb5f961
**评测范围**: D9 a11y (深做) / D11 动效 (深做) / D16 可观察性 (深做) / D10/D12/D15 (探针)
**gap 来源**: V2 评测实测, 非预设 (v2.0 设计稿不预设)

---

## 1. 真 gap 清单 (2 个, 原语层 / 文档化)

| # | gap | 来源 | 类型 | ROI | 工作量估 |
|---|-----|------|------|-----|----------|
| 1 | `vortex_observe` 在 main frame 0 全部扫空 (`ReferenceError: applyReactClickableMarker is not defined`) | D9 实测 + R8 白盒核对 | **能力 gap (原语层)** | 高 (影响 D3/D11/D9 全评测) | 0.3d (内联 applyReactClickableMarker 进 page-side inject func) |
| 2 | `vortex_debug_read.filter` 子字段未文档化 + handler 字段名不统一 (urlPattern/url/pattern) | D16 实测 | **文档化 gap (能力已具备)** | **最高 (一行 description + 1-2 行源码统一)** | 0.05d (一行 description) + 0.1d (handler 字段名统一) |

## 2. 审计层能力空白 (5 个, 定位待定, 非必做)

> 以下 5 项是"目标站质量审计"能力 (接近 Lighthouse/axe/ZAP), **非原语层职责**。是否补齐**取决于 vortex 是否扩展到审计层** (设计稿 §1.1)。本表仅记录边界, **不预判要做**。

| # | 能力空白 | 来源 | 备注 |
|---|----------|------|------|
| 1 | `vortex_a11y_audit` (扫 ARIA + 焦点流) | D9 推论 | 审计套件类, 京东淘宝 aria 普遍 < 15% |
| 2 | `vortex_perf_audit` (Web Vitals 集成) | D10 探针 | evaluate 已可自测 LCP/FCP/TTFB (vortex 测评有真数据: 京东 3216ms / 淘宝 4080-4732ms LCP) |
| 3 | `vortex_animation_trace` (动画录制) | D11 推论 | 录制类审计, react-virtuoso 双平台均无, ROI 弱 |
| 4 | `vortex_color_scheme` (CDP emulateMedia) | D12 探针 | 京东主站无 dark mode, 需求弱 |
| 5 | `vortex_offline_mode` (CDP Network 域) | D15 探针 | 选品场景无强需求 |

## 3. 术语澄清 (真 gap / 文档化 gap / 审计层空白)

- **能力 gap (真, 原语层)**: vortex 原语自身能力缺失。例: observe 不输出 a11y → 属 observe 本职, **必修** (P0 候选)
- **文档化 gap (真, 但非能力缺失)**: handler 已实现 (console.ts:160 level / network.ts:305 url+status / network.ts:253 urlPattern), 仅 `schemas-public.ts` 的 `filter:{type:object}` 未声明子字段 + handler 字段名不统一 → LLM 不会用。修复 = **一行 description + 1-2 行源码统一**。**不是**"能力缺失"也**不是**"伪 gap", 是**真问题, 文档化类**, ROI 最高 (P0 候选)
- **审计层空白 (非职责)**: 见 §2, 取决于定位决策, 不计入"必做 gap"

## 4. V2.1 实施计划输入

(待 V2 评测完成后, 依 §1 真 gap 填充 P0/P1; §2 审计层空白先做定位决策再决定是否进 P2。v2.0 设计稿不预设。)

### P0 候选 (依实测填)

| # | 行动项 | 来源 | 工作量估 |
|---|--------|------|----------|
| 1 | **`vortex_debug_read.filter` 文档化 + handler 字段名统一** | D16 真 gap #2 | **0.15d** (一行 description + 1-2 行源码统一) |
| 2 | **`vortex_observe` 修复 (applyReactClickableMarker 内联进 page-side inject func)** | D9 真 gap #1 | **0.3d** (方案 A 最简) |
| 3 | observe 输出 a11y 字段 (随 #2 修) | D9 真 gap #1 衍生 | 0d (包含在 #2) |

**P0 合计**: 0.45d

### P1 候选 (依实测填)

| # | 行动项 | 来源 | 工作量估 |
|---|--------|------|----------|
| 1 | `vortex_a11y_audit` 工具 (扫 ARIA 缺失 + 焦点流) | D9 推论 (审计层空白) | 1.0d (新工具) |
| 2 | `vortex_perf_audit` 工具 (Web Vitals API 集成) | D10 探针 | 1.0d (新工具) |

**P1 合计**: 2.0d

### P2 候选 (审计层空白, 需先做定位决策)

| # | 行动项 | 前置决策 | 工作量估 |
|---|--------|----------|----------|
| 1 | `vortex_animation_trace` (动画录制) | vortex 定位: 原语层 vs 审计套件 | 1.0d |
| 2 | `vortex_color_scheme` (CDP emulateMedia) | 同上 | 0.5d |
| 3 | `vortex_offline_mode` (CDP Network 域) | 同上 | 0.5d |

**P2 合计**: 2.0d

## 5. 总工作量

P0 (0.45d) + P1 (2.0d) + P2 (2.0d) = **4.45d**

(注: P0/P1/P2 排序依实测真 gap, 不预设, v2.0 设计稿 §12.1 移除了原 v1.0 预设 P0/P1/P2)
